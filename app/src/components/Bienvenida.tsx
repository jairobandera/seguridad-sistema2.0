import { useEffect, useState } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { StatusBar } from "expo-status-bar";
import { marca } from "@/tema";

/** Fondo de la bienvenida: el mismo azul del splash nativo (app.config.ts), así la transición no se nota. */
export const FONDO_BIENVENIDA = marca.azulOscuro;
/** Mismo ancho (dp) que `imageWidth` del splash nativo: la palabra queda exactamente donde estaba. */
const ANCHO_PALABRA = 180;

/** Pantalla de bienvenida mientras la app arranca: sigue al splash nativo y suma el lema. */
export function Bienvenida() {
  const [aparecer] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(aparecer, {
      toValue: 1,
      duration: 700,
      delay: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [aparecer]);

  const subir = aparecer.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  return (
    <View style={estilos.fondo}>
      <StatusBar style="light" />
      <Image source={require("../../assets/splash-guardiel.png")} style={estilos.palabra} resizeMode="contain" />
      <Animated.View style={[estilos.debajo, { opacity: aparecer, transform: [{ translateY: subir }] }]}>
        <View style={estilos.linea} />
        <Text style={estilos.lema}>Tu casa protegida</Text>
      </Animated.View>
    </View>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: FONDO_BIENVENIDA, alignItems: "center", justifyContent: "center" },
  palabra: { width: ANCHO_PALABRA, height: ANCHO_PALABRA },
  // Debajo de la palabra sin mover el centro (la palabra ocupa ~34dp de alto en el medio de la imagen)
  debajo: { position: "absolute", top: "50%", marginTop: 32, alignItems: "center" },
  linea: { width: 36, height: 3, borderRadius: 2, backgroundColor: marca.celeste, marginBottom: 12 },
  lema: { fontSize: 13, color: "rgba(255,255,255,0.8)", letterSpacing: 3, textTransform: "uppercase" },
});
