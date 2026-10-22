import type { ColorValue } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type Nombre = keyof typeof MaterialCommunityIcons.glyphMap;

/** Ícono para la barra de pestañas. */
export function iconoTab(nombre: Nombre) {
  return function Icono({ color, size }: { color: ColorValue; size: number }) {
    return <MaterialCommunityIcons name={nombre} color={color as string} size={size} />;
  };
}
