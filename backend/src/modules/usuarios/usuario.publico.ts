import bcrypt from "bcryptjs";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../core/prisma";

/** Campos que se pueden devolver de un usuario (nunca passwordHash ni tokenVersion). */
export const selectUsuarioPublico = {
  id: true,
  nombre: true,
  apellido: true,
  email: true,
  telefono: true,
  rol: true,
  activo: true,
  debeCambiarPassword: true,
  creadoEn: true,
} satisfies Prisma.UsuarioSelect;

export type UsuarioPublico = Prisma.UsuarioGetPayload<{ select: typeof selectUsuarioPublico }>;

export async function usuarioConCasas(id: number) {
  const u = await prisma.usuario.findUniqueOrThrow({
    where: { id },
    select: {
      ...selectUsuarioPublico,
      membresias: { select: { rol: true, casa: { select: { id: true, nombre: true, calle: true, numero: true, barrio: true } } } },
    },
  });
  const { membresias, ...resto } = u;
  return { ...resto, casas: membresias.map((m) => ({ ...m.casa, rolCasa: m.rol })) };
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);

export const esquemaPassword = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(100, "La contraseña es demasiado larga");

export const esquemaEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email inválido");

/** Teléfono en formato internacional E.164 (ej. +5491123456789). */
export const esquemaTelefono = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = parsePhoneNumberFromString(v);
    if (!n || !n.isValid()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Teléfono inválido (usá formato internacional, ej. +54 9 11 2345 6789)" });
      return z.NEVER;
    }
    return n.number;
  });
