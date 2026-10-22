import { parsePhoneNumberFromString } from "libphonenumber-js";

export const PAISES = [
  { codigo: "AR", nombre: "Argentina", prefijo: "+54" },
  { codigo: "UY", nombre: "Uruguay", prefijo: "+598" },
  { codigo: "OTRO", nombre: "Otro", prefijo: "+" },
] as const;

export type CodigoPais = (typeof PAISES)[number]["codigo"];

/**
 * Arma el número internacional (E.164) a partir de lo que escribe el usuario.
 * En Argentina los celulares llevan un 9 después del +54 (se agrega solo si falta).
 */
export function normalizarTelefono(pais: CodigoPais, numero: string): { e164: string | null; lindo: string } {
  const limpio = numero.replace(/[^\d+]/g, "");
  let candidato: string;
  if (pais === "OTRO" || limpio.startsWith("+")) candidato = limpio.startsWith("+") ? limpio : `+${limpio}`;
  else if (pais === "AR") {
    let local = limpio.replace(/^0/, "");
    if (local.startsWith("15")) local = local.slice(2);
    candidato = `+54${local.startsWith("9") ? "" : "9"}${local}`;
  } else candidato = `+598${limpio.replace(/^0/, "")}`;
  const n = parsePhoneNumberFromString(candidato);
  if (!n || !n.isValid()) return { e164: null, lindo: candidato };
  return { e164: n.number, lindo: n.formatInternational() };
}

export function formatoTelefono(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
