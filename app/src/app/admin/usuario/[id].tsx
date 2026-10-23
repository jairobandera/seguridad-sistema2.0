import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Appbar, Button, Chip, Dialog, HelperText, Portal, SegmentedButtons, Snackbar, Switch, Text } from "react-native-paper";
import { Campo } from "@/components/Campo";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { admin } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import type { Rol, UsuarioAdmin } from "@/api/tipos";
import { useSesion } from "@/store/sesion";
import { ClaveTemporal } from "@/components/ClaveTemporal";
import { Cargando } from "@/components/Estados";
import { normalizarTelefono } from "@/utils/telefono";

export default function PantallaUsuario() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const nuevo = id === "nuevo";
  const usuarios = useQuery({ queryKey: ["admin", "usuarios", "", undefined], queryFn: () => admin.usuarios(), enabled: !nuevo });
  if (!nuevo && usuarios.isLoading) return <Cargando />;
  const existente = usuarios.data?.find((u) => u.id === Number(id)) ?? null;
  return <UsuarioForm key={existente?.id ?? "nuevo"} id={id} existente={existente} />;
}

function UsuarioForm({ id, existente }: { id: string; existente: UsuarioAdmin | null }) {
  const nuevo = !existente;
  const yo = useSesion((s) => s.usuario);
  const qc = useQueryClient();
  const barrios = useQuery({ queryKey: ["admin", "barrios"], queryFn: admin.barrios });

  const [nombre, setNombre] = useState(existente?.nombre ?? "");
  const [apellido, setApellido] = useState(existente?.apellido ?? "");
  const [email, setEmail] = useState(existente?.email ?? "");
  const [telefono, setTelefono] = useState(existente?.telefono ?? "");
  const [rol, setRol] = useState<Rol>(existente?.rol ?? "CLIENTE");
  const [activo, setActivo] = useState(existente?.activo ?? true);
  const [barrioIds, setBarrioIds] = useState<number[]>(existente?.barrioIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [clave, setClave] = useState<string | null>(null);
  const [confirmarReset, setConfirmarReset] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const tel = telefono.trim() ? normalizarTelefono("AR", telefono) : { e164: null, lindo: "" };
  const soyYo = existente?.id === yo?.id;

  const guardar = async () => {
    if (!nombre.trim() || !apellido.trim() || !email.includes("@")) return setError("Completá nombre, apellido y email");
    if (telefono.trim() && !tel.e164) return setError("El teléfono no es válido");
    setGuardando(true);
    setError(null);
    try {
      const datos = {
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim(),
        telefono: tel.e164,
        rol,
        ...(rol === "GUARDIA" ? { barrioIds } : {}),
      };
      if (nuevo) {
        const r = await admin.crearUsuario(datos);
        qc.invalidateQueries({ queryKey: ["admin", "usuarios"] });
        setClave(r.passwordTemporal);
      } else {
        await admin.editarUsuario(Number(id), { ...datos, activo });
        qc.invalidateQueries({ queryKey: ["admin", "usuarios"] });
        router.back();
      }
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const resetear = async () => {
    setConfirmarReset(false);
    try {
      setClave((await admin.resetPassword(Number(id))).passwordTemporal);
      qc.invalidateQueries({ queryKey: ["admin", "usuarios"] });
    } catch (e) {
      setAviso(mensajeDeError(e));
    }
  };

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={nuevo ? "Nuevo usuario" : "Editar usuario"} />
      </Appbar.Header>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Campo label="Nombre" mode="outlined" value={nombre} onChangeText={setNombre} />
        <Campo label="Apellido" mode="outlined" value={apellido} onChangeText={setApellido} />
        <Campo label="Email" mode="outlined" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Campo
          label="Celular (opcional, recibe los SMS de alarma)"
          mode="outlined"
          keyboardType="phone-pad"
          value={telefono}
          onChangeText={setTelefono}
          placeholder="11 2345 6789 o +598 99 123 456"
        />
        {telefono.trim() ? <HelperText type={tel.e164 ? "info" : "error"}>{tel.e164 ? `Se guardará como ${tel.lindo}` : "Número inválido"}</HelperText> : null}
        <Text variant="labelLarge">Rol</Text>
        <SegmentedButtons
          value={rol}
          onValueChange={(v) => setRol(v as Rol)}
          buttons={[
            { value: "CLIENTE", label: "Cliente", disabled: soyYo },
            { value: "GUARDIA", label: "Guardia", disabled: soyYo },
            { value: "ADMIN", label: "Admin", disabled: soyYo },
          ]}
        />
        {rol === "GUARDIA" ? (
          <>
            <Text variant="labelLarge">Barrios que cuida</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(barrios.data ?? []).map((b) => (
                <Chip
                  key={b.id}
                  selected={barrioIds.includes(b.id)}
                  onPress={() => setBarrioIds((l) => (l.includes(b.id) ? l.filter((x) => x !== b.id) : [...l, b.id]))}
                >
                  {b.nombre}
                  {b.tieneGuardia ? "" : " (sin guardia)"}
                </Chip>
              ))}
            </View>
            <HelperText type="info">
              {barrios.data?.length
                ? "Solo ve y recibe las alarmas de las casas de estos barrios (si el barrio tiene la guardia activada)."
                : "No hay barrios: crealos en la pestaña Sistemas."}
            </HelperText>
          </>
        ) : null}
        {!nuevo ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <Text variant="bodyLarge">Usuario activo</Text>
            <Switch value={activo} onValueChange={setActivo} disabled={soyYo} />
          </View>
        ) : (
          <Text variant="bodySmall">Se genera una contraseña temporal que el usuario cambia al entrar por primera vez.</Text>
        )}
        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>
        <Button mode="contained" onPress={guardar} loading={guardando} disabled={guardando}>
          {nuevo ? "Crear usuario" : "Guardar cambios"}
        </Button>
        {!nuevo ? (
          <Button mode="outlined" icon="lock-reset" onPress={() => setConfirmarReset(true)}>
            Restablecer contraseña
          </Button>
        ) : null}
      </ScrollView>

      <ClaveTemporal
        clave={clave}
        email={email}
        alCerrar={() => {
          setClave(null);
          router.back();
        }}
      />
      <Portal>
        <Dialog visible={confirmarReset} onDismiss={() => setConfirmarReset(false)}>
          <Dialog.Title>¿Restablecer la contraseña?</Dialog.Title>
          <Dialog.Content>
            <Text>Se cierra la sesión del usuario en todos sus celulares y se genera una contraseña temporal.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmarReset(false)}>Cancelar</Button>
            <Button onPress={resetear}>Restablecer</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar visible={!!aviso} onDismiss={() => setAviso(null)}>
        {aviso}
      </Snackbar>
    </>
  );
}
