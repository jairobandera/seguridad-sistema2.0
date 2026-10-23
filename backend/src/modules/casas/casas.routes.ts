import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../core/prisma";
import { HttpError, prohibido } from "../../core/errores";
import { leerId, paginacion } from "../../core/validar";
import { sha256, tokenAleatorio } from "../../core/cripto";
import { usuarioDe } from "../../core/auth/middleware";
import { verificarAccesoCasa } from "../../core/auth/acceso";
import { refrescarRoomsUsuario } from "../../core/socket";
import { cambiarAlarma, estadoCasa } from "../alarma/alarma.service";
import { eventoDTO, incluirEvento } from "../eventos/evento.dto";
import { esquemaEmail } from "../usuarios/usuario.publico";
import { aplanarBarrio } from "../barrios/barrio.service";
import { codigoUnico } from "../auth/registro.service";

export const casasRouter = Router();

const CODIGO_VINCULACION_MIN = 15;

const datosCasa = {
  id: true,
  codigo: true,
  nombre: true,
  calle: true,
  numero: true,
  manzana: true,
  paquete: true,
  barrio: { select: { nombre: true } },
  alarmaArmada: true,
  retardoEntradaSeg: true,
  codigoFamilia: true,
} as const;

/** El código para sumar familiares solo lo ve el dueño. */
const casaParaUsuario = <T extends { codigoFamilia: string | null; barrio: { nombre: string } | null }>(c: T, rolCasa: string | null) => {
  const { codigoFamilia, ...resto } = aplanarBarrio(c);
  return { ...resto, codigoFamilia: rolCasa === "DUENO" ? codigoFamilia : null };
};

/** Casas del usuario logueado con su estado en vivo. */
casasRouter.get("/mias", async (req, res) => {
  const u = usuarioDe(req);
  const membresias = await prisma.casaMiembro.findMany({
    where: { usuarioId: u.id, casa: { activa: true } },
    include: { casa: { select: datosCasa } },
    orderBy: { casaId: "asc" },
  });
  const casas = await Promise.all(
    membresias.map(async (m) => ({ ...casaParaUsuario(m.casa, m.rol), rolCasa: m.rol, estado: await estadoCasa(m.casaId) })),
  );
  res.json(casas);
});

casasRouter.get("/:id", async (req, res) => {
  const u = usuarioDe(req);
  const id = leerId(req.params.id);
  const { rolCasa } = await verificarAccesoCasa(u, id);
  const casa = await prisma.casa.findUniqueOrThrow({ where: { id }, select: datosCasa });
  res.json({ ...casaParaUsuario(casa, rolCasa), rolCasa, estado: await estadoCasa(id) });
});

casasRouter.put("/:id/alarma", async (req, res) => {
  const u = usuarioDe(req);
  if (u.rol === "GUARDIA") throw prohibido("Los guardias no pueden armar ni desarmar alarmas");
  const id = leerId(req.params.id);
  await verificarAccesoCasa(u, id);
  // `excluir`: ids de dispositivos que quedan afuera de este armado (armado parcial)
  const { armada, excluir } = z
    .object({ armada: z.boolean(), excluir: z.array(z.number().int().positive()).max(50).optional() })
    .parse(req.body);
  res.json(await cambiarAlarma(u.id, id, armada, excluir));
});

casasRouter.get("/:id/eventos", async (req, res) => {
  const u = usuarioDe(req);
  const id = leerId(req.params.id);
  await verificarAccesoCasa(u, id);
  const { cursor, limit } = paginacion.parse(req.query);
  const filas = await prisma.evento.findMany({
    where: { casaId: id, ...(cursor ? { id: { lt: cursor } } : {}) },
    orderBy: { id: "desc" },
    take: limit + 1,
    include: incluirEvento,
  });
  const hayMas = filas.length > limit;
  const items = filas.slice(0, limit).map(eventoDTO);
  res.json({ items, siguiente: hayMas ? items[items.length - 1].id : null });
});

