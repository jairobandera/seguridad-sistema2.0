import { router } from "expo-router";
import type { QueryClient } from "@tanstack/react-query";
import { auth } from "@/api/endpoints";
import type { Rol, Sesion } from "@/api/tipos";
import { pushTokenGuardado, useSesion } from "@/store/sesion";
import { desconectarTiempoReal } from "@/realtime/socket";

export function rutaInicio(rol: Rol | undefined): "/cliente" | "/guardia/alertas" | "/admin/usuarios" | "/login" {
  if (rol === "CLIENTE") return "/cliente";
  if (rol === "GUARDIA") return "/guardia/alertas";
  if (rol === "ADMIN") return "/admin/usuarios";
  return "/login";
}

export async function iniciarSesion(s: Sesion) {
  await useSesion.getState().guardar(s);
  router.replace(s.usuario.debeCambiarPassword ? "/cambiar-password" : rutaInicio(s.usuario.rol));
}

/** Cierra sesión: este celular deja de recibir alarmas de la cuenta. */
export async function cerrarSesion(qc: QueryClient) {
  const { refreshToken, limpiar } = useSesion.getState();
  const pushToken = await pushTokenGuardado();
  await auth.logout(refreshToken, pushToken).catch(() => undefined);
  desconectarTiempoReal();
  qc.clear();
  await limpiar();
  router.replace("/login");
}
