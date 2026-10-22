import { useMemo } from "react";
import { RefreshControl, SectionList, View } from "react-native";
import { ActivityIndicator, Divider, Text, useTheme } from "react-native-paper";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Evento, Pagina } from "@/api/tipos";
import { EventoItem } from "./EventoItem";
import { Cargando, ErrorReintentar, Vacio } from "./Estados";
import { dia } from "@/utils/formato";

interface Props {
  queryKey: unknown[];
  cargar: (cursor?: number) => Promise<Pagina<Evento>>;
  mostrarCasa?: boolean;
}

/** Lista de eventos paginada y agrupada por día. */
export function ListaEventos({ queryKey, cargar, mostrarCasa }: Props) {
  const tema = useTheme();
  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => cargar(pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (ultima) => ultima.siguiente ?? undefined,
  });

  const secciones = useMemo(() => {
    const grupos: { title: string; data: Evento[] }[] = [];
    for (const ev of q.data?.pages.flatMap((p) => p.items) ?? []) {
      const titulo = dia(ev.fechaHora);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.title === titulo) ultimo.data.push(ev);
      else grupos.push({ title: titulo, data: [ev] });
    }
    return grupos;
  }, [q.data]);

  if (q.isLoading) return <Cargando />;
  if (q.error) return <ErrorReintentar error={q.error} alReintentar={q.refetch} />;
  if (!secciones.length) return <Vacio icono="history" titulo="Todavía no hay movimientos" />;

  return (
    <SectionList
      sections={secciones}
      keyExtractor={(e) => String(e.id)}
      renderItem={({ item }) => <EventoItem evento={item} mostrarCasa={mostrarCasa} />}
      renderSectionHeader={({ section }) => (
        <Text variant="labelLarge" style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, color: tema.colors.primary, backgroundColor: tema.colors.background, textTransform: "capitalize" }}>
          {section.title}
        </Text>
      )}
      ItemSeparatorComponent={Divider}
      stickySectionHeadersEnabled
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} />}
      ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator style={{ margin: 16 }} /> : <View style={{ height: 24 }} />}
    />
  );
}
