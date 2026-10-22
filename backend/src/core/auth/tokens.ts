import jwt from "jsonwebtoken";
import { Rol } from "@prisma/client";
import { config } from "../config";

export interface UsuarioToken {
  id: number;
  rol: Rol;
  ver: number;
}

interface PayloadAcceso {
  sub: string;
  rol: Rol;
  ver: number;
}

export function firmarAcceso(u: UsuarioToken): string {
  const payload: PayloadAcceso = { sub: String(u.id), rol: u.rol, ver: u.ver };
  return jwt.sign(payload, config.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: `${config.ACCESS_TOKEN_MIN}m`,
  });
}

/** Devuelve el usuario del token o lanza si es inválido o venció. */
export function verificarAcceso(token: string): UsuarioToken {
  const p = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] }) as PayloadAcceso;
  const id = Number(p.sub);
  if (!Number.isInteger(id) || !p.rol) throw new Error("token_invalido");
  return { id, rol: p.rol, ver: p.ver ?? 0 };
}
