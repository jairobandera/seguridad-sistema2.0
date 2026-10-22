import { Dispositivo } from "@prisma/client";
import { config } from "../../core/config";
import { logger } from "../../core/logger";
import { prisma } from "../../core/prisma";
import { HttpError } from "../../core/errores";
import { cifrar, sha256, tokenAleatorio } from "../../core/cripto";
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

/**
 * La placa canjea el código de vinculación (docs/protocolo.md §2).
 * Devuelve las credenciales MQTT propias de la placa.
 */
export async function provisionar(d: DatosProvision) {
  const codigo = await prisma.codigoVinculacion.findUnique({ where: { codigoHash: sha256(d.codigo) } });
  if (!codigo || codigo.usadoEn || codigo.expiraEn < new Date()) {
    throw new HttpError(400, "codigo_invalido", "El código de vinculación no es válido o venció");
  }
  const existente = await prisma.dispositivo.findUnique({ where: { deviceId: d.deviceId } });
  if (existente?.casaId && existente.casaId !== codigo.casaId) {
    throw new HttpError(409, "ya_vinculada", "La placa está vinculada a otra casa");
  }

  const mqttPass = tokenAleatorio(24);
  const datos = {
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
      create: { deviceId: d.deviceId, nombre: "Puerta principal", ...datos },
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
