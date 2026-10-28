import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Appbar, Button, Card, Dialog, HelperText, List, Portal, Snackbar, Text, useTheme } from "react-native-paper";
import { Campo } from "@/components/Campo";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { placas } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import type { DispositivoCasa } from "@/api/tipos";
import { useCasas } from "@/hooks/useCasas";
import { Cargando, ErrorReintentar, Vacio } from "@/components/Estados";
import { nombreDispositivo } from "@/components/DispositivoFila";
import { barrasSenal, colorBateria, haceCuanto, iconoBateria } from "@/utils/formato";
import { colores } from "@/tema";

type Dialogo = "nombre" | "reiniciar" | "no_conectado" | "reset" | "sin_respuesta";

export default function Dispositivos() {
  const tema = useTheme();
  const qc = useQueryClient();
  const { actual, isLoading, error, refetch, isRefetching } = useCasas();
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [elegido, setElegido] = useState<DispositivoCasa | null>(null);
  const [texto, setTexto] = useState("");
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  if (isLoading) return <Cargando />;
  if (error) return <ErrorReintentar error={error} alReintentar={refetch} />;
  if (!actual) return <Vacio icono="home-alert-outline" titulo="No tenés una casa asignada" />;

  const dispositivos = actual.estado?.dispositivos ?? [];
  const esDueno = actual.rolCasa === "DUENO";

  const abrir = (d: DispositivoCasa, tipo: Dialogo) => {
    setElegido(d);
    setTexto(tipo === "nombre" ? (d.nombre ?? "") : "");
    setErrorNombre(null);
    setDialogo(tipo);
  };
  const cerrar = () => setDialogo(null);
  const refrescar = () => qc.invalidateQueries({ queryKey: ["casas"] });

  const cambiarNombre = async () => {
    if (!elegido) return;
    setTrabajando(elegido.id);
    try {
      await placas.renombrar(elegido.id, texto.trim());
      cerrar();
      setAviso("Nombre actualizado");
      refrescar();
    } catch (e) {
      setErrorNombre(mensajeDeError(e));
    } finally {
      setTrabajando(null);
    }
  };

  const cambiarWifi = async (d: DispositivoCasa) => {
    setTrabajando(d.id);
    try {
      // Si el dispositivo está conectado, se le pide que abra el Bluetooth
      const r = await placas.modoConfig(d.id);
      router.push({
        pathname: "/cliente/asistente",
        params: { casaId: actual.id, modo: "wifi", dispositivoId: d.id, deviceId: d.deviceId, bleAbierto: r.status === 200 ? "1" : "0" },
      });
    } catch (e) {
      setAviso(mensajeDeError(e));
    } finally {
      setTrabajando(null);
    }
  };

  const reiniciar = async () => {
    if (!elegido) return;
    setTrabajando(elegido.id);
    try {
      const r = await placas.reiniciar(elegido.id);
      if (r.status === 202) {
        setMensaje(r.datos.mensaje ?? "El dispositivo no está conectado. Desenchufalo y volvé a enchufarlo.");
        setDialogo("no_conectado");
      } else {
        cerrar();
        setAviso(`${nombreDispositivo(elegido)} se está reiniciando. Vuelve en unos 20 segundos.`);
      }
    } catch (e) {
      cerrar();
      setAviso(mensajeDeError(e));
    } finally {
      setTrabajando(null);
    }
  };

  const restablecer = async () => {
    if (!elegido) return;
    setTrabajando(elegido.id);
    try {
      const r = await placas.reset(elegido.id);
      if (r.status === 202) {
        setDialogo("sin_respuesta");
      } else {
        cerrar();
        setAviso(`${nombreDispositivo(elegido)} se restableció y quedó desvinculado`);
        refrescar();
      }
    } catch (e) {
      setAviso(mensajeDeError(e));
    } finally {
      setTrabajando(null);
      setTexto("");
    }
  };

  // El dispositivo no está en internet: se lo restablece de cerca, por Bluetooth (ver asistente, modo "reset")
  const restablecerPorBluetooth = () => {
    if (!elegido) return;
    const d = elegido;
    cerrar();
    router.push({
      pathname: "/cliente/asistente",
      params: { casaId: actual.id, modo: "reset", dispositivoId: d.id, deviceId: d.deviceId },
    });
  };

  const desvincular = async () => {
    if (!elegido) return;
    setTrabajando(elegido.id);
    try {
      await placas.desvincular(elegido.id);
      cerrar();
      setAviso(`${nombreDispositivo(elegido)} quedó desvinculado`);
      refrescar();
    } catch (e) {
      setAviso(mensajeDeError(e));
    } finally {
      setTrabajando(null);
    }
  };

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Dispositivos" />
      </Appbar.Header>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}>
        {dispositivos.length === 0 ? (
          <Card>
            <Card.Content>
              <Text variant="titleMedium">No hay ningún dispositivo vinculado</Text>
              <Text variant="bodyMedium" style={{ marginTop: 8, color: tema.colors.onSurfaceVariant }}>
                {esDueno
                  ? "Necesitás el dispositivo enchufado cerca tuyo, el Bluetooth del celular prendido y la clave de tu WiFi (2,4 GHz)."
                  : "Solo el dueño de la casa puede agregar dispositivos."}
              </Text>
            </Card.Content>
          </Card>
        ) : null}

        {dispositivos.map((d) => (
          <Card key={d.id}>
            <Card.Content>
              <View style={estilos.fila}>
                <View style={[estilos.punto, { backgroundColor: d.online ? colores.ok : colores.peligro }]} />
                <Text variant="titleLarge" style={{ flex: 1 }}>
                  {nombreDispositivo(d)}
                </Text>
              </View>
              <Text variant="bodyMedium" style={{ marginTop: 4, color: tema.colors.onSurfaceVariant }}>
                {d.online
                  ? "Conectado"
                  : "Sin conexión. Revisá que esté enchufado o con batería cargada. Si se cortó internet, vuelve solo. Si cambiaste el WiFi o su clave, tocá “Cambiar WiFi” estando cerca: a los 5 minutos sin WiFi el dispositivo abre su Bluetooth solo."}
              </Text>
            </Card.Content>
            <List.Item
              title={d.puertaAbierta == null ? "Sin datos" : d.puertaAbierta ? "Abierta" : "Cerrada"}
              left={(p) => <List.Icon {...p} icon={d.puertaAbierta ? "door-open" : "door-closed"} color={d.puertaAbierta ? colores.aviso : undefined} />}
            />
            <List.Item title="Red WiFi" description={d.ssid || "—"} left={(p) => <List.Icon {...p} icon={`wifi-strength-${barrasSenal(d.rssi)}`} />} />
            {d.bateria != null && d.online ? (
              <List.Item
                title="Batería"
                description={`${d.bateria} %`}
                left={(p) => <List.Icon {...p} icon={iconoBateria(d.bateria!)} color={colorBateria(d.bateria!)} />}
              />
            ) : d.bateria != null ? (
              // Desconectado: el % es de antes de cortarse, no el de ahora
              <List.Item
                title="Batería"
                description={`Último dato: ${d.bateria} % (puede haberse quedado sin batería)`}
                left={(p) => <List.Icon {...p} icon="battery-unknown" color={tema.colors.onSurfaceVariant} />}
              />
            ) : d.online ? (
              // Sin batería conectada al divisor: se alimenta solo por el USB
              <List.Item title="Alimentación" description="Enchufado a la corriente (sin batería)" left={(p) => <List.Icon {...p} icon="power-plug" />} />
            ) : null}
            <List.Item title="Última conexión" description={haceCuanto(d.ultimaConexion)} left={(p) => <List.Icon {...p} icon="clock-outline" />} />
            <List.Item title="Identificador" description={`${d.deviceId} · v${d.firmwareVersion ?? "?"}`} left={(p) => <List.Icon {...p} icon="chip" />} />
            {esDueno ? (
              <View style={estilos.acciones}>
                <Button mode="contained-tonal" icon="pencil" onPress={() => abrir(d, "nombre")} disabled={trabajando !== null}>
                  Nombre
                </Button>
                <Button
                  // Sin conexión, cambiar el WiFi por Bluetooth es lo que lo arregla
                  mode={d.online ? "contained-tonal" : "contained"}
                  icon="wifi-cog"
                  onPress={() => cambiarWifi(d)}
                  loading={trabajando === d.id && !dialogo}
                  disabled={trabajando !== null}
                >
                  Cambiar WiFi
                </Button>
                <Button mode="contained-tonal" icon="restart" onPress={() => abrir(d, "reiniciar")} disabled={trabajando !== null}>
                  Reiniciar
                </Button>
                <Button
                  mode="outlined"
                  icon="restore-alert"
                  textColor={colores.peligro}
                  style={{ borderColor: colores.peligro }}
                  onPress={() => abrir(d, "reset")}
                  disabled={trabajando !== null}
                >
                  Restablecer
                </Button>
              </View>
            ) : null}
          </Card>
        ))}

        {esDueno ? (
          <Button mode="contained" icon="plus" onPress={() => router.push({ pathname: "/cliente/asistente", params: { casaId: actual.id, modo: "nueva" } })}>
            {dispositivos.length ? "Agregar otro dispositivo" : "Agregar dispositivo"}
          </Button>
        ) : null}
      </ScrollView>

      <Portal>
        <Dialog visible={dialogo === "nombre"} onDismiss={cerrar}>
          <Dialog.Title>Nombre del dispositivo</Dialog.Title>
          <Dialog.Content>
            <Campo label="Por ejemplo: Puerta trasera" value={texto} onChangeText={setTexto} mode="outlined" maxLength={40} />
            <HelperText type="error" visible={!!errorNombre}>
              {errorNombre}
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={cerrar}>Cancelar</Button>
            <Button onPress={cambiarNombre} disabled={!texto.trim() || trabajando !== null} loading={trabajando !== null}>
              Guardar
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={dialogo === "reiniciar"} onDismiss={cerrar}>
          <Dialog.Title>Reiniciar {elegido ? nombreDispositivo(elegido) : ""}</Dialog.Title>
          <Dialog.Content>
            <Text>
              Sirve si quedó trabado o con la conexión inestable. No se borra nada: tarda unos 20 segundos en volver y mientras tanto no
              avisa si se abre.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={cerrar}>Cancelar</Button>
            <Button onPress={reiniciar} loading={trabajando !== null} disabled={trabajando !== null}>
              Reiniciar
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={dialogo === "no_conectado"} onDismiss={cerrar}>
          <Dialog.Title>No está conectado</Dialog.Title>
          <Dialog.Content>
            <Text>{mensaje}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={cerrar}>Entendido</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={dialogo === "reset"} onDismiss={cerrar}>
          <Dialog.Title>Restablecer {elegido ? nombreDispositivo(elegido) : ""}</Dialog.Title>
          <Dialog.Content>
            <Text>El dispositivo borra su WiFi, se desvincula de tu casa y deja de avisar. Para volver a usarlo vas a tener que configurarlo de nuevo.</Text>
            <Campo
              label='Escribí "RESTABLECER" para confirmar'
              value={texto}
              onChangeText={setTexto}
              autoCapitalize="characters"
              style={{ marginTop: 16 }}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={cerrar}>Cancelar</Button>
            <Button
              textColor={colores.peligro}
              disabled={texto.trim().toUpperCase() !== "RESTABLECER" || trabajando !== null}
              loading={trabajando !== null}
              onPress={restablecer}
            >
              Restablecer
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={dialogo === "sin_respuesta"} onDismiss={cerrar}>
          <Dialog.Title>El dispositivo no respondió</Dialog.Title>
          <Dialog.Content>
            <Text>
              Puede estar sin conexión. Si estás cerca del dispositivo, restablecelo por Bluetooth. Si no, podés desvincularlo igual y, cuando lo tengas a mano, mantener apretado su botón BOOT 15 segundos para dejarlo de fábrica.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={cerrar}>Cancelar</Button>
            <Button textColor={colores.peligro} onPress={desvincular} loading={trabajando !== null}>
              Desvincular igual
            </Button>
            <Button mode="contained" onPress={restablecerPorBluetooth} disabled={trabajando !== null}>
              Por Bluetooth
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
  acciones: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
});
