import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { Appbar, Button, HelperText, Text, useTheme } from "react-native-paper";
import { router } from "expo-router";
import { Campo } from "@/components/Campo";
import { auth } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import { iniciarSesion } from "@/sesion/acciones";

/** Segundos antes de poder pedir otro código (el servidor tampoco manda dos seguidos). */
const ESPERA_REENVIO = 60;

/** "Olvidé mi contraseña": llega un código de 6 números al email y con él se elige una contraseña nueva. */
export default function OlvidePassword() {
  const tema = useTheme();
  const [email, setEmail] = useState("");
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [espera, setEspera] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const pedirCodigo = async () => {
    if (!email.trim().includes("@")) return setError("Escribí el email con el que te registraste");
    setEnviando(true);
    setError(null);
    try {
      await auth.olvidePassword(email.trim());
      setCodigoEnviado(true);
      setEspera(ESPERA_REENVIO);
      setAviso(`Si ${email.trim()} tiene una cuenta, te llegó un email con un código de 6 números. Revisá también la carpeta de spam.`);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  const cambiar = async () => {
    if (!/^\d{6}$/.test(codigo.trim())) return setError("El código tiene 6 números");
    if (nueva.length < 8) return setError("La nueva contraseña debe tener al menos 8 caracteres");
    if (nueva !== repetir) return setError("Las contraseñas no coinciden");
    setEnviando(true);
    setError(null);
    try {
      await iniciarSesion(await auth.restablecerPassword(email.trim(), codigo.trim(), nueva));
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  const otroEmail = () => {
    setCodigoEnviado(false);
    setCodigo("");
    setAviso(null);
    setError(null);
  };

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Olvidé mi contraseña" />
      </Appbar.Header>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          {!codigoEnviado ? (
            <>
              <Text variant="bodyLarge" style={[estilos.texto, { color: tema.colors.onSurfaceVariant }]}>
                Escribí el email con el que te registraste. Te vamos a mandar un código para que elijas una contraseña nueva.
              </Text>
              <Campo
                label="Email"
                mode="outlined"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                left={<Campo.Icon icon="email-outline" />}
                onSubmitEditing={pedirCodigo}
              />
              <HelperText type="error" visible={!!error}>
                {error}
              </HelperText>
              <Button mode="contained" onPress={pedirCodigo} loading={enviando} disabled={enviando} contentStyle={estilos.boton}>
                Enviar código
              </Button>
            </>
          ) : (
            <>
              <Text variant="bodyLarge" style={[estilos.texto, { color: tema.colors.onSurfaceVariant }]}>
                {aviso}
              </Text>
              <Campo
                label="Código del email"
                mode="outlined"
                value={codigo}
                onChangeText={(t) => setCodigo(t.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                left={<Campo.Icon icon="numeric" />}
                style={{ letterSpacing: 6 }}
              />
              <Campo
                label="Nueva contraseña (mínimo 8)"
                mode="outlined"
                value={nueva}
                onChangeText={setNueva}
                secureTextEntry={!verClave}
                style={{ marginTop: 12 }}
                left={<Campo.Icon icon="lock-outline" />}
                right={<Campo.Icon icon={verClave ? "eye-off" : "eye"} onPress={() => setVerClave((v) => !v)} />}
              />
              <Campo
                label="Repetir nueva contraseña"
                mode="outlined"
                value={repetir}
                onChangeText={setRepetir}
                secureTextEntry={!verClave}
                style={{ marginTop: 12 }}
                left={<Campo.Icon icon="lock-check-outline" />}
                onSubmitEditing={cambiar}
              />
              <HelperText type="error" visible={!!error}>
                {error}
              </HelperText>
              <Button mode="contained" onPress={cambiar} loading={enviando} disabled={enviando} contentStyle={estilos.boton}>
                Cambiar contraseña
              </Button>
              <Button style={{ marginTop: 12 }} onPress={pedirCodigo} disabled={enviando || espera > 0}>
                {espera > 0 ? `Reenviar código (${espera} s)` : "Reenviar código"}
              </Button>
              <Button onPress={otroEmail} disabled={enviando}>
                Usar otro email
              </Button>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 24 },
  texto: { marginBottom: 16 },
  boton: { paddingVertical: 8 },
});
