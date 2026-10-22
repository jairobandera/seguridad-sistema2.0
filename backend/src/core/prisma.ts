import { PrismaClient } from "@prisma/client";

/**
 * Conexión a MySQL. En producción (Aiven) la DATABASE_URL lleva
 * `?sslaccept=strict&sslcert=./ca.pem` y `scripts/escribir-ca.js` crea
 * prisma/ca.pem desde la variable DATABASE_CA_CERT antes de arrancar.
 */
export const prisma = new PrismaClient({ log: ["error", "warn"] });
