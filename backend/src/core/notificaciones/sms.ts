import twilio from "twilio";
import { config } from "../config";
import { logger } from "../logger";

const habilitado =
  config.SMS_HABILITADO && !!config.TWILIO_ACCOUNT_SID && !!config.TWILIO_AUTH_TOKEN && !!config.TWILIO_FROM_NUMBER;

const cliente = habilitado ? twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN) : null;

if (!habilitado) logger.info("SMS deshabilitado (SMS_HABILITADO=false o faltan credenciales de Twilio)");

export function smsHabilitado(): boolean {
  return habilitado;
}

/** Envía un SMS. Nunca lanza; devuelve el resultado para registrarlo. */
export async function enviarSms(destino: string, cuerpo: string): Promise<{ ok: boolean; error?: string }> {
  if (!cliente) {
    logger.info({ destino }, "SMS no enviado (deshabilitado)");
    return { ok: false, error: "deshabilitado" };
  }
  try {
    const m = await cliente.messages.create({ to: destino, from: config.TWILIO_FROM_NUMBER, body: cuerpo });
    logger.info({ destino, sid: m.sid }, "SMS enviado");
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ destino, error }, "Error enviando SMS");
    return { ok: false, error };
  }
}
