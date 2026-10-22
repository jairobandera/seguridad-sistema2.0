import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Icon, Text, useTheme } from "react-native-paper";
import { mensajeDeError } from "@/api/cliente";

export function Cargando({ texto }: { texto?: string }) {
  return (
    <View style={estilos.centro}>
      <ActivityIndicator size="large" />
      {texto ? <Text style={estilos.texto}>{texto}</Text> : null}
    </View>
  );
}

export function ErrorReintentar({ error, alReintentar }: { error: unknown; alReintentar: () => void }) {
  const tema = useTheme();
  return (
    <View style={estilos.centro}>
      <Icon source="cloud-off-outline" size={48} color={tema.colors.error} />
      <Text variant="titleMedium" style={estilos.texto}>
        {mensajeDeError(error)}
      </Text>
      <Button mode="contained" onPress={alReintentar} style={{ marginTop: 16 }}>
        Reintentar
      </Button>
    </View>
  );
}

export function Vacio({ icono, titulo, detalle }: { icono: string; titulo: string; detalle?: string }) {
  const tema = useTheme();
  return (
    <View style={estilos.centro}>
      <Icon source={icono} size={48} color={tema.colors.outline} />
      <Text variant="titleMedium" style={estilos.texto}>
        {titulo}
      </Text>
      {detalle ? (
        <Text variant="bodyMedium" style={[estilos.texto, { color: tema.colors.onSurfaceVariant }]}>
          {detalle}
        </Text>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  texto: { marginTop: 12, textAlign: "center" },
});
