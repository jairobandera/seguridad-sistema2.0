import { Redirect, Stack } from "expo-router";
import { useSesion } from "@/store/sesion";

export default function LayoutGuardia() {
  const usuario = useSesion((s) => s.usuario);
  if (!usuario || usuario.rol !== "GUARDIA") return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
