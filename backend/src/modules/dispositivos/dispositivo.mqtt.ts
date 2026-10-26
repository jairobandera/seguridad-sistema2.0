import { Prisma } from "@prisma/client";
import { z } from "zod";
import { config } from "../../core/config";
import { logger } from "../../core/logger";
import { prisma } from "../../core/prisma";
import { alCambiarConexion, alRecibirMensaje, placaConectada, TipoMensaje } from "../../core/mqtt/broker";
import { resolverAck } from "../../core/mqtt/comandos";
import { emitirEstadoCasa, procesarEventoPuerta, registrarConexion, revisarBateria } from "../alarma/alarma.service";
import { reenviarLog } from "./monitor";

const esquemaState = z.object({
  online: z.boolean(),
  puerta: z.enum(["abierta", "cerrada"]).optional(),
  fw: z.string().max(20).optional(),
  ssid: z.string().max(64).optional(),
  rssi: z.number().int().min(-127).max(0).optional(),
  ip: z.string().max(45).optional(),
  bat: z.number().int().min(0).max(100).optional(),
  mv: z.number().int().min(0).max(6000).optional(),
});

const esquemaEvento = z.object({
  seq: z.number().int().positive(),
  tipo: z.enum(["PUERTA_ABIERTA", "PUERTA_CERRADA"]),
  ts: z.number().int().nonnegative().optional(),
});

const esquemaTelemetria = z.object({
  rssi: z.number().int().min(-127).max(0).optional(),
  uptime: z.number().nonnegative().optional(),
  heap: z.number().nonnegative().optional(),
  bat: z.number().int().min(0).max(100).optional(),
  mv: z.number().int().min(0).max(6000).optional(),
});

const esquemaAck = z.object({
  id: z.string().max(64),
  ok: z.boolean(),
  error: z.string().max(100).nullish(),
});

// Sin `bat` la placa no tiene batería conectada: se borra el último valor
const bateriaDe = (m: { bat?: number; mv?: number }) => ({ bateria: m.bat ?? null, bateriaMv: m.bat !== undefined ? (m.mv ?? null) : null });

// Procesa los mensajes de cada placa en orden (evita condiciones de carrera)
const colas = new Map<string, Promise<void>>();
function enCola(deviceId: string, tarea: () => Promise<void>) {
  const previa = colas.get(deviceId) ?? Promise.resolve();
  const siguiente = previa
    .then(tarea)
    .catch((err) => logger.error({ err, deviceId }, "Error procesando mensaje de placa"))
    .finally(() => {
      if (colas.get(deviceId) === siguiente) colas.delete(deviceId);
    });
  colas.set(deviceId, siguiente);
  return siguiente;
}

const offlinePendientes = new Map<string, NodeJS.Timeout>();

function cancelarOffline(deviceId: string) {
  const t = offlinePendientes.get(deviceId);
  if (t) {
    clearTimeout(t);
    offlinePendientes.delete(deviceId);
  }
}

async function marcarOnline(deviceId: string, extra: Prisma.DispositivoUpdateInput = {}, emitir = false) {
  cancelarOffline(deviceId);
  const antes = await prisma.dispositivo.findUnique({ where: { deviceId } });
  if (!antes?.casaId) return null;
  const disp = await prisma.dispositivo.update({
    where: { deviceId },
    data: { ...extra, online: true, ultimaConexion: new Date() },
  });
  if (!antes.online) await registrarConexion(disp, true);
  else if (emitir || disp.bateria !== antes.bateria) await emitirEstadoCasa(disp.casaId);
  if (disp.bateria !== antes.bateria) await revisarBateria(disp);
  return disp;
}

async function marcarOffline(deviceId: string) {
  const r = await prisma.dispositivo.updateMany({ where: { deviceId, online: true }, data: { online: false } });
  if (r.count === 0) return;
  const disp = await prisma.dispositivo.findUnique({ where: { deviceId } });
  if (disp) {
    logger.info({ deviceId }, "Placa offline");
    await registrarConexion(disp, false);
  }
}

/** Espera un margen antes de declarar offline (cortes breves de WiFi o reinicios). */
function programarOffline(deviceId: string) {
  if (offlinePendientes.has(deviceId)) return;
  const t = setTimeout(() => {
    offlinePendientes.delete(deviceId);
    if (placaConectada(deviceId)) return;
    enCola(deviceId, () => marcarOffline(deviceId));
  }, config.DEVICE_OFFLINE_GRACIA_SEG * 1000);
  t.unref?.();
  offlinePendientes.set(deviceId, t);
}

