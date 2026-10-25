import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../../core/config";
import { HttpError } from "../../core/errores";
import { prisma } from "../../core/prisma";
import { sha256 } from "../../core/cripto";
import { autenticar, usuarioDe } from "../../core/auth/middleware";
import { desconectarUsuario } from "../../core/socket";
import { esquemaEmail, esquemaPassword, hashPassword } from "../usuarios/usuario.publico";
import { crearSesion, invalidarSesiones, renovarSesion } from "./auth.service";
import { esquemaRegistro, registrar } from "./registro.service";
import { esquemaRestablecer, esquemaSolicitud, restablecerPassword, solicitarCodigo } from "./recuperacion.service";

export const authRouter = Router();

// Hash fijo para que el tiempo de respuesta sea igual exista o no el usuario
const HASH_FALSO = bcrypt.hashSync("no-existe-este-usuario", 10);

const limiteLogin = rateLimit({
  windowMs: 60_000,
  limit: config.esTest ? 1000 : 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.email ?? "").toLowerCase()}`,
  message: { error: "demasiados_intentos", mensaje: "Demasiados intentos. Esperá un minuto y probá de nuevo." },
});

const datosCliente = (req: { ip?: string; headers: Record<string, unknown> }) => ({
  ip: req.ip,
  userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
});

authRouter.post("/login", limiteLogin, async (req, res) => {
  const { email, password } = z.object({ email: esquemaEmail, password: z.string().min(1).max(100) }).parse(req.body);
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  const valido = await bcrypt.compare(password, usuario?.passwordHash ?? HASH_FALSO);
  if (!usuario || !valido || !usuario.activo) {
    throw new HttpError(401, "credenciales_invalidas", "Email o contraseña incorrectos");
  }
  res.json(await crearSesion(usuario.id, datosCliente(req)));
});

// Registro abierto: límite por IP para frenar cuentas masivas
const limiteRegistro = rateLimit({
  windowMs: 10 * 60_000,
  limit: config.esTest ? 1000 : 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "demasiados_intentos", mensaje: "Demasiados registros desde esta conexión. Probá más tarde." },
});

/** El cliente crea su cuenta (con código de barrio, de familia o sin código) y queda logueado. */
authRouter.post("/registro", limiteRegistro, async (req, res) => {
  const usuarioId = await registrar(esquemaRegistro.parse(req.body));
  res.status(201).json(await crearSesion(usuarioId, datosCliente(req)));
});

// "Olvidé mi contraseña": pocas solicitudes por conexión (cada una puede mandar un email)
const limiteRecuperar = rateLimit({
  windowMs: 15 * 60_000,
  limit: config.esTest ? 1000 : 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "demasiados_intentos", mensaje: "Demasiados intentos. Esperá unos minutos y probá de nuevo." },
});

/** Manda un código de 6 dígitos al email. Responde igual exista o no la cuenta. */
authRouter.post("/olvide-password", limiteRecuperar, async (req, res) => {
  await solicitarCodigo(esquemaSolicitud.parse(req.body).email);
  res.status(204).end();
});

/** Con el código del email elige una contraseña nueva: cierra las otras sesiones y queda logueado. */
authRouter.post("/restablecer-password", limiteRecuperar, async (req, res) => {
  const usuarioId = await restablecerPassword(esquemaRestablecer.parse(req.body));
  await invalidarSesiones(usuarioId);
  desconectarUsuario(usuarioId);
  res.json(await crearSesion(usuarioId, datosCliente(req)));
});

authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(10).max(200) }).parse(req.body);
  const r = await renovarSesion(refreshToken);
  if (!r) throw new HttpError(401, "sesion_invalida", "Tu sesión venció. Iniciá sesión de nuevo.");
  res.json(r);
});

authRouter.post("/logout", async (req, res) => {
  const { refreshToken, pushToken } = z
    .object({ refreshToken: z.string().max(200).optional(), pushToken: z.string().max(200).optional() })
    .parse(req.body ?? {});
  if (refreshToken) {
    const sesion = await prisma.sesion.findUnique({ where: { refreshHash: sha256(refreshToken) } });
    if (sesion) {
      await prisma.sesion.update({ where: { id: sesion.id }, data: { activa: false } });
      // Este celular deja de recibir alarmas de esta cuenta
      if (pushToken) await prisma.pushToken.deleteMany({ where: { token: pushToken, usuarioId: sesion.usuarioId } });
    }
  }
  res.status(204).end();
});

authRouter.post("/cambiar-password", autenticar, async (req, res) => {
  const u = usuarioDe(req);
  const { actual, nueva } = z.object({ actual: z.string().min(1).max(100), nueva: esquemaPassword }).parse(req.body);
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
  if (!(await bcrypt.compare(actual, usuario.passwordHash))) {
    throw new HttpError(400, "password_incorrecta", "La contraseña actual no es correcta");
  }
  if (actual === nueva) throw new HttpError(400, "password_igual", "La nueva contraseña debe ser distinta a la actual");
  await prisma.usuario.update({
    where: { id: u.id },
    data: { passwordHash: await hashPassword(nueva), debeCambiarPassword: false },
  });
  // Cierra todas las otras sesiones y entrega una nueva para este celular
  await invalidarSesiones(u.id);
  desconectarUsuario(u.id);
  res.json(await crearSesion(u.id, datosCliente(req)));
});
