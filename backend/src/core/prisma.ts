import { PrismaClient } from "@prisma/client";

/**
 * Conexión a PostgreSQL (Supabase). Cada entorno usa su propio esquema con `?schema=`:
 * guardiel (producción), desarrollo (tu PC) y pruebas (los tests, se borra en cada corrida).
 */
export const prisma = new PrismaClient({ log: ["error", "warn"] });
