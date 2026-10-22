import { z } from "zod";

/** Parámetro de ruta numérico positivo. */
export const idParam = z.coerce.number().int().positive();

export function leerId(valor: unknown): number {
  return idParam.parse(valor);
}

export const paginacion = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
