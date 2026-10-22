import { Router } from "express";
import { Prisma, Rol, RolCasa } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../core/prisma";
import { HttpError, noEncontrado } from "../../core/errores";
import { leerId } from "../../core/validar";
import { passwordTemporal, tokenAleatorio } from "../../core/cripto";
import { requerirRol, usuarioDe } from "../../core/auth/middleware";
import { desconectarUsuario, refrescarRoomsUsuario } from "../../core/socket";
import { estadoBroker } from "../../core/mqtt/broker";
import { smsHabilitado } from "../../core/notificaciones/sms";
import { estadoCasa } from "../alarma/alarma.service";
import { invalidarSesiones } from "../auth/auth.service";
import { dispositivoPublico } from "../dispositivos/dispositivo.service";
import { esquemaEmail, esquemaPassword, esquemaTelefono, hashPassword, selectUsuarioPublico } from "../usuarios/usuario.publico";

export const adminRouter = Router();
adminRouter.use(requerirRol("ADMIN"));

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------
adminRouter.get("/usuarios", async (req, res) => {
  const f = z
    .object({
      q: z.string().trim().max(100).optional(),
      rol: z.nativeEnum(Rol).optional(),
      activo: z.enum(["true", "false"]).optional(),
    })
    .parse(req.query);
  const where: Prisma.UsuarioWhereInput = {
    ...(f.rol ? { rol: f.rol } : {}),
    ...(f.activo ? { activo: f.activo === "true" } : {}),
    ...(f.q
      ? { OR: [{ nombre: { contains: f.q } }, { apellido: { contains: f.q } }, { email: { contains: f.q } }] }
      : {}),
  };
  const usuarios = await prisma.usuario.findMany({
    where,
    select: { ...selectUsuarioPublico, membresias: { select: { rol: true, casaId: true } } },
    orderBy: [{ activo: "desc" }, { apellido: "asc" }, { nombre: "asc" }],
  });
  res.json(usuarios);
});

const esquemaUsuarioNuevo = z.object({
  nombre: z.string().trim().min(1).max(60),
  apellido: z.string().trim().min(1).max(60),
  email: esquemaEmail,
  telefono: esquemaTelefono.nullish(),
  rol: z.nativeEnum(Rol),
  password: esquemaPassword.optional(),
});

adminRouter.post("/usuarios", async (req, res) => {
  const d = esquemaUsuarioNuevo.parse(req.body);
  if (await prisma.usuario.findUnique({ where: { email: d.email } })) {
    throw new HttpError(409, "email_en_uso", "Ya existe un usuario con ese email");
  }
  const temporal = d.password ?? passwordTemporal();
  const usuario = await prisma.usuario.create({
    data: {
      nombre: d.nombre,
      apellido: d.apellido,
      email: d.email,
      telefono: d.telefono ?? null,
      rol: d.rol,
      passwordHash: await hashPassword(temporal),
      debeCambiarPassword: true,
    },
    select: selectUsuarioPublico,
  });
  // La clave temporal se muestra una sola vez para pasársela al usuario
  res.status(201).json({ usuario, passwordTemporal: d.password ? null : temporal });
});

adminRouter.put("/usuarios/:id", async (req, res) => {
  const yo = usuarioDe(req);
  const id = leerId(req.params.id);
  const d = z
    .object({
      nombre: z.string().trim().min(1).max(60).optional(),
      apellido: z.string().trim().min(1).max(60).optional(),
      email: esquemaEmail.optional(),
      telefono: esquemaTelefono.nullable().optional(),
      rol: z.nativeEnum(Rol).optional(),
      activo: z.boolean().optional(),
    })
    .parse(req.body);
  const actual = await prisma.usuario.findUnique({ where: { id } });
  if (!actual) throw noEncontrado("Usuario no encontrado");
  if (id === yo.id && ((d.rol && d.rol !== actual.rol) || d.activo === false)) {
    throw new HttpError(400, "no_permitido", "No podés quitarte el rol de administrador ni desactivarte");
  }
  if (d.rol && d.rol !== "CLIENTE" && (await prisma.casaMiembro.count({ where: { usuarioId: id } }))) {
    throw new HttpError(400, "tiene_casas", "Quitá al usuario de sus casas antes de cambiarle el rol");
  }
  const usuario = await prisma.usuario.update({ where: { id }, data: d, select: selectUsuarioPublico });
  if ((d.rol && d.rol !== actual.rol) || (d.activo === false && actual.activo)) {
    await invalidarSesiones(id);
    desconectarUsuario(id);
  }
  res.json(usuario);
});

