import { Redirect } from "expo-router";
import { useSesion } from "@/store/sesion";
import { rutaInicio } from "@/sesion/acciones";

export default function Inicio() {
  const usuario = useSesion((s) => s.usuario);
  if (!usuario) return <Redirect href="/login" />;
  if (usuario.debeCambiarPassword) return <Redirect href="/cambiar-password" />;
  return <Redirect href={rutaInicio(usuario.rol)} />;
}
