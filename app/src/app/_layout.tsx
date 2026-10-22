import { useEffect, useRef, useState } from "react";
import { AppState, useColorScheme } from "react-native";
import { Stack, ThemeProvider, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { ApiError, renovarSesion } from "@/api/cliente";
import { marcarCargado, useSesion } from "@/store/sesion";
import { conectarTiempoReal } from "@/realtime/socket";
import { registrarPush } from "@/push/notificaciones";
import { AlarmaOverlay } from "@/components/AlarmaOverlay";
import { Cargando, ErrorReintentar } from "@/components/Estados";
import { rutaInicio } from "@/sesion/acciones";
import { temaClaro, temaNavegacion, temaOscuro } from "@/tema";

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
    },
  },
});

// Refresca los datos al volver a la app
AppState.addEventListener("change", (s) => focusManager.setFocused(s === "active"));

function Sesion() {
  const cargando = useSesion((s) => s.cargando);
  const usuario = useSesion((s) => s.usuario);
  const refreshToken = useSesion((s) => s.refreshToken);
  const pushRegistrado = useRef(false);
  const [intento, setIntento] = useState(0);

  // Al abrir la app: si hay sesión guardada, se renueva (trae el usuario actualizado)
  useEffect(() => {
    (async () => {
      useSesion.setState({ cargando: true });
      await useSesion.getState().cargar();
      if (useSesion.getState().refreshToken) await renovarSesion();
      marcarCargado();
    })();
  }, [intento]);

  useEffect(() => {
    if (!usuario) {
      pushRegistrado.current = false;
      return;
    }
    conectarTiempoReal(qc);
    if (!pushRegistrado.current) {
      pushRegistrado.current = true;
      registrarPush();
    }
  }, [usuario]);

  // Tocar una notificación lleva a la pantalla correspondiente
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const rol = useSesion.getState().usuario?.rol;
      if (!rol) return;
      const tipo = r.notification.request.content.data?.tipo;
      if (rol === "GUARDIA" && (tipo === "ALARMA" || tipo === "OFFLINE")) router.navigate("/guardia/alertas");
      else if (rol === "CLIENTE") router.navigate(tipo === "ALARMA" || tipo === "OFFLINE" ? "/cliente/actividad" : "/cliente");
      else router.navigate(rutaInicio(rol));
    });
    return () => sub.remove();
  }, []);

  if (cargando) return <Cargando texto="Cargando..." />;
  // Hay sesión guardada pero no se pudo renovar (sin internet o servidor caído)
  if (!usuario && refreshToken) {
    return (
      <ErrorReintentar
        error={new Error("No se pudo conectar con el servidor. Revisá tu internet.")}
        alReintentar={() => setIntento((n) => n + 1)}
      />
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <AlarmaOverlay />
    </>
  );
}

export default function RootLayout() {
  const oscuro = useColorScheme() === "dark";
  const tema = oscuro ? temaOscuro : temaClaro;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={qc}>
        <PaperProvider theme={tema}>
          <ThemeProvider value={temaNavegacion(tema, oscuro)}>
            <StatusBar style={oscuro ? "light" : "dark"} />
            <Sesion />
          </ThemeProvider>
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
