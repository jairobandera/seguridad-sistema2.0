import { Router } from "express";
import { EstadoAtencion, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../core/prisma";
import { HttpError, noEncontrado } from "../../core/errores";
import { leerId, paginacion } from "../../core/validar";
import { requerirRol, usuarioDe } from "../../core/auth/middleware";
import { emitirCasa } from "../../core/socket";
import { estadoCasa } from "../alarma/alarma.service";
import { eventoDTO, incluirEvento } from "../eventos/evento.dto";
import { whereCasasDeGuardia } from "../barrios/barrio.service";
import { verificarAccesoCasa } from "../../core/auth/acceso";
import { UsuarioToken } from "../../core/auth/tokens";

export const guardiaRouter = Router();

const ABIERTOS: EstadoAtencion[] = ["PENDIENTE", "EN_CURSO"];

// Lectura: guardias y admins. Acciones: solo guardias.
guardiaRouter.use(requerirRol("GUARDIA", "ADMIN"));
const soloGuardia = requerirRol("GUARDIA");

/** Casas que ve el usuario: el guardia, las de sus barrios con guardia; el admin, todas. */
const alcance = (u: UsuarioToken): Prisma.CasaWhereInput => (u.rol === "ADMIN" ? {} : whereCasasDeGuardia(u.id));

/** El guardia solo puede atender alertas de sus casas. */
async function verificarAccesoEvento(u: UsuarioToken, eventoId: number) {
  const e = await prisma.evento.findUnique({ where: { id: eventoId }, select: { casaId: true } });
  if (!e?.casaId) throw noEncontrado("Alerta no encontrada");
  await verificarAccesoCasa(u, e.casaId);
}

guardiaRouter.get("/resumen", async (req, res) => {
  const casa = alcance(usuarioDe(req));
  const dispositivos: Prisma.DispositivoWhereInput = { casaId: { not: null }, casa: { is: { activa: true, ...casa } } };
  const [pendientes, enCurso, casasArmadas, casasActivas, dispositivosOffline, puertasAbiertas] = await Promise.all([
    prisma.eventoEstado.count({ where: { estado: "PENDIENTE", evento: { casa: { is: casa } } } }),
    prisma.eventoEstado.count({ where: { estado: "EN_CURSO", evento: { casa: { is: casa } } } }),
    prisma.casa.count({ where: { activa: true, alarmaArmada: true, ...casa } }),
    prisma.casa.count({ where: { activa: true, ...casa } }),
    prisma.dispositivo.count({ where: { ...dispositivos, online: false } }),
    prisma.dispositivo.count({ where: { ...dispositivos, puertaAbierta: true } }),
  ]);
  res.json({ pendientes, enCurso, casasArmadas, casasActivas, dispositivosOffline, puertasAbiertas });
});

guardiaRouter.get("/casas", async (req, res) => {
  const casa = alcance(usuarioDe(req));
  const [casas, alertas] = await Promise.all([
    prisma.casa.findMany({
      where: { activa: true, ...casa },
      include: {
        barrio: { select: { nombre: true } },
        dispositivos: { select: { online: true, puertaAbierta: true } },
        miembros: {
          where: { rol: "DUENO" },
          include: { usuario: { select: { nombre: true, apellido: true, telefono: true } } },
        },
      },
      orderBy: { id: "asc" },
    }),
    prisma.evento.groupBy({
      by: ["casaId"],
      where: { estado: { estado: { in: ABIERTOS } }, casa: { is: casa } },
      _count: { _all: true },
    }),
  ]);
  const alertasPorCasa = new Map(alertas.map((a) => [a.casaId, a._count._all]));
  res.json(
    casas.map((c) => {
      const dueno = c.miembros[0]?.usuario;
      return {
        id: c.id,
        codigo: c.codigo,
        nombre: c.nombre,
        calle: c.calle,
        numero: c.numero,
        manzana: c.manzana,
        barrio: c.barrio?.nombre ?? null,
        alarmaArmada: c.alarmaArmada,
        dueno: dueno ? { nombre: `${dueno.nombre} ${dueno.apellido}`.trim(), telefono: dueno.telefono } : null,
        cantidadDispositivos: c.dispositivos.length,
        dispositivosOffline: c.dispositivos.filter((d) => !d.online).length,
        puertaAbierta: c.dispositivos.some((d) => d.puertaAbierta === true),
        alertasAbiertas: alertasPorCasa.get(c.id) ?? 0,
      };
    }),
  );
});

guardiaRouter.get("/casas/:id", async (req, res) => {
  const id = leerId(req.params.id);
  await verificarAccesoCasa(usuarioDe(req), id);
  const casa = await prisma.casa.findUnique({
    where: { id },
    include: {
      barrio: { select: { nombre: true } },
      miembros: {
        include: {
          usuario: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              telefono: true,
              contactos: { where: { activo: true }, select: { nombre: true, telefono: true, relacion: true } },
            },
          },
        },
      },
    },
  });
  if (!casa) throw noEncontrado("Casa no encontrada");
  const eventos = await prisma.evento.findMany({
    where: { casaId: id },
    orderBy: { id: "desc" },
    take: 20,
    include: incluirEvento,
  });
  res.json({
    id: casa.id,
    codigo: casa.codigo,
    nombre: casa.nombre,
    calle: casa.calle,
    numero: casa.numero,
    manzana: casa.manzana,
    barrio: casa.barrio?.nombre ?? null,
    estado: await estadoCasa(id),
    miembros: casa.miembros.map((m) => ({
      usuarioId: m.usuarioId,
      rol: m.rol,
      nombre: `${m.usuario.nombre} ${m.usuario.apellido}`.trim(),
      telefono: m.usuario.telefono,
    })),
    contactos: casa.miembros.filter((m) => m.rol === "DUENO").flatMap((m) => m.usuario.contactos),
    eventos: eventos.map(eventoDTO),
  });
});

