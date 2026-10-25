import { Share } from "react-native";
import { Button, Dialog, Portal, Text } from "react-native-paper";

/** Muestra una sola vez la contraseña temporal para pasársela al usuario. */
export function ClaveTemporal({ clave, email, alCerrar }: { clave: string | null; email: string; alCerrar: () => void }) {
  return (
    <Portal>
      <Dialog visible={!!clave} onDismiss={alCerrar} dismissable={false}>
        <Dialog.Title>Contraseña temporal</Dialog.Title>
        <Dialog.Content>
          <Text>Pasásela al usuario. Se la va a pedir cambiar la primera vez que entre. No se vuelve a mostrar.</Text>
          <Text variant="headlineSmall" selectable style={{ marginTop: 16, fontWeight: "700", letterSpacing: 2, textAlign: "center" }}>
            {clave}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => Share.share({ message: `Tu acceso a GuardiEl:\nUsuario: ${email}\nContraseña temporal: ${clave}` })}>
            Compartir
          </Button>
          <Button onPress={alCerrar}>Listo</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
