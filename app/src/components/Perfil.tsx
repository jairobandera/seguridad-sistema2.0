import { useEffect, useState } from "react";
import { Linking, ScrollView } from "react-native";
import { Banner, Button, Card, List, Snackbar, Text, useTheme } from "react-native-paper";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as Application from "expo-application";
import { yo } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import { API_URL } from "@/config";
import { useSesion } from "@/store/sesion";
import { permisoPush, registrarPush } from "@/push/notificaciones";
import { cerrarSesion } from "@/sesion/acciones";
import { nombreCompleto } from "@/utils/formato";
import { formatoTelefono } from "@/utils/telefono";

const ROLES = { ADMIN: "Administrador", GUARDIA: "Guardia", CLIENTE: "Cliente" } as const;

/** Datos de la cuenta, notificaciones y cierre de sesión (todos los roles). */
export function Perfil() {
  const tema = useTheme();
  const qc = useQueryClient();
  const usuario = useSesion((s) => s.usuario);
  const [conPermiso, setConPermiso] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);

  useEffect(() => {
    permisoPush().then(setConPermiso);
  }, []);

  if (!usuario) return null;

  const probar = async () => {
    setProbando(true);
    try {
      const r = await registrarPush();
      if (r === "sin_permiso") {
        setConPermiso(false);
        return;
      }
      if (r === "sin_proyecto") return setAviso("Las notificaciones push se activan cuando la app está compilada con EAS (ver la guía).");
      if (r === "emulador") return setAviso("Las notificaciones push solo funcionan en un celular real.");
      await yo.pruebaPush();
      setAviso("Te mandamos una notificación de prueba");
    } catch (e) {
      setAviso(mensajeDeError(e));
    } finally {
      setProbando(false);
    }
  };

  return (
    <>
      <Banner
        visible={!conPermiso}
        icon="bell-off"
        actions={[{ label: "Abrir ajustes", onPress: () => Linking.openSettings() }]}
      >
        Las notificaciones están desactivadas: no te vamos a poder avisar si pasa algo. Activalas en los ajustes del celular.
      </Banner>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Card>
          <Card.Title title={nombreCompleto(usuario)} subtitle={ROLES[usuario.rol]} />
          <List.Item title="Email" description={usuario.email} left={(p) => <List.Icon {...p} icon="email-outline" />} />
          <List.Item
            title="Teléfono"
            description={usuario.telefono ? formatoTelefono(usuario.telefono) : "No cargado (pedile a la administración)"}
            left={(p) => <List.Icon {...p} icon="phone" />}
          />
        </Card>
        <Button mode="outlined" icon="bell-ring" onPress={probar} loading={probando}>
          Probar notificación
        </Button>
        <Button mode="outlined" icon="lock-reset" onPress={() => router.push("/cambiar-password")}>
          Cambiar contraseña
        </Button>
        <Button mode="contained" icon="logout" buttonColor={tema.colors.error} onPress={() => cerrarSesion(qc)}>
          Cerrar sesión
        </Button>
        <Text variant="bodySmall" style={{ textAlign: "center", color: tema.colors.onSurfaceVariant }}>
          Versión {Application.nativeApplicationVersion ?? "dev"} · {API_URL}
        </Text>
      </ScrollView>
      <Snackbar visible={!!aviso} onDismiss={() => setAviso(null)} duration={4000}>
        {aviso}
      </Snackbar>
    </>
  );
}
