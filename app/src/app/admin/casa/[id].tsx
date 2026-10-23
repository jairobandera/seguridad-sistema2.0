import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Appbar, Button, Card, Chip, Dialog, HelperText, IconButton, List, Portal, Searchbar, SegmentedButtons, Switch, Text } from "react-native-paper";
import { Campo, sinSugerencias } from "@/components/Campo";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { admin, placas } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import type { CasaAdmin, DispositivoAdmin, Paquete, RolCasa } from "@/api/tipos";
import { Cargando } from "@/components/Estados";
import { haceCuanto, nombreCompleto } from "@/utils/formato";

interface MiembroForm {
  usuarioId: number;
  rol: RolCasa;
  nombre: string;
  email: string;
}

export default function PantallaCasa() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const nueva = id === "nueva";
  const casa = useQuery({ queryKey: ["admin", "casa", id], queryFn: () => admin.casa(Number(id)), enabled: !nueva });
  if (!nueva && casa.isLoading) return <Cargando />;
  return <CasaForm key={casa.data?.id ?? "nueva"} id={id} casa={casa.data ?? null} />;
}

function CasaForm({ id, casa }: { id: string; casa: CasaAdmin | null }) {
  const nueva = !casa;
  const qc = useQueryClient();
  const clientes = useQuery({ queryKey: ["admin", "usuarios", "", "CLIENTE"], queryFn: () => admin.usuarios({ rol: "CLIENTE" }) });
  const barrios = useQuery({ queryKey: ["admin", "barrios"], queryFn: admin.barrios });

  const [nombre, setNombre] = useState(casa?.nombre ?? "");
  const [calle, setCalle] = useState(casa?.calle ?? "");
  const [numero, setNumero] = useState(casa?.numero ?? "");
  const [manzana, setManzana] = useState(casa?.manzana ?? "");
  const [paquete, setPaquete] = useState<Paquete>(casa?.paquete ?? "BARRIO");
  const [barrioId, setBarrioId] = useState<number | null>(casa?.barrioId ?? null);
  const [renombrando, setRenombrando] = useState<DispositivoAdmin | null>(null);
  const [nombreDisp, setNombreDisp] = useState("");
  const [retardo, setRetardo] = useState(String(casa?.retardoEntradaSeg ?? 0));
  const [activa, setActiva] = useState(casa?.activa ?? true);
  const [miembros, setMiembros] = useState<MiembroForm[]>(
    casa?.miembros.map((m) => ({ usuarioId: m.usuarioId, rol: m.rol, nombre: nombreCompleto(m), email: m.email })) ?? [],
  );
  const [eligiendo, setEligiendo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const candidatos = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return (clientes.data ?? [])
      .filter((u) => u.activo && !miembros.some((m) => m.usuarioId === u.id))
      .filter((u) => !t || `${u.nombre} ${u.apellido} ${u.email}`.toLowerCase().includes(t))
      .slice(0, 30);
  }, [clientes.data, miembros, busqueda]);

  const cambiarRol = (usuarioId: number, rol: RolCasa) =>
    setMiembros((l) => l.map((m) => (m.usuarioId === usuarioId ? { ...m, rol } : rol === "DUENO" && m.rol === "DUENO" ? { ...m, rol: "FAMILIAR" } : m)));

  const guardar = async () => {
    const seg = Number(retardo);
    if (!Number.isInteger(seg) || seg < 0 || seg > 120) return setError("El retardo debe ser entre 0 y 120 segundos");
    if (miembros.length && !miembros.some((m) => m.rol === "DUENO")) return setError("Elegí quién es el dueño de la casa");
    if (paquete === "BARRIO" && !barrioId) return setError("Elegí el barrio de la casa");
    setGuardando(true);
    setError(null);
    const datos = {
      nombre: nombre.trim() || null,
      calle: calle.trim() || null,
      numero: numero.trim() || null,
      manzana: manzana.trim() || null,
      paquete,
      barrioId: paquete === "BARRIO" ? barrioId : null,
      retardoEntradaSeg: seg,
    };
    const lista = miembros.map((m) => ({ usuarioId: m.usuarioId, rol: m.rol }));
    try {
      if (nueva) await admin.crearCasa({ ...datos, miembros: lista });
      else {
        await admin.editarCasa(Number(id), { ...datos, activa });
        await admin.miembros(Number(id), lista);
      }
      qc.invalidateQueries({ queryKey: ["admin"] });
      router.back();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const renombrar = async () => {
    if (!renombrando) return;
    try {
      await placas.renombrar(renombrando.id, nombreDisp.trim());
      setRenombrando(null);
      qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      setError(mensajeDeError(e));
      setRenombrando(null);
    }
  };

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={nueva ? "Nueva casa" : "Editar casa"} subtitle={casa?.codigo} />
      </Appbar.Header>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Campo label="Nombre (opcional, ej. Casa de Ana)" mode="outlined" value={nombre} onChangeText={setNombre} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Campo label="Calle" mode="outlined" value={calle} onChangeText={setCalle} style={{ flex: 2 }} />
          <Campo label="Número" mode="outlined" value={numero} onChangeText={setNumero} style={{ flex: 1 }} />
        </View>
        <Campo label="Manzana" mode="outlined" value={manzana} onChangeText={setManzana} />

        <Text variant="titleMedium">Paquete</Text>
        <SegmentedButtons
          value={paquete}
          onValueChange={(v) => setPaquete(v as Paquete)}
          buttons={[
            { value: "BARRIO", label: "Barrio", icon: "home-group" },
            { value: "INDIVIDUAL", label: "Individual", icon: "home" },
          ]}
        />
        {paquete === "BARRIO" ? (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(barrios.data ?? []).map((b) => (
                <Chip key={b.id} selected={barrioId === b.id} onPress={() => setBarrioId(b.id)} icon={b.tieneGuardia ? "shield-account" : undefined}>
                  {b.nombre}
                </Chip>
              ))}
            </View>
            <HelperText type="info">
              {barrios.data?.length ? "Los barrios con escudo tienen guardia." : "No hay barrios: crealos en la pestaña Sistemas."}
            </HelperText>
          </>
        ) : (
          <HelperText type="info">Casa individual: sin guardia. Las alarmas avisan al dueño, la familia y por SMS.</HelperText>
        )}
        <Campo
          label="Retardo de entrada (segundos)"
          mode="outlined"
          keyboardType="number-pad"
          value={retardo}
          onChangeText={setRetardo}
        />
        <HelperText type="info">Tiempo para desarmar al entrar antes de que suene la alarma. 0 = inmediato.</HelperText>
        {!nueva ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text variant="bodyLarge">Casa activa</Text>
            <Switch value={activa} onValueChange={setActiva} />
          </View>
        ) : null}

        <Card>
          <Card.Title title="Personas" subtitle="Un dueño y los familiares que quieras" />
          {miembros.map((m) => (
            <View key={m.usuarioId} style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1 }} variant="bodyLarge">
                  {m.nombre}
                </Text>
                <IconButton icon="close" onPress={() => setMiembros((l) => l.filter((x) => x.usuarioId !== m.usuarioId))} />
              </View>
              <SegmentedButtons
                value={m.rol}
                onValueChange={(v) => cambiarRol(m.usuarioId, v as RolCasa)}
                buttons={[
                  { value: "DUENO", label: "Dueño" },
                  { value: "FAMILIAR", label: "Familiar" },
                ]}
              />
            </View>
          ))}
          <Card.Actions>
            <Button icon="account-plus" onPress={() => setEligiendo(true)}>
              Agregar persona
            </Button>
          </Card.Actions>
        </Card>

        {casa?.dispositivos.length ? (
          <Card>
            <Card.Title title="Dispositivos" subtitle="Los vincula el dueño desde la app" />
            {casa.dispositivos.map((d) => (
              <List.Item
                key={d.id}
                title={d.nombre ?? d.deviceId}
                description={`${d.deviceId} · ${d.online ? "Online" : "Offline"} · ${d.wifiSsid ?? "—"} · ${haceCuanto(d.ultimaConexion)}`}
                left={(p) => <List.Icon {...p} icon="chip" />}
                right={() => (
                  <IconButton
                    icon="pencil"
                    onPress={() => {
                      setNombreDisp(d.nombre ?? "");
                      setRenombrando(d);
                    }}
                  />
                )}
              />
            ))}
          </Card>
        ) : null}

        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>
        <Button mode="contained" onPress={guardar} loading={guardando} disabled={guardando}>
          {nueva ? "Crear casa" : "Guardar cambios"}
        </Button>
      </ScrollView>

      <Portal>
        <Dialog visible={!!renombrando} onDismiss={() => setRenombrando(null)}>
          <Dialog.Title>Nombre del dispositivo</Dialog.Title>
          <Dialog.Content>
            <Campo label="Por ejemplo: Puerta trasera" mode="outlined" value={nombreDisp} onChangeText={setNombreDisp} maxLength={40} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRenombrando(null)}>Cancelar</Button>
            <Button onPress={renombrar} disabled={!nombreDisp.trim()}>
              Guardar
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={eligiendo} onDismiss={() => setEligiendo(false)} style={{ maxHeight: "80%" }}>
          <Dialog.Title>Elegí un cliente</Dialog.Title>
          <Dialog.Content>
            <Searchbar {...sinSugerencias} placeholder="Buscar" value={busqueda} onChangeText={setBusqueda} />
          </Dialog.Content>
          <Dialog.ScrollArea>
            <ScrollView>
              {candidatos.map((u) => (
                <List.Item
                  key={u.id}
                  title={nombreCompleto(u)}
                  description={u.email}
                  onPress={() => {
                    setMiembros((l) => [
                      ...l,
                      { usuarioId: u.id, rol: l.some((m) => m.rol === "DUENO") ? "FAMILIAR" : "DUENO", nombre: nombreCompleto(u), email: u.email },
                    ]);
                    setEligiendo(false);
                    setBusqueda("");
                  }}
                />
              ))}
              {!candidatos.length ? <Text style={{ padding: 16 }}>No hay clientes disponibles. Creá el usuario primero.</Text> : null}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setEligiendo(false)}>Cerrar</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
