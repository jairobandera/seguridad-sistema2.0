import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../core/prisma";
import { HttpError, noEncontrado } from "../../core/errores";
import { leerId } from "../../core/validar";
import { usuarioDe } from "../../core/auth/middleware";
import { esquemaTelefono } from "../usuarios/usuario.publico";

export const contactosRouter = Router();

export const MAX_CONTACTOS = 2;

const esquemaContacto = z.object({
  nombre: z.string().trim().min(1, "Ingresá un nombre").max(60),
  telefono: esquemaTelefono,
  relacion: z.string().trim().max(40).nullish(),
});

const select = { id: true, nombre: true, telefono: true, relacion: true } as const;

contactosRouter.get("/", async (req, res) => {
  const u = usuarioDe(req);
  res.json(await prisma.contactoEmergencia.findMany({ where: { usuarioId: u.id, activo: true }, select, orderBy: { id: "asc" } }));
});

contactosRouter.post("/", async (req, res) => {
  const u = usuarioDe(req);
  const datos = esquemaContacto.parse(req.body);
  const cantidad = await prisma.contactoEmergencia.count({ where: { usuarioId: u.id, activo: true } });
  if (cantidad >= MAX_CONTACTOS) {
    throw new HttpError(400, "maximo_contactos", `Podés tener hasta ${MAX_CONTACTOS} contactos de emergencia`);
  }
  const c = await prisma.contactoEmergencia.create({ data: { ...datos, relacion: datos.relacion ?? null, usuarioId: u.id }, select });
  res.status(201).json(c);
});

async function propio(usuarioId: number, id: number) {
  const c = await prisma.contactoEmergencia.findFirst({ where: { id, usuarioId, activo: true } });
  if (!c) throw noEncontrado("Contacto no encontrado");
  return c;
}

contactosRouter.put("/:id", async (req, res) => {
  const u = usuarioDe(req);
  const id = leerId(req.params.id);
  await propio(u.id, id);
  const datos = esquemaContacto.parse(req.body);
  res.json(await prisma.contactoEmergencia.update({ where: { id }, data: { ...datos, relacion: datos.relacion ?? null }, select }));
});

contactosRouter.delete("/:id", async (req, res) => {
  const u = usuarioDe(req);
  const id = leerId(req.params.id);
  await propio(u.id, id);
  await prisma.contactoEmergencia.delete({ where: { id } });
  res.status(204).end();
});
