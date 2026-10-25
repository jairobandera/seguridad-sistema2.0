import { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { Appbar, SegmentedButtons, Surface, Text, useTheme } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { guardia } from "@/api/endpoints";
import { TarjetaAlerta } from "@/components/TarjetaAlerta";
import { ListaEventos } from "@/components/ListaEventos";
import { Cargando, ErrorReintentar, Vacio } from "@/components/Estados";
import { colores } from "@/tema";

export default function Alertas() {
  const [vista, setVista] = useState<"abiertas" | "cerradas">("abiertas");
  const resumen = useQuery({ queryKey: ["guardia", "resumen"], queryFn: guardia.resumen });
  const abiertas = useQuery({ queryKey: ["guardia", "abiertas"], queryFn: () => guardia.eventos({ estado: "PENDIENTE,EN_CURSO" }) });
  const r = resumen.data;

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Alertas" />
      </Appbar.Header>
      <View style={estilos.resumen}>
        <Dato valor={r?.pendientes} texto="Pendientes" color={colores.peligro} />
        <Dato valor={r?.enCurso} texto="En curso" color={colores.aviso} />
        <Dato valor={r?.dispositivosOffline} texto="Sin conexión" color={colores.apagado} />
        <Dato valor={r?.casasArmadas} texto="Armadas" color={colores.armada} />
      </View>
      <SegmentedButtons
        style={{ marginHorizontal: 16, marginBottom: 8 }}
        value={vista}
        onValueChange={(v) => setVista(v as typeof vista)}
        buttons={[
          { value: "abiertas", label: "Abiertas", icon: "alarm-light" },
          { value: "cerradas", label: "Historial", icon: "history" },
        ]}
      />
      {vista === "cerradas" ? (
        <ListaEventos queryKey={["guardia", "cerradas"]} cargar={(cursor) => guardia.eventos({ estado: "RESUELTO,FALSA_ALARMA", cursor })} mostrarCasa />
      ) : abiertas.isLoading ? (
        <Cargando />
      ) : abiertas.error ? (
        <ErrorReintentar error={abiertas.error} alReintentar={abiertas.refetch} />
      ) : (
        <FlatList
          data={abiertas.data?.items ?? []}
          keyExtractor={(e) => String(e.id)}
          renderItem={({ item }) => <TarjetaAlerta evento={item} />}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          ListEmptyComponent={<Vacio icono="shield-check" titulo="Todo tranquilo" detalle="No hay alertas abiertas." />}
          refreshControl={
            <RefreshControl
              refreshing={abiertas.isRefetching}
              onRefresh={() => {
                abiertas.refetch();
                resumen.refetch();
              }}
            />
          }
        />
      )}
    </>
  );
}

function Dato({ valor, texto, color }: { valor: number | undefined; texto: string; color: string }) {
  const tema = useTheme();
  return (
    <Surface style={estilos.dato} elevation={1}>
      <Text variant="headlineSmall" style={{ color, fontWeight: "800" }}>
        {valor ?? "–"}
      </Text>
      <Text variant="labelSmall" style={{ color: tema.colors.onSurfaceVariant }}>
        {texto}
      </Text>
    </Surface>
  );
}

const estilos = StyleSheet.create({
  resumen: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 12 },
  dato: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12 },
});
