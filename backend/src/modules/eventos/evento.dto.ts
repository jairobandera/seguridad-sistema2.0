import { Prisma } from "@prisma/client";
import { aplanarBarrio, selectCasaDireccion } from "../barrios/barrio.service";

export const incluirEvento = {
  casa: { select: selectCasaDireccion },
  dispositivo: { select: { deviceId: true, nombre: true } },
  usuario: { select: { id: true, nombre: true, apellido: true } },
  estado: { include: { guardia: { select: { id: true, nombre: true, apellido: true } } } },
} satisfies Prisma.EventoInclude;

export type EventoConRelaciones = Prisma.EventoGetPayload<{ include: typeof incluirEvento }>;

const nombreCompleto = (u: { nombre: string; apellido: string }) => `${u.nombre} ${u.apellido}`.trim();

/** Forma pública de un evento (docs/protocolo.md §4). */
export function eventoDTO(e: EventoConRelaciones) {
  return {
    id: e.id,
    tipo: e.tipo,
    severidad: e.severidad,
    fechaHora: e.fechaHora.toISOString(),
    alarmaArmada: e.alarmaArmada,
    valor: e.valor,
    casa: e.casa ? aplanarBarrio(e.casa) : null,
    dispositivo: e.dispositivo,
    usuario: e.usuario ? { id: e.usuario.id, nombre: nombreCompleto(e.usuario) } : null,
    estado: e.estado
      ? {
          estado: e.estado.estado,
          guardia: e.estado.guardia ? { id: e.estado.guardia.id, nombre: nombreCompleto(e.estado.guardia) } : null,
          nota: e.estado.nota,
          tomadoEn: e.estado.tomadoEn?.toISOString() ?? null,
          resueltoEn: e.estado.resueltoEn?.toISOString() ?? null,
        }
      : null,
  };
}

export type EventoDTO = ReturnType<typeof eventoDTO>;

export function direccionCasa(c: { nombre?: string | null; calle?: string | null; numero?: string | null; barrio?: string | null } | null) {
  if (!c) return "Casa sin datos";
  if (c.nombre) return c.nombre;
  const partes = [[c.calle, c.numero].filter(Boolean).join(" "), c.barrio].filter(Boolean);
  return partes.length ? partes.join(", ") : "Casa";
}
