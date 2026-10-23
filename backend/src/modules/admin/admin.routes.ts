import { Router } from "express";
import { Paquete, Prisma, Rol, RolCasa } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../core/prisma";
import { HttpError, noEncontrado } from "../../core/errores";
import { leerId } from "../../core/validar";
import { passwordTemporal, tokenAleatorio } from "../../core/cripto";
import { requerirRol, usuarioDe } from "../../core/auth/middleware";
import { desconectarUsuario, refrescarRoomsBarrio, refrescarRoomsUsuario } from "../../core/socket";
import { estadoBroker } from "../../core/mqtt/broker";
import { smsHabilitado } from "../../core/notificaciones/sms";
import { emitirEstadoCasa, estadoCasa } from "../alarma/alarma.service";
import { invalidarSesiones } from "../auth/auth.service";
import { dispositivoPublico } from "../dispositivos/dispositivo.service";
import { esquemaEmail, esquemaPassword, esquemaTelefono, hashPassword, selectUsuarioPublico } from "../usuarios/usuario.publico";
import { aplanarBarrio } from "../barrios/barrio.service";

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
    select: {
      ...selectUsuarioPublico,
      membresias: { select: { rol: true, casaId: true } },
      barriosGuardia: { select: { barrioId: true } },
    },
    orderBy: [{ activo: "desc" }, { apellido: "asc" }, { nombre: "asc" }],
  });
  res.json(usuarios.map(({ barriosGuardia, ...u }) => ({ ...u, barrioIds: barriosGuardia.map((b) => b.barrioId) })));
});

// Barrios que cubre un guardia (reemplaza los anteriores)
const esquemaBarrioIds = z.array(z.number().int().positive()).max(100);

async function guardarBarriosGuardia(usuarioId: number, barrioIds: number[]) {
  const ids = [...new Set(barrioIds)];
  if (ids.length && (await prisma.barrio.count({ where: { id: { in: ids } } })) !== ids.length) {
    throw new HttpError(400, "barrio_invalido", "Alguno de los barrios no existe");
  }
  await prisma.$transaction([
    prisma.guardiaBarrio.deleteMany({ where: { usuarioId } }),
    prisma.guardiaBarrio.createMany({ data: ids.map((barrioId) => ({ usuarioId, barrioId })) }),
  ]);
  await refrescarRoomsUsuario(usuarioId);
}

const esquemaUsuarioNuevo = z.object({
  nombre: z.string().trim().min(1).max(60),
  apellido: z.string().trim().min(1).max(60),
  email: esquemaEmail,
  telefono: esquemaTelefono.nullish(),
  rol: z.nativeEnum(Rol),
  password: esquemaPassword.optional(),
  barrioIds: esquemaBarrioIds.optional(),
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
  if (d.rol === "GUARDIA" && d.barrioIds?.length) await guardarBarriosGuardia(usuario.id, d.barrioIds);
  // La clave temporal se muestra una sola vez para pasársela al usuario
  res.status(201).json({ usuario, passwordTemporal: d.password ? null : temporal });
});

adminRouter.put("/usuarios/:id", async (req, res) => {
  const yo = usuarioDe(req);
  const id = leerId(req.params.id);
  const { barrioIds, ...d } = z
    .object({
      nombre: z.string().trim().min(1).max(60).optional(),
      apellido: z.string().trim().min(1).max(60).optional(),
      email: esquemaEmail.optional(),
      telefono: esquemaTelefono.nullable().optional(),
      rol: z.nativeEnum(Rol).optional(),
      activo: z.boolean().optional(),
      barrioIds: esquemaBarrioIds.optional(),
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
  // Solo los guardias cubren barrios
  if (usuario.rol !== "GUARDIA") {
    if (actual.rol === "GUARDIA") await guardarBarriosGuardia(id, []);
  } else if (barrioIds) {
    await guardarBarriosGuardia(id, barrioIds);
  }
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
// Barrios y sistemas (paquete Barrio / Individual)
// ---------------------------------------------------------------------------
const esquemaBarrio = z.object({
  nombre: z.string().trim().min(1, "Poné un nombre").max(80),
  tieneGuardia: z.boolean().optional(),
  activo: z.boolean().optional(),
});

const selectCasaResumen = { alarmaArmada: true, dispositivos: { select: { online: true } } } satisfies Prisma.CasaSelect;

/** Resumen de un grupo de casas para el panel. */
function resumenCasas(casas: Prisma.CasaGetPayload<{ select: typeof selectCasaResumen }>[]) {
  const dispositivos = casas.flatMap((c) => c.dispositivos);
  return {
    casas: casas.length,
    casasArmadas: casas.filter((c) => c.alarmaArmada).length,
    dispositivos: dispositivos.length,
    dispositivosOffline: dispositivos.filter((d) => !d.online).length,
  };
}

adminRouter.get("/barrios", async (_req, res) => {
  const barrios = await prisma.barrio.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }] });
  res.json(barrios.map((b) => ({ id: b.id, nombre: b.nombre, tieneGuardia: b.tieneGuardia, activo: b.activo })));
});

