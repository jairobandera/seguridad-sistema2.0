import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import type { Sesion, Usuario } from "@/api/tipos";

// Los tokens se guardan cifrados en el llavero del sistema (Keychain / Keystore).
// En la versión web (panel desde la PC) no hay llavero: se usa localStorage.
const almacen =
  Platform.OS === "web"
    ? {
        getItemAsync: async (k: string) => globalThis.localStorage?.getItem(k) ?? null,
        setItemAsync: async (k: string, v: string) => globalThis.localStorage?.setItem(k, v),
        deleteItemAsync: async (k: string) => globalThis.localStorage?.removeItem(k),
      }
    : SecureStore;

const CLAVE_REFRESH = "refreshToken";
const CLAVE_ACCESO = "accessToken";
const CLAVE_PUSH = "pushToken";

interface EstadoSesion {
  cargando: boolean;
  usuario: Usuario | null;
  accessToken: string | null;
  refreshToken: string | null;
  cargar: () => Promise<void>;
  guardar: (s: Sesion) => Promise<void>;
  actualizarUsuario: (u: Usuario) => void;
  limpiar: () => Promise<void>;
}

export const useSesion = create<EstadoSesion>((set) => ({
  cargando: true,
  usuario: null,
  accessToken: null,
  refreshToken: null,

  cargar: async () => {
    const [refreshToken, accessToken] = await Promise.all([
      almacen.getItemAsync(CLAVE_REFRESH),
      almacen.getItemAsync(CLAVE_ACCESO),
    ]);
    set({ refreshToken, accessToken });
  },

  guardar: async (s) => {
    await Promise.all([
      almacen.setItemAsync(CLAVE_REFRESH, s.refreshToken),
      almacen.setItemAsync(CLAVE_ACCESO, s.accessToken),
    ]);
    set({ usuario: s.usuario, accessToken: s.accessToken, refreshToken: s.refreshToken, cargando: false });
  },

  actualizarUsuario: (usuario) => set({ usuario }),

  limpiar: async () => {
    await Promise.all([almacen.deleteItemAsync(CLAVE_REFRESH), almacen.deleteItemAsync(CLAVE_ACCESO)]);
    set({ usuario: null, accessToken: null, refreshToken: null, cargando: false });
  },
}));

export const marcarCargado = () => useSesion.setState({ cargando: false });

export const pushTokenGuardado = () => almacen.getItemAsync(CLAVE_PUSH);
export const guardarPushToken = (t: string) => almacen.setItemAsync(CLAVE_PUSH, t);
