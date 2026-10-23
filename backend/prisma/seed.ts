/**
 * Crea el administrador inicial a partir de SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD.
 * Es idempotente: si el usuario ya existe no lo toca.
 *
 * Con `--demo` crea además datos de prueba: un barrio con guardia (casa de Ana y Juan), un barrio
 * sin guardia (casa de Lucía) y una casa individual (Pedro).
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

async function usuario(email: string, datos: { nombre: string; apellido: string; rol: "ADMIN" | "GUARDIA" | "CLIENTE"; telefono?: string }, password: string) {
  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    console.log(`- ${email} ya existe`);
    return existente;
  }
  const u = await prisma.usuario.create({
    data: { ...datos, email, passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`+ ${datos.rol} ${email}`);
  return u;
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) {
    throw new Error("Definí SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (mínimo 8 caracteres) en el .env");
  }
  await usuario(email, { nombre: "Administrador", apellido: "General", rol: "ADMIN" }, password);

  if (process.argv.includes("--demo")) {
    const clave = "Demo12345";
    const ana = await usuario("ana@demo.com", { nombre: "Ana", apellido: "Pérez", rol: "CLIENTE", telefono: "+5491100000001" }, clave);
    const juan = await usuario("juan@demo.com", { nombre: "Juan", apellido: "Pérez", rol: "CLIENTE" }, clave);
    const guardia = await usuario("guardia@demo.com", { nombre: "Carlos", apellido: "Gómez", rol: "GUARDIA" }, clave);
    const lucia = await usuario("lucia@demo.com", { nombre: "Lucía", apellido: "Martínez", rol: "CLIENTE" }, clave);
    const pedro = await usuario("pedro@demo.com", { nombre: "Pedro", apellido: "López", rol: "CLIENTE" }, clave);

    // Barrio con guardia (el guardia de demo lo cubre) y barrio sin guardia
    const conGuardia = await prisma.barrio.upsert({ where: { nombre: "Barrio Demo" }, update: {}, create: { nombre: "Barrio Demo" } });
    const sinGuardia = await prisma.barrio.upsert({
      where: { nombre: "Barrio Sin Guardia" },
      update: {},
      create: { nombre: "Barrio Sin Guardia", tieneGuardia: false },
    });
    await prisma.guardiaBarrio.upsert({
      where: { usuarioId_barrioId: { usuarioId: guardia.id, barrioId: conGuardia.id } },
      update: {},
      create: { usuarioId: guardia.id, barrioId: conGuardia.id },
    });

    await casa("C-DEMO", { calle: "Los Aromos", numero: "123", paquete: "BARRIO", barrioId: conGuardia.id }, [
      { usuarioId: ana.id, rol: "DUENO" },
      { usuarioId: juan.id, rol: "FAMILIAR" },
    ]);
    await casa("C-SINGUARDIA", { calle: "Las Lilas", numero: "45", paquete: "BARRIO", barrioId: sinGuardia.id }, [
      { usuarioId: lucia.id, rol: "DUENO" },
    ]);
    await casa("C-INDIVIDUAL", { calle: "Av. Italia", numero: "2500", paquete: "INDIVIDUAL" }, [{ usuarioId: pedro.id, rol: "DUENO" }]);
    console.log(`Clave de todos los usuarios de demo: ${clave}`);
  }
}

async function casa(
  codigo: string,
  datos: { calle: string; numero: string; paquete: "BARRIO" | "INDIVIDUAL"; barrioId?: number },
  miembros: { usuarioId: number; rol: "DUENO" | "FAMILIAR" }[],
) {
  if (await prisma.casa.findUnique({ where: { codigo } })) {
    console.log(`- casa ${codigo} ya existe`);
    return;
  }
  await prisma.casa.create({ data: { codigo, ...datos, miembros: { create: miembros } } });
  console.log(`+ casa ${codigo} (${datos.paquete === "INDIVIDUAL" ? "individual" : "barrio"})`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
