import { type ComponentRef, useEffect, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text as TextoNativo, View } from "react-native";
import { Appbar, Text } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import { abrirMonitor } from "@/realtime/socket";
import { colores } from "@/tema";

const MAX_LINEAS = 1000;
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
// Códigos de color de la terminal que a veces mandan los mensajes internos del ESP32
const ANSI = /\x1b\[[0-9;]*m/g;

function colorLinea(l: string): string {
  if (/^E \(\d+\)/.test(l) || l.includes("error")) return "#FF8A80";
  if (/^W \(\d+\)/.test(l)) return "#FFD180";
  if (l.startsWith("[bateria]")) return "#80D8FF";
  if (l.startsWith("=====")) return "#B9F6CA";
  return "#E0E0E0";
}

/** Monitor serial de un dispositivo por internet (lo mismo que el Monitor Serie del Arduino IDE). */
export default function Monitor() {
  const { deviceId, nombre } = useLocalSearchParams<{ deviceId: string; nombre?: string }>();
  const [lineas, setLineas] = useState<string[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [siguiendo, setSiguiendo] = useState(true);
  const resto = useRef(""); // línea que todavía no terminó
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    if (!deviceId) return;
    return abrirMonitor(
      deviceId,
      (texto) => {
        const partes = (resto.current + texto.replace(ANSI, "").replace(/\r/g, "")).split("\n");
        resto.current = partes.pop() ?? "";
        if (partes.length) setLineas((l) => [...l, ...partes].slice(-MAX_LINEAS));
      },
      setOnline,
    );
  }, [deviceId]);

  const estado = online == null ? "Conectando…" : online ? "Conectado" : "Sin conexión: esperando que vuelva";

  return (
    <View style={{ flex: 1, backgroundColor: "#121417" }}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={nombre || deviceId} subtitle={estado} />
        <Appbar.Action
          icon={siguiendo ? "pause" : "play"}
          accessibilityLabel={siguiendo ? "Pausar" : "Seguir"}
          onPress={() => setSiguiendo((s) => !s)}
        />
        <Appbar.Action icon="delete-sweep" accessibilityLabel="Limpiar" onPress={() => setLineas([])} />
      </Appbar.Header>
      <View style={[estilos.barra, { backgroundColor: online ? colores.ok : online === false ? colores.peligro : "#546E7A" }]} />
      <ScrollView
        ref={scroll}
        contentContainerStyle={estilos.contenido}
        onContentSizeChange={() => siguiendo && scroll.current?.scrollToEnd({ animated: false })}
      >
        {lineas.length === 0 ? (
          <Text style={estilos.vacio}>
            {online === false
              ? "El dispositivo está desconectado. Cuando vuelva a conectarse, sus mensajes aparecen acá."
              : "Esperando mensajes del dispositivo… (los primeros tardan unos segundos)"}
          </Text>
        ) : (
          lineas.map((l, i) => (
            <TextoNativo key={i} selectable style={[estilos.linea, { color: colorLinea(l) }]}>
              {l || " "}
            </TextoNativo>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  barra: { height: 3 },
  contenido: { padding: 12 },
  linea: { fontFamily: MONO, fontSize: 12, lineHeight: 17 },
  vacio: { color: "#9E9E9E", fontFamily: MONO, fontSize: 13 },
});
