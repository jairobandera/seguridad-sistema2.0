import { DarkTheme, DefaultTheme, type Theme } from "expo-router";
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from "react-native-paper";

// Colores del logo de GuardiEl: azul del escudo, celeste del brillo y gris pizarra de las letras
export const marca = {
  azul: "#1557C0",
  azulOscuro: "#0B3D91",
  celeste: "#29A8F0",
  pizarra: "#37474F",
};

export const colores = {
  peligro: "#D32F2F",
  ok: "#2E7D32",
  aviso: "#EF6C00",
  apagado: "#78909C",
  // Alarma armada = protegida: el azul de la marca
  armada: marca.azul,
};

export const temaClaro: MD3Theme = {
  ...MD3LightTheme,
  roundness: 4,
  colors: {
    ...MD3LightTheme.colors,
    primary: marca.azul,
    onPrimary: "#FFFFFF",
    primaryContainer: "#D9E6FF",
    onPrimaryContainer: "#001B44",
    secondary: "#0A84C6",
    onSecondary: "#FFFFFF",
    secondaryContainer: "#D2EEFF",
    onSecondaryContainer: "#00283D",
    tertiary: marca.pizarra,
    onTertiary: "#FFFFFF",
    tertiaryContainer: "#DDE5EA",
    onTertiaryContainer: "#141D22",
    error: colores.peligro,
    background: "#F2F5FA",
    onBackground: "#16202B",
    surface: "#FFFFFF",
    onSurface: "#16202B",
    surfaceVariant: "#E2E8F1",
    onSurfaceVariant: "#4A5668",
    outline: "#78859A",
    outlineVariant: "#C8D1DE",
    elevation: {
      level0: "transparent",
      level1: "#FFFFFF",
      level2: "#F7F9FD",
      level3: "#F1F5FC",
      level4: "#EEF3FB",
      level5: "#EAF0FA",
    },
  },
};

export const temaOscuro: MD3Theme = {
  ...MD3DarkTheme,
  roundness: 4,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#9CC2FF",
    onPrimary: "#002E6B",
    primaryContainer: "#0E3F8F",
    onPrimaryContainer: "#D9E6FF",
    secondary: "#7CCFFF",
    onSecondary: "#003550",
    secondaryContainer: "#004C70",
    onSecondaryContainer: "#D2EEFF",
    tertiary: "#B9C8D0",
    onTertiary: "#24323A",
    tertiaryContainer: "#3A4A53",
    onTertiaryContainer: "#DDE5EA",
    error: "#FF8A80",
    background: "#09111E",
    onBackground: "#E3E9F2",
    surface: "#0F1A2B",
    onSurface: "#E3E9F2",
    surfaceVariant: "#1B2940",
    onSurfaceVariant: "#A9B6CA",
    outline: "#617089",
    outlineVariant: "#2A3A54",
    elevation: {
      level0: "transparent",
      level1: "#121F33",
      level2: "#15233A",
      level3: "#182841",
      level4: "#1A2A44",
      level5: "#1C2D49",
    },
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
