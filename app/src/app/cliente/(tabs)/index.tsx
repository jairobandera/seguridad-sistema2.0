import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Appbar, Button, Card, Chip, Divider, Snackbar, Text, useTheme } from "react-native-paper";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { casas } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import type { Casa } from "@/api/tipos";
import { useCasas } from "@/hooks/useCasas";
import { BotonAlarma } from "@/components/BotonAlarma";
import { Indicador } from "@/components/Indicador";
import { EventoItem } from "@/components/EventoItem";
import { Cargando, ErrorReintentar, Vacio } from "@/components/Estados";
import { barrasSenal, direccion } from "@/utils/formato";
import { colores } from "@/tema";

export default function InicioCliente() {
  const tema = useTheme();
  const qc = useQueryClient();
  const { lista, actual, elegir, isLoading, error, refetch, isRefetching } = useCasas();
  const [aviso, setAviso] = useState<string | null>(null);

  const ultimos = useQuery({
    queryKey: ["eventos", actual?.id, "ultimos"],
    queryFn: () => casas.eventos(actual!.id),
    enabled: !!actual,
  });

  const alarma = useMutation({
    mutationFn: (armar: boolean) => casas.alarma(actual!.id, armar),
    onSuccess: (r) => {
      qc.setQueryData<Casa[]>(["casas", "mias"], (l) =>
        l?.map((c) => (c.id === r.estado.casaId ? { ...c, alarmaArmada: r.estado.alarmaArmada, estado: r.estado } : c)),
      );
      qc.invalidateQueries({ queryKey: ["eventos", actual?.id] });
      if (r.advertencia === "puerta_abierta") setAviso("Ojo: la alarma quedó armada pero la puerta está abierta.");
      else setAviso(r.estado.alarmaArmada ? "Alarma armada" : "Alarma desarmada");
    },
    onError: (e) => setAviso(mensajeDeError(e)),
  });

  if (isLoading) return <Cargando />;
  if (error) return <ErrorReintentar error={error} alReintentar={refetch} />;
  if (!actual) {
    return (
      <>
        <Appbar.Header>
          <Appbar.Content title="Mi casa" />
        </Appbar.Header>
        <Vacio icono="home-alert-outline" titulo="Todavía no tenés una casa asignada" detalle="Pedile a la administración que te asigne tu casa." />
      </>
    );
  }

  const e = actual.estado;
  const tienePlaca = !!e?.dispositivo;
  const online = !!e?.online;

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title={direccion(actual)} subtitle={actual.rolCasa === "DUENO" ? "Dueño" : "Familiar"} />
      </Appbar.Header>
      <ScrollView
        contentContainerStyle={estilos.contenido}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); ultimos.refetch(); }} />}
      >
        {lista.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {lista.map((c) => (
              <Chip key={c.id} selected={c.id === actual.id} onPress={() => elegir(c.id)} style={{ marginRight: 8 }}>
                {direccion(c)}
              </Chip>
            ))}
          </ScrollView>
        ) : null}

        <Card style={estilos.tarjeta}>
          <Card.Content style={{ alignItems: "center", paddingVertical: 24 }}>
            <BotonAlarma armada={actual.alarmaArmada} cargando={alarma.isPending} alCambiar={(armar) => alarma.mutate(armar)} />
          </Card.Content>
        </Card>

        {tienePlaca ? (
          <View style={estilos.indicadores}>
            <Indicador
              icono={e!.puertaAbierta ? "door-open" : "door-closed"}
              titulo="Puerta"
              valor={e!.puertaAbierta ? "Abierta" : "Cerrada"}
              color={e!.puertaAbierta ? colores.aviso : colores.ok}
            />
            <Indicador
              icono={online ? `wifi-strength-${barrasSenal(e!.rssi)}` : "wifi-off"}
              titulo="Placa"
              valor={online ? "Conectada" : "Sin conexión"}
              color={online ? colores.ok : colores.peligro}
            />
          </View>
        ) : (
          <Card style={estilos.tarjeta}>
            <Card.Content>
              <Text variant="titleMedium">Tu casa todavía no tiene una placa</Text>
              <Text variant="bodyMedium" style={{ marginTop: 4, color: tema.colors.onSurfaceVariant }}>
                {actual.rolCasa === "DUENO"
                  ? "Configurala en un par de minutos desde el celular."
                  : "Pedile al dueño de la casa que la configure."}
              </Text>
            </Card.Content>
            {actual.rolCasa === "DUENO" ? (
              <Card.Actions>
                <Button mode="contained" icon="plus" onPress={() => router.push({ pathname: "/cliente/asistente", params: { casaId: actual.id, modo: "nueva" } })}>
                  Agregar placa
                </Button>
              </Card.Actions>
            ) : null}
          </Card>
        )}

        <Card style={estilos.tarjeta}>
          <Card.Title title="Últimos movimientos" />
          {(ultimos.data?.items ?? []).slice(0, 5).map((ev, i) => (
            <View key={ev.id}>
              {i > 0 ? <Divider /> : null}
              <EventoItem evento={ev} />
            </View>
          ))}
          {ultimos.data && ultimos.data.items.length === 0 ? (
            <Text style={{ padding: 16, color: tema.colors.onSurfaceVariant }}>Todavía no hay movimientos.</Text>
          ) : null}
          <Card.Actions>
            <Button onPress={() => router.navigate("/cliente/actividad")}>Ver toda la actividad</Button>
          </Card.Actions>
        </Card>
      </ScrollView>
      <Snackbar visible={!!aviso} onDismiss={() => setAviso(null)} duration={3500}>
        {aviso}
      </Snackbar>
    </>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, paddingBottom: 32 },
  tarjeta: { marginBottom: 16 },
  indicadores: { flexDirection: "row", gap: 12, marginBottom: 16 },
});
