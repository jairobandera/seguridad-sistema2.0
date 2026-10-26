import type { Server, Socket } from "socket.io";
import { logger } from "../../core/logger";
import { prisma } from "../../core/prisma";
import { alCambiarConexion, placaConectada } from "../../core/mqtt/broker";
import { enviarComando } from "../../core/mqtt/comandos";

/**
 * Monitor serial por internet (docs/protocolo.md §3 y §4): un admin abre el monitor de una placa, la placa manda
 * lo que imprime a dev/{id}/log y se reenvía solo a los admins que lo están mirando. La placa lo apaga sola a los
 * 3 min si no se renueva: mientras haya alguien mirando, se renueva cada minuto.
 */
const RENOVAR_MS = 60_000;
const DEVICE_ID = /^[0-9A-F]{12}$/;

let io: Server | null = null;
let renovacion: NodeJS.Timeout | null = null;

const roomMonitor = (deviceId: string) => `monitor:${deviceId}`;

function mirando(deviceId: string): boolean {
  return (io?.sockets.adapter.rooms.get(roomMonitor(deviceId))?.size ?? 0) > 0;
}

function pedirMonitor(deviceId: string, activo: boolean) {
  void enviarComando(deviceId, "monitor", 5_000, { activo }).catch((err) =>
    logger.warn({ err, deviceId }, "No se pudo mandar el comando monitor"),
  );
}

/** Placas con al menos un admin mirando. */
function placasMiradas(): string[] {
  if (!io) return [];
  return [...io.sockets.adapter.rooms.entries()]
    .filter(([nombre, sockets]) => nombre.startsWith("monitor:") && sockets.size > 0)
    .map(([nombre]) => nombre.slice("monitor:".length));
}

export function iniciarMonitor(servidor: Server) {
  io = servidor;
  renovacion = setInterval(() => placasMiradas().forEach((id) => pedirMonitor(id, true)), RENOVAR_MS);
  renovacion.unref?.();
  // La placa se reconectó (o se cayó) con alguien mirando: se le vuelve a pedir y se avisa en la pantalla
  alCambiarConexion((deviceId, online) => {
    if (!mirando(deviceId)) return;
    io?.to(roomMonitor(deviceId)).emit("monitor:estado", { deviceId, online });
    if (online) pedirMonitor(deviceId, true);
  });
}

export function detenerMonitor() {
  if (renovacion) clearInterval(renovacion);
  renovacion = null;
  io = null;
}

/** Texto que mandó la placa (dev/{id}/log): a los admins que la están mirando. */
export function reenviarLog(deviceId: string, texto: string) {
  if (!mirando(deviceId)) return;
  io?.to(roomMonitor(deviceId)).emit("monitor:linea", { deviceId, texto });
}

/** Eventos `monitor:abrir` / `monitor:cerrar` de un socket. Solo para admins. */
export function escucharMonitor(socket: Socket) {
  const salir = (deviceId: string) => {
    socket.leave(roomMonitor(deviceId));
    if (!mirando(deviceId)) pedirMonitor(deviceId, false);
  };

  socket.on("monitor:abrir", async (datos: unknown, responder?: (r: unknown) => void) => {
    const deviceId = typeof (datos as { deviceId?: unknown })?.deviceId === "string" ? (datos as { deviceId: string }).deviceId : "";
    const ok = DEVICE_ID.test(deviceId) && !!(await prisma.dispositivo.findUnique({ where: { deviceId }, select: { id: true } }));
    if (!ok) return responder?.({ ok: false, error: "no_encontrado" });
    socket.join(roomMonitor(deviceId));
    pedirMonitor(deviceId, true);
    responder?.({ ok: true, online: placaConectada(deviceId) });
  });

  socket.on("monitor:cerrar", (datos: unknown) => {
    const deviceId = (datos as { deviceId?: unknown })?.deviceId;
    if (typeof deviceId === "string" && DEVICE_ID.test(deviceId)) salir(deviceId);
  });

  // Se fue sin cerrar (cerró la app, se cortó internet): si era el último mirando, se apaga
  socket.on("disconnecting", () => {
    const placas = [...socket.rooms].filter((r) => r.startsWith("monitor:")).map((r) => r.slice("monitor:".length));
    setImmediate(() => placas.forEach((id) => !mirando(id) && pedirMonitor(id, false)));
  });
}
