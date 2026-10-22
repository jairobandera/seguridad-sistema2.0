import { Dispositivo, Severidad } from "@prisma/client";
import { config } from "../../core/config";
import { logger } from "../../core/logger";
import { prisma } from "../../core/prisma";
import { emitirCasa } from "../../core/socket";
import { enviarPush } from "../../core/notificaciones/push";
import { enviarSms } from "../../core/notificaciones/sms";
import { direccionCasa, eventoDTO, EventoDTO, incluirEvento } from "../eventos/evento.dto";

/** Eventos más viejos que esto (llegados tarde desde la cola de la placa) no disparan alarma. */
const MAX_ATRASO_ALARMA_MS = 15 * 60_000;

const retardosPendientes = new Map<number, NodeJS.Timeout>();
const ultimoSmsPorCasa = new Map<number, number>();

// ---------------------------------------------------------------------------
// Estado de la casa (lo que ve la app en tiempo real)
// ---------------------------------------------------------------------------
export async function estadoCasa(casaId: number) {
  const casa = await prisma.casa.findUnique({
    where: { id: casaId },
    include: { dispositivos: { orderBy: { vinculadoEn: "desc" } } },
  });
  if (!casa) return null;
  const disp = casa.dispositivos[0] ?? null;
  return {
    casaId: casa.id,
    alarmaArmada: casa.alarmaArmada,
    puertaAbierta: casa.dispositivos.some((d) => d.puertaAbierta === true),
    online: casa.dispositivos.some((d) => d.online),
    rssi: disp?.wifiRssi ?? null,
    ssid: disp?.wifiSsid ?? null,
    dispositivo: disp
      ? {
          id: disp.id,
          deviceId: disp.deviceId,
          nombre: disp.nombre,
          online: disp.online,
          firmwareVersion: disp.firmwareVersion,
          ultimaConexion: disp.ultimaConexion?.toISOString() ?? null,
        }
      : null,
  };
}

export async function emitirEstadoCasa(casaId: number | null | undefined) {
  if (!casaId) return;
  const estado = await estadoCasa(casaId);
  if (estado) emitirCasa(casaId, "casa:estado", estado);
}

// ---------------------------------------------------------------------------
// Creación de eventos
// ---------------------------------------------------------------------------
interface NuevoEvento {
  tipo: string;
  severidad: Severidad;
  casaId: number | null;
  dispositivoId?: number | null;
  usuarioId?: number | null;
  alarmaArmada: boolean;
  fechaHora?: Date;
  seq?: number | null;
  origen: string;
  valor?: string | null;
  requiereAtencion?: boolean;
}

export async function crearEvento(d: NuevoEvento): Promise<EventoDTO> {
  const e = await prisma.evento.create({
    data: {
      tipo: d.tipo,
      severidad: d.severidad,
      casaId: d.casaId,
      dispositivoId: d.dispositivoId ?? null,
      usuarioId: d.usuarioId ?? null,
      alarmaArmada: d.alarmaArmada,
      fechaHora: d.fechaHora ?? new Date(),
      seq: d.seq ?? null,
      origen: d.origen,
      valor: d.valor ?? null,
      estado: d.requiereAtencion ? { create: {} } : undefined,
    },
    include: incluirEvento,
  });
  const dto = eventoDTO(e);
  emitirCasa(d.casaId, "evento:nuevo", dto);
  return dto;
}

// ---------------------------------------------------------------------------
// Destinatarios
// ---------------------------------------------------------------------------
async function destinatarios(casaId: number) {
  const [miembros, guardias] = await Promise.all([
    prisma.casaMiembro.findMany({
      where: { casaId, usuario: { activo: true } },
      include: { usuario: { include: { contactos: { where: { activo: true } } } } },
    }),
    prisma.usuario.findMany({ where: { rol: "GUARDIA", activo: true }, select: { id: true } }),
  ]);
  const duenos = miembros.filter((m) => m.rol === "DUENO").map((m) => m.usuario);
  const telefonos = new Set<string>();
  for (const d of duenos) {
    if (d.telefono) telefonos.add(d.telefono);
    d.contactos.forEach((c) => telefonos.add(c.telefono));
  }
  return {
    miembrosIds: miembros.map((m) => m.usuarioId),
    guardiasIds: guardias.map((g) => g.id),
    telefonosSms: [...telefonos],
  };
}