/** Todos los sistemas que se brindan: cada barrio con su resumen y las casas individuales. */
adminRouter.get("/sistemas", async (_req, res) => {
  const [barrios, individuales] = await Promise.all([
    prisma.barrio.findMany({
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
      include: {
        casas: { where: { activa: true, paquete: "BARRIO" }, select: selectCasaResumen },
        guardias: { include: { usuario: { select: { id: true, nombre: true, apellido: true, activo: true } } } },
      },
    }),
    prisma.casa.findMany({ where: { activa: true, paquete: "INDIVIDUAL" }, select: selectCasaResumen }),
  ]);
  res.json({
    barrios: barrios.map((b) => ({
      id: b.id,
      nombre: b.nombre,
      tieneGuardia: b.tieneGuardia,
      activo: b.activo,
      guardias: b.guardias
        .filter((g) => g.usuario.activo)
        .map((g) => ({ id: g.usuario.id, nombre: `${g.usuario.nombre} ${g.usuario.apellido}`.trim() })),
      ...resumenCasas(b.casas),
    })),
    individuales: resumenCasas(individuales),
  });
});

/** Al cambiar la guardia de un barrio: los guardias entran/salen de la room y las casas actualizan su estado. */
async function avisarCambioBarrio(barrioId: number) {
  await refrescarRoomsBarrio(barrioId);
  const casas = await prisma.casa.findMany({ where: { barrioId }, select: { id: true } });
  await Promise.all(casas.map((c) => emitirEstadoCasa(c.id)));
}

adminRouter.post("/barrios", async (req, res) => {
  const d = esquemaBarrio.parse(req.body);
  if (await prisma.barrio.findUnique({ where: { nombre: d.nombre } })) {
    throw new HttpError(409, "nombre_en_uso", "Ya existe un barrio con ese nombre");
  }
  res.status(201).json(await prisma.barrio.create({ data: d }));
});

adminRouter.put("/barrios/:id", async (req, res) => {
  const id = leerId(req.params.id);
  const d = esquemaBarrio.partial().parse(req.body);
  if (!(await prisma.barrio.findUnique({ where: { id } }))) throw noEncontrado("Barrio no encontrado");
  if (d.nombre && (await prisma.barrio.findFirst({ where: { nombre: d.nombre, id: { not: id } } }))) {
    throw new HttpError(409, "nombre_en_uso", "Ya existe un barrio con ese nombre");
  }
  const barrio = await prisma.barrio.update({ where: { id }, data: d });
  await avisarCambioBarrio(id);
  res.json(barrio);
});

// ---------------------------------------------------------------------------
// Casas
// ---------------------------------------------------------------------------
const incluirCasaAdmin = {
  miembros: {
    include: { usuario: { select: { id: true, nombre: true, apellido: true, email: true, telefono: true } } },
    orderBy: { rol: "asc" },
  },
  dispositivos: { orderBy: { vinculadoEn: "asc" } },
  barrio: { select: { nombre: true, tieneGuardia: true, activo: true } },
} satisfies Prisma.CasaInclude;

type CasaAdmin = Prisma.CasaGetPayload<{ include: typeof incluirCasaAdmin }>;

const casaAdminDTO = (c: CasaAdmin) => ({
  id: c.id,
  codigo: c.codigo,
  nombre: c.nombre,
  calle: c.calle,
  numero: c.numero,
  manzana: c.manzana,
  paquete: c.paquete,
  barrioId: c.barrioId,
  barrio: c.barrio?.nombre ?? null,
  tieneGuardia: c.paquete === "BARRIO" && !!c.barrio?.tieneGuardia && !!c.barrio?.activo,
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
  paquete: z.nativeEnum(Paquete).optional(),
  barrioId: z.number().int().positive().nullish(),
  retardoEntradaSeg: z.number().int().min(0).max(120).optional(),
  activa: z.boolean().optional(),
});

