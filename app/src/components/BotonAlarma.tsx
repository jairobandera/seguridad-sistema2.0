import { Pressable, StyleSheet, View } from "react-native";
import { ActivityIndicator, Icon, Text } from "react-native-paper";
import * as Haptics from "expo-haptics";
import { colores } from "@/tema";

interface Props {
  armada: boolean;
  cargando: boolean;
  alCambiar: (armar: boolean) => void;
}

/** Botón grande: hay que mantenerlo apretado para evitar toques sin querer. */
export function BotonAlarma({ armada, cargando, alCambiar }: Props) {
  const color = armada ? colores.armada : colores.apagado;
  return (
    <View style={{ alignItems: "center" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={armada ? "Desarmar alarma" : "Armar alarma"}
        disabled={cargando}
        delayLongPress={700}
        onPressIn={() => Haptics.selectionAsync()}
        onLongPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          alCambiar(!armada);
        }}
        style={({ pressed }) => [
          estilos.circulo,
          armada
            ? { borderColor: color, backgroundColor: pressed ? "#0B3D91" : color, shadowColor: color }
            : { borderColor: color, backgroundColor: color + (pressed ? "33" : "14"), shadowColor: "#000" },
        ]}
      >
        {cargando ? <ActivityIndicator size="large" /> : <Icon source={armada ? "shield-lock" : "shield-off-outline"} size={72} color={armada ? "#FFFFFF" : color} />}
        <Text variant="titleLarge" style={{ color: armada ? "#FFFFFF" : color, fontWeight: "800", marginTop: 4, letterSpacing: 1 }}>
          {armada ? "ARMADA" : "DESARMADA"}
        </Text>
      </Pressable>
      <Text variant="bodyMedium" style={{ marginTop: 10, opacity: 0.7 }}>
        Mantené apretado para {armada ? "desarmar" : "armar"}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  circulo: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 6,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
});
