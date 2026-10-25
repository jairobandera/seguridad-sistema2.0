import { Linking, RefreshControl, ScrollView, View } from "react-native";
import { Appbar, Button, Card, Divider, IconButton, List, Text } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { guardia } from "@/api/endpoints";
import { EventoItem } from "@/components/EventoItem";
import { Indicador } from "@/components/Indicador";
import { Cargando, ErrorReintentar } from "@/components/Estados";
import { DispositivoFila, resumenConexion, resumenPuertas } from "@/components/DispositivoFila";
import { direccion } from "@/utils/formato";
import { formatoTelefono } from "@/utils/telefono";
import { colores } from "@/tema";

const llamar = (tel: string) => Linking.openURL(`tel:${tel}`);

export default function CasaGuardiaDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["guardia", "casa", Number(id)], queryFn: () => guardia.casa(Number(id)) });
  const resolverTodo = useMutation({
    mutationFn: () => guardia.resolverTodo(Number(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guardia"] }),
  });

  const c = q.data;
  const dispositivos = c?.estado?.dispositivos ?? [];
  const puertas = resumenPuertas(dispositivos);
  const conexion = resumenConexion(dispositivos);
  const abiertas = c?.eventos.filter((e) => e.estado && (e.estado.estado === "PENDIENTE" || e.estado.estado === "EN_CURSO")).length ?? 0;

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={c ? direccion(c) : "Casa"} subtitle={c?.codigo} />
      </Appbar.Header>
      {q.isLoading ? (
        <Cargando />
      ) : q.error || !c ? (
        <ErrorReintentar error={q.error} alReintentar={q.refetch} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Indicador icono={c.estado?.alarmaArmada ? "shield-lock" : "shield-off-outline"} titulo="Alarma" valor={c.estado?.alarmaArmada ? "Armada" : "Desarmada"} color={c.estado?.alarmaArmada ? colores.armada : colores.apagado} />
            <Indicador
              icono={puertas.abierta ? "door-open" : "door-closed"}
              titulo="Aberturas"
              valor={dispositivos.length ? puertas.texto : "—"}
              color={puertas.abierta ? colores.peligro : colores.ok}
            />
            <Indicador
              icono={conexion.ok ? "wifi" : "wifi-off"}
              titulo="Dispositivos"
              valor={dispositivos.length ? conexion.texto : "Sin dispositivos"}
              color={dispositivos.length && conexion.ok ? colores.ok : colores.peligro}
            />
          </View>

          {dispositivos.length ? (
            <Card>
              {dispositivos.map((dsp, i) => (
                <View key={dsp.id}>
                  {i > 0 ? <Divider /> : null}
                  <DispositivoFila d={dsp} />
                </View>
              ))}
            </Card>
          ) : null}

          {abiertas > 0 ? (
            <Button mode="contained" icon="check-all" onPress={() => resolverTodo.mutate()} loading={resolverTodo.isPending}>
              Cerrar las {abiertas} alertas abiertas
            </Button>
          ) : null}

          <Card>
            <Card.Title title="Personas de la casa" />
            {c.miembros.map((m) => (
              <List.Item
                key={m.usuarioId}
                title={m.nombre}
                description={`${m.rol === "DUENO" ? "Dueño" : "Familiar"}${m.telefono ? ` · ${formatoTelefono(m.telefono)}` : ""}`}
                left={(p) => <List.Icon {...p} icon="account" />}
                right={() => (m.telefono ? <IconButton icon="phone" onPress={() => llamar(m.telefono!)} /> : null)}
              />
            ))}
            {c.contactos.length ? <Divider /> : null}
            {c.contactos.map((ct, i) => (
              <List.Item
                key={`c${i}`}
                title={ct.nombre}
                description={`Contacto de emergencia${ct.relacion ? ` (${ct.relacion})` : ""} · ${formatoTelefono(ct.telefono)}`}
                left={(p) => <List.Icon {...p} icon="account-alert" />}
                right={() => <IconButton icon="phone" onPress={() => llamar(ct.telefono)} />}
              />
            ))}
          </Card>

          <Card>
            <Card.Title title="Últimos eventos" />
            {c.eventos.map((e, i) => (
              <View key={e.id}>
                {i > 0 ? <Divider /> : null}
                <EventoItem evento={e} />
              </View>
            ))}
            {!c.eventos.length ? <Text style={{ padding: 16 }}>Sin eventos.</Text> : null}
          </Card>
        </ScrollView>
      )}
    </>
  );
}