/** Barrio: obligatorio (y existente) para el paquete Barrio; las casas individuales no tienen. */
async function validarPaquete(paquete: Paquete, barrioId: number | null | undefined) {
  if (paquete === "INDIVIDUAL") return { paquete, barrioId: null };
  if (!barrioId) throw new HttpError(400, "sin_barrio", "Elegí el barrio de la casa");
  if (!(await prisma.barrio.findUnique({ where: { id: barrioId } }))) {
    throw new HttpError(400, "barrio_invalido", "El barrio no existe");
  }
  return { paquete, barrioId };
}

adminRouter.get("/casas", async (req, res) => {
  const { q, paquete, barrioId } = z
    .object({
      q: z.string().trim().max(100).optional(),
      paquete: z.nativeEnum(Paquete).optional(),
      barrioId: z.coerce.number().int().positive().optional(),
    })
    .parse(req.query);
  const casas = await prisma.casa.findMany({
    where: {
      ...(paquete ? { paquete } : {}),
      ...(barrioId ? { barrioId } : {}),
      ...(q
        ? {
            OR: [
              { nombre: { contains: q } },
              { calle: { contains: q } },
              { barrio: { is: { nombre: { contains: q } } } },
              { codigo: { contains: q } },
              { miembros: { some: { usuario: { OR: [{ nombre: { contains: q } }, { apellido: { contains: q } }] } } } },
            ],
          }
        : {}),
    },
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
  const { miembros, paquete, barrioId, ...datos } = esquemaCasa.extend({ miembros: esquemaMiembros.optional() }).parse(req.body);
  const casa = await prisma.casa.create({
    data: {
      ...datos,
      ...(await validarPaquete(paquete ?? "BARRIO", barrioId)),
      codigo: `C-${tokenAleatorio(4).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`,
    },
  });
  if (miembros?.length) await guardarMiembros(casa.id, miembros);
  const completa = await prisma.casa.findUniqueOrThrow({ where: { id: casa.id }, include: incluirCasaAdmin });
  res.status(201).json(casaAdminDTO(completa));
});

adminRouter.put("/casas/:id", async (req, res) => {
  const id = leerId(req.params.id);
  const { paquete, barrioId, ...datos } = esquemaCasa.parse(req.body);
  const actual = await prisma.casa.findUnique({ where: { id } });
  if (!actual) throw noEncontrado("Casa no encontrada");
  const cambiaPaquete = paquete !== undefined || barrioId !== undefined;
  const paqueteFinal = cambiaPaquete
    ? await validarPaquete(paquete ?? actual.paquete, barrioId === undefined ? actual.barrioId : barrioId)
    : {};
  await prisma.casa.update({ where: { id }, data: { ...datos, ...paqueteFinal } });
  // Cambia quién la vigila: la app y los guardias se enteran
  if (cambiaPaquete) await emitirEstadoCasa(id);
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
// Dispositivos y sistema
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
    include: { casa: { select: { id: true, nombre: true, calle: true, numero: true, barrio: { select: { nombre: true } } } } },
    orderBy: { id: "desc" },
  });
  res.json(lista.map((d) => ({ ...dispositivoPublico(d), casa: d.casa ? aplanarBarrio(d.casa) : null })));
});

adminRouter.get("/sistema", async (_req, res) => {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  const [usuarios, casas, individuales, barrios, placas, placasOnline, pushTokens] = await Promise.all([
    prisma.usuario.count({ where: { activo: true } }),
    prisma.casa.count({ where: { activa: true } }),
    prisma.casa.count({ where: { activa: true, paquete: "INDIVIDUAL" } }),
    prisma.barrio.count({ where: { activo: true } }),
    prisma.dispositivo.count({ where: { casaId: { not: null } } }),
    prisma.dispositivo.count({ where: { online: true } }),
    prisma.pushToken.count(),
  ]);
  res.json({
    db,
    mqtt: estadoBroker(),
    sms: smsHabilitado(),
    conteos: { usuarios, casas, individuales, barrios, placas, placasOnline, pushTokens },
    version: process.env.npm_package_version ?? "2.0.0",
    uptimeSeg: Math.round(process.uptime()),
  });
});
