import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Appbar, Button, Card, Dialog, List, Portal, Snackbar, Text, TextInput, useTheme } from "react-native-paper";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { placas } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import { useCasas } from "@/hooks/useCasas";
import { Cargando, ErrorReintentar, Vacio } from "@/components/Estados";
import { barrasSenal, haceCuanto } from "@/utils/formato";
import { colores } from "@/tema";

export default function Placa() {
  const tema = useTheme();
  const qc = useQueryClient();
  const { actual, isLoading, error, refetch, isRefetching } = useCasas();
  const [dialogo, setDialogo] = useState<"reset" | "sin_respuesta" | null>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  if (isLoading) return <Cargando />;
  if (error) return <ErrorReintentar error={error} alReintentar={refetch} />;
  if (!actual) return <Vacio icono="home-alert-outline" titulo="No tenés una casa asignada" />;

  const disp = actual.estado?.dispositivo ?? null;
  const esDueno = actual.rolCasa === "DUENO";
  const online = !!actual.estado?.online;

  const cambiarWifi = async () => {
    if (!disp) return;
    setTrabajando(true);
    try {
      // Si la placa está conectada, se le pide que abra el Bluetooth
      const r = await placas.modoConfig(disp.id);
      router.push({
        pathname: "/cliente/asistente",
        params: { casaId: actual.id, modo: "wifi", dispositivoId: disp.id, deviceId: disp.deviceId, bleAbierto: r.status === 200 ? "1" : "0" },
      });
    } catch (e) {
      setAviso(mensajeDeError(e));
    } finally {
      setTrabajando(false);
    }
  };

  const restablecer = async () => {
    if (!disp) return;
    setTrabajando(true);
    try {
      const r = await placas.reset(disp.id);
      if (r.status === 202) {
        setDialogo("sin_respuesta");
      } else {
        setDialogo(null);
        setAviso("La placa se restableció y quedó desvinculada");
        qc.invalidateQueries({ queryKey: ["casas"] });
      }
    } catch (e) {
      setAviso(mensajeDeError(e));
    } finally {
      setTrabajando(false);
      setConfirmacion("");
    }
  };

  const desvincular = async () => {
    if (!disp) return;
    setTrabajando(true);
    try {
      await placas.desvincular(disp.id);
      setDialogo(null);
      setAviso("Placa desvinculada");
      qc.invalidateQueries({ queryKey: ["casas"] });
    } catch (e) {
      setAviso(mensajeDeError(e));
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Placa de seguridad" />
      </Appbar.Header>
      <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}>
        {!disp ? (
          <Card>
            <Card.Content>
              <Text variant="titleMedium">No hay ninguna placa vinculada</Text>
              <Text variant="bodyMedium" style={{ marginTop: 8, color: tema.colors.onSurfaceVariant }}>
                {esDueno
                  ? "Necesitás la placa enchufada cerca tuyo, el Bluetooth del celular prendido y la clave de tu WiFi (2,4 GHz)."
                  : "Solo el dueño de la casa puede agregar la placa."}
              </Text>
            </Card.Content>
            {esDueno ? (
              <Card.Actions>
                <Button mode="contained" icon="plus" onPress={() => router.push({ pathname: "/cliente/asistente", params: { casaId: actual.id, modo: "nueva" } })}>
                  Agregar placa
                </Button>
              </Card.Actions>
            ) : null}
          </Card>
        ) : (
          <>
            <Card>
              <Card.Content>
                <View style={estilos.fila}>
                  <View style={[estilos.punto, { backgroundColor: online ? colores.ok : colores.peligro }]} />
                  <Text variant="titleLarge">{online ? "Conectada" : "Sin conexión"}</Text>
                </View>
                {!online ? (
                  <Text variant="bodyMedium" style={{ marginTop: 8, color: tema.colors.onSurfaceVariant }}>
                    Revisá que esté enchufada y que el WiFi funcione. Si cambiaste el router, usá “Cambiar WiFi”.
                  </Text>
                ) : null}
              </Card.Content>
              <List.Item title="Red WiFi" description={actual.estado?.ssid || "—"} left={(p) => <List.Icon {...p} icon={`wifi-strength-${barrasSenal(actual.estado?.rssi)}`} />} />
              <List.Item title="Última conexión" description={haceCuanto(disp.ultimaConexion)} left={(p) => <List.Icon {...p} icon="clock-outline" />} />
              <List.Item title="Identificador" description={`${disp.deviceId} · v${disp.firmwareVersion ?? "?"}`} left={(p) => <List.Icon {...p} icon="chip" />} />
            </Card>

            {esDueno ? (
              <View style={{ gap: 12, marginTop: 16 }}>
                <Button mode="contained" icon="wifi-cog" onPress={cambiarWifi} loading={trabajando} disabled={trabajando}>
                  Cambiar WiFi
                </Button>
                <Button mode="outlined" icon="restore-alert" textColor={colores.peligro} onPress={() => setDialogo("reset")} disabled={trabajando}>
                  Restablecer y desvincular
                </Button>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Portal>
        <Dialog visible={dialogo === "reset"} onDismiss={() => setDialogo(null)}>
          <Dialog.Title>Restablecer la placa</Dialog.Title>
          <Dialog.Content>
            <Text>La placa borra su WiFi, se desvincula de tu casa y deja de avisar. Para volver a usarla vas a tener que configurarla de nuevo.</Text>
            <TextInput
              label='Escribí "RESTABLECER" para confirmar'
              value={confirmacion}
              onChangeText={setConfirmacion}
              autoCapitalize="characters"
              style={{ marginTop: 16 }}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogo(null)}>Cancelar</Button>
            <Button textColor={colores.peligro} disabled={confirmacion.trim().toUpperCase() !== "RESTABLECER" || trabajando} loading={trabajando} onPress={restablecer}>
              Restablecer
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={dialogo === "sin_respuesta"} onDismiss={() => setDialogo(null)}>
          <Dialog.Title>La placa no respondió</Dialog.Title>
          <Dialog.Content>
            <Text>
              Puede estar sin conexión. Podés desvincularla igual y, cuando la tengas a mano, mantener apretado su botón BOOT 15 segundos para dejarla de fábrica.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogo(null)}>Cancelar</Button>
            <Button textColor={colores.peligro} onPress={desvincular} loading={trabajando}>
              Desvincular igual
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar visible={!!aviso} onDismiss={() => setAviso(null)} duration={4000}>
        {aviso}
      </Snackbar>
    </>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: "row", alignItems: "center", gap: 10 },
  punto: { width: 14, height: 14, borderRadius: 7 },
});
