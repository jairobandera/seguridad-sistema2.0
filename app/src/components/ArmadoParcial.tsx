import { useState } from "react";
import { Button, Checkbox, Dialog, Portal, Text } from "react-native-paper";
import type { DispositivoCasa } from "@/api/tipos";
import { almacen } from "@/store/sesion";
import { nombreDispositivo } from "@/components/DispositivoFila";

// La última selección del armado parcial se recuerda por casa (en este celular)
const clave = (casaId: number) => `armado_parcial_${casaId}`;

async function ultimaSeleccion(casaId: number): Promise<number[]> {
  try {
    const v = await almacen.getItemAsync(clave(casaId));
    return v ? (JSON.parse(v) as number[]) : [];
  } catch {
    return [];
  }
}

const recordar = (casaId: number, excluir: number[]) => almacen.setItemAsync(clave(casaId), JSON.stringify(excluir)).catch(() => undefined);

type Ventana = { tipo: "parcial"; excluir: number[] } | { tipo: "abiertos"; abiertos: DispositivoCasa[] } | null;

/**
 * Armar dejando dispositivos afuera (ej. una ventana abierta):
 * - `pedirParcial()` abre la lista con un tilde por dispositivo (con la última selección).
 * - `armarTodo()` arma todo, pero si hay algo abierto pregunta si dejarlo afuera.
 */
export function useArmadoParcial(casaId: number, dispositivos: DispositivoCasa[], armar: (excluir: number[]) => void) {
  const [ventana, setVentana] = useState<Ventana>(null);
  const cerrar = () => setVentana(null);

  const armarTodo = () => {
    const abiertos = dispositivos.filter((d) => d.puertaAbierta === true);
    if (abiertos.length) setVentana({ tipo: "abiertos", abiertos });
    else armar([]);
  };

  const pedirParcial = async () => {
    const guardada = await ultimaSeleccion(casaId);
    // Solo los que siguen existiendo
    setVentana({ tipo: "parcial", excluir: guardada.filter((id) => dispositivos.some((d) => d.id === id)) });
  };

  const confirmar = (excluir: number[]) => {
    cerrar();
    if (excluir.length) recordar(casaId, excluir);
    armar(excluir);
  };

  const alternar = (id: number) =>
    setVentana((v) =>
      v?.tipo === "parcial" ? { ...v, excluir: v.excluir.includes(id) ? v.excluir.filter((x) => x !== id) : [...v.excluir, id] } : v,
    );

  const todosAfuera = ventana?.tipo === "parcial" && ventana.excluir.length >= dispositivos.length;
  const nombresAbiertos = ventana?.tipo === "abiertos" ? ventana.abiertos.map(nombreDispositivo).join(", ") : "";
  const sePuedenDejarAfuera = ventana?.tipo === "abiertos" && ventana.abiertos.length < dispositivos.length;

  const dialogos = (
    <Portal>
      <Dialog visible={ventana?.tipo === "parcial"} onDismiss={cerrar}>
        <Dialog.Title>Armar la casa</Dialog.Title>
        <Dialog.Content>
          <Text style={{ marginBottom: 8 }}>Destildá lo que querés dejar afuera de la alarma esta vez.</Text>
          {dispositivos.map((d) => (
            <Checkbox.Item
              key={d.id}
              label={`${nombreDispositivo(d)}${d.puertaAbierta ? " (abierta)" : ""}`}
              status={ventana?.tipo === "parcial" && ventana.excluir.includes(d.id) ? "unchecked" : "checked"}
              onPress={() => alternar(d.id)}
              position="leading"
              labelStyle={{ textAlign: "left" }}
            />
          ))}
          {todosAfuera ? <Text style={{ marginTop: 8 }}>Dejá al menos uno en la alarma.</Text> : null}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={cerrar}>Cancelar</Button>
          <Button mode="contained" disabled={todosAfuera} onPress={() => ventana?.tipo === "parcial" && confirmar(ventana.excluir)}>
            Armar
          </Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={ventana?.tipo === "abiertos"} onDismiss={cerrar}>
        <Dialog.Title>Hay algo abierto</Dialog.Title>
        <Dialog.Content>
          <Text>
            {nombresAbiertos} {ventana?.tipo === "abiertos" && ventana.abiertos.length > 1 ? "están abiertos" : "está abierto"}.{" "}
            {sePuedenDejarAfuera ? "¿Armás dejándolo afuera de la alarma?" : "Cerralo antes de armar o armá igual."}
          </Text>
        </Dialog.Content>
        <Dialog.Actions style={{ flexWrap: "wrap" }}>
          <Button onPress={cerrar}>Cancelar</Button>
          <Button onPress={() => confirmar([])}>Armar igual</Button>
          {sePuedenDejarAfuera ? (
            <Button mode="contained" onPress={() => ventana?.tipo === "abiertos" && confirmar(ventana.abiertos.map((d) => d.id))}>
              Dejarlo afuera
            </Button>
          ) : null}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );

  return { armarTodo, pedirParcial, dialogos };
}
