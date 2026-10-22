import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance, AndroidNotificationVisibility } from "expo-notifications";
import Constants from "expo-constants";
import { yo } from "@/api/endpoints";
import { guardarPushToken } from "@/store/sesion";

// Canal "alarma": sonido de sirena y máxima prioridad. Los canales de Android no se pueden
// modificar una vez creados: si se cambia el sonido, hay que usar otro id de canal.
export const CANAL_ALARMA = "alarma";
export const CANAL_GENERAL = "general";

Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    // Con la app abierta, las alarmas suenan desde la pantalla roja (no dos sirenas a la vez)
    const esAlarma = n.request.content.data?.tipo === "ALARMA";
    return { shouldShowBanner: !esAlarma, shouldShowList: true, shouldPlaySound: !esAlarma, shouldSetBadge: false };
  },
});

async function crearCanales() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CANAL_ALARMA, {
    name: "Alarmas",
    description: "Puerta abierta con la alarma armada",
    importance: AndroidImportance.MAX,
    sound: "alarma.wav",
    vibrationPattern: [0, 600, 300, 600, 300, 600],
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
  });
  await Notifications.setNotificationChannelAsync(CANAL_GENERAL, {
    name: "Avisos",
    description: "Placa desconectada y otros avisos",
    importance: AndroidImportance.HIGH,
  });
}

export type ResultadoPush = "ok" | "sin_permiso" | "emulador" | "sin_proyecto" | "error";

/** Pide permiso, obtiene el token de Expo y lo registra en el backend. */
export async function registrarPush(): Promise<ResultadoPush> {
  try {
    await crearCanales();
    if (!Device.isDevice) return "emulador";
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return "sin_permiso";

    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) return "sin_proyecto";
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await yo.registrarPush(token, Platform.OS);
    await guardarPushToken(token);
    return "ok";
  } catch {
    return "error";
  }
}

export async function permisoPush(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).status === "granted";
}