async function enviarSmsCasa(casaId: number, eventoId: number, cuerpo: string) {
  const ahora = Date.now();
  const ultimo = ultimoSmsPorCasa.get(casaId) ?? 0;
  if (ahora - ultimo < config.SMS_MINUTOS_ENTRE_ALERTAS * 60_000) {
    logger.info({ casaId }, "SMS omitido (anti-spam)");
    return;
  }
  ultimoSmsPorCasa.set(casaId, ahora);
  const { telefonosSms } = await destinatarios(casaId);
  for (const tel of telefonosSms) {
    const r = await enviarSms(tel, cuerpo);
    await prisma.notificacion.create({
      data: { tipo: "ALARMA", mensaje: cuerpo, canal: "SMS", destino: tel, entregado: r.ok, error: r.error, eventoId },
    });
  }
}

/** Alerta crítica: estado PENDIENTE para guardias, push con sirena a todos y SMS. */
async function dispararAlarma(evento: EventoDTO, casaId: number) {
  await prisma.eventoEstado.upsert({ where: { eventoId: evento.id }, update: {}, create: { eventoId: evento.id } });
  const { miembrosIds, guardiasIds } = await destinatarios(casaId);
  const lugar = direccionCasa(evento.casa);
  await enviarPush(
    [...miembrosIds, ...guardiasIds],
    {
      titulo: "🚨 ¡PUERTA ABIERTA!",
      cuerpo: `${lugar}: se abrió la puerta con la alarma armada`,
      datos: { tipo: "ALARMA", eventoId: evento.id, casaId },
      alarma: true,
      tipo: "ALARMA",
    },
    evento.id,
  );
  await enviarSmsCasa(casaId, evento.id, `ALERTA: se abrió la puerta en ${lugar} con la alarma armada.`);
}

// ---------------------------------------------------------------------------
// Puerta
// ---------------------------------------------------------------------------
function fechaDesdeTs(ts: number | undefined): Date {
  const ahora = Date.now();
  if (!ts) return new Date(ahora);
  const ms = ts * 1000;
  // Hora inválida (placa sin NTP o reloj corrido): usar la de recepción
  if (ms > ahora + 5 * 60_000 || ms < Date.UTC(2024, 0, 1)) return new Date(ahora);
  return new Date(ms);
}

export async function procesarEventoPuerta(
  disp: Dispositivo,
  e: { abierta: boolean; seq?: number; ts?: number },
): Promise<EventoDTO | null> {
  if (!disp.casaId) return null;

  // Deduplicación atómica: solo pasa si el seq es nuevo
  if (e.seq !== undefined) {
    const r = await prisma.dispositivo.updateMany({
      where: { id: disp.id, ultimoSeq: { lt: e.seq } },
      data: { ultimoSeq: e.seq },
    });
    if (r.count === 0) {
      logger.debug({ deviceId: disp.deviceId, seq: e.seq }, "Evento duplicado ignorado");
      return null;
    }
  }

  const fechaHora = fechaDesdeTs(e.ts);
  const atrasado = Date.now() - fechaHora.getTime() > MAX_ATRASO_ALARMA_MS;
  if (!atrasado) {
    await prisma.dispositivo.update({ where: { id: disp.id }, data: { puertaAbierta: e.abierta } });
  }

  const casa = await prisma.casa.findUnique({ where: { id: disp.casaId } });
  if (!casa) return null;

  let severidad: Severidad = "INFO";
  if (e.abierta && casa.alarmaArmada && !atrasado) {
    severidad = casa.retardoEntradaSeg > 0 ? "ALERTA" : "CRITICA";
  }

  const evento = await crearEvento({
    tipo: e.abierta ? "PUERTA_ABIERTA" : "PUERTA_CERRADA",
    severidad,
    casaId: casa.id,
    dispositivoId: disp.id,
    alarmaArmada: casa.alarmaArmada,
    fechaHora,
    seq: e.seq ?? null,
    origen: "MQTT",
    valor: atrasado ? "registrado_sin_conexion" : null,
  });
  await emitirEstadoCasa(casa.id);

  if (severidad === "CRITICA") {
    await dispararAlarma(evento, casa.id);
  } else if (severidad === "ALERTA") {
    // Retardo de entrada: si nadie desarma a tiempo, se dispara la alarma
    programarRetardo(casa.id, evento, casa.retardoEntradaSeg);
  }
  return evento;
}

