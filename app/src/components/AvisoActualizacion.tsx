import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { Button, Dialog, Portal, Text } from "react-native-paper";
import * as Updates from "expo-updates";

/** Busca una versión nueva y la descarga en segundo plano (no aplica en desarrollo ni en la web). */
async function buscarVersionNueva() {
  if (!Updates.isEnabled || __DEV__) return;
  try {
    const r = await Updates.checkForUpdateAsync();
    if (r.isAvailable) await Updates.fetchUpdateAsync();
  } catch {
    // Sin internet o servidor de updates caído: se reintenta la próxima vez
  }
}

/**
 * Actualizaciones por aire (EAS Update): cuando hay una versión nueva descargada, ofrece aplicarla.
 * Al abrir la app y al volver a ella se busca si hay una nueva.
 */
function AvisoNativo() {
  const { isUpdatePending } = Updates.useUpdates();
  const [masTarde, setMasTarde] = useState(false);

  useEffect(() => {
    void buscarVersionNueva();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void buscarVersionNueva();
    });
    return () => sub.remove();
  }, []);

  return (
    <Portal>
      <Dialog visible={isUpdatePending && !masTarde} onDismiss={() => setMasTarde(true)}>
        <Dialog.Title>Hay una versión nueva</Dialog.Title>
        <Dialog.Content>
          <Text>Actualizá para tener las últimas mejoras. Tarda unos segundos y no se pierde nada.</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setMasTarde(true)}>Más tarde</Button>
          <Button mode="contained" onPress={() => void Updates.reloadAsync()}>
            Actualizar
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

// En la web la página siempre carga la última versión publicada
export const AvisoActualizacion = Platform.OS === "web" ? () => null : AvisoNativo;