// ---------------------------------------------------------------------------
// Familiares
// ---------------------------------------------------------------------------
casasRouter.get("/:id/miembros", async (req, res) => {
  const u = usuarioDe(req);
  const id = leerId(req.params.id);
  await verificarAccesoCasa(u, id);
  const miembros = await prisma.casaMiembro.findMany({
    where: { casaId: id },
    include: { usuario: { select: { id: true, nombre: true, apellido: true, email: true, telefono: true } } },
    orderBy: [{ rol: "asc" }, { creadoEn: "asc" }],
  });
  res.json(miembros.map((m) => ({ usuarioId: m.usuarioId, rol: m.rol, ...m.usuario, id: undefined })));
});

casasRouter.post("/:id/miembros", async (req, res) => {
  const u = usuarioDe(req);
  const id = leerId(req.params.id);
  await verificarAccesoCasa(u, id, { soloDueno: true });
  const { email } = z.object({ email: esquemaEmail }).parse(req.body);
  const familiar = await prisma.usuario.findUnique({ where: { email } });
  if (!familiar || !familiar.activo || familiar.rol !== "CLIENTE") {
    throw new HttpError(
      404,
      "usuario_no_encontrado",
      "No encontramos una cuenta de cliente con ese email. Pedile a la administración que la cree.",
    );
  }
  const existente = await prisma.casaMiembro.findUnique({ where: { casaId_usuarioId: { casaId: id, usuarioId: familiar.id } } });
  if (existente) throw new HttpError(409, "ya_es_miembro", "Esa persona ya es parte de la casa");
  await prisma.casaMiembro.create({ data: { casaId: id, usuarioId: familiar.id, rol: "FAMILIAR" } });
  await refrescarRoomsUsuario(familiar.id);
  res.status(201).json({ usuarioId: familiar.id, rol: "FAMILIAR", nombre: familiar.nombre, apellido: familiar.apellido, email });
});

casasRouter.delete("/:id/miembros/:usuarioId", async (req, res) => {
  const u = usuarioDe(req);
  const id = leerId(req.params.id);
  const usuarioId = leerId(req.params.usuarioId);
  await verificarAccesoCasa(u, id, { soloDueno: true });
  const miembro = await prisma.casaMiembro.findUnique({ where: { casaId_usuarioId: { casaId: id, usuarioId } } });
  if (!miembro) throw new HttpError(404, "no_encontrado", "Esa persona no es parte de la casa");
  if (miembro.rol === "DUENO") throw new HttpError(400, "no_permitido", "No se puede quitar al dueño de la casa");
  await prisma.casaMiembro.delete({ where: { id: miembro.id } });
  await refrescarRoomsUsuario(usuarioId);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Vinculación de dispositivos (una casa puede tener varios)
// ---------------------------------------------------------------------------
export const esquemaNombreDispositivo = z.string().trim().min(1, "Poné un nombre").max(40, "Máximo 40 caracteres");

/** Código para que los familiares se registren solos en esta casa. Regenerarlo invalida el anterior. */
casasRouter.post("/:id/codigo-familia", async (req, res) => {
  const u = usuarioDe(req);
  const id = leerId(req.params.id);
  await verificarAccesoCasa(u, id, { soloDueno: true });
  const codigoFamilia = await codigoUnico("F", async (cod) => !!(await prisma.casa.findUnique({ where: { codigoFamilia: cod } })));
  await prisma.casa.update({ where: { id }, data: { codigoFamilia } });
  res.json({ codigoFamilia });
});

casasRouter.post("/:id/codigo-vinculacion", async (req, res) => {
  const u = usuarioDe(req);
  const id = leerId(req.params.id);
  await verificarAccesoCasa(u, id, { gestion: true });
  const { nombre } = z.object({ nombre: esquemaNombreDispositivo.optional() }).parse(req.body ?? {});
  const codigo = tokenAleatorio(18);
  const expiraEn = new Date(Date.now() + CODIGO_VINCULACION_MIN * 60_000);
  // Un código vigente por casa: los anteriores sin usar se invalidan
  await prisma.codigoVinculacion.deleteMany({ where: { casaId: id, usadoEn: null } });
  await prisma.codigoVinculacion.create({
    data: { codigoHash: sha256(codigo), casaId: id, usuarioId: u.id, expiraEn, nombreDispositivo: nombre ?? null },
  });
  res.status(201).json({ codigo, expiraEn: expiraEn.toISOString() });
});