function programarRetardo(casaId: number, evento: EventoDTO, segundos: number) {
  if (retardosPendientes.has(casaId)) return; // ya hay una cuenta regresiva en curso
  const t = setTimeout(async () => {
    retardosPendientes.delete(casaId);
    try {
      const casa = await prisma.casa.findUnique({ where: { id: casaId } });
      if (!casa?.alarmaArmada) return;
      const actualizado = await prisma.evento.update({
        where: { id: evento.id },
        data: { severidad: "CRITICA" },
        include: incluirEvento,
      });
      const dto = eventoDTO(actualizado);
      emitirCasa(casaId, "evento:nuevo", dto);
      await dispararAlarma(dto, casaId);
    } catch (err) {
      logger.error({ err, casaId }, "Error disparando alarma tras retardo");
    }
  }, segundos * 1000);
  t.unref?.();
  retardosPendientes.set(casaId, t);
}

function cancelarRetardo(casaId: number) {
  const t = retardosPendientes.get(casaId);
  if (t) {
    clearTimeout(t);
    retardosPendientes.delete(casaId);
  }
}

// ---------------------------------------------------------------------------
// Armar / desarmar
// ---------------------------------------------------------------------------
export async function cambiarAlarma(usuarioId: number, casaId: number, armada: boolean) {
  const casa = await prisma.casa.findUniqueOrThrow({ where: { id: casaId } });
  if (!armada) cancelarRetardo(casaId);
  if (casa.alarmaArmada !== armada) {
    await prisma.casa.update({ where: { id: casaId }, data: { alarmaArmada: armada } });
    await crearEvento({
      tipo: armada ? "ALARMA_ARMADA" : "ALARMA_DESARMADA",
      severidad: "INFO",
      casaId,
      usuarioId,
      alarmaArmada: armada,
      origen: "APP",
    });
  }
  const estado = await estadoCasa(casaId);
  if (estado) emitirCasa(casaId, "casa:estado", estado);
  return {
    estado,
    advertencia: armada && estado?.puertaAbierta ? "puerta_abierta" : null,
  };
}

// ---------------------------------------------------------------------------
// Conexión de la placa
// ---------------------------------------------------------------------------
export async function registrarConexion(disp: Dispositivo, online: boolean) {
  if (!disp.casaId) return;
  const casa = await prisma.casa.findUnique({ where: { id: disp.casaId } });
  if (!casa) return;

  const evento = await crearEvento({
    tipo: online ? "DISPOSITIVO_ONLINE" : "DISPOSITIVO_OFFLINE",
    severidad: online ? "INFO" : casa.alarmaArmada ? "ALERTA" : "INFO",
    casaId: casa.id,
    dispositivoId: disp.id,
    alarmaArmada: casa.alarmaArmada,
    origen: "MQTT",
    requiereAtencion: !online && casa.alarmaArmada,
  });
  await emitirEstadoCasa(casa.id);

  if (!online) {
    const { miembrosIds, guardiasIds } = await destinatarios(casa.id);
    const lugar = direccionCasa(evento.casa);
    await enviarPush(
      casa.alarmaArmada ? [...miembrosIds, ...guardiasIds] : miembrosIds,
      {
        titulo: "Placa sin conexión",
        cuerpo: `${lugar}: la placa de seguridad se desconectó`,
        datos: { tipo: "OFFLINE", eventoId: evento.id, casaId: casa.id },
        tipo: "OFFLINE",
      },
      evento.id,
    );
    if (casa.alarmaArmada) {
      await enviarSmsCasa(casa.id, evento.id, `AVISO: la placa de seguridad de ${lugar} se desconectó con la alarma armada.`);
    }
  }
}

/** Solo para tests. */
export function _reiniciarEstadoInterno() {
  retardosPendientes.forEach((t) => clearTimeout(t));
  retardosPendientes.clear();
  ultimoSmsPorCasa.clear();
}
