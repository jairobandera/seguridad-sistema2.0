import http from "http";
import { Server } from "socket.io";
import { config } from "./config";
import { logger } from "./logger";
import { prisma } from "./prisma";
import { verificarAcceso } from "./auth/tokens";
import { barrioConGuardiaDeCasa, barriosVisiblesDeGuardia } from "../modules/barrios/barrio.service";
import { escucharMonitor, iniciarMonitor } from "../modules/dispositivos/monitor";

let io: Server | null = null;

const roomCasa = (casaId: number) => `casa:${casaId}`;
const roomUsuario = (id: number) => `user:${id}`;
const roomBarrio = (barrioId: number) => `barrio:${barrioId}`;

export function iniciarSocket(server: http.Server): Server {
  io = new Server(server, {
    cors: { origin: config.corsOrigins.length ? config.corsOrigins : false },
    transports: ["websocket", "polling"],
    // Deja pasar los upgrades de /mqtt al broker MQTT
    destroyUpgrade: false,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string") return next(new Error("no_autenticado"));
      const datos = verificarAcceso(token);
      const usuario = await prisma.usuario.findUnique({
        where: { id: datos.id },
        select: { id: true, rol: true, activo: true, tokenVersion: true },
      });
      if (!usuario || !usuario.activo || usuario.tokenVersion !== datos.ver) {
        return next(new Error("token_invalido"));
      }
      socket.data.usuario = { id: usuario.id, rol: usuario.rol };
      next();
    } catch {
      next(new Error("token_invalido"));
    }
  });

  io.on("connection", async (socket) => {
    const { id, rol } = socket.data.usuario as { id: number; rol: string };
    socket.join(roomUsuario(id));
    if (rol === "ADMIN") {
      socket.join("admins");
      escucharMonitor(socket);
    }
    try {
      (await roomsDeseadas(id, rol)).forEach((r) => socket.join(r));
    } catch (err) {
      logger.warn({ err }, "No se pudieron cargar las casas del socket");
    }
    logger.debug({ usuarioId: id, rol }, "Socket conectado");
  });

  iniciarMonitor(io);
  return io;
}

/** Rooms de casa (miembros) y de barrio (guardias de barrios con guardia) que corresponden al usuario. */
async function roomsDeseadas(usuarioId: number, rol: string): Promise<Set<string>> {
  const membresias = await prisma.casaMiembro.findMany({ where: { usuarioId }, select: { casaId: true } });
  const rooms = new Set(membresias.map((m) => roomCasa(m.casaId)));
  if (rol === "GUARDIA") (await barriosVisiblesDeGuardia(usuarioId)).forEach((b) => rooms.add(roomBarrio(b)));
  return rooms;
}

// Los eventos de cada casa salen en orden aunque haya que consultar su barrio
const colasEmision = new Map<number, Promise<void>>();

/** Eventos que ven los miembros de la casa, los guardias de su barrio (si tiene guardia) y los admins. */
export function emitirCasa(casaId: number | null | undefined, evento: string, datos: unknown) {
  if (!io) return;
  const servidor = io;
  if (!casaId) {
    servidor.to("admins").emit(evento, datos);
    return;
  }
  const previa = colasEmision.get(casaId) ?? Promise.resolve();
  const siguiente = previa
    .then(async () => {
      const barrioId = await barrioConGuardiaDeCasa(casaId);
      let destino = servidor.to(roomCasa(casaId)).to("admins");
      if (barrioId) destino = destino.to(roomBarrio(barrioId));
      destino.emit(evento, datos);
    })
    .catch((err) => logger.error({ err, casaId, evento }, "No se pudo emitir el evento de la casa"));
  colasEmision.set(casaId, siguiente);
  void siguiente.finally(() => {
    if (colasEmision.get(casaId) === siguiente) colasEmision.delete(casaId);
  });
}

/** Solo miembros de la casa y admins (ej. progreso de vinculación). */
export function emitirMiembros(casaId: number, evento: string, datos: unknown) {
  if (!io) return;
  io.to(roomCasa(casaId)).to("admins").emit(evento, datos);
}

/** Cuando cambian las casas o los barrios de un usuario, actualiza las rooms de sus sockets abiertos. */
export async function refrescarRoomsUsuario(usuarioId: number) {
  if (!io) return;
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { rol: true } });
  if (!usuario) return;
  const deseadas = await roomsDeseadas(usuarioId, usuario.rol);
  const sockets = await io.in(roomUsuario(usuarioId)).fetchSockets();
  for (const s of sockets) {
    for (const r of s.rooms) if ((r.startsWith("casa:") || r.startsWith("barrio:")) && !deseadas.has(r)) s.leave(r);
    deseadas.forEach((r) => s.join(r));
  }
}

/** Al prender/apagar la guardia de un barrio o cambiar sus guardias. */
export async function refrescarRoomsBarrio(barrioId: number) {
  const guardias = await prisma.guardiaBarrio.findMany({ where: { barrioId }, select: { usuarioId: true } });
  await Promise.all(guardias.map((g) => refrescarRoomsUsuario(g.usuarioId)));
}

/** Corta los sockets de un usuario (desactivado, cambio de clave, logout global). */
export function desconectarUsuario(usuarioId: number) {
  io?.in(roomUsuario(usuarioId)).disconnectSockets(true);
}

export function socketActivo(): boolean {
  return io !== null;
}
