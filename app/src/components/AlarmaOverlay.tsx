import { useEffect, useRef } from "react";
import { Linking, Modal, StyleSheet, Vibration, View } from "react-native";
import { Button, Icon, Text } from "react-native-paper";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { router } from "expo-router";
import { useAlarma } from "@/store/alarma";
import { useSesion } from "@/store/sesion";
import { casas } from "@/api/endpoints";
import { direccion, fechaCorta } from "@/utils/formato";

const sirena = require("../../assets/sounds/alarma.wav");

/** Pantalla roja con sirena cuando se abre la puerta con la alarma armada (app abierta). */
export function AlarmaOverlay() {
  const evento = useAlarma((s) => s.evento);
  const cerrar = useAlarma((s) => s.cerrar);
  const usuario = useSesion((s) => s.usuario);
  const player = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    if (!evento) return;
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    if (!player.current) player.current = createAudioPlayer(sirena);
    const p = player.current;
    p.loop = true;
    p.seekTo(0);
    p.play();
    Vibration.vibrate([0, 700, 400], true);
    return () => {
      p.pause();
      Vibration.cancel();
    };
  }, [evento]);

  // Libera el reproductor al desmontar
  useEffect(() => () => player.current?.remove(), []);

  if (!evento) return null;
  const esGuardia = usuario?.rol === "GUARDIA";
  const esMiembro = !!usuario?.casas.some((c) => c.id === evento.casa?.id);

  const desarmar = async () => {
    if (evento.casa) await casas.alarma(evento.casa.id, false).catch(() => undefined);
    cerrar();
  };

  return (
    <Modal visible animationType="fade" onRequestClose={cerrar} statusBarTranslucent>
      <View style={estilos.fondo}>
        <Icon source="alarm-light" size={96} color="#FFFFFF" />
        <Text variant="displaySmall" style={estilos.titulo}>
          ¡PUERTA ABIERTA!
        </Text>
        <Text variant="titleLarge" style={estilos.texto}>
          {direccion(evento.casa)}
        </Text>
        <Text variant="titleMedium" style={estilos.texto}>
          La alarma estaba armada · {fechaCorta(evento.fechaHora)}
        </Text>

        <View style={estilos.botones}>
          {esMiembro ? (
            <Button mode="contained" buttonColor="#FFFFFF" textColor="#B71C1C" icon="shield-off-outline" onPress={desarmar} contentStyle={estilos.boton}>
              Fui yo, desarmar
            </Button>
          ) : null}
          {esGuardia ? (
            <Button
              mode="contained"
              buttonColor="#FFFFFF"
              textColor="#B71C1C"
              icon="shield-account"
              contentStyle={estilos.boton}
              onPress={() => {
                cerrar();
                router.navigate("/guardia/alertas");
              }}
            >
              Ver alerta
            </Button>
          ) : null}
          {esMiembro ? (
            <Button mode="outlined" textColor="#FFFFFF" style={{ borderColor: "#FFFFFF" }} icon="phone" onPress={() => Linking.openURL("tel:911")} contentStyle={estilos.boton}>
              Llamar al 911
            </Button>
          ) : null}
          <Button mode="text" textColor="#FFFFFF" onPress={cerrar} contentStyle={estilos.boton}>
            Silenciar
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "#B71C1C", alignItems: "center", justifyContent: "center", padding: 24 },
  titulo: { color: "#FFFFFF", fontWeight: "800", marginTop: 16, textAlign: "center" },
  texto: { color: "#FFFFFF", marginTop: 8, textAlign: "center" },
  botones: { marginTop: 40, alignSelf: "stretch", gap: 12 },
  boton: { paddingVertical: 8 },
});