const esquemaEstados = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(",") : ABIERTOS))
  .pipe(z.array(z.nativeEnum(EstadoAtencion)));

/** Eventos que requieren atención de guardia. */
guardiaRouter.get("/eventos", async (req, res) => {
  const { cursor, limit } = paginacion.parse(req.query);
  const estados = esquemaEstados.parse(req.query.estado);
  const casaId = req.query.casaId ? leerId(req.query.casaId) : undefined;
  const where: Prisma.EventoWhereInput = {
    estado: { estado: { in: estados } },
    casa: { is: alcance(usuarioDe(req)) },
    ...(casaId ? { casaId } : {}),
    ...(cursor ? { id: { lt: cursor } } : {}),
  };
  const filas = await prisma.evento.findMany({ where, orderBy: { id: "desc" }, take: limit + 1, include: incluirEvento });
  const hayMas = filas.length > limit;
  const items = filas.slice(0, limit).map(eventoDTO);
  res.json({ items, siguiente: hayMas ? items[items.length - 1].id : null });
});

async function emitirEstadoEvento(eventoId: number) {
  const e = await prisma.evento.findUniqueOrThrow({ where: { id: eventoId }, include: incluirEvento });
  const dto = eventoDTO(e);
  emitirCasa(e.casaId, "evento:estado", {
    eventoId,
    casaId: e.casaId,
    estado: dto.estado?.estado ?? null,
    guardia: dto.estado?.guardia ?? null,
    nota: dto.estado?.nota ?? null,
  });
  return dto;
}

guardiaRouter.post("/eventos/:id/tomar", soloGuardia, async (req, res) => {
  const u = usuarioDe(req);
  const eventoId = leerId(req.params.id);
  await verificarAccesoEvento(u, eventoId);
  const r = await prisma.eventoEstado.updateMany({
    where: { eventoId, OR: [{ estado: "PENDIENTE" }, { estado: "EN_CURSO", guardiaId: u.id }] },
    data: { estado: "EN_CURSO", guardiaId: u.id, tomadoEn: new Date() },
  });
  if (r.count === 0) {
    const actual = await prisma.eventoEstado.findUnique({
      where: { eventoId },
      include: { guardia: { select: { nombre: true, apellido: true } } },
    });
    if (!actual) throw noEncontrado("Alerta no encontrada");
    const quien = actual.guardia ? `${actual.guardia.nombre} ${actual.guardia.apellido}`.trim() : "otro guardia";
    throw new HttpError(409, "ya_tomada", actual.estado === "EN_CURSO" ? `La está atendiendo ${quien}` : "La alerta ya está cerrada");
  }
  res.json(await emitirEstadoEvento(eventoId));
});

guardiaRouter.post("/eventos/:id/resolver", soloGuardia, async (req, res) => {
  const u = usuarioDe(req);
  const eventoId = leerId(req.params.id);
  const { resultado, nota } = z
    .object({ resultado: z.enum(["RESUELTO", "FALSA_ALARMA"]), nota: z.string().trim().max(500).optional() })
    .parse(req.body);
  await verificarAccesoEvento(u, eventoId);
  const actual = await prisma.eventoEstado.findUnique({ where: { eventoId } });
  if (!actual) throw noEncontrado("Alerta no encontrada");
  if (!ABIERTOS.includes(actual.estado)) throw new HttpError(409, "ya_cerrada", "La alerta ya está cerrada");
  const ahora = new Date();
  await prisma.eventoEstado.update({
    where: { eventoId },
    data: {
      estado: resultado,
      nota: nota || actual.nota,
      resueltoEn: ahora,
      guardiaId: actual.guardiaId ?? u.id,
      tomadoEn: actual.tomadoEn ?? ahora,
    },
  });
  res.json(await emitirEstadoEvento(eventoId));
});

guardiaRouter.post("/casas/:id/resolver-todo", soloGuardia, async (req, res) => {
  const u = usuarioDe(req);
  const casaId = leerId(req.params.id);
  await verificarAccesoCasa(u, casaId);
  const { nota } = z.object({ nota: z.string().trim().max(500).optional() }).parse(req.body ?? {});
  const abiertos = await prisma.eventoEstado.findMany({
    where: { estado: { in: ABIERTOS }, evento: { casaId } },
    select: { eventoId: true },
  });
  const ahora = new Date();
  await prisma.eventoEstado.updateMany({
    where: { eventoId: { in: abiertos.map((a) => a.eventoId) } },
    data: { estado: "RESUELTO", resueltoEn: ahora, guardiaId: u.id, ...(nota ? { nota } : {}) },
  });
  for (const a of abiertos) await emitirEstadoEvento(a.eventoId);
  res.json({ resueltos: abiertos.length });
});
