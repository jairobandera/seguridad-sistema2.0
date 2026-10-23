import { z } from "zod";
import { prisma } from "../../core/prisma";
import { HttpError } from "../../core/errores";
import { codigoLegible } from "../../core/cripto";
import { esquemaEmail, esquemaPassword, esquemaTelefono, hashPassword } from "../usuarios/usuario.publico";

/**
 * Registro de clientes desde la app (docs/protocolo.md §5):
 * - sin código → casa INDIVIDUAL a su nombre (dueño);
 * - código de barrio "B-…" → casa nueva en ese barrio (dueño), con su guardia si el barrio tiene;
 * - código de familia "F-…" → se suma como FAMILIAR a esa casa.
 */
export const esquemaRegistro = z.object({
  nombre: z.string().trim().min(1, "Poné tu nombre").max(60),
  apellido: z.string().trim().min(1, "Poné tu apellido").max(60),
  email: esquemaEmail,
  password: esquemaPassword,
  telefono: esquemaTelefono.nullish(),
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .max(20)
    .nullish()
    .transform((c) => c || null),
  direccion: z
    .object({
      calle: z.string().trim().min(1, "Poné la calle").max(80),
      numero: z.string().trim().min(1, "Poné el número").max(20),
      manzana: z.string().trim().max(20).nullish(),
    })
    .nullish(),
});

const codigoInvalido = () => new HttpError(400, "codigo_invalido", "El código no existe. Revisalo o pedíselo a la administración.");

/** Genera un código que no esté en uso (reintenta ante la rarísima colisión). */
export async function codigoUnico(prefijo: string, enUso: (codigo: string) => Promise<boolean>): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const c = codigoLegible(prefijo);
    if (!(await enUso(c))) return c;
  }
  throw new HttpError(500, "codigo", "No se pudo generar un código, probá de nuevo");
}

const nuevoCodigoCasa = () => codigoUnico("C", async (c) => !!(await prisma.casa.findUnique({ where: { codigo: c } })));

export async function registrar(d: z.infer<typeof esquemaRegistro>): Promise<number> {
  if (await prisma.usuario.findUnique({ where: { email: d.email } })) {
    throw new HttpError(409, "email_en_uso", "Ya hay una cuenta con ese email. Iniciá sesión.");
  }

  // A qué se suma según el código
  let casaFamilia: number | null = null;
  let barrioId: number | null = null;
  if (d.codigo?.startsWith("F-")) {
    const casa = await prisma.casa.findFirst({ where: { codigoFamilia: d.codigo, activa: true } });
    if (!casa) throw codigoInvalido();
    casaFamilia = casa.id;
  } else if (d.codigo) {
    const barrio = await prisma.barrio.findFirst({ where: { codigoRegistro: d.codigo, activo: true } });
    if (!barrio) throw codigoInvalido();
    barrioId = barrio.id;
  }
  if (casaFamilia === null && !d.direccion) {
    throw new HttpError(400, "sin_direccion", "Completá la dirección de tu casa");
  }

  const passwordHash = await hashPassword(d.password);
  const codigoCasa = casaFamilia === null ? await nuevoCodigoCasa() : null;

  const usuario = await prisma.$transaction(async (tx) => {
    const u = await tx.usuario.create({
      data: { nombre: d.nombre, apellido: d.apellido, email: d.email, telefono: d.telefono ?? null, rol: "CLIENTE", passwordHash },
    });
    if (casaFamilia !== null) {
      await tx.casaMiembro.create({ data: { casaId: casaFamilia, usuarioId: u.id, rol: "FAMILIAR" } });
    } else {
      await tx.casa.create({
        data: {
          codigo: codigoCasa!,
          calle: d.direccion!.calle,
          numero: d.direccion!.numero,
          manzana: d.direccion!.manzana || null,
          paquete: barrioId ? "BARRIO" : "INDIVIDUAL",
          barrioId,
          miembros: { create: { usuarioId: u.id, rol: "DUENO" } },
        },
      });
    }
    return u;
  });
  return usuario.id;
}
