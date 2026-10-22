import { RolCasa } from "@prisma/client";
import { prisma } from "../prisma";
import { noEncontrado, prohibido } from "../errores";
import { UsuarioToken } from "./tokens";

/**
 * Reglas de acceso a una casa:
 * - ADMIN y GUARDIA pueden ver todas.
 * - CLIENTE solo las casas donde es miembro. `soloDueno` exige rol DUENO en la casa.
 * - `gestion`: acciones sobre la placa/miembros (ADMIN o DUENO; nunca GUARDIA).
 */
export async function verificarAccesoCasa(
  u: UsuarioToken,
  casaId: number,
  opciones: { soloDueno?: boolean; gestion?: boolean } = {},
): Promise<{ rolCasa: RolCasa | null }> {
  const casa = await prisma.casa.findUnique({ where: { id: casaId }, select: { id: true } });
  if (!casa) throw noEncontrado("Casa no encontrada");

  if (u.rol === "ADMIN") return { rolCasa: null };
  if (u.rol === "GUARDIA") {
    if (opciones.soloDueno || opciones.gestion) throw prohibido();
    return { rolCasa: null };
  }

  const miembro = await prisma.casaMiembro.findUnique({
    where: { casaId_usuarioId: { casaId, usuarioId: u.id } },
    select: { rol: true },
  });
  // Para un cliente, una casa ajena "no existe" (no revelamos ids válidos).
  if (!miembro) throw noEncontrado("Casa no encontrada");
  if ((opciones.soloDueno || opciones.gestion) && miembro.rol !== "DUENO") {
    throw prohibido("Solo el dueño de la casa puede hacer esto");
  }
  return { rolCasa: miembro.rol };
}

/** Igual que verificarAccesoCasa pero a partir del id de un dispositivo. */
export async function verificarAccesoDispositivo(
  u: UsuarioToken,
  dispositivoId: number,
  opciones: { gestion?: boolean } = {},
) {
  const disp = await prisma.dispositivo.findUnique({ where: { id: dispositivoId } });
  if (!disp) throw noEncontrado("Placa no encontrada");
  if (u.rol === "ADMIN") return disp;
  if (!disp.casaId) throw noEncontrado("Placa no encontrada");
  await verificarAccesoCasa(u, disp.casaId, opciones);
  return disp;
}
