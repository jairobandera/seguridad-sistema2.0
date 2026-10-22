import { Redirect, Stack } from "expo-router";
import { useSesion } from "@/store/sesion";

export default function LayoutCliente() {
  const usuario = useSesion((s) => s.usuario);
  if (!usuario || usuario.rol !== "CLIENTE") return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