adminRouter.post("/usuarios/:id/reset-password", async (req, res) => {
  const id = leerId(req.params.id);
  if (!(await prisma.usuario.findUnique({ where: { id } }))) throw noEncontrado("Usuario no encontrado");
  const temporal = passwordTemporal();
  await prisma.usuario.update({
    where: { id },
    data: { passwordHash: await hashPassword(temporal), debeCambiarPassword: true },
  });
  await invalidarSesiones(id);
  desconectarUsuario(id);
  res.json({ passwordTemporal: temporal });
});

// ---------------------------------------------------------------------------
// Casas
// ---------------------------------------------------------------------------
const incluirCasaAdmin = {
  miembros: {
    include: { usuario: { select: { id: true, nombre: true, apellido: true, email: true, telefono: true } } },
    orderBy: { rol: "asc" },
  },
  dispositivos: true,
} satisfies Prisma.CasaInclude;

type CasaAdmin = Prisma.CasaGetPayload<{ include: typeof incluirCasaAdmin }>;

const casaAdminDTO = (c: CasaAdmin) => ({
  id: c.id,
  codigo: c.codigo,
  nombre: c.nombre,
  calle: c.calle,
  numero: c.numero,
  manzana: c.manzana,
  barrio: c.barrio,
  alarmaArmada: c.alarmaArmada,
  retardoEntradaSeg: c.retardoEntradaSeg,
  activa: c.activa,
  miembros: c.miembros.map((m) => ({ usuarioId: m.usuarioId, rol: m.rol, ...m.usuario })),
  dispositivos: c.dispositivos.map(dispositivoPublico),
});

const esquemaCasa = z.object({
  nombre: z.string().trim().max(80).nullish(),
  calle: z.string().trim().max(80).nullish(),
  numero: z.string().trim().max(20).nullish(),
  manzana: z.string().trim().max(20).nullish(),
  barrio: z.string().trim().max(80).nullish(),
  retardoEntradaSeg: z.number().int().min(0).max(120).optional(),
  activa: z.boolean().optional(),
});

adminRouter.get("/casas", async (req, res) => {
  const q = z.string().trim().max(100).optional().parse(req.query.q);
  const casas = await prisma.casa.findMany({
    where: q
      ? {
          OR: [
            { nombre: { contains: q } },
            { calle: { contains: q } },
            { barrio: { contains: q } },
            { codigo: { contains: q } },
            { miembros: { some: { usuario: { OR: [{ nombre: { contains: q } }, { apellido: { contains: q } }] } } } },
          ],
        }
      : undefined,
    include: incluirCasaAdmin,
    orderBy: [{ activa: "desc" }, { id: "desc" }],
  });
  res.json(casas.map(casaAdminDTO));
});

adminRouter.get("/casas/:id", async (req, res) => {
  const id = leerId(req.params.id);
  const casa = await prisma.casa.findUnique({ where: { id }, include: incluirCasaAdmin });
  if (!casa) throw noEncontrado("Casa no encontrada");
  res.json({ ...casaAdminDTO(casa), estado: await estadoCasa(id) });
});

const esquemaMiembros = z
  .array(z.object({ usuarioId: z.number().int().positive(), rol: z.nativeEnum(RolCasa) }))
  .max(20)
  .refine((m) => m.filter((x) => x.rol === "DUENO").length <= 1, "La casa puede tener un solo dueño")
  .refine((m) => new Set(m.map((x) => x.usuarioId)).size === m.length, "Hay usuarios repetidos");

