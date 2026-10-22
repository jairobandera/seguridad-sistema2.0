import fs from "fs";
import type { ExpoConfig } from "expo/config";

// APP_VARIANT: "development" (por defecto) permite HTTP en la red local para probar con tu PC.
// En "production" solo HTTPS.
const produccion = process.env.APP_VARIANT === "production";

const config: ExpoConfig = {
  name: "Seguridad Hogar",
  slug: "seguridad",
  scheme: "seguridadhogar",
  version: "2.0.0",
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
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    // google-services.json (Firebase) es necesario para las push en Android (no hace falta para probar en local)
    ...(fs.existsSync("./google-services.json") ? { googleServicesFile: "./google-services.json" } : {}),
  },
  web: { favicon: "./assets/favicon.png" },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-audio",
    [
      "expo-notifications",
      {
        color: "#C62828",
        sounds: ["./assets/sounds/alarma.wav"],
        defaultChannel: "alarma",
      },
    ],
    [
      "react-native-ble-plx",
      {
        isBackgroundEnabled: false,
        modes: [],
        bluetoothAlwaysPermission: "Usamos Bluetooth para configurar el WiFi de tu placa de seguridad.",
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
    eas: { projectId: "48484418-1134-457b-820d-fb34b4419b0d" },
  },
};

export default config;
