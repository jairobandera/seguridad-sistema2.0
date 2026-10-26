import { View } from "react-native";
import { Icon, List, Text } from "react-native-paper";
import type { DispositivoCasa } from "@/api/tipos";
import { barrasSenal, colorBateria, iconoBateria } from "@/utils/formato";
import { colores } from "@/tema";

/** Nombre del dispositivo o uno genérico si todavía no tiene. */
export const nombreDispositivo = (d: Pick<DispositivoCasa, "nombre">) => d.nombre?.trim() || "Dispositivo";

/** Una fila por dispositivo: nombre, puerta/ventana, conexión y batería. */
export function DispositivoFila({ d, alTocar }: { d: DispositivoCasa; alTocar?: () => void }) {
  const abierta = d.puertaAbierta === true;
  return (
    <List.Item
      title={nombreDispositivo(d)}
      description={`${d.puertaAbierta == null ? "Sin datos" : abierta ? "Abierta" : "Cerrada"} · ${d.online ? "Conectado" : "Sin conexión"}${d.excluido ? " · Fuera de la alarma" : ""}`}
      onPress={alTocar}
      left={(p) => (
        <List.Icon {...p} icon={abierta ? "door-open" : "door-closed"} color={!d.online ? colores.peligro : abierta ? colores.aviso : colores.ok} />
      )}
      right={() => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {d.bateria != null && d.online ? (
            <>
              <Icon source={iconoBateria(d.bateria)} size={20} color={colorBateria(d.bateria)} />
              <Text variant="labelMedium">{d.bateria} %</Text>
            </>
          ) : d.online ? (
            <Icon source="power-plug" size={20} color={colores.ok} />
          ) : null}
          <Icon source={d.online ? `wifi-strength-${barrasSenal(d.rssi)}` : "wifi-off"} size={20} color={d.online ? colores.ok : colores.peligro} />
        </View>
      )}
    />
  );
}

/** Texto corto del estado de las puertas: "Todo cerrado", "Abierta: Puerta trasera", "2 abiertas". */
export function resumenPuertas(dispositivos: DispositivoCasa[]): { texto: string; abierta: boolean } {
  const abiertas = dispositivos.filter((d) => d.puertaAbierta === true);
  if (abiertas.length === 0) return { texto: dispositivos.length > 1 ? "Todo cerrado" : "Cerrada", abierta: false };
  if (abiertas.length === 1) return { texto: dispositivos.length > 1 ? nombreDispositivo(abiertas[0]) : "Abierta", abierta: true };
  return { texto: `${abiertas.length} abiertas`, abierta: true };
}

/** Texto corto de la conexión: "Conectado", "3 conectados", "1 sin conexión". */
export function resumenConexion(dispositivos: DispositivoCasa[]): { texto: string; ok: boolean } {
  const caidos = dispositivos.filter((d) => !d.online).length;
  if (caidos === 0) return { texto: dispositivos.length > 1 ? `${dispositivos.length} conectados` : "Conectado", ok: true };
  return { texto: dispositivos.length > 1 ? `${caidos} sin conexión` : "Sin conexión", ok: false };
}
