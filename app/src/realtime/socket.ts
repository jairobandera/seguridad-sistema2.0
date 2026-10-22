import { io, Socket } from "socket.io-client";
import type { QueryClient } from "@tanstack/react-query";
import { API_URL } from "@/config";
import { renovarSesion } from "@/api/cliente";
import type { Casa, EstadoCasa, Evento } from "@/api/tipos";
import { useSesion } from "@/store/sesion";
import { useAlarma } from "@/store/alarma";

let socket: Socket | null = null;

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

  socket.on("connect_error", async (err) => {
    if (err.message === "token_invalido" && (await renovarSesion())) socket?.connect();
  });

  // Al reconectar, refresca todo por si se perdió algo
  socket.io.on("reconnect", () => qc.invalidateQueries());

  socket.on("casa:estado", (estado: EstadoCasa) => {
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

export function desconectarTiempoReal() {
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
