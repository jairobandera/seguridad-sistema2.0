import { useState } from "react";
import { Platform, Share, View } from "react-native";
import { Button, Dialog, Portal, Text, useTheme } from "react-native-paper";

interface Props {
  titulo: string;
  codigo: string | null;
  /** Texto que se manda al compartir (incluye el código) */
  mensaje: (codigo: string) => string;
  generar: () => Promise<unknown>;
  avisar: (texto: string) => void;
}

/** Código para registrarse (barrio o familia) con Compartir y Generar/Regenerar. */
export function CodigoCompartir({ titulo, codigo, mensaje, generar, avisar }: Props) {
  const tema = useTheme();
  const [generando, setGenerando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const crear = async () => {
    setConfirmar(false);
    setGenerando(true);
    try {
      await generar();
      avisar(codigo ? "Código nuevo generado: el anterior ya no sirve" : "Código generado");
    } catch {
      avisar("No se pudo generar el código");
    } finally {
      setGenerando(false);
    }
  };

  const compartir = async () => {
    if (!codigo) return;
    try {
      await Share.share({ message: mensaje(codigo) });
    } catch {
      // En la web sin "compartir" del navegador: se copia
      if (Platform.OS === "web" && globalThis.navigator?.clipboard) {
        await globalThis.navigator.clipboard.writeText(mensaje(codigo));
        avisar("Copiado al portapapeles");
      }
    }
  };

  return (
    <View style={{ gap: 4 }}>
      <Text variant="labelMedium" style={{ color: tema.colors.onSurfaceVariant }}>
        {titulo}
      </Text>
      {codigo ? (
        <Text variant="headlineSmall" selectable style={{ fontWeight: "700", letterSpacing: 2 }}>
          {codigo}
        </Text>
      ) : (
        <Text variant="bodyMedium">Todavía no hay código.</Text>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {codigo ? (
          <Button icon="share-variant" mode="contained-tonal" onPress={compartir}>
            Compartir
          </Button>
        ) : null}
        <Button icon="refresh" onPress={() => (codigo ? setConfirmar(true) : crear())} loading={generando} disabled={generando}>
          {codigo ? "Generar otro" : "Generar código"}
        </Button>
      </View>
      <Portal>
        <Dialog visible={confirmar} onDismiss={() => setConfirmar(false)}>
          <Dialog.Title>¿Generar otro código?</Dialog.Title>
          <Dialog.Content>
            <Text>El código actual deja de servir. Las cuentas ya creadas no cambian.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmar(false)}>Cancelar</Button>
            <Button onPress={crear}>Generar</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}
