import { ScrollView } from "react-native";
import { Appbar, Divider, List } from "react-native-paper";
import { router } from "expo-router";

export default function Mas() {
  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Más opciones" />
      </Appbar.Header>
      <ScrollView>
        <List.Item
          title="Contactos de emergencia"
          description="Reciben un SMS si se abre la puerta con la alarma armada"
          left={(p) => <List.Icon {...p} icon="account-alert" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push("/cliente/contactos")}
        />
        <Divider />
        <List.Item
          title="Familia"
          description="Personas que también ven y manejan la alarma"
          left={(p) => <List.Icon {...p} icon="account-group" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push("/cliente/familia")}
        />
        <Divider />
        <List.Item
          title="Mi cuenta"
          description="Datos, contraseña y notificaciones"
          left={(p) => <List.Icon {...p} icon="account-circle" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push("/cliente/perfil")}
        />
      </ScrollView>
    </>
  );
}
