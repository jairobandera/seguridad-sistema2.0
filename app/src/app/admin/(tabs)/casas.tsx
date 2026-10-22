import { useState } from "react";
import { FlatList, RefreshControl } from "react-native";
import { Appbar, FAB, List, Searchbar, useTheme } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { admin } from "@/api/endpoints";
import { Cargando, ErrorReintentar, Vacio } from "@/components/Estados";
import { direccion, nombreCompleto } from "@/utils/formato";

export default function CasasAdmin() {
  const tema = useTheme();
  const [q, setQ] = useState("");
  const consulta = useQuery({ queryKey: ["admin", "casas", q], queryFn: () => admin.casas(q.trim() || undefined) });

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Casas" />
      </Appbar.Header>
      <Searchbar placeholder="Buscar por dirección, código o dueño" value={q} onChangeText={setQ} style={{ margin: 16, marginTop: 0 }} />
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
            const placa = c.dispositivos[0];
            return (
              <List.Item
                title={direccion(c)}
                titleStyle={{ opacity: c.activa ? 1 : 0.5 }}
                description={`${c.codigo} · ${dueno ? nombreCompleto(dueno) : "sin dueño"} · ${placa ? (placa.online ? "placa online" : "placa offline") : "sin placa"}${c.activa ? "" : " · INACTIVA"}`}
                left={(p) => <List.Icon {...p} icon={c.alarmaArmada ? "shield-lock" : "home"} />}
                right={(p) => <List.Icon {...p} icon="chevron-right" />}
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
