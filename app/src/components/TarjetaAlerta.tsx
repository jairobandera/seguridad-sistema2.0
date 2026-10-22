import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Chip, Dialog, HelperText, Portal, SegmentedButtons, Text, TextInput, useTheme } from "react-native-paper";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { guardia } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import type { Evento } from "@/api/tipos";
import { useSesion } from "@/store/sesion";
import { colorSeveridad, direccion, fechaCorta, textoEstadoAtencion, textoEvento } from "@/utils/formato";

/** Alerta para guardias con acciones Tomar / Resolver. */
export function TarjetaAlerta({ evento }: { evento: Evento }) {
  const tema = useTheme();
  const qc = useQueryClient();
  const yo = useSesion((s) => s.usuario);
  const [resolviendo, setResolviendo] = useState(false);
  const [resultado, setResultado] = useState<"RESUELTO" | "FALSA_ALARMA">("RESUELTO");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refrescar = () => qc.invalidateQueries({ queryKey: ["guardia"] });
  const tomar = useMutation({ mutationFn: () => guardia.tomar(evento.id), onSuccess: refrescar, onError: (e) => setError(mensajeDeError(e)) });
  const resolver = useMutation({
    mutationFn: () => guardia.resolver(evento.id, resultado, nota.trim() || undefined),
    onSuccess: () => {
      setResolviendo(false);
      refrescar();
    },
    onError: (e) => setError(mensajeDeError(e)),
  });

  const estado = evento.estado?.estado ?? "PENDIENTE";
  const mia = evento.estado?.guardia?.id === yo?.id;
  const color = colorSeveridad[evento.severidad];
  const { titulo } = textoEvento(evento);

  return (
    <Card style={[estilos.tarjeta, { borderLeftColor: color }]}>
      <Card.Content>
        <View style={estilos.cabecera}>
          <Text variant="titleMedium" style={{ flex: 1, color, fontWeight: "700" }}>
            {titulo}
          </Text>
          <Chip compact>{textoEstadoAtencion[estado]}</Chip>
        </View>
        <Text variant="bodyLarge" style={{ marginTop: 4 }}>
          {direccion(evento.casa)}
        </Text>
        <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
          {fechaCorta(evento.fechaHora)}
          {evento.estado?.guardia ? ` · ${mia ? "La estás atendiendo vos" : `Atiende ${evento.estado.guardia.nombre}`}` : ""}
        </Text>
        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>
      </Card.Content>
      <Card.Actions>
        {evento.casa ? <Button onPress={() => router.push(`/guardia/casa/${evento.casa!.id}`)}>Ver casa</Button> : null}
        {estado === "PENDIENTE" ? (
          <Button mode="contained" onPress={() => tomar.mutate()} loading={tomar.isPending}>
            Tomar
          </Button>
        ) : null}
        {estado === "PENDIENTE" || (estado === "EN_CURSO" && mia) ? (
          <Button mode={estado === "EN_CURSO" ? "contained" : "outlined"} onPress={() => { setError(null); setResolviendo(true); }}>
            Cerrar
          </Button>
        ) : null}
      </Card.Actions>

      <Portal>
        <Dialog visible={resolviendo} onDismiss={() => setResolviendo(false)}>
          <Dialog.Title>Cerrar alerta</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <SegmentedButtons
              value={resultado}
              onValueChange={(v) => setResultado(v as typeof resultado)}
              buttons={[
                { value: "RESUELTO", label: "Resuelta" },
                { value: "FALSA_ALARMA", label: "Falsa alarma" },
              ]}
            />
            <TextInput label="Nota (opcional)" mode="outlined" multiline value={nota} onChangeText={setNota} placeholder="¿Qué pasó?" />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setResolviendo(false)}>Cancelar</Button>
            <Button onPress={() => resolver.mutate()} loading={resolver.isPending}>
              Confirmar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Card>
  );
}

const estilos = StyleSheet.create({
  tarjeta: { marginBottom: 12, borderLeftWidth: 6 },
  cabecera: { flexDirection: "row", alignItems: "center", gap: 8 },
});
