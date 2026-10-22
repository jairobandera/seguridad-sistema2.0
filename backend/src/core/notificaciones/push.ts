import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { config } from "../config";
import { logger } from "../logger";
import { prisma } from "../prisma";

const expo = new Expo({ accessToken: config.EXPO_ACCESS_TOKEN });

export interface MensajePush {
  titulo: string;
  cuerpo: string;
  datos?: Record<string, unknown>;
  /** true = sonido de alarma, canal "alarma" y prioridad máxima */
  alarma?: boolean;
  tipo?: string;
}

export function esTokenPushValido(token: string): boolean {
  return Expo.isExpoPushToken(token);
}

/**
 * Envía una push a todos los celulares de los usuarios indicados.
 * Nunca lanza: los errores se registran en el log y en Notificacion.
 */
export async function enviarPush(usuarioIds: number[], msg: MensajePush, eventoId?: number): Promise<number> {
  const ids = [...new Set(usuarioIds)];
  if (!ids.length) return 0;
  try {
    const tokens = await prisma.pushToken.findMany({ where: { usuarioId: { in: ids } } });
    const validos = tokens.filter((t) => Expo.isExpoPushToken(t.token));
    if (!validos.length) return 0;

    const mensajes: ExpoPushMessage[] = validos.map((t) => ({
      to: t.token,
      title: msg.titulo,
      body: msg.cuerpo,
      data: msg.datos ?? {},
      sound: msg.alarma ? "alarma.wav" : "default",
      channelId: msg.alarma ? "alarma" : "general",
      priority: "high",
      interruptionLevel: msg.alarma ? "time-sensitive" : "active",
      ttl: msg.alarma ? 600 : 3600,
    }));

    const aBorrar: string[] = [];
    let enviados = 0;
    for (const lote of expo.chunkPushNotifications(mensajes)) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(lote);
        tickets.forEach((ticket, i) => {
          const token = String(lote[i].to);
          if (ticket.status === "ok") {
            enviados++;
          } else {
            logger.warn({ error: ticket.details?.error, mensaje: ticket.message }, "Push rechazada");
            if (ticket.details?.error === "DeviceNotRegistered") aBorrar.push(token);
          }
        });
      } catch (err) {
        logger.error({ err }, "Error enviando lote de push");
      }
    }
    if (aBorrar.length) await prisma.pushToken.deleteMany({ where: { token: { in: aBorrar } } });

    await prisma.notificacion.createMany({
      data: ids.map((usuarioId) => ({
        tipo: msg.tipo ?? "PUSH",
        mensaje: `${msg.titulo}: ${msg.cuerpo}`,
        canal: "PUSH",
        entregado: enviados > 0,
        usuarioId,
        eventoId: eventoId ?? null,
      })),
    });
    return enviados;
  } catch (err) {
    logger.error({ err }, "Error en enviarPush");
    return 0;
  }
}
