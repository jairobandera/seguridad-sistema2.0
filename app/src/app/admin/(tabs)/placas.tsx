import { useState } from "react";
import { FlatList, RefreshControl } from "react-native";
import { Appbar, Button, Dialog, IconButton, List, Portal, SegmentedButtons, Snackbar, Text } from "react-native-paper";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { admin, placas } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import type { DispositivoAdmin } from "@/api/tipos";
import { Cargando, ErrorReintentar, Vacio } from "@/components/Estados";
import { direccion, haceCuanto } from "@/utils/formato";

export default function PlacasAdmin() {
  const qc = useQueryClient();
  const [estado, setEstado] = useState<string>("");
  const q = useQuery({ queryKey: ["admin", "dispositivos", estado], queryFn: () => admin.dispositivos(estado || undefined) });
  const [elegida, setElegida] = useState<DispositivoAdmin | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const accion = async (tipo: "reset" | "desvincular") => {
    if (!elegida) return;
    setTrabajando(true);
    try {
      if (tipo === "reset") {
        const r = await placas.reset(elegida.id);
        setAviso(r.status === 202 ? r.datos.mensaje ?? "El dispositivo no respondió" : "Dispositivo restablecido y desvinculado");
      } else {
        await placas.desvincular(elegida.id);
        setAviso("Dispositivo desvinculado");
      }
      setElegida(null);
      qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      setAviso(mensajeDeError(e));
    } finally {
      setTrabajando(false);
    }
  };

  // Monitor serial por internet: lo mismo que el Monitor Serie del Arduino IDE, sin cable
  const verMonitor = (d: DispositivoAdmin) =>
    router.push({ pathname: "/admin/monitor/[deviceId]", params: { deviceId: d.deviceId, nombre: d.nombre ?? d.deviceId } });

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Dispositivos" />
      </Appbar.Header>
      <SegmentedButtons
        style={{ marginHorizontal: 16, marginBottom: 8 }}
        value={estado}
        onValueChange={setEstado}
        buttons={[
          { value: "", label: "Todas" },
          { value: "offline", label: "Offline" },
          { value: "sin_vincular", label: "Sin casa" },
        ]}
      />
      {q.isLoading ? (
        <Cargando />
      ) : q.error ? (
        <ErrorReintentar error={q.error} alReintentar={q.refetch} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(d) => String(d.id)}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
          ListEmptyComponent={<Vacio icono="chip" titulo="No hay dispositivos" detalle="Aparecen cuando un cliente los vincula desde la app." />}
          renderItem={({ item: d }) => (
            <List.Item
              title={`${d.nombre ?? d.deviceId}${d.casa ? ` · ${direccion(d.casa)}` : ""}`}
              description={`${d.deviceId} · ${d.casaId ? (d.online ? "Online" : "Offline") : "Sin casa"} · ${d.wifiSsid ?? "—"} · v${d.firmwareVersion ?? "?"} · ${haceCuanto(d.ultimaConexion)}`}
              left={(p) => <List.Icon {...p} icon={d.online ? "chip" : "chip"} color={d.online ? "#2E7D32" : d.casaId ? "#C62828" : undefined} />}
              onPress={d.casaId ? () => setElegida(d) : undefined}
              right={() => (
                <IconButton icon="console" accessibilityLabel="Monitor" onPress={() => verMonitor(d)} />
              )}
            />
          )}
        />
      )}
      <Portal>
        <Dialog visible={!!elegida} onDismiss={() => setElegida(null)}>
          <Dialog.Title>{elegida?.nombre ?? "Dispositivo"} · {elegida?.deviceId}</Dialog.Title>
          <Dialog.Content>
            <Text>“Restablecer” borra el WiFi del dispositivo y lo desvincula (necesita estar conectado). “Desvincular” solo lo quita de la casa.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setElegida(null)}>Cancelar</Button>
            <Button
              onPress={() => {
                if (elegida) verMonitor(elegida);
                setElegida(null);
              }}
            >
              Monitor
            </Button>
            <Button onPress={() => accion("desvincular")} disabled={trabajando}>
              Desvincular
            </Button>
            <Button onPress={() => accion("reset")} loading={trabajando} disabled={trabajando}>
              Restablecer
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
