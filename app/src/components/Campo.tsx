import type { ComponentProps } from "react";
import { Platform } from "react-native";
import { TextInput } from "react-native-paper";

type PropsCampo = ComponentProps<typeof TextInput>;

/**
 * Sin sugerencias de ningún tipo: ni del teclado (palabras), ni autocorrector, ni corrector
 * ortográfico, ni autocompletado del sistema (emails o claves guardadas).
 */
export const sinSugerencias = {
  autoCorrect: false,
  spellCheck: false,
  autoComplete: "off",
  importantForAutofill: "no",
  textContentType: "none",
} as const;

// En Android algunos teclados (Gboard) muestran sugerencias igual: el teclado "visible-password"
// es el único que las apaga siempre. Solo para texto común de una línea.
function tecladoAndroid(p: PropsCampo): PropsCampo["keyboardType"] {
  if (Platform.OS !== "android" || p.keyboardType || p.multiline || p.secureTextEntry) return p.keyboardType;
  return "visible-password";
}

function CampoBase(props: PropsCampo) {
  return <TextInput {...props} {...sinSugerencias} keyboardType={tecladoAndroid(props)} />;
}

/** TextInput de React Native Paper sin sugerencias. Usar siempre este en vez de TextInput. */
export const Campo = Object.assign(CampoBase, { Icon: TextInput.Icon, Affix: TextInput.Affix });
