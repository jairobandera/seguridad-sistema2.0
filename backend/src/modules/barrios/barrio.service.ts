import { Prisma } from "@prisma/client";
import { prisma } from "../../core/prisma";

/**
 * Reglas de guardia (una sola fuente de verdad):
 * - Una casa tiene guardia si es del paquete BARRIO y su barrio está activo con `tieneGuardia`.
 * - Un guardia ve solo las casas con guardia de los barrios que cubre.
 * - Casas individuales y barrios sin guardia: la alarma avisa solo a la familia (push) y por SMS.
 */
export const filtroCasaConGuardia = {
  paquete: "BARRIO",
  barrio: { is: { tieneGuardia: true, activo: true } },
} satisfies Prisma.CasaWhereInput;

export function whereCasasDeGuardia(usuarioId: number): Prisma.CasaWhereInput {
  return { paquete: "BARRIO", barrio: { is: { tieneGuardia: true, activo: true, guardias: { some: { usuarioId } } } } };
}

/** Barrio con guardia de la casa (para la room de los guardias), o null si la casa no tiene guardia. */
export async function barrioConGuardiaDeCasa(casaId: number): Promise<number | null> {
  const casa = await prisma.casa.findFirst({ where: { id: casaId, ...filtroCasaConGuardia }, select: { barrioId: true } });
  return casa?.barrioId ?? null;
}

/** Guardias activos que tienen que enterarse de lo que pasa en la casa (vacío si no tiene guardia). */
export async function guardiasDeCasa(casaId: number): Promise<number[]> {
  const barrioId = await barrioConGuardiaDeCasa(casaId);
  if (!barrioId) return [];
  const guardias = await prisma.usuario.findMany({
    where: { rol: "GUARDIA", activo: true, barriosGuardia: { some: { barrioId } } },
    select: { id: true },
  });
  return guardias.map((g) => g.id);
}

export async function guardiaVeCasa(usuarioId: number, casaId: number): Promise<boolean> {
  const casa = await prisma.casa.findFirst({ where: { id: casaId, ...whereCasasDeGuardia(usuarioId) }, select: { id: true } });
  return !!casa;
}

/** Barrios con guardia que cubre el guardia (rooms `barrio:{id}` de su socket). */
export async function barriosVisiblesDeGuardia(usuarioId: number): Promise<number[]> {
  const filas = await prisma.guardiaBarrio.findMany({
    where: { usuarioId, barrio: { tieneGuardia: true, activo: true } },
    select: { barrioId: true },
  });
  return filas.map((f) => f.barrioId);
}

/** Forma que se muestra en la app: el nombre del barrio como texto. */
export const selectCasaDireccion = {
  id: true,
  nombre: true,
  calle: true,
  numero: true,
  manzana: true,
  barrio: { select: { nombre: true } },
} satisfies Prisma.CasaSelect;

export function aplanarBarrio<T extends { barrio: { nombre: string } | null }>(c: T): Omit<T, "barrio"> & { barrio: string | null } {
  return { ...c, barrio: c.barrio?.nombre ?? null };
}
