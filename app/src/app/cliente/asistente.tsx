import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Card, Chip, HelperText, Icon, List, Text, useTheme } from "react-native-paper";
import { Campo } from "@/components/Campo";
import { router, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { casas, placas } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import { API_URL } from "@/config";
import {
  bluetoothDisponible,
  bluetoothEncendido,
  buscarPlacas,
  ConexionPlaca,
  pedirPermisos,
  type PlacaEncontrada,
  type RedWifi,
} from "@/ble/placa";
import { colores } from "@/tema";

type Paso = "intro" | "buscar" | "conectando" | "redes" | "clave" | "configurando" | "restableciendo" | "listo" | "error";

// Nombres rápidos para el dispositivo nuevo (también se puede escribir otro)
const NOMBRES_SUGERIDOS = ["Puerta principal", "Puerta trasera", "Ventana", "Garage", "Portón"];

const FASES: { fase: string; texto: string; soloNueva?: boolean }[] = [
  { fase: "wifi_conectando", texto: "Conectando al WiFi" },
  { fase: "wifi_ok", texto: "WiFi conectado" },
  { fase: "vinculando", texto: "Vinculando con tu casa", soloNueva: true },
  { fase: "vinculada", texto: "Dispositivo vinculado", soloNueva: true },
  { fase: "mqtt_ok", texto: "Conectado al servidor" },
];

export default function Asistente() {
  const tema = useTheme();
  const qc = useQueryClient();
  // nueva: agregar · wifi: cambiar el WiFi · reset: dejarlo de fábrica por Bluetooth (no está en internet)
  const p = useLocalSearchParams<{
    casaId: string;
    modo: "nueva" | "wifi" | "reset";
    dispositivoId?: string;
    deviceId?: string;
    bleAbierto?: string;
  }>();
  const casaId = Number(p.casaId);
  const modoWifi = p.modo === "wifi";
  const modoReset = p.modo === "reset";
  // Un dispositivo que ya es de la casa: se busca solo ese
  const conocido = modoWifi || modoReset;

  const [paso, setPaso] = useState<Paso>("intro");
  const [error, setError] = useState<string | null>(null);
  const [encontradas, setEncontradas] = useState<PlacaEncontrada[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [redes, setRedes] = useState<RedWifi[]>([]);
  const [cargandoRedes, setCargandoRedes] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ssid, setSsid] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [fases, setFases] = useState<string[]>([]);
  const conexion = useRef<ConexionPlaca | null>(null);
  const detenerBusqueda = useRef<(() => void) | null>(null);

  // Al salir de la pantalla: corta la búsqueda y la conexión Bluetooth
  useEffect(
    () => () => {
      detenerBusqueda.current?.();
      conexion.current?.desconectar();
    },
    [],
  );

  const fallar = (msg: string) => {
    detenerBusqueda.current?.();
    setError(msg);
    setPaso("error");
  };

  const buscar = useCallback(async () => {
    setError(null);
    if (!bluetoothDisponible()) {
      return fallar("Esta versión de la app no tiene Bluetooth (Expo Go no lo soporta). Instalá la app de prueba que generamos con EAS.");
    }
    if (!(await pedirPermisos())) return fallar("Necesitamos el permiso de Bluetooth para encontrar el dispositivo. Activalo en los ajustes del celular.");
    if (!(await bluetoothEncendido())) return fallar("Prendé el Bluetooth del celular y volvé a intentar.");
    setEncontradas([]);
    setPaso("buscar");
    setBuscando(true);
    detenerBusqueda.current?.();
    detenerBusqueda.current = buscarPlacas(
      (placa) =>
        setEncontradas((l) => {
          if (conocido && p.deviceId && !placa.nombre.endsWith(p.deviceId.slice(-4))) return l;
          return l.some((x) => x.id === placa.id) ? l : [...l, placa];
        }),
      (msg) => fallar(`Error de Bluetooth: ${msg}`),
    );
    setTimeout(() => {
      detenerBusqueda.current?.();
      setBuscando(false);
    }, 15000);
  }, [conocido, p.deviceId]);

  const elegirPlaca = async (placa: PlacaEncontrada) => {
    detenerBusqueda.current?.();
    setBuscando(false);
    setPaso("conectando");
    try {
      const c = new ConexionPlaca();
      c.alDesconectar = () => setPaso((actual) => (actual === "listo" ? actual : "error"));
      await c.conectar(placa.id);
      conexion.current = c;
      const info = await c.info();
      if (conocido && p.deviceId && info.id !== p.deviceId) {
        await c.desconectar();
        return fallar("Ese no es el dispositivo que querés configurar. Elegí el que corresponde.");
      }
      if (modoReset) return restablecer(c);
      if (!modoWifi && info.vinculada) {
        await c.desconectar();
        return fallar(
          "Este dispositivo ya está configurado. Si es de tu casa, usá “Cambiar WiFi” desde la pestaña Dispositivos. Si no, dejalo de fábrica manteniendo su botón BOOT 15 segundos.",
        );
      }
      setPaso("redes");
      cargarRedes();
    } catch (e) {
      fallar(`No se pudo conectar con el dispositivo. Acercate y volvé a intentar. (${mensajeDeError(e)})`);
    }
  };

  const restablecer = async (c: ConexionPlaca) => {
    setPaso("restableciendo");
    try {
      const { token } = await placas.tokenConfig(Number(p.dispositivoId));
      // Al confirmar, la placa se reinicia y corta el Bluetooth: no es un error
      c.alDesconectar = undefined;
      await c.restablecer(token);
      await c.desconectar();
      await placas.desvincular(Number(p.dispositivoId));
      qc.invalidateQueries({ queryKey: ["casas"] });
      setPaso("listo");
    } catch (e) {
      await c.desconectar();
      fallar(`No se pudo restablecer el dispositivo. (${mensajeDeError(e)})`);
    }
  };

  const cargarRedes = async () => {
    if (!conexion.current) return;
    setCargandoRedes(true);
    try {
      setRedes(await conexion.current.escanearRedes());
    } catch {
      setRedes([]);
    } finally {
      setCargandoRedes(false);
    }
  };

  const configurar = async () => {
    if (!conexion.current) return;
    setPaso("configurando");
    setFases([]);
    try {
      const credencial = modoWifi
        ? { token: (await placas.tokenConfig(Number(p.dispositivoId))).token }
        : { codigo: (await casas.codigoVinculacion(casaId, nombre.trim())).codigo };
      await conexion.current.configurar({ ssid, pass: clave, api: API_URL, ...credencial }, (fase) => setFases((f) => [...f, fase]));
      setPaso("listo");
      qc.invalidateQueries({ queryKey: ["casas"] });
      conexion.current.desconectar();
    } catch (e) {
      // Errores de WiFi: se puede reintentar con otra clave sin volver a buscar
      setError(mensajeDeError(e));
      setPaso("clave");
    }
  };

  const titulo = modoReset ? "Restablecer por Bluetooth" : modoWifi ? "Cambiar WiFi del dispositivo" : "Agregar dispositivo";

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={titulo} />
      </Appbar.Header>
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        {paso === "intro" ? (
          <Card>
            <Card.Content style={{ gap: 12 }}>
              {!modoWifi ? (
                <>
                  <Text variant="titleMedium">¿Dónde lo vas a poner?</Text>
                  <View style={estilos.chips}>
                    {NOMBRES_SUGERIDOS.map((n) => (
                      <Chip key={n} selected={nombre === n} onPress={() => setNombre(n)}>
                        {n}
                      </Chip>
                    ))}
                  </View>
                  <Campo label="Nombre del dispositivo" mode="outlined" value={nombre} onChangeText={setNombre} maxLength={40} />
                </>
              ) : null}
              <Text variant="titleMedium">Antes de empezar</Text>
              {modoReset ? (
                <Paso1 icono="restore-alert" texto="El dispositivo va a borrar su WiFi y quedar desvinculado de tu casa. Para volver a usarlo, agregalo de nuevo." />
              ) : null}
              {conocido ? (
                p.bleAbierto === "1" ? (
                  <Paso1 icono="check-circle" texto="El dispositivo ya abrió su Bluetooth (su luz parpadea rápido)." />
                ) : (
                  <Paso1
                    icono="gesture-tap-hold"
                    texto="Si está sin WiFi hace más de 5 minutos, ya abrió su Bluetooth solo (su luz parpadea rápido). Si no, mantené apretado su botón BOOT 5 segundos."
                  />
                )
              ) : (
                <Paso1 icono="power-plug" texto="Enchufá el dispositivo. Su luz azul tiene que parpadear rápido." />
              )}
              <Paso1 icono="bluetooth" texto="Prendé el Bluetooth del celular y quedate cerca del dispositivo." />
              {!modoReset ? (
                <Paso1 icono="wifi" texto="Tené a mano la clave de tu WiFi. El dispositivo solo funciona con redes de 2,4 GHz." />
              ) : null}
            </Card.Content>
            <Card.Actions>
              <Button mode="contained" onPress={buscar} disabled={!modoWifi && !nombre.trim()}>
                Buscar dispositivo
              </Button>
            </Card.Actions>
          </Card>
        ) : null}

        {paso === "buscar" ? (
          <Card>
            <Card.Title title="Elegí tu dispositivo" subtitle={buscando ? "Buscando dispositivos cercanos..." : "Búsqueda terminada"} right={() => (buscando ? <ActivityIndicator style={{ marginRight: 16 }} /> : null)} />
            {encontradas.map((pl) => (
              <List.Item key={pl.id} title={pl.nombre} description="Tocá para conectar" left={(pp) => <List.Icon {...pp} icon="chip" />} onPress={() => elegirPlaca(pl)} />
            ))}
            {!buscando && encontradas.length === 0 ? (
              <Card.Content>
                <Text>No encontramos ningún dispositivo. Verificá que su luz parpadee rápido y que estés cerca.</Text>
              </Card.Content>
            ) : null}
            <Card.Actions>
              <Button onPress={buscar} disabled={buscando}>
                Buscar de nuevo
              </Button>
            </Card.Actions>
          </Card>
        ) : null}

        {paso === "conectando" ? <Esperando texto="Conectando con el dispositivo..." /> : null}
        {paso === "restableciendo" ? <Esperando texto="Restableciendo el dispositivo..." /> : null}

        {paso === "redes" ? (
          <Card>
            <Card.Title title="Elegí tu red WiFi" subtitle="Solo aparecen las redes compatibles (2,4 GHz)" right={() => (cargandoRedes ? <ActivityIndicator style={{ marginRight: 16 }} /> : null)} />
            {redes.map((r) => (
              <List.Item
                key={r.ssid}
                title={r.ssid}
                left={(pp) => <List.Icon {...pp} icon={r.seguro ? "wifi-lock" : "wifi"} />}
                onPress={() => {
                  setSsid(r.ssid);
                  setError(null);
                  setPaso("clave");
                }}
              />
            ))}
            {!cargandoRedes && redes.length === 0 ? (
              <Card.Content>
                <Text>No se encontraron redes. Podés buscar de nuevo o escribir el nombre a mano.</Text>
              </Card.Content>
            ) : null}
            <Card.Actions>
              <Button onPress={cargarRedes} disabled={cargandoRedes}>
                Buscar redes
              </Button>
              <Button
                onPress={() => {
                  setSsid("");
                  setPaso("clave");
                }}
              >
                Escribir a mano
              </Button>
            </Card.Actions>
          </Card>
        ) : null}

        {paso === "clave" ? (
          <Card>
            <Card.Content style={{ gap: 12 }}>
              <Campo label="Nombre de la red (SSID)" mode="outlined" value={ssid} onChangeText={setSsid} autoCapitalize="none" />
              <Campo
                label="Contraseña del WiFi"
                mode="outlined"
                value={clave}
                onChangeText={setClave}
                secureTextEntry={!verClave}
                autoCapitalize="none"
                right={<Campo.Icon icon={verClave ? "eye-off" : "eye"} onPress={() => setVerClave((v) => !v)} />}
              />
              <HelperText type="error" visible={!!error}>
                {error}
              </HelperText>
            </Card.Content>
            <Card.Actions>
              <Button onPress={() => setPaso("redes")}>Otra red</Button>
              <Button mode="contained" onPress={configurar} disabled={!ssid.trim()}>
                Conectar
              </Button>
            </Card.Actions>
          </Card>
        ) : null}

        {paso === "configurando" ? (
          <Card>
            <Card.Title title="Configurando el dispositivo" subtitle="Puede tardar hasta un minuto" />
            <Card.Content>
              {FASES.filter((f) => !(f.soloNueva && modoWifi)).map((f) => {
                const hecha = fases.includes(f.fase);
                return (
                  <View key={f.fase} style={estilos.fase}>
                    {hecha ? <Icon source="check-circle" size={22} color={colores.ok} /> : <ActivityIndicator size={18} />}
                    <Text style={{ opacity: hecha ? 1 : 0.6 }}>{f.texto}</Text>
                  </View>
                );
              })}
            </Card.Content>
          </Card>
        ) : null}

        {paso === "listo" ? (
          <View style={estilos.centro}>
            <Icon source="check-decagram" size={96} color={colores.ok} />
            <Text variant="headlineSmall" style={{ marginTop: 16, textAlign: "center" }}>
              {modoReset ? "Quedó de fábrica y desvinculado" : modoWifi ? "¡WiFi actualizado!" : `¡Listo! ${nombre.trim()} quedó vinculado`}
            </Text>
            <Text style={{ marginTop: 8, textAlign: "center", color: tema.colors.onSurfaceVariant }}>
              {modoReset ? "Para volver a usarlo, agregalo de nuevo desde Dispositivos." : "Ya podés armar la alarma desde el inicio."}
            </Text>
            <Button mode="contained" style={{ marginTop: 24 }} onPress={() => router.navigate("/cliente")}>
              Ir al inicio
            </Button>
          </View>
        ) : null}

        {paso === "error" ? (
          <View style={estilos.centro}>
            <Icon source="alert-circle" size={72} color={colores.peligro} />
            <Text variant="titleMedium" style={{ marginTop: 16, textAlign: "center" }}>
              {error ?? "Se perdió la conexión con el dispositivo."}
            </Text>
            <Button mode="contained" style={{ marginTop: 24 }} onPress={buscar}>
              Volver a intentar
            </Button>
            {Platform.OS === "android" ? (
              <Button style={{ marginTop: 8 }} onPress={() => Linking.openSettings()}>
                Abrir ajustes del celular
              </Button>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

function Paso1({ icono, texto }: { icono: string; texto: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
      <Icon source={icono} size={28} />
      <Text style={{ flex: 1 }} variant="bodyLarge">
        {texto}
      </Text>
    </View>
  );
}

function Esperando({ texto }: { texto: string }) {
  return (
    <View style={estilos.centro}>
      <ActivityIndicator size="large" />
      <Text style={{ marginTop: 16 }}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, paddingBottom: 40 },
  centro: { alignItems: "center", padding: 24, marginTop: 24 },
  fase: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
