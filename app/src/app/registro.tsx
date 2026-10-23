import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Appbar, Button, HelperText, Text, useTheme } from "react-native-paper";
import { router } from "expo-router";
import { Campo } from "@/components/Campo";
import { auth } from "@/api/endpoints";
import { mensajeDeError } from "@/api/cliente";
import { iniciarSesion } from "@/sesion/acciones";
import { normalizarTelefono } from "@/utils/telefono";

/** El cliente crea su cuenta: con código de barrio, de familia o sin código (casa individual). */
export default function Registro() {
  const tema = useTheme();
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repetir, setRepetir] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [telefono, setTelefono] = useState("");
  const [codigo, setCodigo] = useState("");
  const [calle, setCalle] = useState("");
  const [numero, setNumero] = useState("");
  const [manzana, setManzana] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cod = codigo.trim().toUpperCase();
  // Con código de familia se suma a una casa que ya existe: no pide dirección
  const esFamilia = cod.startsWith("F-");
  const tel = telefono.trim() ? normalizarTelefono("AR", telefono) : { e164: null, lindo: "" };

  const crear = async () => {
    if (!nombre.trim() || !apellido.trim() || !email.includes("@")) return setError("Completá nombre, apellido y email");
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres");
    if (password !== repetir) return setError("Las contraseñas no coinciden");
    if (telefono.trim() && !tel.e164) return setError("El celular no es válido");
    if (!esFamilia && (!calle.trim() || !numero.trim())) return setError("Completá la dirección de tu casa");
    setEnviando(true);
    setError(null);
    try {
      const sesion = await auth.registro({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim(),
        password,
        telefono: tel.e164,
        codigo: cod || null,
        direccion: esFamilia ? null : { calle: calle.trim(), numero: numero.trim(), manzana: manzana.trim() || null },
      });
      await iniciarSesion(sesion);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Crear cuenta" />
      </Appbar.Header>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          <Text variant="titleMedium">Tus datos</Text>
          <View style={estilos.fila}>
            <Campo label="Nombre" mode="outlined" value={nombre} onChangeText={setNombre} style={{ flex: 1 }} />
            <Campo label="Apellido" mode="outlined" value={apellido} onChangeText={setApellido} style={{ flex: 1 }} />
          </View>
          <Campo label="Email" mode="outlined" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Campo
            label="Contraseña (mínimo 8)"
            mode="outlined"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!verClave}
            right={<Campo.Icon icon={verClave ? "eye-off" : "eye"} onPress={() => setVerClave((v) => !v)} />}
          />
          <Campo label="Repetí la contraseña" mode="outlined" value={repetir} onChangeText={setRepetir} secureTextEntry={!verClave} />
          <Campo
            label="Celular (opcional, recibe los SMS de alarma)"
            mode="outlined"
            keyboardType="phone-pad"
            value={telefono}
            onChangeText={setTelefono}
            placeholder="11 2345 6789 o +598 99 123 456"
          />

          <Text variant="titleMedium" style={{ marginTop: 8 }}>
            Código (opcional)
          </Text>
          <Campo label="Ej. B-7K2QX9 o F-4HT8WQ" mode="outlined" value={codigo} onChangeText={setCodigo} autoCapitalize="characters" />
          <HelperText type="info" style={{ paddingHorizontal: 0 }}>
            Si vivís en un barrio con seguridad o te sumás a la casa de un familiar, poné el código que te dieron. Si no, dejalo vacío.
          </HelperText>

          {!esFamilia ? (
            <>
              <Text variant="titleMedium">Dirección de tu casa</Text>
              <View style={estilos.fila}>
                <Campo label="Calle" mode="outlined" value={calle} onChangeText={setCalle} style={{ flex: 2 }} />
                <Campo label="Número" mode="outlined" value={numero} onChangeText={setNumero} style={{ flex: 1 }} />
              </View>
              <Campo label="Manzana / depto (opcional)" mode="outlined" value={manzana} onChangeText={setManzana} />
            </>
          ) : (
            <Text style={{ color: tema.colors.onSurfaceVariant }}>Te vas a sumar a la casa de tu familiar.</Text>
          )}

          <HelperText type="error" visible={!!error}>
            {error}
          </HelperText>
          <Button mode="contained" onPress={crear} loading={enviando} disabled={enviando} contentStyle={{ paddingVertical: 8 }}>
            Crear cuenta
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, paddingBottom: 40, gap: 12 },
  fila: { flexDirection: "row", gap: 8 },
});
