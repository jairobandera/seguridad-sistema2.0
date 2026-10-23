import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Appbar, Button, Card, Dialog, FAB, HelperText, IconButton, Portal, Snackbar, Switch, Text, useTheme } from "react-native-paper";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { admin } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import type { Barrio, ResumenCasas } from "@/api/tipos";
import { Campo } from "@/components/Campo";
import { CodigoCompartir } from "@/components/CodigoCompartir";
import { Cargando, ErrorReintentar } from "@/components/Estados";
import { colores } from "@/tema";

/** Todos los sistemas que se brindan: barrios (con o sin guardia) y casas individuales. */
export default function Sistemas() {
  const tema = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "sistemas"], queryFn: admin.sistemas });
  const [editando, setEditando] = useState<Barrio | "nuevo" | null>(null);
  const [nombre, setNombre] = useState("");
  const [conGuardia, setConGuardia] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const refrescar = () => qc.invalidateQueries({ queryKey: ["admin"] });

  const abrir = (b: Barrio | "nuevo") => {
    setEditando(b);
    setNombre(b === "nuevo" ? "" : b.nombre);
    setConGuardia(b === "nuevo" ? true : b.tieneGuardia);
    setError(null);
  };

  const guardar = async () => {
    if (!editando) return;
    setGuardando(true);
    try {
      if (editando === "nuevo") await admin.crearBarrio({ nombre: nombre.trim(), tieneGuardia: conGuardia });
      else await admin.editarBarrio(editando.id, { nombre: nombre.trim(), tieneGuardia: conGuardia });
      setEditando(null);
      refrescar();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const cambiarGuardia = async (b: Barrio, valor: boolean) => {
    try {
      await admin.editarBarrio(b.id, { tieneGuardia: valor });
      setAviso(valor ? `${b.nombre}: guardia activada` : `${b.nombre}: guardia desactivada`);
      refrescar();
    } catch (e) {
      setAviso(mensajeDeError(e));
    }
  };

  const s = q.data;

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Sistemas" />
      </Appbar.Header>
      {q.isLoading ? (
        <Cargando />
      ) : q.error || !s ? (
        <ErrorReintentar error={q.error} alReintentar={q.refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 12 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
        >
          <Text variant="titleMedium">Barrios</Text>
          {s.barrios.length === 0 ? (
            <Text style={{ color: tema.colors.onSurfaceVariant }}>Todavía no hay barrios. Creá el primero con el botón de abajo.</Text>
          ) : null}
          {s.barrios.map((b) => (
            <Card key={b.id} style={{ opacity: b.activo ? 1 : 0.5 }} onPress={() => router.navigate({ pathname: "/admin/casas", params: { barrioId: b.id } })}>
              <Card.Title
                title={b.nombre}
                subtitle={b.tieneGuardia ? `Con guardia · ${b.guardias.length ? b.guardias.map((g) => g.nombre).join(", ") : "sin guardias asignados"}` : "Sin guardia"}
                right={() => <IconButton icon="pencil" onPress={() => abrir(b)} />}
              />
              <Card.Content>
                <Resumen r={b} />
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                  <Text variant="bodyLarge">Guardia</Text>
                  <Switch value={b.tieneGuardia} onValueChange={(v) => cambiarGuardia(b, v)} />
                </View>
                <View style={{ marginTop: 8 }}>
                  <CodigoCompartir
                    titulo="Código para que los vecinos se registren"
                    codigo={b.codigoRegistro}
                    mensaje={(c) => `Para usar la alarma de ${b.nombre}, bajá la app Seguridad Hogar, tocá "Crear cuenta" y poné el código ${c}`}
                    generar={async () => {
                      await admin.codigoBarrio(b.id);
                      refrescar();
                    }}
                    avisar={setAviso}
                  />
                </View>
              </Card.Content>
            </Card>
          ))}

          <Text variant="titleMedium" style={{ marginTop: 8 }}>
            Individuales
          </Text>
          <Card onPress={() => router.navigate({ pathname: "/admin/casas", params: { paquete: "INDIVIDUAL" } })}>
            <Card.Title title="Casas individuales" subtitle="Sin guardia: avisan al dueño, la familia y por SMS" />
            <Card.Content>
              <Resumen r={s.individuales} />
            </Card.Content>
          </Card>
        </ScrollView>
      )}

      <FAB
        icon="map-marker-plus"
        label="Nuevo barrio"
        style={{ position: "absolute", right: 16, bottom: 16, backgroundColor: tema.colors.primaryContainer }}
        onPress={() => abrir("nuevo")}
      />

      <Portal>
        <Dialog visible={!!editando} onDismiss={() => setEditando(null)}>
          <Dialog.Title>{editando === "nuevo" ? "Nuevo barrio" : "Editar barrio"}</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <Campo label="Nombre del barrio" mode="outlined" value={nombre} onChangeText={setNombre} maxLength={80} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text variant="bodyLarge">Tiene guardia</Text>
              <Switch value={conGuardia} onValueChange={setConGuardia} />
            </View>
            <HelperText type="error" visible={!!error}>
              {error}
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditando(null)}>Cancelar</Button>
            <Button onPress={guardar} disabled={!nombre.trim() || guardando} loading={guardando}>
              Guardar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar visible={!!aviso} onDismiss={() => setAviso(null)} duration={3000}>
        {aviso}
      </Snackbar>
    </>
  );
}

function Resumen({ r }: { r: ResumenCasas }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
      <Dato valor={r.casas} texto={r.casas === 1 ? "casa" : "casas"} />
      <Dato valor={r.casasArmadas} texto={r.casasArmadas === 1 ? "armada" : "armadas"} />
      <Dato valor={r.dispositivos} texto={r.dispositivos === 1 ? "dispositivo" : "dispositivos"} />
      {r.dispositivosOffline ? <Dato valor={r.dispositivosOffline} texto="sin conexión" color={colores.peligro} /> : null}
    </View>
  );
}

function Dato({ valor, texto, color }: { valor: number; texto: string; color?: string }) {
  return (
    <Text variant="bodyMedium" style={color ? { color } : undefined}>
      <Text variant="titleMedium" style={color ? { color } : undefined}>
        {valor}
      </Text>{" "}
      {texto}
    </Text>
  );
}
