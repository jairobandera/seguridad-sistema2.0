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
import { DispositivoFila, nombreDispositivo, resumenConexion, resumenPuertas } from "@/components/DispositivoFila";
import { useArmadoParcial } from "@/components/ArmadoParcial";
import { direccion } from "@/utils/formato";
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
    mutationFn: (p: { armar: boolean; excluir?: number[] }) => casas.alarma(actual!.id, p.armar, p.excluir),
    onSuccess: (r) => {
      qc.setQueryData<Casa[]>(["casas", "mias"], (l) =>
        l?.map((c) => (c.id === r.estado.casaId ? { ...c, alarmaArmada: r.estado.alarmaArmada, estado: r.estado } : c)),
      );
      qc.invalidateQueries({ queryKey: ["eventos", actual?.id] });
      if (r.advertencia === "puerta_abierta") setAviso("Ojo: la alarma quedó armada pero hay algo abierto.");
      else setAviso(!r.estado.alarmaArmada ? "Alarma desarmada" : r.estado.armadoParcial ? "Alarma armada (parcial)" : "Alarma armada");
    },
    onError: (e) => setAviso(mensajeDeError(e)),
  });

  const dispositivos = actual?.estado?.dispositivos ?? [];
  const parcial = useArmadoParcial(actual?.id ?? 0, dispositivos, (excluir) => alarma.mutate({ armar: true, excluir }));

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

  const esDueno = actual.rolCasa === "DUENO";
  const afuera = dispositivos.filter((d) => d.excluido);
  const puertas = resumenPuertas(dispositivos);
  const conexion = resumenConexion(dispositivos);
  const agregar = () => router.push({ pathname: "/cliente/asistente", params: { casaId: actual.id, modo: "nueva" } });

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
            <BotonAlarma
              armada={actual.alarmaArmada}
              cargando={alarma.isPending}
              alCambiar={(armar) => (armar ? parcial.armarTodo() : alarma.mutate({ armar: false }))}
            />
            {afuera.length ? (
              <Text variant="bodyMedium" style={{ marginTop: 8, color: colores.aviso, textAlign: "center" }}>
                Armada parcial · afuera: {afuera.map(nombreDispositivo).join(", ")}
              </Text>
            ) : null}
            {!actual.alarmaArmada && dispositivos.length > 1 ? (
              <Button icon="checkbox-multiple-marked-outline" style={{ marginTop: 8 }} onPress={parcial.pedirParcial} disabled={alarma.isPending}>
                Armar parcial
              </Button>
            ) : null}
          </Card.Content>
        </Card>

        {dispositivos.length > 0 ? (
          <>
            <View style={estilos.indicadores}>
              <Indicador
                icono={puertas.abierta ? "door-open" : "door-closed"}
                titulo={dispositivos.length > 1 ? "Aberturas" : "Puerta"}
                valor={puertas.texto}
                color={puertas.abierta ? colores.aviso : colores.ok}
              />
              <Indicador
                icono={conexion.ok ? "wifi" : "wifi-off"}
                titulo={dispositivos.length > 1 ? "Dispositivos" : "Dispositivo"}
                valor={conexion.texto}
                color={conexion.ok ? colores.ok : colores.peligro}
              />
            </View>
            <Card style={estilos.tarjeta}>
              {dispositivos.map((d, i) => (
                <View key={d.id}>
                  {i > 0 ? <Divider /> : null}
                  <DispositivoFila d={d} alTocar={() => router.navigate("/cliente/dispositivos")} />
                </View>
              ))}
            </Card>
          </>
        ) : (
          <Card style={estilos.tarjeta}>
            <Card.Content>
              <Text variant="titleMedium">Tu casa todavía no tiene dispositivos</Text>
              <Text variant="bodyMedium" style={{ marginTop: 4, color: tema.colors.onSurfaceVariant }}>
                {esDueno ? "Configuralo en un par de minutos desde el celular." : "Pedile al dueño de la casa que lo configure."}
              </Text>
            </Card.Content>
            {esDueno ? (
              <Card.Actions>
                <Button mode="contained" icon="plus" onPress={agregar}>
                  Agregar dispositivo
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
      {parcial.dialogos}
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
