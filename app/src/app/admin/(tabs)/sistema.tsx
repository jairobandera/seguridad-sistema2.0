import { ScrollView } from "react-native";
import { Appbar, Card, List } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { admin } from "@/api/endpoints";
import { Perfil } from "@/components/Perfil";
import { colores } from "@/tema";

export default function Sistema() {
  const q = useQuery({ queryKey: ["admin", "sistema"], queryFn: admin.sistema, refetchInterval: 30_000 });
  const s = q.data;
  const ok = (v: boolean | undefined) => (v ? colores.ok : colores.peligro);
  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Sistema" />
        <Appbar.Action icon="refresh" onPress={() => q.refetch()} />
      </Appbar.Header>
      <ScrollView>
        <Card style={{ margin: 16, marginBottom: 0 }}>
          <List.Item title="Base de datos" description={s ? (s.db ? "Funcionando" : "Con problemas") : "…"} left={(p) => <List.Icon {...p} icon="database" color={ok(s?.db)} />} />
          <List.Item title="MQTT (dispositivos)" description={s ? `${s.mqtt.activo ? "Activo" : "Detenido"} · ${s.mqtt.clientes} conectadas` : "…"} left={(p) => <List.Icon {...p} icon="access-point-network" color={ok(s?.mqtt.activo)} />} />
          <List.Item title="SMS (Twilio)" description={s ? (s.sms ? "Habilitado" : "Deshabilitado") : "…"} left={(p) => <List.Icon {...p} icon="message-text" color={ok(s?.sms)} />} />
          <List.Item
            title="Totales"
            description={s ? `${s.conteos.usuarios} usuarios · ${s.conteos.barrios} barrios · ${s.conteos.casas} casas (${s.conteos.individuales} individuales) · ${s.conteos.placas} dispositivos (${s.conteos.placasOnline} online) · ${s.conteos.pushTokens} celulares` : "…"}
            left={(p) => <List.Icon {...p} icon="counter" />}
          />
          <List.Item title="Versión del servidor" description={s ? `${s.version} · encendido hace ${Math.round(s.uptimeSeg / 60)} min` : "…"} left={(p) => <List.Icon {...p} icon="server" />} />
        </Card>
        <Perfil />
      </ScrollView>
    </>
  );
}
