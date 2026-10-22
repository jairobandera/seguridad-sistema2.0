import { DarkTheme, DefaultTheme, type Theme } from "expo-router";
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from "react-native-paper";

export const colores = {
  peligro: "#C62828",
  ok: "#2E7D32",
  aviso: "#EF6C00",
  apagado: "#78909C",
};

export const temaClaro: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#1E3A8A",
    onPrimary: "#FFFFFF",
    primaryContainer: "#DCE3FF",
    secondary: "#0F766E",
    error: colores.peligro,
    background: "#F5F7FB",
    surface: "#FFFFFF",
  },
};

export const temaOscuro: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#A9BCFF",
    primaryContainer: "#22346E",
    secondary: "#5EEAD4",
    error: "#FF8A80",
  },
};

/** Tema de la navegación (fondos de pantallas y barra de pestañas) igual al de Paper. */
export function temaNavegacion(t: MD3Theme, oscuro: boolean): Theme {
  const base = oscuro ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: t.colors.primary,
      background: t.colors.background,
      card: t.colors.surface,
      text: t.colors.onSurface,
      border: t.colors.outlineVariant,
      notification: t.colors.error,
    },
  };
}
