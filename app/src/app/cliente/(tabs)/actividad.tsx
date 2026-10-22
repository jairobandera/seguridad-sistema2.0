import { Appbar } from "react-native-paper";
import { casas } from "@/api/endpoints";
import { useCasas } from "@/hooks/useCasas";
import { ListaEventos } from "@/components/ListaEventos";
import { Cargando, Vacio } from "@/components/Estados";
import { direccion } from "@/utils/formato";

export default function Actividad() {
  const { actual, isLoading } = useCasas();
  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Actividad" subtitle={actual ? direccion(actual) : undefined} />
      </Appbar.Header>
      {isLoading ? (
        <Cargando />
      ) : actual ? (
        <ListaEventos queryKey={["eventos", actual.id, "lista"]} cargar={(cursor) => casas.eventos(actual.id, cursor)} />
      ) : (
        <Vacio icono="home-alert-outline" titulo="No tenés una casa asignada" />
      )}
    </>
  );
}
