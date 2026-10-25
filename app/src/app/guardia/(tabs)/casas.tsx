import { useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Appbar, Badge, Card, Chip, Icon, Searchbar, Text, useTheme } from "react-native-paper";
import { sinSugerencias } from "@/components/Campo";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { guardia } from "@/api/endpoints";
import type { CasaGuardia } from "@/api/tipos";
import { Cargando, ErrorReintentar, Vacio } from "@/components/Estados";
import { direccion } from "@/utils/formato";
import { colores } from "@/tema";

type Filtro = "todas" | "alertas" | "armadas" | "abiertas" | "offline";

const FILTROS: { valor: Filtro; texto: string; cumple: (c: CasaGuardia) => boolean }[] = [
  { valor: "todas", texto: "Todas", cumple: () => true },
  { valor: "alertas", texto: "Con alertas", cumple: (c) => c.alertasAbiertas > 0 },
  { valor: "armadas", texto: "Armadas", cumple: (c) => c.alarmaArmada },
  { valor: "abiertas", texto: "Abierta", cumple: (c) => c.puertaAbierta },
  { valor: "offline", texto: "Sin conexión", cumple: (c) => c.dispositivosOffline > 0 },
];

export default function CasasGuardia() {
  const tema = useTheme();
  const q = useQuery({ queryKey: ["guardia", "casas"], queryFn: guardia.casas });
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const lista = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const f = FILTROS.find((x) => x.valor === filtro)!;
    return (q.data ?? [])
      .filter(f.cumple)
      .filter((c) => !t || `${direccion(c)} ${c.dueno?.nombre ?? ""} ${c.codigo}`.toLowerCase().includes(t))
      .sort((a, b) => b.alertasAbiertas - a.alertasAbiertas);
  }, [q.data, busqueda, filtro]);

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Casas" />
      </Appbar.Header>
      <Searchbar {...sinSugerencias} placeholder="Buscar por dirección o dueño" value={busqueda} onChangeText={setBusqueda} style={{ marginHorizontal: 16 }} />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8 }}>
          {FILTROS.map((f) => (
            <Chip key={f.valor} selected={filtro === f.valor} onPress={() => setFiltro(f.valor)}>
              {f.texto}
            </Chip>
          ))}
        </ScrollView>
      </View>
      {q.isLoading ? (
        <Cargando />
      ) : q.error ? (
        <ErrorReintentar error={q.error} alReintentar={q.refetch} />
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
          ListEmptyComponent={<Vacio icono="home-search" titulo="No hay casas con ese filtro" />}
          renderItem={({ item: c }) => (
            <Card style={{ marginBottom: 10 }} onPress={() => router.push(`/guardia/casa/${c.id}`)}>
              <Card.Content>
                <View style={estilos.fila}>
                  <Text variant="titleMedium" style={{ flex: 1 }}>
                    {direccion(c)}
                  </Text>
                  {c.alertasAbiertas > 0 ? <Badge size={24}>{c.alertasAbiertas}</Badge> : null}
                </View>
                <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                  {c.dueno?.nombre ?? "Sin dueño asignado"}
                </Text>
                <View style={[estilos.fila, { marginTop: 8, gap: 16 }]}>
                  <Estado icono={c.alarmaArmada ? "shield-lock" : "shield-off-outline"} texto={c.alarmaArmada ? "Armada" : "Desarmada"} color={c.alarmaArmada ? colores.armada : colores.apagado} />
                  {c.cantidadDispositivos > 0 ? (
                    <>
                      <Estado icono={c.puertaAbierta ? "door-open" : "door-closed"} texto={c.puertaAbierta ? "Abierta" : "Cerrada"} color={c.puertaAbierta ? colores.peligro : colores.ok} />
                      <Estado
                        icono={c.dispositivosOffline ? "wifi-off" : "wifi"}
                        texto={`${c.cantidadDispositivos - c.dispositivosOffline}/${c.cantidadDispositivos} online`}
                        color={c.dispositivosOffline ? colores.peligro : colores.ok}
                      />
                    </>
                  ) : (
                    <Estado icono="chip" texto="Sin dispositivos" color={colores.apagado} />
                  )}
                </View>
              </Card.Content>
            </Card>
          )}
        />
      )}
    </>
  );
}

function Estado({ icono, texto, color }: { icono: string; texto: string; color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Icon source={icono} size={18} color={color} />
      <Text variant="labelMedium" style={{ color }}>
        {texto}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({ fila: { flexDirection: "row", alignItems: "center" } });
