import fs from "fs";
import type { ExpoConfig } from "expo/config";

// APP_VARIANT: "development" (por defecto) permite HTTP en la red local para probar con tu PC.
// En "production" solo HTTPS.
const produccion = process.env.APP_VARIANT === "production";
const PROJECT_ID = "48484418-1134-457b-820d-fb34b4419b0d";

const config: ExpoConfig = {
  name: "GuardiEl",
  slug: "seguridad",
  scheme: "seguridadhogar",
  version: "2.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "com.seguridadhogar.app",
    supportsTablet: false,
    infoPlist: {
      UIBackgroundModes: ["remote-notification"],
      ITSAppUsesNonExemptEncryption: false,
      ...(produccion ? {} : { NSAppTransportSecurity: { NSAllowsLocalNetworking: true, NSAllowsArbitraryLoads: true } }),
    },
  },
  android: {
    package: "com.seguridadhogar.app",
    adaptiveIcon: {
      backgroundColor: "#FFFFFF",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    // google-services.json (Firebase) es necesario para las push en Android (no hace falta para probar en local)
    ...(fs.existsSync("./google-services.json") ? { googleServicesFile: "./google-services.json" } : {}),
  },
  // Panel web (admin/guardia) publicado como sitio estático: una sola página (Render reescribe todo a index.html)
  web: { favicon: "./assets/favicon.png", output: "single" },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-splash-screen",
      // La palabra GuardiEl sobre el azul de la marca. Android 12+ muestra solo un círculo de 192dp en el centro:
      // con 180dp de ancho la palabra entra completa. La bienvenida (src/components/Bienvenida.tsx) usa la misma
      // imagen en el mismo lugar, así el paso de una a otra no se nota.
      {
        image: "./assets/splash-guardiel.png",
        imageWidth: 180,
        resizeMode: "contain",
        backgroundColor: "#0B3D91",
        dark: { image: "./assets/splash-guardiel.png", backgroundColor: "#0B3D91" },
      },
    ],
    "expo-audio",
    [
      "expo-notifications",
      {
        // Color del ícono chico de las notificaciones (Android): el azul de la marca
        color: "#1557C0",
        sounds: ["./assets/sounds/alarma.wav"],
        defaultChannel: "alarma",
      },
    ],
    [
      "react-native-ble-plx",
      {
        isBackgroundEnabled: false,
        modes: [],
        bluetoothAlwaysPermission: "GuardiEl usa Bluetooth para configurar el WiFi de tu dispositivo de seguridad.",
      },
    ],
    [
      "expo-build-properties",
      {
        android: { usesCleartextTraffic: !produccion },
      },
    ],
  ],
  extra: {
    eas: { projectId: PROJECT_ID },
  },
  // Actualizaciones por aire (EAS Update): los cambios de JS llegan sin reinstalar.
  // Un update solo llega a las apps con la misma `version`: si cambia algo nativo, subí la versión y compilá de nuevo.
  runtimeVersion: { policy: "appVersion" },
  updates: { url: `https://u.expo.dev/${PROJECT_ID}` },
};

export default config;
