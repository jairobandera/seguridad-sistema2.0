import { Redirect, Stack } from "expo-router";
import { useSesion } from "@/store/sesion";

export default function LayoutAdmin() {
  const usuario = useSesion((s) => s.usuario);
  if (!usuario || usuario.rol !== "ADMIN") return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
