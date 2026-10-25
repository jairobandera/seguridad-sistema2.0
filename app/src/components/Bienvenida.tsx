import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { StatusBar } from "expo-status-bar";
import { marca } from "@/tema";

/** Fondo de la bienvenida: el mismo azul del splash nativo (app.config.ts), así la transición no se nota. */
export const FONDO_BIENVENIDA = marca.azulOscuro;

/** Pantalla de bienvenida mientras la app arranca: la palabra GuardiEl (nítida en cualquier pantalla). */
export function Bienvenida() {
  const [aparecer] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(aparecer, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [aparecer]);

  const escala = aparecer.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <Animated.View style={estilos.fondo}>
      <StatusBar style="light" />
      <Animated.View style={{ opacity: aparecer, transform: [{ scale: escala }], alignItems: "center" }}>
        <Text style={estilos.nombre}>
          Guardi<Text style={[estilos.nombre, { color: marca.celeste }]}>El</Text>
        </Text>
        <Text style={estilos.lema}>Tu casa protegida</Text>
      </Animated.View>
    </Animated.View>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: FONDO_BIENVENIDA, alignItems: "center", justifyContent: "center" },
  nombre: { fontSize: 46, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.5 },
  lema: { marginTop: 8, fontSize: 15, color: "rgba(255,255,255,0.75)", letterSpacing: 2, textTransform: "uppercase" },
});
