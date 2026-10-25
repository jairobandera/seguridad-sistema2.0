import crypto from "crypto";
import { z } from "zod";
import { config } from "../../core/config";
import { HttpError } from "../../core/errores";
import { logger } from "../../core/logger";
import { prisma } from "../../core/prisma";
import { sha256 } from "../../core/cripto";
import { correoHabilitado, enviarCorreo } from "../../core/notificaciones/correo";
import { esquemaEmail, esquemaPassword, hashPassword } from "../usuarios/usuario.publico";

/**
 * "Olvidé mi contraseña" (docs/protocolo.md §5): llega un código de 6 dígitos al email de la cuenta;
 * con ese código se elige una contraseña nueva sin saber la anterior.
 */
export const MINUTOS_VALIDEZ = 15;
export const MAX_INTENTOS = 5;
/** No se manda otro email a la misma cuenta antes de este tiempo (evita llenarle la casilla). */
const SEGUNDOS_ENTRE_ENVIOS = 60;

export const esquemaSolicitud = z.object({ email: esquemaEmail });
export const esquemaRestablecer = z.object({
  email: esquemaEmail,
  codigo: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "El código tiene 6 números"),
  nueva: esquemaPassword,
});

const hashCodigo = (usuarioId: number, codigo: string) => sha256(`${config.JWT_SECRET}|${usuarioId}|${codigo}`);

/**
 * Manda el código si el email es de una cuenta activa. Si no existe no se avisa (para no revelar
 * qué emails están registrados): la app siempre muestra "si el email está registrado, te llegó un código".
 */
export async function solicitarCodigo(email: string): Promise<void> {
  if (config.esProduccion && !correoHabilitado()) {
    throw new HttpError(
      503,
      "correo_no_configurado",
      "Por ahora no se puede recuperar la contraseña por email. Pedile a la administración que te la restablezca.",
    );
  }
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.activo) return;

  const reciente = await prisma.recuperacionPassword.findFirst({
    where: { usuarioId: usuario.id, usadoEn: null, creadoEn: { gt: new Date(Date.now() - SEGUNDOS_ENTRE_ENVIOS * 1000) } },
  });
  if (reciente) return;

  const codigo = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  // Un código nuevo anula los anteriores
  await prisma.$transaction([
    prisma.recuperacionPassword.updateMany({ where: { usuarioId: usuario.id, usadoEn: null }, data: { usadoEn: new Date() } }),
    prisma.recuperacionPassword.create({
      data: {
        usuarioId: usuario.id,
        codigoHash: hashCodigo(usuario.id, codigo),
        expiraEn: new Date(Date.now() + MINUTOS_VALIDEZ * 60_000),
      },
    }),
  ]);

  if (!correoHabilitado()) {
    // Solo llega acá en desarrollo (en producción sin email responde 503 arriba). El logger oculta el campo
    // "codigo", por eso va en el mensaje.
    logger.warn({ email }, `Email deshabilitado. Código para restablecer la contraseña: ${codigo}`);
    return;
  }
  const r = await enviarCorreo({ para: usuario.email, nombre: `${usuario.nombre} ${usuario.apellido}`, ...correoCodigo(usuario.nombre, codigo) });
  if (!r.ok) throw new HttpError(503, "correo_fallo", "No pudimos enviar el email. Probá de nuevo en unos minutos.");
}

const CODIGO_INVALIDO = "El código no es correcto o ya venció. Revisalo o pedí uno nuevo.";

/** Valida el código y cambia la contraseña. Devuelve el id del usuario para iniciarle sesión. */
export async function restablecerPassword(datos: z.infer<typeof esquemaRestablecer>): Promise<number> {
  const usuario = await prisma.usuario.findUnique({ where: { email: datos.email } });
  const rec = usuario?.activo
    ? await prisma.recuperacionPassword.findFirst({
        where: { usuarioId: usuario.id, usadoEn: null, expiraEn: { gt: new Date() } },
        orderBy: { id: "desc" },
      })
    : null;
  if (!usuario || !rec) throw new HttpError(400, "codigo_invalido", CODIGO_INVALIDO);
  if (rec.intentos >= MAX_INTENTOS) {
    throw new HttpError(400, "demasiados_intentos", "Te equivocaste muchas veces. Pedí un código nuevo.");
  }
  if (rec.codigoHash !== hashCodigo(usuario.id, datos.codigo)) {
    await prisma.recuperacionPassword.update({ where: { id: rec.id }, data: { intentos: { increment: 1 } } });
    throw new HttpError(400, "codigo_invalido", CODIGO_INVALIDO);
  }

  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: usuario.id },
      data: { passwordHash: await hashPassword(datos.nueva), debeCambiarPassword: false },
    }),
    prisma.recuperacionPassword.update({ where: { id: rec.id }, data: { usadoEn: new Date() } }),
  ]);
  return usuario.id;
}

function correoCodigo(nombre: string, codigo: string) {
  const asunto = `${codigo} es tu código para cambiar la contraseña de GuardiEl`;
  const texto =
    `Hola ${nombre}:\n\nTu código para elegir una contraseña nueva en GuardiEl es: ${codigo}\n\n` +
    `Escribilo en la app. Vence en ${MINUTOS_VALIDEZ} minutos.\n\n` +
    `Si no lo pediste vos, ignorá este email: tu contraseña sigue siendo la misma.`;
  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#EEF3FA;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1B1F24">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#FFFFFF;border-radius:12px;overflow:hidden">
        <tr><td style="background:#0B3D91;padding:22px;text-align:center;font-size:28px;font-weight:800;color:#FFFFFF">
          Guardi<span style="color:#29A8F0">El</span>
        </td></tr>
        <tr><td style="padding:28px 28px 8px">
          <p style="margin:0 0 12px;font-size:16px">Hola ${escaparHtml(nombre)}:</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.5">Pediste cambiar tu contraseña. Escribí este código en la app:</p>
          <div style="text-align:center;font-size:36px;font-weight:700;letter-spacing:10px;color:#0B3D91;background:#EEF3FA;border-radius:10px;padding:16px 0">${codigo}</div>
          <p style="margin:20px 0 0;font-size:13px;color:#5A6472;line-height:1.5">Vence en ${MINUTOS_VALIDEZ} minutos. Si no lo pediste vos, ignorá este email: tu contraseña sigue siendo la misma.</p>
        </td></tr>
        <tr><td style="padding:20px 28px 24px;font-size:12px;color:#8A94A3;text-align:center">GuardiEl · Tu casa protegida</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { asunto, html, texto };
}

function escaparHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
