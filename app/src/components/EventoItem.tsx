import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Icon, Text, useTheme } from "react-native-paper";
import type { Evento } from "@/api/tipos";
import { colorSeveridad, direccion, fechaCorta, textoEstadoAtencion, textoEvento } from "@/utils/formato";

interface Props {
  evento: Evento;
  mostrarCasa?: boolean;
}

function EventoItemBase({ evento, mostrarCasa }: Props) {
  const tema = useTheme();
  const { titulo, icono } = textoEvento(evento);
  // Colores en hex: se les agrega transparencia para el fondo del ícono
  const color = colorSeveridad[evento.severidad];
  return (
    <View style={estilos.fila}>
      <View style={[estilos.icono, { backgroundColor: color + "22" }]}>
        <Icon source={icono} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyLarge" style={{ color: evento.severidad === "CRITICA" ? color : tema.colors.onSurface, fontWeight: evento.severidad === "INFO" ? "400" : "600" }}>
          {titulo}
        </Text>
        <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
          {fechaCorta(evento.fechaHora)}
          {mostrarCasa && evento.casa ? ` · ${direccion(evento.casa)}` : ""}
          {evento.estado ? ` · ${textoEstadoAtencion[evento.estado.estado]}${evento.estado.guardia ? ` (${evento.estado.guardia.nombre})` : ""}` : ""}
        </Text>
      </View>
    </View>
  );
}

export const EventoItem = memo(EventoItemBase);

const estilos = StyleSheet.create({
  fila: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 16, gap: 12 },
  icono: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
