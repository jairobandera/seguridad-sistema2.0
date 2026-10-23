import bcrypt from "bcryptjs";
import request from "supertest";
import { Rol } from "@prisma/client";
import { prisma } from "../src/core/prisma";
import { crearApp } from "../src/app";

export const app = crearApp();
export const CLAVE = "Clave12345";
const hash = bcrypt.hashSync(CLAVE, 4);

/** Borra todos los datos (orden inverso a las dependencias). */
export async function limpiarBase() {
  await prisma.$transaction([
    prisma.notificacion.deleteMany(),
    prisma.eventoEstado.deleteMany(),
    prisma.evento.deleteMany(),
    prisma.codigoVinculacion.deleteMany(),
    prisma.dispositivo.deleteMany(),
    prisma.casaMiembro.deleteMany(),
    prisma.camara.deleteMany(),
    prisma.casa.deleteMany(),
    prisma.guardiaBarrio.deleteMany(),
    prisma.barrio.deleteMany(),
    prisma.contactoEmergencia.deleteMany(),
    prisma.pushToken.deleteMany(),
    prisma.sesion.deleteMany(),
    prisma.usuario.deleteMany(),
  ]);
}

let n = 0;
export async function crearUsuario(rol: Rol, extra: { telefono?: string } = {}) {
  n++;
  return prisma.usuario.create({
    data: { nombre: `${rol}${n}`, apellido: "Test", email: `u${n}-${Date.now()}@test.com`, rol, passwordHash: hash, ...extra },
  });
}

export async function token(email: string): Promise<string> {
  const r = await request(app).post("/auth/login").send({ email, password: CLAVE });
  if (r.status !== 200) throw new Error(`login falló: ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

/** Barrio de prueba; con `guardias` los asigna para que lo cubran. */
export async function crearBarrio(tieneGuardia = true, guardias: number[] = []) {
  n++;
  return prisma.barrio.create({
    data: { nombre: `Barrio ${n}-${Date.now()}`, tieneGuardia, guardias: { create: guardias.map((usuarioId) => ({ usuarioId })) } },
  });
}

/**
 * Escenario típico: casa (en un barrio con guardia) con dueño y familiar, una casa individual de un
 * cliente ajeno, un guardia que cubre ese barrio y un admin.
 */
export async function escenario() {
  const [dueno, familiar, ajeno, guardia, admin] = await Promise.all([
    crearUsuario("CLIENTE", { telefono: "+5491100000001" }),
    crearUsuario("CLIENTE"),
    crearUsuario("CLIENTE"),
    crearUsuario("GUARDIA"),
    crearUsuario("ADMIN"),
  ]);
  const barrio = await crearBarrio(true, [guardia.id]);
  const casa = await prisma.casa.create({
    data: {
      codigo: `C-${Date.now()}-${n}`,
      calle: "Calle",
      numero: "1",
      paquete: "BARRIO",
      barrioId: barrio.id,
      miembros: { create: [{ usuarioId: dueno.id, rol: "DUENO" }, { usuarioId: familiar.id, rol: "FAMILIAR" }] },
    },
  });
  const casaAjena = await prisma.casa.create({
    data: { codigo: `C-AJ-${Date.now()}-${n}`, paquete: "INDIVIDUAL", miembros: { create: [{ usuarioId: ajeno.id, rol: "DUENO" }] } },
  });
  const t = {
    dueno: await token(dueno.email),
    familiar: await token(familiar.email),
    ajeno: await token(ajeno.email),
    guardia: await token(guardia.email),
    admin: await token(admin.email),
  };
  return { dueno, familiar, ajeno, guardia, admin, barrio, casa, casaAjena, t };
}

/** Vincula una placa a una casa directamente y devuelve sus credenciales MQTT. */
export async function vincularPlaca(casaId: number, deviceId = "A1B2C3D4E5F6", nombreDispositivo?: string) {
  const { provisionar } = await import("../src/modules/dispositivos/dispositivo.service");
  const { sha256, tokenAleatorio } = await import("../src/core/cripto");
  const codigo = tokenAleatorio(18);
  const dueno = await prisma.casaMiembro.findFirstOrThrow({ where: { casaId, rol: "DUENO" } });
  await prisma.codigoVinculacion.create({
    data: { codigoHash: sha256(codigo), casaId, usuarioId: dueno.usuarioId, expiraEn: new Date(Date.now() + 60_000), nombreDispositivo },
  });
  const r = await provisionar({ deviceId, codigo, secret: "ab".repeat(32) });
  const disp = await prisma.dispositivo.findUniqueOrThrow({ where: { deviceId } });
  return { disp, mqtt: r.mqtt };
}

export const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
