import { Dispositivo } from "@prisma/client";
import { config } from "../../core/config";
import { logger } from "../../core/logger";
import { prisma } from "../../core/prisma";
import { HttpError } from "../../core/errores";
import { cifrar, descifrar, sha256, tokenAleatorio } from "../../core/cripto";
import { desconectarPlaca } from "../../core/mqtt/broker";
import { emitirMiembros } from "../../core/socket";
import { crearEvento, emitirEstadoCasa } from "../alarma/alarma.service";

export function dispositivoPublico(d: Dispositivo) {
  return {
    id: d.id,
    deviceId: d.deviceId,
    nombre: d.nombre,
    casaId: d.casaId,
    online: d.online,
    puertaAbierta: d.puertaAbierta,
    wifiSsid: d.wifiSsid,
    wifiRssi: d.wifiRssi,
    bateria: d.bateria,
    firmwareVersion: d.firmwareVersion,
    ultimaConexion: d.ultimaConexion?.toISOString() ?? null,
    vinculadoEn: d.vinculadoEn?.toISOString() ?? null,
  };
}

interface DatosProvision {
  deviceId: string;
  codigo: string;
  secret: string;
  fw?: string;
}

/** Ventana en la que la misma placa puede repetir el canje (si no le llegó la respuesta). */
const REINTENTO_PROVISION_MS = 2 * 60_000;

/**
 * El código ya lo canjeó ESTA placa (mismo deviceId y mismo secreto) hace instantes: la respuesta se
 * perdió en el camino (WiFi por repetidor, Bluetooth activo...) y la placa reintenta.
 */
function esReintento(
  codigo: { casaId: number; usadoEn: Date | null },
  disp: Dispositivo | null,
  secret: string,
): boolean {
  if (!codigo.usadoEn || !disp?.vinculadoEn || !disp.secretEnc || disp.casaId !== codigo.casaId) return false;
  if (Date.now() - codigo.usadoEn.getTime() > REINTENTO_PROVISION_MS) return false;
  // El canje y la vinculación se guardan en el mismo instante
  if (Math.abs(disp.vinculadoEn.getTime() - codigo.usadoEn.getTime()) > 5_000) return false;
  try {
    return descifrar(disp.secretEnc) === secret.toLowerCase();
  } catch {
    return false;
  }
}

/** Credenciales MQTT nuevas para una placa recién vinculada que reintenta (las anteriores quedan anuladas). */
async function reemitirCredenciales(disp: Dispositivo) {
  const mqttPass = tokenAleatorio(24);
  await prisma.dispositivo.update({ where: { id: disp.id }, data: { mqttPassHash: sha256(mqttPass) } });
  desconectarPlaca(disp.deviceId);
  logger.info({ deviceId: disp.deviceId }, "Placa repitió la vinculación (no le llegó la respuesta)");
  return { mqtt: { url: config.MQTT_PUBLIC_URL, user: disp.deviceId, pass: mqttPass }, casaId: disp.casaId! };
}

/**
 * La placa canjea el código de vinculación (docs/protocolo.md §2).
 * Devuelve las credenciales MQTT propias de la placa.
 */
export async function provisionar(d: DatosProvision) {
  const codigo = await prisma.codigoVinculacion.findUnique({ where: { codigoHash: sha256(d.codigo) } });
  const existente = await prisma.dispositivo.findUnique({ where: { deviceId: d.deviceId } });
  if (codigo && esReintento(codigo, existente, d.secret)) return reemitirCredenciales(existente!);
  if (!codigo || codigo.usadoEn || codigo.expiraEn < new Date()) {
    throw new HttpError(400, "codigo_invalido", "El código de vinculación no es válido o venció");
  }
  if (existente?.casaId && existente.casaId !== codigo.casaId) {
    throw new HttpError(409, "ya_vinculada", "La placa está vinculada a otra casa");
  }

  // Nombre: el que eligió el dueño; si no eligió, se conserva el de antes (misma casa) o uno por defecto
  let nombre = codigo.nombreDispositivo ?? (existente?.casaId === codigo.casaId ? existente.nombre : null);
  if (!nombre) {
    const otros = await prisma.dispositivo.count({ where: { casaId: codigo.casaId, deviceId: { not: d.deviceId } } });
    nombre = otros === 0 ? "Puerta principal" : `Dispositivo ${otros + 1}`;
  }

  const mqttPass = tokenAleatorio(24);
  const datos = {
    nombre,
    casaId: codigo.casaId,
    secretEnc: cifrar(d.secret.toLowerCase()),
    mqttUsername: d.deviceId,
    mqttPassHash: sha256(mqttPass),
    vinculadoEn: new Date(),
    ultimoSeq: 0,
    online: false,
    puertaAbierta: null,
    firmwareVersion: d.fw ?? null,
  };

  const disp = await prisma.$transaction(async (tx) => {
    // Marca el código como usado de forma atómica (evita doble canje)
    const usado = await tx.codigoVinculacion.updateMany({
      where: { id: codigo.id, usadoEn: null },
      data: { usadoEn: new Date() },
    });
    if (usado.count !== 1) throw new HttpError(400, "codigo_invalido", "El código de vinculación ya se usó");
    return tx.dispositivo.upsert({
      where: { deviceId: d.deviceId },
      update: datos,
      create: { deviceId: d.deviceId, ...datos },
    });
  });

  // Si quedó una conexión con credenciales viejas, se corta
  desconectarPlaca(d.deviceId);

  await crearEvento({
    tipo: "DISPOSITIVO_VINCULADO",
    severidad: "INFO",
    casaId: codigo.casaId,
    dispositivoId: disp.id,
    usuarioId: codigo.usuarioId,
    alarmaArmada: false,
    origen: "PROVISION",
  });
  emitirMiembros(codigo.casaId, "dispositivo:config", { deviceId: d.deviceId, casaId: codigo.casaId, fase: "vinculada" });
  logger.info({ deviceId: d.deviceId, casaId: codigo.casaId }, "Placa vinculada");

  return { mqtt: { url: config.MQTT_PUBLIC_URL, user: d.deviceId, pass: mqttPass }, casaId: codigo.casaId };
}

/** Quita la placa de la casa y anula sus credenciales. */
export async function desvincular(disp: Dispositivo, fase: "desvinculada" | "reset" = "desvinculada") {
  const casaId = disp.casaId;
  await prisma.dispositivo.update({
    where: { id: disp.id },
    data: {
      casaId: null,
      secretEnc: null,
      mqttUsername: null,
      mqttPassHash: null,
      vinculadoEn: null,
      online: false,
      puertaAbierta: null,
    },
  });
  desconectarPlaca(disp.deviceId);
  if (casaId) {
    emitirMiembros(casaId, "dispositivo:config", { deviceId: disp.deviceId, casaId, fase });
    await emitirEstadoCasa(casaId);
  }
  logger.info({ deviceId: disp.deviceId, casaId }, "Placa desvinculada");
}
