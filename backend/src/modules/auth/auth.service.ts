import { config } from "../../core/config";
import { sha256, tokenAleatorio } from "../../core/cripto";
import { prisma } from "../../core/prisma";
import { firmarAcceso } from "../../core/auth/tokens";
import { usuarioConCasas } from "../usuarios/usuario.publico";

export interface DatosCliente {
  ip?: string;
  userAgent?: string;
}

/** Crea una sesión nueva y devuelve el par de tokens + datos del usuario. */
export async function crearSesion(usuarioId: number, cliente: DatosCliente = {}) {
  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
    select: { id: true, rol: true, tokenVersion: true },
  });
  const refreshToken = tokenAleatorio(48);
  await prisma.sesion.create({
    data: {
      usuarioId,
      refreshHash: sha256(refreshToken),
      ip: cliente.ip?.slice(0, 64),
      userAgent: cliente.userAgent?.slice(0, 500),
      expiracion: new Date(Date.now() + config.REFRESH_TOKEN_DIAS * 86_400_000),
    },
  });
  return {
    accessToken: firmarAcceso({ id: usuario.id, rol: usuario.rol, ver: usuario.tokenVersion }),
    refreshToken,
    usuario: await usuarioConCasas(usuarioId),
  };
}

/** Rota el refresh token. Devuelve null si no es válido. */
export async function renovarSesion(refreshToken: string) {
  const sesion = await prisma.sesion.findUnique({
    where: { refreshHash: sha256(refreshToken) },
    include: { usuario: { select: { id: true, rol: true, activo: true, tokenVersion: true } } },
  });
  if (!sesion || !sesion.activa || sesion.expiracion < new Date() || !sesion.usuario.activo) return null;

  const nuevo = tokenAleatorio(48);
  await prisma.sesion.update({
    where: { id: sesion.id },
    data: {
      refreshHash: sha256(nuevo),
      ultimoUso: new Date(),
      expiracion: new Date(Date.now() + config.REFRESH_TOKEN_DIAS * 86_400_000),
    },
  });
  const u = sesion.usuario;
  return {
    accessToken: firmarAcceso({ id: u.id, rol: u.rol, ver: u.tokenVersion }),
    refreshToken: nuevo,
    usuario: await usuarioConCasas(u.id),
  };
}

/** Invalida todas las sesiones y access tokens de un usuario. */
export async function invalidarSesiones(usuarioId: number) {
  await prisma.$transaction([
    prisma.usuario.update({ where: { id: usuarioId }, data: { tokenVersion: { increment: 1 } } }),
    prisma.sesion.updateMany({ where: { usuarioId, activa: true }, data: { activa: false } }),
  ]);
}
