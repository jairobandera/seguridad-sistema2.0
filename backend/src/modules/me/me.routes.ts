import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../core/prisma";
import { HttpError } from "../../core/errores";
import { usuarioDe } from "../../core/auth/middleware";
import { enviarPush, esTokenPushValido } from "../../core/notificaciones/push";
import { esquemaTelefono, usuarioConCasas } from "../usuarios/usuario.publico";

export const meRouter = Router();

meRouter.get("/me", async (req, res) => {
  res.json(await usuarioConCasas(usuarioDe(req).id));
});

meRouter.put("/me", async (req, res) => {
  const u = usuarioDe(req);
  const datos = z
    .object({
      nombre: z.string().trim().min(1).max(60).optional(),
      apellido: z.string().trim().min(1).max(60).optional(),
      telefono: esquemaTelefono.nullable().optional(),
    })
    .parse(req.body);
  await prisma.usuario.update({ where: { id: u.id }, data: datos });
  res.json(await usuarioConCasas(u.id));
});

meRouter.post("/push-tokens", async (req, res) => {
  const u = usuarioDe(req);
  const { token, plataforma } = z
    .object({ token: z.string().min(10).max(200), plataforma: z.enum(["android", "ios", "web"]).optional() })
    .parse(req.body);
  if (!esTokenPushValido(token)) throw new HttpError(400, "token_push_invalido", "Token de notificaciones inválido");
  // Si el celular estaba asociado a otra cuenta, pasa a esta
  await prisma.pushToken.upsert({
    where: { token },
    update: { usuarioId: u.id, plataforma },
    create: { token, plataforma, usuarioId: u.id },
  });
  res.status(204).end();
});

meRouter.delete("/push-tokens", async (req, res) => {
  const u = usuarioDe(req);
  const { token } = z.object({ token: z.string().max(200) }).parse(req.body);
  await prisma.pushToken.deleteMany({ where: { token, usuarioId: u.id } });
  res.status(204).end();
});

meRouter.post("/me/notificacion-prueba", async (req, res) => {
  const u = usuarioDe(req);
  const enviados = await enviarPush([u.id], {
    titulo: "Notificación de prueba",
    cuerpo: "¡Funciona! Así te vamos a avisar si pasa algo en tu casa.",
    alarma: true,
    datos: { tipo: "PRUEBA" },
    tipo: "PRUEBA",
  });
  if (!enviados) {
    throw new HttpError(409, "sin_dispositivos", "Este celular no tiene las notificaciones activadas");
  }
  res.json({ enviados });
});