async function guardarMiembros(casaId: number, miembros: z.infer<typeof esquemaMiembros>) {
  if (miembros.length && !miembros.some((m) => m.rol === "DUENO")) {
    throw new HttpError(400, "sin_dueno", "La casa necesita un dueño");
  }
  const usuarios = await prisma.usuario.findMany({ where: { id: { in: miembros.map((m) => m.usuarioId) } } });
  if (usuarios.length !== miembros.length || usuarios.some((u) => u.rol !== "CLIENTE" || !u.activo)) {
    throw new HttpError(400, "miembro_invalido", "Los miembros deben ser clientes activos");
  }
  const anteriores = await prisma.casaMiembro.findMany({ where: { casaId }, select: { usuarioId: true } });
  await prisma.$transaction([
    prisma.casaMiembro.deleteMany({ where: { casaId } }),
    prisma.casaMiembro.createMany({ data: miembros.map((m) => ({ casaId, usuarioId: m.usuarioId, rol: m.rol })) }),
  ]);
  const afectados = new Set([...anteriores.map((a) => a.usuarioId), ...miembros.map((m) => m.usuarioId)]);
  await Promise.all([...afectados].map(refrescarRoomsUsuario));
}

adminRouter.post("/casas", async (req, res) => {
  const d = esquemaCasa.extend({ miembros: esquemaMiembros.optional() }).parse(req.body);
  const { miembros, ...datos } = d;
  const casa = await prisma.casa.create({
    data: { ...datos, codigo: `C-${tokenAleatorio(4).toUpperCase().replace(/[^A-Z0-9]/g, "X")}` },
  });
  if (miembros?.length) await guardarMiembros(casa.id, miembros);
  const completa = await prisma.casa.findUniqueOrThrow({ where: { id: casa.id }, include: incluirCasaAdmin });
  res.status(201).json(casaAdminDTO(completa));
});

adminRouter.put("/casas/:id", async (req, res) => {
  const id = leerId(req.params.id);
  const d = esquemaCasa.parse(req.body);
  await prisma.casa.update({ where: { id }, data: d });
  const casa = await prisma.casa.findUniqueOrThrow({ where: { id }, include: incluirCasaAdmin });
  res.json(casaAdminDTO(casa));
});

adminRouter.put("/casas/:id/miembros", async (req, res) => {
  const id = leerId(req.params.id);
  if (!(await prisma.casa.findUnique({ where: { id } }))) throw noEncontrado("Casa no encontrada");
  const { miembros } = z.object({ miembros: esquemaMiembros }).parse(req.body);
  await guardarMiembros(id, miembros);
  const casa = await prisma.casa.findUniqueOrThrow({ where: { id }, include: incluirCasaAdmin });
  res.json(casaAdminDTO(casa));
});

// ---------------------------------------------------------------------------
// Placas y sistema
// ---------------------------------------------------------------------------
adminRouter.get("/dispositivos", async (req, res) => {
  const estado = z.enum(["sin_vincular", "vinculado", "offline", "online"]).optional().parse(req.query.estado);
  const where: Prisma.DispositivoWhereInput =
    estado === "sin_vincular"
      ? { casaId: null }
      : estado === "vinculado"
        ? { casaId: { not: null } }
        : estado === "offline"
          ? { casaId: { not: null }, online: false }
          : estado === "online"
            ? { online: true }
            : {};
  const lista = await prisma.dispositivo.findMany({
    where,
    include: { casa: { select: { id: true, nombre: true, calle: true, numero: true, barrio: true } } },
    orderBy: { id: "desc" },
  });
  res.json(lista.map((d) => ({ ...dispositivoPublico(d), casa: d.casa })));
});

adminRouter.get("/sistema", async (_req, res) => {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  const [usuarios, casas, placas, placasOnline, pushTokens] = await Promise.all([
    prisma.usuario.count({ where: { activo: true } }),
    prisma.casa.count({ where: { activa: true } }),
    prisma.dispositivo.count({ where: { casaId: { not: null } } }),
    prisma.dispositivo.count({ where: { online: true } }),
    prisma.pushToken.count(),
  ]);
  res.json({
    db,
    mqtt: estadoBroker(),
    sms: smsHabilitado(),
    conteos: { usuarios, casas, placas, placasOnline, pushTokens },
    version: process.env.npm_package_version ?? "2.0.0",
    uptimeSeg: Math.round(process.uptime()),
  });
});
