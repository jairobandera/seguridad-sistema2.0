import { useState } from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";
import { Appbar, Chip, FAB, List, Searchbar, useTheme } from "react-native-paper";
import { sinSugerencias } from "@/components/Campo";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { admin } from "@/api/endpoints";
import type { Paquete } from "@/api/tipos";
import { Cargando, ErrorReintentar, Vacio } from "@/components/Estados";
import { direccion, nombreCompleto } from "@/utils/formato";

type Filtro = { paquete?: Paquete; barrioId?: number };

export default function CasasAdmin() {
  const tema = useTheme();
  // El filtro vive en la URL: así se puede llegar desde Sistemas con un barrio o "Individuales" ya elegido
  const p = useLocalSearchParams<{ barrioId?: string; paquete?: Paquete }>();
  const [q, setQ] = useState("");
  const filtro: Filtro = p.barrioId ? { barrioId: Number(p.barrioId) } : p.paquete ? { paquete: p.paquete } : {};
  const setFiltro = (f: Filtro) => router.setParams({ barrioId: f.barrioId ? String(f.barrioId) : undefined, paquete: f.paquete });

  const barrios = useQuery({ queryKey: ["admin", "barrios"], queryFn: admin.barrios });
  const consulta = useQuery({
    queryKey: ["admin", "casas", q, filtro],
    queryFn: () => admin.casas({ q: q.trim() || undefined, ...filtro }),
  });

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Casas" />
      </Appbar.Header>
      <Searchbar {...sinSugerencias} placeholder="Buscar por dirección, código o dueño" value={q} onChangeText={setQ} style={{ marginHorizontal: 16 }} />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8 }}>
          <Chip selected={!filtro.paquete && !filtro.barrioId} onPress={() => setFiltro({})}>
            Todas
          </Chip>
          <Chip selected={filtro.paquete === "INDIVIDUAL"} onPress={() => setFiltro({ paquete: "INDIVIDUAL" })}>
            Individuales
          </Chip>
          {(barrios.data ?? []).map((b) => (
            <Chip key={b.id} selected={filtro.barrioId === b.id} onPress={() => setFiltro({ barrioId: b.id })}>
              {b.nombre}
            </Chip>
          ))}
        </ScrollView>
      </View>
      {consulta.isLoading ? (
        <Cargando />
      ) : consulta.error ? (
        <ErrorReintentar error={consulta.error} alReintentar={consulta.refetch} />
      ) : (
        <FlatList
          data={consulta.data ?? []}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ paddingBottom: 96, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={consulta.isRefetching} onRefresh={() => void consulta.refetch()} />}
          ListEmptyComponent={<Vacio icono="home-search" titulo="No hay casas" />}
          renderItem={({ item: c }) => {
            const dueno = c.miembros.find((m) => m.rol === "DUENO");
            const online = c.dispositivos.filter((d) => d.online).length;
            const sistema = c.paquete === "INDIVIDUAL" ? "Individual" : `${c.barrio ?? "Sin barrio"}${c.tieneGuardia ? "" : " (sin guardia)"}`;
            const dispositivos = c.dispositivos.length ? `${online}/${c.dispositivos.length} dispositivos online` : "sin dispositivos";
            return (
              <List.Item
                title={direccion(c)}
                titleStyle={{ opacity: c.activa ? 1 : 0.5 }}
                description={`${sistema} · ${dueno ? nombreCompleto(dueno) : "sin dueño"} · ${dispositivos}${c.activa ? "" : " · INACTIVA"}`}
                descriptionNumberOfLines={2}
                left={(pp) => <List.Icon {...pp} icon={c.alarmaArmada ? "shield-lock" : c.paquete === "INDIVIDUAL" ? "home" : "home-group"} />}
                right={(pp) => <List.Icon {...pp} icon="chevron-right" />}
                onPress={() => router.push(`/admin/casa/${c.id}`)}
              />
            );
          }}
        />
      )}
      <FAB icon="home-plus" label="Nueva" style={{ position: "absolute", right: 16, bottom: 16, backgroundColor: tema.colors.primaryContainer }} onPress={() => router.push("/admin/casa/nueva")} />
    </>
  );
}
