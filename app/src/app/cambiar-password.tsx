import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Appbar, Button, HelperText, Text, TextInput, useTheme } from "react-native-paper";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { auth } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import { useSesion } from "@/store/sesion";
import { cerrarSesion, rutaInicio } from "@/sesion/acciones";
import { reconectarTiempoReal } from "@/realtime/socket";

export default function CambiarPassword() {
  const tema = useTheme();
  const qc = useQueryClient();
  const usuario = useSesion((s) => s.usuario);
  const obligatorio = !!usuario?.debeCambiarPassword;
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (nueva.length < 8) return setError("La nueva contraseña debe tener al menos 8 caracteres");
    if (nueva !== repetir) return setError("Las contraseñas no coinciden");
    setEnviando(true);
    setError(null);
    try {
      const sesion = await auth.cambiarPassword(actual, nueva);
      await useSesion.getState().guardar(sesion);
      reconectarTiempoReal();
      router.replace(rutaInicio(sesion.usuario.rol));
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Appbar.Header>
        {obligatorio ? null : <Appbar.BackAction onPress={() => router.back()} />}
        <Appbar.Content title="Cambiar contraseña" />
        {obligatorio ? <Appbar.Action icon="logout" onPress={() => cerrarSesion(qc)} /> : null}
      </Appbar.Header>
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        {obligatorio ? (
          <Text variant="bodyLarge" style={{ marginBottom: 16, color: tema.colors.onSurfaceVariant }}>
            Por seguridad, elegí una contraseña nueva para tu cuenta. La contraseña actual es la que te dio la administración.
          </Text>
        ) : null}
        <TextInput label="Contraseña actual" mode="outlined" secureTextEntry value={actual} onChangeText={setActual} />
        <TextInput label="Nueva contraseña (mínimo 8)" mode="outlined" secureTextEntry value={nueva} onChangeText={setNueva} style={{ marginTop: 12 }} />
        <TextInput label="Repetir nueva contraseña" mode="outlined" secureTextEntry value={repetir} onChangeText={setRepetir} style={{ marginTop: 12 }} />
        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>
        <Button mode="contained" onPress={guardar} loading={enviando} disabled={enviando || !actual || !nueva}>
          Guardar
        </Button>
      </ScrollView>
    </>
  );
}

const estilos = StyleSheet.create({ contenido: { padding: 24 } });
