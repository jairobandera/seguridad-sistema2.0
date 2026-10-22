import { StyleSheet, View } from "react-native";
import { Icon, Text, useTheme } from "react-native-paper";

/** Indicador de estado (ícono + título + valor) con color. */
export function Indicador({ icono, titulo, valor, color }: { icono: string; titulo: string; valor: string; color: string }) {
  const tema = useTheme();
  return (
    <View style={[estilos.caja, { backgroundColor: color + "14", borderColor: color + "55" }]}>
      <Icon source={icono} size={30} color={color} />
      <Text variant="labelMedium" style={{ color: tema.colors.onSurfaceVariant, marginTop: 6 }}>
        {titulo}
      </Text>
      <Text variant="titleMedium" style={{ color, fontWeight: "700", textAlign: "center" }}>
        {valor}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: { flex: 1, alignItems: "center", padding: 12, borderRadius: 16, borderWidth: 1 },
});
