import { Image, StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { NOMBRE_APP } from "@/config";
import { marca } from "@/tema";

const escudo = require("../../assets/escudo.png");

/**
 * Logo de GuardiEl: el escudo sobre una placa blanca redondeada (como el ícono de la app; así se ve igual
 * en modo claro y oscuro) y el nombre con "El" en el azul de la marca.
 */
export function Marca({ tamano = 96, conNombre = true, lema }: { tamano?: number; conNombre?: boolean; lema?: string }) {
  const tema = useTheme();
  return (
    <View style={estilos.caja}>
      <View style={[estilos.placa, { width: tamano, height: tamano, borderRadius: tamano * 0.26 }]}>
        <Image source={escudo} style={{ width: tamano * 0.82, height: tamano * 0.82 }} resizeMode="contain" accessibilityLabel={NOMBRE_APP} />
      </View>
      {conNombre ? (
        <Text variant="headlineMedium" style={[estilos.nombre, { color: tema.dark ? "#E3E9F2" : marca.pizarra }]}>
          Guardi<Text style={[estilos.nombre, { color: tema.dark ? tema.colors.primary : marca.azul }]}>El</Text>
        </Text>
      ) : null}
      {lema ? (
        <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant, textAlign: "center", marginTop: 4 }}>
          {lema}
        </Text>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: { alignItems: "center" },
  placa: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0B3D91",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  nombre: { fontWeight: "800", letterSpacing: 0.5, marginTop: 14 },
});
