import { create } from "zustand";
import type { Evento } from "@/api/tipos";

/** Alarma activa que se muestra a pantalla completa con sirena. */
interface EstadoAlarma {
  evento: Evento | null;
  mostrar: (e: Evento) => void;
  cerrar: () => void;
}

export const useAlarma = create<EstadoAlarma>((set) => ({
  evento: null,
  mostrar: (evento) => set({ evento }),
  cerrar: () => set({ evento: null }),
}));
