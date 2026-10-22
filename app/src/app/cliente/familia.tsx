import { useState } from "react";
import { ScrollView } from "react-native";
import { Appbar, Button, Card, Dialog, HelperText, IconButton, List, Portal, Text, TextInput, useTheme } from "react-native-paper";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { casas } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import type { Miembro } from "@/api/tipos";
import { useCasas } from "@/hooks/useCasas";
import { useSesion } from "@/store/sesion";
import { Cargando, ErrorReintentar, Vacio } from "@/components/Estados";
import { direccion, nombreCompleto } from "@/utils/formato";

export default function Familia() {
  const tema = useTheme();
  const qc = useQueryClient();
  const yo = useSesion((s) => s.usuario);
  const { actual } = useCasas();
  const esDueno = actual?.rolCasa === "DUENO";
  const q = useQuery({ queryKey: ["miembros", actual?.id], queryFn: () => casas.miembros(actual!.id), enabled: !!actual });
  const [agregando, setAgregando] = useState(false);
  const [email, setEmail] = useState("");
  const [quitando, setQuitando] = useState<Miembro | null>(null);
  const [error, setError] = useState<string | null>(null);

  const agregar = useMutation({
    mutationFn: () => casas.agregarMiembro(actual!.id, email.trim()),
    onSuccess: () => {
      setAgregando(false);
      setEmail("");
      qc.invalidateQueries({ queryKey: ["miembros", actual?.id] });
    },
    onError: (e) => setError(mensajeDeError(e)),
  });
  const quitar = useMutation({
    mutationFn: (usuarioId: number) => casas.quitarMiembro(actual!.id, usuarioId),
    onSuccess: () => {
      setQuitando(null);
      qc.invalidateQueries({ queryKey: ["miembros", actual?.id] });
    },
  });

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Familia" subtitle={actual ? direccion(actual) : undefined} />
      </Appbar.Header>
      {!actual ? (
        <Vacio icono="home-alert-outline" titulo="No tenés una casa asignada" />
      ) : q.isLoading ? (
        <Cargando />
      ) : q.error ? (
        <ErrorReintentar error={q.error} alReintentar={q.refetch} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Text style={{ color: tema.colors.onSurfaceVariant }}>
            Todos los miembros reciben las alarmas en su celular y pueden armar o desarmar.
          </Text>
          <Card>
            {(q.data ?? []).map((m) => (
              <List.Item
                key={m.usuarioId}
                title={`${nombreCompleto(m)}${m.usuarioId === yo?.id ? " (vos)" : ""}`}
                description={`${m.rol === "DUENO" ? "Dueño" : "Familiar"} · ${m.email}`}
                left={(p) => <List.Icon {...p} icon={m.rol === "DUENO" ? "account-star" : "account"} />}
                right={() => (esDueno && m.rol === "FAMILIAR" ? <IconButton icon="account-remove" onPress={() => setQuitando(m)} /> : null)}
              />
            ))}
          </Card>
          {esDueno ? (
            <Button mode="contained" icon="account-plus" onPress={() => { setError(null); setAgregando(true); }}>
              Agregar familiar
            </Button>
          ) : null}
        </ScrollView>
      )}

      <Portal>
        <Dialog visible={agregando} onDismiss={() => setAgregando(false)}>
          <Dialog.Title>Agregar familiar</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 12 }}>La persona tiene que tener una cuenta. Si no la tiene, pedile a la administración que la cree.</Text>
            <TextInput label="Email de la persona" mode="outlined" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <HelperText type="error" visible={!!error}>
              {error}
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAgregando(false)}>Cancelar</Button>
            <Button onPress={() => agregar.mutate()} loading={agregar.isPending} disabled={!email.includes("@")}>
              Agregar
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={!!quitando} onDismiss={() => setQuitando(null)}>
          <Dialog.Title>¿Quitar a {quitando?.nombre}?</Dialog.Title>
          <Dialog.Content>
            <Text>Dejará de ver la casa y de recibir alarmas.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setQuitando(null)}>Cancelar</Button>
            <Button loading={quitar.isPending} onPress={() => quitando && quitar.mutate(quitando.usuarioId)}>
              Quitar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
