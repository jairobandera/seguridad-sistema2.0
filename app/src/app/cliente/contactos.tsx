import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Appbar, Button, Card, Dialog, HelperText, IconButton, List, Portal, SegmentedButtons, Snackbar, Text, useTheme } from "react-native-paper";
import { Campo } from "@/components/Campo";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { contactos } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import type { Contacto } from "@/api/tipos";
import { Cargando, ErrorReintentar } from "@/components/Estados";
import { formatoTelefono, normalizarTelefono, PAISES, type CodigoPais } from "@/utils/telefono";

const MAX = 2;

export default function Contactos() {
  const tema = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["contactos"], queryFn: contactos.listar });
  const [editando, setEditando] = useState<Contacto | "nuevo" | null>(null);
  const [borrando, setBorrando] = useState<Contacto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const borrar = useMutation({
    mutationFn: (id: number) => contactos.borrar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contactos"] });
      setBorrando(null);
    },
    onError: (e) => setAviso(mensajeDeError(e)),
  });

  const lista = q.data ?? [];
  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Contactos de emergencia" />
      </Appbar.Header>
      {q.isLoading ? (
        <Cargando />
      ) : q.error ? (
        <ErrorReintentar error={q.error} alReintentar={q.refetch} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Text style={{ color: tema.colors.onSurfaceVariant }}>
            Si se abre la puerta con la alarma armada, les mandamos un SMS a vos y a estas personas (hasta {MAX}).
          </Text>
          {lista.map((c) => (
            <Card key={c.id}>
              <List.Item
                title={c.nombre}
                description={`${formatoTelefono(c.telefono)}${c.relacion ? ` · ${c.relacion}` : ""}`}
                left={(p) => <List.Icon {...p} icon="account" />}
                right={() => (
                  <View style={{ flexDirection: "row" }}>
                    <IconButton icon="pencil" onPress={() => setEditando(c)} />
                    <IconButton icon="delete" onPress={() => setBorrando(c)} />
                  </View>
                )}
              />
            </Card>
          ))}
          {lista.length < MAX ? (
            <Button mode="contained" icon="plus" onPress={() => setEditando("nuevo")}>
              Agregar contacto
            </Button>
          ) : (
            <Text style={{ color: tema.colors.onSurfaceVariant }}>Llegaste al máximo de {MAX} contactos.</Text>
          )}
        </ScrollView>
      )}

      {editando ? (
        <FormContacto
          contacto={editando === "nuevo" ? null : editando}
          alCerrar={() => setEditando(null)}
          alGuardar={() => {
            setEditando(null);
            qc.invalidateQueries({ queryKey: ["contactos"] });
            setAviso("Contacto guardado");
          }}
        />
      ) : null}

      <Portal>
        <Dialog visible={!!borrando} onDismiss={() => setBorrando(null)}>
          <Dialog.Title>¿Quitar a {borrando?.nombre}?</Dialog.Title>
          <Dialog.Content>
            <Text>Dejará de recibir avisos de emergencia.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setBorrando(null)}>Cancelar</Button>
            <Button loading={borrar.isPending} onPress={() => borrando && borrar.mutate(borrando.id)}>
              Quitar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar visible={!!aviso} onDismiss={() => setAviso(null)}>
        {aviso}
      </Snackbar>
    </>
  );
}

function paisDe(e164?: string): CodigoPais {
  if (e164?.startsWith("+54")) return "AR";
  if (e164?.startsWith("+598")) return "UY";
  return e164 ? "OTRO" : "AR";
}

function FormContacto({ contacto, alCerrar, alGuardar }: { contacto: Contacto | null; alCerrar: () => void; alGuardar: () => void }) {
  const [nombre, setNombre] = useState(contacto?.nombre ?? "");
  const [relacion, setRelacion] = useState(contacto?.relacion ?? "");
  const [pais, setPais] = useState<CodigoPais>(paisDe(contacto?.telefono));
  const [numero, setNumero] = useState(contacto?.telefono ?? "");
  const [error, setError] = useState<string | null>(null);
  const tel = normalizarTelefono(pais, numero);

  const guardar = useMutation({
    mutationFn: () => {
      const datos = { nombre: nombre.trim(), telefono: tel.e164!, relacion: relacion.trim() || null };
      return contacto ? contactos.editar(contacto.id, datos) : contactos.crear(datos);
    },
    onSuccess: alGuardar,
    onError: (e) => setError(mensajeDeError(e)),
  });

  return (
    <Portal>
      <Dialog visible onDismiss={alCerrar}>
        <Dialog.Title>{contacto ? "Editar contacto" : "Nuevo contacto"}</Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 24 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingVertical: 12 }}>
            <Campo label="Nombre" mode="outlined" value={nombre} onChangeText={setNombre} />
            <Campo label="Relación (opcional)" mode="outlined" value={relacion} onChangeText={setRelacion} placeholder="Ej: hermano, vecina" />
            <SegmentedButtons value={pais} onValueChange={(v) => setPais(v as CodigoPais)} buttons={PAISES.map((p) => ({ value: p.codigo, label: p.nombre }))} />
            <Campo
              label={pais === "OTRO" ? "Número con código de país (+...)" : "Celular (con código de área)"}
              mode="outlined"
              keyboardType="phone-pad"
              value={numero}
              onChangeText={setNumero}
              left={pais === "OTRO" ? undefined : <Campo.Affix text={PAISES.find((p) => p.codigo === pais)!.prefijo} />}
              placeholder={pais === "AR" ? "11 2345 6789" : pais === "UY" ? "99 123 456" : "+1 555 123 4567"}
            />
            <HelperText type={tel.e164 ? "info" : "error"} visible={numero.length > 3}>
              {tel.e164 ? `Se guardará como ${tel.lindo}` : "El número no parece válido"}
            </HelperText>
            <HelperText type="error" visible={!!error}>
              {error}
            </HelperText>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={alCerrar}>Cancelar</Button>
          <Button onPress={() => guardar.mutate()} loading={guardar.isPending} disabled={!nombre.trim() || !tel.e164 || guardar.isPending}>
            Guardar
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
