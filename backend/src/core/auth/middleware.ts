import { NextFunction, Request, Response } from "express";
import { Rol } from "@prisma/client";
import { prisma } from "../prisma";
import { HttpError, prohibido } from "../errores";
import { UsuarioToken, verificarAcceso } from "./tokens";

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioToken;
    }
  }
}

/**
 * Exige un access token válido y que el usuario siga activo con la misma
 * versión de token (si un admin lo desactiva o le cambia la clave, se corta el acceso).
 */
export async function autenticar(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new HttpError(401, "no_autenticado", "Iniciá sesión para continuar"));
  }
  let datos: UsuarioToken;
  try {
    datos = verificarAcceso(header.slice(7));
  } catch {
    return next(new HttpError(401, "token_invalido", "Tu sesión venció"));
  }
  const usuario = await prisma.usuario.findUnique({
    where: { id: datos.id },
    select: { activo: true, tokenVersion: true, rol: true },
  });
  if (!usuario || !usuario.activo || usuario.tokenVersion !== datos.ver) {
    return next(new HttpError(401, "token_invalido", "Tu sesión venció"));
  }
  req.usuario = { id: datos.id, rol: usuario.rol, ver: usuario.tokenVersion };
  next();
}

export function requerirRol(...roles: Rol[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario) return next(new HttpError(401, "no_autenticado", "Iniciá sesión para continuar"));
    if (!roles.includes(req.usuario.rol)) return next(prohibido());
    next();
  };
}

/** Usuario autenticado (para usar dentro de handlers protegidos). */
export function usuarioDe(req: Request): UsuarioToken {
  if (!req.usuario) throw new HttpError(401, "no_autenticado", "Iniciá sesión para continuar");
  return req.usuario;
}
