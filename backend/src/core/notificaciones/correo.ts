import { config } from "../config";
import { logger } from "../logger";

const habilitado = !!config.BREVO_API_KEY && !!config.EMAIL_REMITENTE;

if (!habilitado) logger.info("Email deshabilitado (faltan BREVO_API_KEY o EMAIL_REMITENTE)");

export function correoHabilitado(): boolean {
  return habilitado;
}

export interface Correo {
  para: string;
  nombre?: string;
  asunto: string;
  html: string;
  texto: string;
}

/** Envía un email por la API HTTP de Brevo. Nunca lanza; devuelve si salió. */
export async function enviarCorreo(c: Correo): Promise<{ ok: boolean; error?: string }> {
  if (!habilitado) {
    logger.info({ para: c.para }, "Email no enviado (deshabilitado)");
    return { ok: false, error: "deshabilitado" };
  }
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": config.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: config.EMAIL_NOMBRE_REMITENTE, email: config.EMAIL_REMITENTE },
        to: [{ email: c.para, ...(c.nombre ? { name: c.nombre } : {}) }],
        subject: c.asunto,
        htmlContent: c.html,
        textContent: c.texto,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      const error = `HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`;
      logger.error({ para: c.para, error }, "Error enviando email");
      return { ok: false, error };
    }
    logger.info({ para: c.para }, "Email enviado");
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ para: c.para, error }, "Error enviando email");
    return { ok: false, error };
  }
}
