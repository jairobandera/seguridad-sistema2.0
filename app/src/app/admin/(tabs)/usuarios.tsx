import { useState } from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";
import { Appbar, Chip, FAB, List, Searchbar, useTheme } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { admin } from "@/api/endpoints";
import type { Rol } from "@/api/tipos";
import { Cargando, ErrorReintentar, Vacio } from "@/components/Estados";
import { nombreCompleto } from "@/utils/formato";

const ROLES: { valor: Rol | undefined; texto: string }[] = [
  { valor: undefined, texto: "Todos" },
  { valor: "CLIENTE", texto: "Clientes" },
  { valor: "GUARDIA", texto: "Guardias" },
  { valor: "ADMIN", texto: "Admins" },
];
const ICONOS: Record<Rol, string> = { CLIENTE: "account", GUARDIA: "shield-account", ADMIN: "account-key" };

export default function Usuarios() {
  const tema = useTheme();
  const [q, setQ] = useState("");
  const [rol, setRol] = useState<Rol | undefined>(undefined);
  const consulta = useQuery({ queryKey: ["admin", "usuarios", q, rol], queryFn: () => admin.usuarios({ q: q.trim() || undefined, rol }) });

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Usuarios" />
      </Appbar.Header>
      <Searchbar placeholder="Buscar por nombre o email" value={q} onChangeText={setQ} style={{ marginHorizontal: 16 }} />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8 }}>
          {ROLES.map((r) => (
            <Chip key={r.texto} selected={rol === r.valor} onPress={() => setRol(r.valor)}>
              {r.texto}
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
          keyExtractor={(u) => String(u.id)}
          contentContainerStyle={{ paddingBottom: 96, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={consulta.isRefetching} onRefresh={() => void consulta.refetch()} />}
          ListEmptyComponent={<Vacio icono="account-search" titulo="No hay usuarios" />}
          renderItem={({ item: u }) => (
            <List.Item
              title={nombreCompleto(u)}
              description={`${u.email}${u.activo ? "" : " · DESACTIVADO"}${u.debeCambiarPassword ? " · clave temporal" : ""}`}
              titleStyle={{ opacity: u.activo ? 1 : 0.5 }}
              left={(p) => <List.Icon {...p} icon={ICONOS[u.rol]} />}
              right={(p) => <List.Icon {...p} icon="chevron-right" />}
              onPress={() => router.push(`/admin/usuario/${u.id}`)}
            />
          )}
        />
      )}
      <FAB icon="account-plus" label="Nuevo" style={{ position: "absolute", right: 16, bottom: 16, backgroundColor: tema.colors.primaryContainer }} onPress={() => router.push("/admin/usuario/nuevo")} />
    </>
  );
}
