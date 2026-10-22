/**
 * Crea el administrador inicial a partir de SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD.
 * Es idempotente: si el usuario ya existe no lo toca.
 *
 * Con `--demo` crea además datos de prueba (un cliente con su casa, un familiar y un guardia).
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
    await usuario("guardia@demo.com", { nombre: "Carlos", apellido: "Gómez", rol: "GUARDIA" }, clave);
    let casa = await prisma.casa.findUnique({ where: { codigo: "C-DEMO" } });
    if (!casa) {
      casa = await prisma.casa.create({
        data: {
          codigo: "C-DEMO",
          calle: "Los Aromos",
          numero: "123",
          barrio: "Barrio Demo",
          miembros: { create: [{ usuarioId: ana.id, rol: "DUENO" }, { usuarioId: juan.id, rol: "FAMILIAR" }] },
        },
      });
      console.log(`+ casa C-DEMO (dueña ana@demo.com, familiar juan@demo.com) — clave de demo: ${clave}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
