import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logger } from "./logger";

/** Error con código HTTP y mensaje apto para mostrar al usuario. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensaje?: string,
  ) {
    super(mensaje ?? codigo);
  }
}

export const noEncontrado = (mensaje = "No encontrado") => new HttpError(404, "no_encontrado", mensaje);
export const prohibido = (mensaje = "No tenés permiso para esta acción") => new HttpError(403, "prohibido", mensaje);
export const solicitudInvalida = (codigo: string, mensaje: string) => new HttpError(400, codigo, mensaje);

export function manejadorErrores(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.codigo, mensaje: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "datos_invalidos",
      mensaje: "Revisá los datos enviados",
      detalles: err.issues.map((i) => ({ campo: i.path.join("."), mensaje: i.message })),
    });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "duplicado", mensaje: "Ya existe un registro con esos datos" });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "no_encontrado", mensaje: "No encontrado" });
    }
  }
  if (err instanceof SyntaxError && "body" in (err as object)) {
    return res.status(400).json({ error: "json_invalido", mensaje: "JSON inválido" });
  }
  logger.error({ err, url: req.originalUrl, metodo: req.method }, "Error no controlado");
  return res.status(500).json({ error: "interno", mensaje: "Error interno del servidor" });
}

export function rutaNoEncontrada(_req: Request, res: Response) {
  res.status(404).json({ error: "no_encontrado", mensaje: "Ruta no encontrada" });
}