function parsear<T>(esquema: z.ZodType<T>, payload: Buffer, deviceId: string, tipo: string): T | null {
  try {
    const r = esquema.safeParse(JSON.parse(payload.toString("utf8")));
    if (r.success) return r.data;
  } catch {
    /* JSON inválido */
  }
  logger.warn({ deviceId, tipo }, "Mensaje MQTT inválido descartado");
  return null;
}

async function manejar(deviceId: string, tipo: TipoMensaje, payload: Buffer) {
  switch (tipo) {
    case "state": {
      const s = parsear(esquemaState, payload, deviceId, tipo);
      if (!s) return;
      if (!s.online) return programarOffline(deviceId);
      await marcarOnline(
        deviceId,
        {
          ...(s.puerta ? { puertaAbierta: s.puerta === "abierta" } : {}),
          ...(s.fw ? { firmwareVersion: s.fw } : {}),
          ...(s.ssid !== undefined ? { wifiSsid: s.ssid } : {}),
          ...(s.rssi !== undefined ? { wifiRssi: s.rssi } : {}),
          ...(s.ip ? { ip: s.ip } : {}),
          ...bateriaDe(s),
        },
        true,
      );
      return;
    }
    case "event": {
      const e = parsear(esquemaEvento, payload, deviceId, tipo);
      if (!e) return;
      const disp = await marcarOnline(deviceId);
      if (!disp) return;
      await procesarEventoPuerta(disp, { abierta: e.tipo === "PUERTA_ABIERTA", seq: e.seq, ts: e.ts });
      return;
    }
    case "telemetry": {
      const t = parsear(esquemaTelemetria, payload, deviceId, tipo);
      if (!t) return;
      await marcarOnline(deviceId, { ...(t.rssi !== undefined ? { wifiRssi: t.rssi } : {}), ...bateriaDe(t) });
      return;
    }
    case "log":
      // Texto del monitor serial: no se guarda, solo se reenvía a los admins que miran
      reenviarLog(deviceId, payload.toString("utf8").slice(0, 4000));
      return;
    case "ack": {
      const a = parsear(esquemaAck, payload, deviceId, tipo);
      if (a) resolverAck(a.id, a.ok, a.error ?? null);
      return;
    }
  }
}

let watchdog: NodeJS.Timeout | null = null;

export function iniciarManejadoresMqtt() {
  alRecibirMensaje((deviceId, tipo, payload) => {
    if (tipo === "ack" || tipo === "log") {
      // Los ACK no esperan la cola (alguien espera la respuesta), ni el monitor (no toca la base)
      void manejar(deviceId, tipo, payload);
      return;
    }
    void enCola(deviceId, () => manejar(deviceId, tipo, payload));
  });

  alCambiarConexion((deviceId, conectado) => {
    if (conectado) void enCola(deviceId, async () => void (await marcarOnline(deviceId)));
    else programarOffline(deviceId);
  });

  // Respaldo: placas marcadas online que dejaron de reportar
  watchdog = setInterval(async () => {
    try {
      const limite = new Date(Date.now() - config.DEVICE_OFFLINE_SEG * 1000);
      const viejas = await prisma.dispositivo.findMany({
        where: { online: true, OR: [{ ultimaConexion: { lt: limite } }, { ultimaConexion: null }] },
        select: { deviceId: true },
      });
      for (const d of viejas) {
        if (!placaConectada(d.deviceId)) void enCola(d.deviceId, () => marcarOffline(d.deviceId));
      }
    } catch (err) {
      logger.error({ err }, "Error en watchdog de placas");
    }
  }, 30_000);
  watchdog.unref?.();
}

export async function detenerManejadoresMqtt() {
  if (watchdog) clearInterval(watchdog);
  offlinePendientes.forEach((t) => clearTimeout(t));
  offlinePendientes.clear();
  await Promise.all(colas.values());
}

/** Para tests: procesa un mensaje como si viniera del broker y espera a que termine. */
export function _procesarMensaje(deviceId: string, tipo: TipoMensaje, payload: object) {
  return enCola(deviceId, () => manejar(deviceId, tipo, Buffer.from(JSON.stringify(payload))));
}
