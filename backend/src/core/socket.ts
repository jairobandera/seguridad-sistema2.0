import http from "http";
import { Server } from "socket.io";
import { config } from "./config";
import { logger } from "./logger";
import { prisma } from "./prisma";
import { verificarAcceso } from "./auth/tokens";

let io: Server | null = null;

const roomCasa = (casaId: number) => `casa:${casaId}`;
const roomUsuario = (id: number) => `user:${id}`;

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
    if (rol === "GUARDIA") socket.join("guardias");
    if (rol === "ADMIN") socket.join("admins");
    try {
      const membresias = await prisma.casaMiembro.findMany({ where: { usuarioId: id }, select: { casaId: true } });
      membresias.forEach((m) => socket.join(roomCasa(m.casaId)));
    } catch (err) {
      logger.warn({ err }, "No se pudieron cargar las casas del socket");
    }
    logger.debug({ usuarioId: id, rol }, "Socket conectado");
  });

  return io;
}

/** Eventos que ven los miembros de la casa, los guardias y los admins. */
export function emitirCasa(casaId: number | null | undefined, evento: string, datos: unknown) {
  if (!io) return;
  const destino = casaId ? io.to(roomCasa(casaId)).to("guardias").to("admins") : io.to("guardias").to("admins");
  destino.emit(evento, datos);
}

/** Solo miembros de la casa y admins (ej. progreso de vinculación). */
export function emitirMiembros(casaId: number, evento: string, datos: unknown) {
  if (!io) return;
  io.to(roomCasa(casaId)).to("admins").emit(evento, datos);
}

/** Cuando cambian las casas de un usuario, actualiza las rooms de sus sockets abiertos. */
export async function refrescarRoomsUsuario(usuarioId: number) {
  if (!io) return;
  const membresias = await prisma.casaMiembro.findMany({ where: { usuarioId }, select: { casaId: true } });
  const deseadas = new Set(membresias.map((m) => roomCasa(m.casaId)));
  const sockets = await io.in(roomUsuario(usuarioId)).fetchSockets();
  for (const s of sockets) {
    for (const r of s.rooms) if (r.startsWith("casa:") && !deseadas.has(r)) s.leave(r);
    deseadas.forEach((r) => s.join(r));
  }
}

/** Corta los sockets de un usuario (desactivado, cambio de clave, logout global). */
export function desconectarUsuario(usuarioId: number) {
  io?.in(roomUsuario(usuarioId)).disconnectSockets(true);
}

export function socketActivo(): boolean {
  return io !== null;
}
