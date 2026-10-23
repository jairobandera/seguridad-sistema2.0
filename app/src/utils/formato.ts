import type { Evento, Severidad } from "@/api/tipos";
import { colores } from "@/tema";

export const nombreCompleto = (u: { nombre: string; apellido?: string | null }) => `${u.nombre} ${u.apellido ?? ""}`.trim();

export function direccion(c: { nombre?: string | null; calle?: string | null; numero?: string | null; barrio?: string | null; manzana?: string | null } | null | undefined): string {
  if (!c) return "Casa";
  if (c.nombre) return c.nombre;
  const calle = [c.calle, c.numero].filter(Boolean).join(" ");
  const resto = [c.manzana ? `Mz ${c.manzana}` : null, c.barrio].filter(Boolean).join(", ");
  return [calle, resto].filter(Boolean).join(" · ") || "Casa";
}

const hora = (d: Date) => d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

export function fechaCorta(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return `Hoy ${hora(d)}`;
  if (d.toDateString() === ayer.toDateString()) return `Ayer ${hora(d)}`;
  return `${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} ${hora(d)}`;
}

export function dia(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

export function haceCuanto(iso: string | null): string {
  if (!iso) return "nunca";
  const seg = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return "hace instantes";
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.round(seg / 3600)} h`;
  return fechaCorta(iso);
}

interface TextoEvento {
  titulo: string;
  icono: string;
}

/** Texto amigable para cada tipo de evento (con el nombre del dispositivo: "Puerta trasera"). */
export function textoEvento(e: Pick<Evento, "tipo" | "usuario" | "severidad" | "dispositivo" | "valor">): TextoEvento {
  const nombre = e.dispositivo?.nombre?.trim();
  switch (e.tipo) {
    case "PUERTA_ABIERTA": {
      const que = nombre ? `Se abrió ${nombre}` : "Se abrió la puerta";
      return { titulo: e.severidad === "INFO" ? que : `¡${que} con la alarma armada!`, icono: "door-open" };
    }
    case "PUERTA_CERRADA":
      return { titulo: nombre ? `Se cerró ${nombre}` : "Se cerró la puerta", icono: "door-closed" };
    case "ALARMA_ARMADA":
      return {
        titulo: `${e.usuario ? `${e.usuario.nombre} armó la alarma` : "Alarma armada"}${e.valor ? ` (parcial · ${e.valor.replace(/^Sin: /, "sin ")})` : ""}`,
        icono: "shield-check",
      };
    case "ALARMA_DESARMADA":
      return { titulo: e.usuario ? `${e.usuario.nombre} desarmó la alarma` : "Alarma desarmada", icono: "shield-off-outline" };
    case "DISPOSITIVO_OFFLINE":
      return { titulo: `${nombre ?? "El dispositivo"} se desconectó`, icono: "wifi-off" };
    case "DISPOSITIVO_ONLINE":
      return { titulo: `${nombre ?? "El dispositivo"} se conectó`, icono: "wifi" };
    case "DISPOSITIVO_VINCULADO":
      return { titulo: `${nombre ?? "Dispositivo"} vinculado a la casa`, icono: "link-variant" };
    case "BATERIA_BAJA":
      return {
        titulo: `${nombre ?? "El dispositivo"} con batería ${e.severidad === "ALERTA" ? "muy " : ""}baja${e.valor ? ` (${e.valor} %)` : ""}`,
        icono: e.severidad === "ALERTA" ? "battery-alert" : "battery-20",
      };
    default:
      return { titulo: e.tipo, icono: "information-outline" };
  }
}

export const colorSeveridad: Record<Severidad, string> = {
  INFO: "#607D8B",
  ALERTA: "#EF6C00",
  CRITICA: "#C62828",
};

export const textoEstadoAtencion = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  RESUELTO: "Resuelta",
  FALSA_ALARMA: "Falsa alarma",
} as const;

/** Barras de señal (0-4) a partir del RSSI. */
export function barrasSenal(rssi: number | null | undefined): number {
  if (rssi == null) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -75) return 2;
  return 1;
}

/** Ícono de batería (Material Design Icons) según el porcentaje. */
export function iconoBateria(pct: number): string {
  if (pct <= 10) return "battery-alert";
  const decena = Math.round(pct / 10) * 10;
  return decena >= 100 ? "battery" : `battery-${decena}`;
}

/** Verde, naranja con 20 % o menos, rojo con 10 % o menos. */
export function colorBateria(pct: number): string {
  if (pct <= 10) return colores.peligro;
  if (pct <= 20) return colores.aviso;
  return colores.ok;
}
