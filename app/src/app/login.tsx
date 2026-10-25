import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Button, HelperText, useTheme } from "react-native-paper";
import { Marca } from "@/components/Marca";
import { Campo } from "@/components/Campo";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { auth } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import { iniciarSesion } from "@/sesion/acciones";

export default function Login() {
  const tema = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entrar = async () => {
    if (!email.trim() || !password) return setError("Completá tu email y contraseña");
    setEnviando(true);
    setError(null);
    try {
      await iniciarSesion(await auth.login(email.trim(), password));
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tema.colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          <View style={estilos.logo}>
            <Marca tamano={112} lema="Tu casa protegida, en tu celular" />
          </View>

          <Campo
            label="Email"
            mode="outlined"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            left={<Campo.Icon icon="email-outline" />}
          />
          <Campo
            label="Contraseña"
            mode="outlined"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!verClave}
            style={{ marginTop: 12 }}
            left={<Campo.Icon icon="lock-outline" />}
            right={<Campo.Icon icon={verClave ? "eye-off" : "eye"} onPress={() => setVerClave((v) => !v)} />}
            onSubmitEditing={entrar}
          />
          <HelperText type="error" visible={!!error}>
            {error}
          </HelperText>
          <Button mode="contained" onPress={entrar} loading={enviando} disabled={enviando} contentStyle={{ paddingVertical: 8 }}>
            Ingresar
          </Button>
          <Button style={{ marginTop: 12 }} onPress={() => router.push("/olvide-password")}>
            Olvidé mi contraseña
          </Button>
          <Button onPress={() => router.push("/registro")}>¿No tenés cuenta? Creala</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  contenido: { flexGrow: 1, justifyContent: "center", padding: 24 },
  logo: { alignItems: "center", marginBottom: 36 },
});
