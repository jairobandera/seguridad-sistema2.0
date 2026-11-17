import fs from "fs";
import { defineConfig } from "vitest/config";

// Los tests usan un esquema aparte que se borra en cada corrida (TEST_DATABASE_URL en .env, con ?schema=pruebas).
const TEST_DB = leerTestDb();
// globalSetup (test/global-setup.ts) corre fuera de `test.env`: la recibe por acá
process.env.TEST_DATABASE_URL = TEST_DB;

function leerTestDb(): string {
  const url = process.env.TEST_DATABASE_URL ?? leerDeEnv("TEST_DATABASE_URL");
  if (!url) throw new Error("Falta TEST_DATABASE_URL en backend/.env (ver .env.example)");
  // Nunca contra producción: los tests borran todo
  if (!/[?&]schema=pruebas\b/.test(url)) throw new Error("TEST_DATABASE_URL tiene que terminar en ?schema=pruebas");
  return url;
}

function leerDeEnv(nombre: string): string | undefined {
  if (!fs.existsSync(".env")) return undefined;
  const linea = fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${nombre}=`));
  return linea?.slice(nombre.length + 1).trim().replace(/^"|"$/g, "");
}

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
    // La base de tests está en Supabase (por internet): cada test hace muchas consultas
    testTimeout: 120_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DB,
      JWT_SECRET: "secreto-de-test-con-mas-de-32-caracteres-ok",
      DEVICE_SECRET_KEY: "11".repeat(32),
      MQTT_PUBLIC_URL: "mqtt://localhost:1885",
      DEVICE_OFFLINE_GRACIA_SEG: "0",
      SMS_MINUTOS_ENTRE_ALERTAS: "5",
    },
  },
});
