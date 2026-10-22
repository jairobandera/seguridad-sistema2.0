import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { casas } from "@/api/endpoints";

const useCasaElegida = create<{ id: number | null; elegir: (id: number) => void }>((set) => ({
  id: null,
  elegir: (id) => set({ id }),
}));

/** Casas del cliente y la que está mirando (la mayoría tiene una sola). */
export function useCasas() {
  const q = useQuery({ queryKey: ["casas", "mias"], queryFn: casas.mias });
  const { id, elegir } = useCasaElegida();
  const lista = q.data ?? [];
  const actual = lista.find((c) => c.id === id) ?? lista[0] ?? null;
  return { ...q, lista, actual, elegir };
}
