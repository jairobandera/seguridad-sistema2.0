import { AppState, type NativeEventSubscription } from "react-native";
import { io, Socket } from "socket.io-client";
import type { QueryClient } from "@tanstack/react-query";
import { API_URL } from "@/config";
import { renovarSesion } from "@/api/cliente";
import type { Casa, EstadoCasa, Evento } from "@/api/tipos";
import { useSesion } from "@/store/sesion";
import { useAlarma } from "@/store/alarma";

let socket: Socket | null = null;
let reintento: ReturnType<typeof setTimeout> | undefined;
let appState: NativeEventSubscription | null = null;

type Oyente = (datos: { deviceId: string; casaId: number; fase: string }) => void;
const oyentesConfig = new Set<Oyente>();

/** Para el asistente de la placa: avisa cuando el servidor confirma la vinculación. */
export function alConfigurarPlaca(fn: Oyente) {
  oyentesConfig.add(fn);
  return () => oyentesConfig.delete(fn);
}

export function conectarTiempoReal(qc: QueryClient) {
  if (socket) return;
  socket = io(API_URL, {
    transports: ["websocket"],
    // Se evalúa en cada (re)conexión: siempre usa el token vigente
    auth: (cb) => cb({ token: useSesion.getState().accessToken }),
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  // Si el servidor rechaza la conexión (token vencido, servidor reiniciándose), socket.io no reintenta solo
  socket.on("connect_error", async (err) => {
    if (err.message === "token_invalido") await renovarSesion();
    if (!useSesion.getState().accessToken) return;
    clearTimeout(reintento);
    reintento = setTimeout(() => {
      if (socket && !socket.connected) socket.connect();
    }, 3000);
  });

  // Al (re)conectar, refresca todo por si se perdió algún aviso mientras estaba desconectado
  let primeraConexion = true;
  socket.on("connect", () => {
    if (!primeraConexion) qc.invalidateQueries();
    primeraConexion = false;
  });

  // Al volver a la app (estaba en segundo plano): Android puede haber cortado la conexión
  appState?.remove();
  appState = AppState.addEventListener("change", (s) => {
    if (s !== "active" || !socket) return;
    if (!socket.connected) socket.connect();
    qc.invalidateQueries({ queryKey: ["casas"] });
  });

  socket.on("casa:estado", async (estado: EstadoCasa) => {
    // Una recarga de la lista que ya estaba en curso traería el estado VIEJO y pisaría este:
    // se cancela antes de aplicar el nuevo
    await qc.cancelQueries({ queryKey: ["casas", "mias"] });
    qc.setQueryData<Casa[]>(["casas", "mias"], (lista) =>
      lista?.map((c) => (c.id === estado.casaId ? { ...c, alarmaArmada: estado.alarmaArmada, estado } : c)),
    );
    qc.invalidateQueries({ queryKey: ["guardia"] });
    qc.invalidateQueries({ queryKey: ["admin", "casas"] });
  });

  socket.on("evento:nuevo", (e: Evento) => {
    if (e.casa) qc.invalidateQueries({ queryKey: ["eventos", e.casa.id] });
    qc.invalidateQueries({ queryKey: ["guardia"] });
    const rol = useSesion.getState().usuario?.rol;
    if (e.severidad === "CRITICA" && e.tipo === "PUERTA_ABIERTA" && rol !== "ADMIN") {
      useAlarma.getState().mostrar(e);
    }
  });

  socket.on("evento:estado", (d: { casaId: number | null }) => {
    if (d.casaId) qc.invalidateQueries({ queryKey: ["eventos", d.casaId] });
    qc.invalidateQueries({ queryKey: ["guardia"] });
  });

  socket.on("dispositivo:config", (d: { deviceId: string; casaId: number; fase: string }) => {
    qc.invalidateQueries({ queryKey: ["casas"] });
    qc.invalidateQueries({ queryKey: ["admin"] });
    oyentesConfig.forEach((fn) => fn(d));
  });
}

/**
 * Monitor serial de una placa (solo admin): `alTexto` recibe lo que imprime la placa y `alEstado` si está conectada
 * (null = no se pudo abrir o todavía no se sabe). Devuelve la función para cerrarlo.
 */
export function abrirMonitor(
  deviceId: string,
  alTexto: (texto: string) => void,
  alEstado: (online: boolean | null) => void,
): () => void {
  const s = socket;
  if (!s) {
    alEstado(null);
    return () => undefined;
  }
  // Se vuelve a abrir en cada reconexión (el servidor olvida quién miraba)
  const abrir = () =>
    s.timeout(8000).emit("monitor:abrir", { deviceId }, (err: Error | null, r?: { ok: boolean; online?: boolean }) =>
      alEstado(err || !r?.ok ? null : !!r.online),
    );
  const linea = (d: { deviceId: string; texto: string }) => d.deviceId === deviceId && alTexto(d.texto);
  const estado = (d: { deviceId: string; online: boolean }) => d.deviceId === deviceId && alEstado(d.online);
  s.on("monitor:linea", linea);
  s.on("monitor:estado", estado);
  s.on("connect", abrir);
  if (s.connected) abrir();
  return () => {
    s.off("monitor:linea", linea);
    s.off("monitor:estado", estado);
    s.off("connect", abrir);
    s.emit("monitor:cerrar", { deviceId });
  };
}

export function desconectarTiempoReal() {
  clearTimeout(reintento);
  appState?.remove();
  appState = null;
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

/** Tras renovar el token o cambiar de casas, reconecta para tomar las rooms nuevas. */
export function reconectarTiempoReal() {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}
