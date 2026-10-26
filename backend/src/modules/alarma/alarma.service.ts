import { Dispositivo, Severidad } from "@prisma/client";
import { config } from "../../core/config";
import { HttpError } from "../../core/errores";
import { logger } from "../../core/logger";
import { prisma } from "../../core/prisma";
import { emitirCasa } from "../../core/socket";
import { enviarPush } from "../../core/notificaciones/push";
import { enviarSms } from "../../core/notificaciones/sms";
import { direccionCasa, eventoDTO, EventoDTO, incluirEvento } from "../eventos/evento.dto";
import { barrioConGuardiaDeCasa, guardiasDeCasa } from "../barrios/barrio.service";
import { enviarComando } from "../../core/mqtt/comandos";

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
    include: { dispositivos: { orderBy: { vinculadoEn: "asc" } } },
  });
  if (!casa) return null;
  const dispositivos = casa.dispositivos.map((d) => ({
    id: d.id,
    deviceId: d.deviceId,
    nombre: d.nombre,
    online: d.online,
    puertaAbierta: d.puertaAbierta,
    rssi: d.wifiRssi,
    ssid: d.wifiSsid,
    bateria: d.bateria,
    /** Armado parcial: quedó afuera de la alarma (no la dispara) */
    excluido: casa.alarmaArmada && d.excluidoAlarma,
    firmwareVersion: d.firmwareVersion,
    ultimaConexion: d.ultimaConexion?.toISOString() ?? null,
  }));
  return {
    casaId: casa.id,
    alarmaArmada: casa.alarmaArmada,
    // Agregados: alguna abierta / todos conectados
    puertaAbierta: dispositivos.some((d) => d.puertaAbierta === true),
    online: dispositivos.length > 0 && dispositivos.every((d) => d.online),
    dispositivosOffline: dispositivos.filter((d) => !d.online).length,
    armadoParcial: dispositivos.some((d) => d.excluido),
    tieneGuardia: (await barrioConGuardiaDeCasa(casa.id)) !== null,
    dispositivos,
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
  // Solo las casas con guardia tienen eventos "pendientes de atender"
  const requiereAtencion = !!d.requiereAtencion && !!d.casaId && (await barrioConGuardiaDeCasa(d.casaId)) !== null;
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
      estado: requiereAtencion ? { create: {} } : undefined,
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
    guardiasDeCasa(casaId),
  ]);
  const duenos = miembros.filter((m) => m.rol === "DUENO").map((m) => m.usuario);
  const telefonos = new Set<string>();
  for (const d of duenos) {
    if (d.telefono) telefonos.add(d.telefono);
    d.contactos.forEach((c) => telefonos.add(c.telefono));
  }
  return {
    miembrosIds: miembros.map((m) => m.usuarioId),
    guardiasIds: guardias,
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

/** Nombre del dispositivo para los mensajes ("Puerta trasera"), o un genérico. */
const nombreDispositivo = (nombre: string | null | undefined, generico: string) => nombre?.trim() || generico;

/** Alerta crítica: estado PENDIENTE para guardias (si la casa tiene), push con sirena y SMS. */
async function dispararAlarma(evento: EventoDTO, casaId: number) {
  if ((await barrioConGuardiaDeCasa(casaId)) !== null) {
    await prisma.eventoEstado.upsert({ where: { eventoId: evento.id }, update: {}, create: { eventoId: evento.id } });
  }
  const { miembrosIds, guardiasIds } = await destinatarios(casaId);
  const lugar = direccionCasa(evento.casa);
  const que = nombreDispositivo(evento.dispositivo?.nombre, "la puerta");
  await enviarPush(
    [...miembrosIds, ...guardiasIds],
    {
      titulo: `🚨 ¡ALARMA! ${nombreDispositivo(evento.dispositivo?.nombre, "Puerta")} abierta`,
      cuerpo: `${lugar}: se abrió ${que} con la alarma armada`,
      datos: { tipo: "ALARMA", eventoId: evento.id, casaId },
      alarma: true,
      tipo: "ALARMA",
    },
    evento.id,
  );
  await enviarSmsCasa(casaId, evento.id, `ALERTA: se abrió ${que} en ${lugar} con la alarma armada.`);
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
  if (e.abierta && casa.alarmaArmada && !disp.excluidoAlarma && !atrasado) {
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

/** MySQL cancela una de dos transacciones que chocan (deadlock, P2034): se reintenta. */
async function conReintento<T>(fn: () => Promise<T>, intentos = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const choque = (err as { code?: string }).code === "P2034";
      if (!choque || i >= intentos) throw err;
      await new Promise((r) => setTimeout(r, 30 * i));
    }
  }
}

// ---------------------------------------------------------------------------
// Hibernación de las placas
// ---------------------------------------------------------------------------
/**
 * Con la alarma desarmada (o si el dispositivo quedó afuera del armado) la placa entra en ahorro de energía;
 * armada vuelve a modo normal. No se espera la respuesta: si la placa no está conectada, se le manda al conectarse.
 */
export function enviarModoAhorro(disp: Pick<Dispositivo, "deviceId" | "excluidoAlarma">, alarmaArmada: boolean) {
  const activo = !alarmaArmada || disp.excluidoAlarma;
  void enviarComando(disp.deviceId, "ahorro", 5_000, { activo }).catch((err) =>
    logger.warn({ err, deviceId: disp.deviceId }, "No se pudo mandar el modo ahorro"),
  );
}

// ---------------------------------------------------------------------------
// Armar / desarmar
// ---------------------------------------------------------------------------
/**
 * Arma o desarma la casa. `excluir`: dispositivos que quedan afuera de este armado (armado parcial,
 * ej. una ventana abierta). Al desarmar se limpia: el próximo "armar todo" vuelve a incluirlos.
 */
export async function cambiarAlarma(usuarioId: number, casaId: number, armada: boolean, excluir: number[] = []) {
  const casa = await prisma.casa.findUniqueOrThrow({ where: { id: casaId }, include: { dispositivos: true } });
  const fuera = armada ? [...new Set(excluir)] : [];
  if (fuera.some((id) => !casa.dispositivos.some((d) => d.id === id))) {
    throw new HttpError(400, "dispositivo_invalido", "Alguno de los dispositivos no es de esta casa");
  }
  if (fuera.length && fuera.length >= casa.dispositivos.length) {
    throw new HttpError(400, "sin_dispositivos", "Dejá al menos un dispositivo en la alarma");
  }
  const antes = new Set(casa.dispositivos.filter((d) => d.excluidoAlarma).map((d) => d.id));
  const cambiaronExcluidos = antes.size !== fuera.length || fuera.some((id) => !antes.has(id));

  if (!armada) cancelarRetardo(casaId);
  // Por id (bloquea solo esas filas): con "todos los de la casa" chocaba con los mensajes de las placas
  const adentro = casa.dispositivos.map((d) => d.id).filter((id) => !fuera.includes(id));
  await conReintento(() =>
    prisma.$transaction([
      prisma.dispositivo.updateMany({ where: { id: { in: adentro } }, data: { excluidoAlarma: false } }),
      prisma.dispositivo.updateMany({ where: { id: { in: fuera } }, data: { excluidoAlarma: true } }),
      prisma.casa.update({ where: { id: casaId }, data: { alarmaArmada: armada } }),
    ]),
  );
  if (casa.alarmaArmada !== armada || (armada && cambiaronExcluidos)) {
    const nombres = casa.dispositivos.filter((d) => fuera.includes(d.id)).map((d) => nombreDispositivo(d.nombre, d.deviceId));
    await crearEvento({
      tipo: armada ? "ALARMA_ARMADA" : "ALARMA_DESARMADA",
      severidad: "INFO",
      casaId,
      usuarioId,
      alarmaArmada: armada,
      origen: "APP",
      valor: nombres.length ? `Sin: ${nombres.join(", ")}` : null,
    });
  }
  const estado = await estadoCasa(casaId);
  if (estado) emitirCasa(casaId, "casa:estado", estado);
  const actuales = await prisma.dispositivo.findMany({ where: { casaId }, select: { deviceId: true, excluidoAlarma: true } });
  actuales.forEach((d) => enviarModoAhorro(d, armada));
  // Solo importa lo que quedó adentro de la alarma
  const abiertoAdentro = estado?.dispositivos.some((d) => d.puertaAbierta === true && !d.excluido);
  return {
    estado,
    advertencia: armada && abiertoAdentro ? "puerta_abierta" : null,
  };
}

// ---------------------------------------------------------------------------
// Conexión de los dispositivos
// ---------------------------------------------------------------------------
export async function registrarConexion(disp: Dispositivo, online: boolean) {
  if (!disp.casaId) return;
  const casa = await prisma.casa.findUnique({ where: { id: disp.casaId } });
  if (!casa) return;
  // Un dispositivo que quedó afuera del armado no genera alerta si se desconecta
  const vigilado = casa.alarmaArmada && !disp.excluidoAlarma;
  // Al conectarse, la placa se entera de si tiene que hibernar
  if (online) enviarModoAhorro(disp, casa.alarmaArmada);

  const evento = await crearEvento({
    tipo: online ? "DISPOSITIVO_ONLINE" : "DISPOSITIVO_OFFLINE",
    severidad: online ? "INFO" : vigilado ? "ALERTA" : "INFO",
    casaId: casa.id,
    dispositivoId: disp.id,
    alarmaArmada: casa.alarmaArmada,
    origen: "MQTT",
    requiereAtencion: !online && vigilado,
  });
  await emitirEstadoCasa(casa.id);

  if (!online) {
    const { miembrosIds, guardiasIds } = await destinatarios(casa.id);
    const lugar = direccionCasa(evento.casa);
    const que = nombreDispositivo(disp.nombre, "el dispositivo de seguridad");
    // Con poca batería en el último dato, lo más probable es que se haya apagado por eso
    const porBateria = disp.bateria != null && disp.bateria <= BATERIA_SOSPECHA_PCT;
    const motivo = porBateria ? ` (seguramente se quedó sin batería: tenía ${disp.bateria} %)` : "";
    await enviarPush(
      vigilado ? [...miembrosIds, ...guardiasIds] : miembrosIds,
      {
        titulo: "Dispositivo sin conexión",
        cuerpo: `${lugar}: ${que} se desconectó${motivo}`,
        datos: { tipo: "OFFLINE", eventoId: evento.id, casaId: casa.id },
        tipo: "OFFLINE",
      },
      evento.id,
    );
    if (vigilado) {
      await enviarSmsCasa(casa.id, evento.id, `AVISO: ${que} de ${lugar} se desconectó con la alarma armada${motivo}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Batería baja
// ---------------------------------------------------------------------------
const BATERIA_BAJA_PCT = 20;
const BATERIA_CRITICA_PCT = 10;
// Recién al superar este % (la cargaron) se vuelve a avisar: evita repetir si la lectura oscila
const BATERIA_REARME_PCT = 30;
// Si se desconecta con este % o menos, el aviso dice que seguramente fue la batería
const BATERIA_SOSPECHA_PCT = 25;

/** Avisa una vez al 20 % y otra al 10 % a la familia (push, sin sirena). */
export async function revisarBateria(disp: Dispositivo) {
  if (!disp.casaId || disp.bateria == null) return;
  if (disp.bateria >= BATERIA_REARME_PCT) {
    if (disp.avisoBateria != null) await prisma.dispositivo.update({ where: { id: disp.id }, data: { avisoBateria: null } });
    return;
  }
  const umbral = disp.bateria <= BATERIA_CRITICA_PCT ? BATERIA_CRITICA_PCT : disp.bateria <= BATERIA_BAJA_PCT ? BATERIA_BAJA_PCT : null;
  if (!umbral || (disp.avisoBateria != null && disp.avisoBateria <= umbral)) return;
  // Atómico: si llegan dos lecturas juntas, avisa una sola
  const r = await prisma.dispositivo.updateMany({
    where: { id: disp.id, OR: [{ avisoBateria: null }, { avisoBateria: { gt: umbral } }] },
    data: { avisoBateria: umbral },
  });
  if (r.count === 0) return;

  const casa = await prisma.casa.findUnique({ where: { id: disp.casaId } });
  if (!casa) return;
  const evento = await crearEvento({
    tipo: "BATERIA_BAJA",
    severidad: umbral === BATERIA_CRITICA_PCT ? "ALERTA" : "INFO",
    casaId: casa.id,
    dispositivoId: disp.id,
    alarmaArmada: casa.alarmaArmada,
    origen: "MQTT",
    valor: String(disp.bateria),
  });
  const { miembrosIds } = await destinatarios(casa.id);
  const que = nombreDispositivo(disp.nombre, "El dispositivo de seguridad");
  await enviarPush(
    miembrosIds,
    umbral === BATERIA_CRITICA_PCT
      ? {
          titulo: "🪫 Batería muy baja",
          cuerpo: `${direccionCasa(evento.casa)}: ${que} tiene ${disp.bateria} % de batería y puede apagarse. Cargalo ya.`,
          datos: { tipo: "BATERIA", eventoId: evento.id, casaId: casa.id },
          tipo: "BATERIA",
        }
      : {
          titulo: "🔋 Batería baja",
          cuerpo: `${direccionCasa(evento.casa)}: ${que} tiene ${disp.bateria} % de batería. Cargalo pronto.`,
          datos: { tipo: "BATERIA", eventoId: evento.id, casaId: casa.id },
          tipo: "BATERIA",
        },
    evento.id,
  );
}

/** Solo para tests. */
export function _reiniciarEstadoInterno() {
  retardosPendientes.forEach((t) => clearTimeout(t));
  retardosPendientes.clear();
  ultimoSmsPorCasa.clear();
}
