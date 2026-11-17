import { execSync } from "child_process";

/** Recrea la base de tests desde las migraciones antes de correr la suite. */
export default function setup() {
  // vitest.config.ts ya validó que apunte al esquema "pruebas"
  const url = process.env.TEST_DATABASE_URL!;
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });
}
