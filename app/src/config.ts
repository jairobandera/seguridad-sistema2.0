import Constants from "expo-constants";

export const NOMBRE_APP = "GuardiEl";
// La de app.config.ts (llega también con las actualizaciones por aire)
export const VERSION_APP = Constants.expoConfig?.version ?? "dev";

// URL del backend. Se define en app/.env (EXPO_PUBLIC_API_URL) o en el perfil de EAS.
//   Local:      http://IP-DE-TU-PC:3000   (el celular y la PC en la misma red WiFi)
//   Producción: https://TU-SERVICIO.onrender.com
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.1.75:3000").replace(/\/+$/, "");
