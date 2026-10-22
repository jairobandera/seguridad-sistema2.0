import net from "net";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mqtt, { MqttClient } from "mqtt";
import { prisma } from "../src/core/prisma";
import { cerrarBroker, crearBroker } from "../src/core/mqtt/broker";
import { enviarComando } from "../src/core/mqtt/comandos";
import { detenerManejadoresMqtt, iniciarManejadoresMqtt } from "../src/modules/dispositivos/dispositivo.mqtt";
import { escenario, limpiarBase, vincularPlaca } from "./ayudas";

vi.mock("../src/core/notificaciones/push", () => ({ enviarPush: vi.fn(async () => 1), esTokenPushValido: () => true }));
vi.mock("../src/core/notificaciones/sms", () => ({ enviarSms: vi.fn(async () => ({ ok: true })), smsHabilitado: () => false }));

const DEVICE = "A1B2C3D4E5F6";
const OTRO = "B1B2C3D4E5F6";
let server: net.Server;
let url: string;
let cred: { user: string; pass: string };
let credOtro: { user: string; pass: string };
const clientes: MqttClient[] = [];

function conectar(opts: mqtt.IClientOptions): Promise<MqttClient> {
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(url, { reconnectPeriod: 0, connectTimeout: 3000, ...opts });
    clientes.push(c);
    c.once("connect", () => resolve(c));
    c.once("error", reject);
  });
}

const esperar = async (cond: () => Promise<boolean>, ms = 3000) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

beforeAll(async () => {
  await limpiarBase();
  const e = await escenario();
  cred = (await vincularPlaca(e.casa.id, DEVICE)).mqtt;
  credOtro = (await vincularPlaca(e.casaAjena.id, OTRO)).mqtt;
  const broker = crearBroker();
  iniciarManejadoresMqtt();
  server = net.createServer(broker.handle);
  await new Promise<void>((r) => server.listen(0, r));
  url = `mqtt://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  clientes.forEach((c) => c.end(true));
  await detenerManejadoresMqtt();
  await cerrarBroker();
  server.close();
});

describe("broker MQTT", () => {
  it("rechaza clave incorrecta, sin usuario, o clientId distinto al usuario", async () => {
    await expect(conectar({ clientId: DEVICE, username: DEVICE, password: "mala" })).rejects.toThrow();
    await expect(conectar({ clientId: DEVICE })).rejects.toThrow();
    await expect(conectar({ clientId: OTRO, username: DEVICE, password: cred.pass })).rejects.toThrow();
  });

  it("acepta a la placa y procesa su estado", async () => {
    const c = await conectar({ clientId: DEVICE, username: cred.user, password: cred.pass });
    c.publish(`dev/${DEVICE}/state`, JSON.stringify({ online: true, puerta: "cerrada", ssid: "MiWifi", rssi: -50 }), { qos: 1, retain: true });
    expect(
      await esperar(async () => (await prisma.dispositivo.findUniqueOrThrow({ where: { deviceId: DEVICE } })).wifiSsid === "MiWifi"),
    ).toBe(true);
  });

  it("una placa no puede publicar como otra (no se crean eventos falsos)", async () => {
    const c = await conectar({ clientId: OTRO, username: credOtro.user, password: credOtro.pass });
    c.publish(`dev/${DEVICE}/event`, JSON.stringify({ seq: 99, tipo: "PUERTA_ABIERTA", ts: 0 }), { qos: 0 });
    await new Promise((r) => setTimeout(r, 300));
    const d = await prisma.dispositivo.findUniqueOrThrow({ where: { deviceId: DEVICE } });
    expect(await prisma.evento.count({ where: { dispositivoId: d.id, tipo: "PUERTA_ABIERTA" } })).toBe(0);
  });

  it("una placa no puede escuchar los comandos de otra", async () => {
    const c = await conectar({ clientId: `${OTRO}`, username: credOtro.user, password: credOtro.pass });
    await expect(c.subscribeAsync(`dev/${DEVICE}/cmd`, { qos: 1 })).rejects.toThrow(/Subscribe error/);
    expect(c.connected).toBe(true);
  });

  it("comandos con ACK: el backend recibe la respuesta de la placa", async () => {
    const c = clientes.find((x) => x.options.clientId === DEVICE && x.connected)!;
    await c.subscribeAsync(`dev/${DEVICE}/cmd`, { qos: 1 });
    c.on("message", (_t, p) => {
      const { id } = JSON.parse(p.toString());
      c.publish(`dev/${DEVICE}/ack`, JSON.stringify({ id, ok: true, error: null }), { qos: 1 });
    });
    const r = await enviarComando(DEVICE, "ping", 3000);
    expect(r).toEqual({ ok: true, error: null });
  });

  it("si la placa se cae sin avisar (LWT), queda offline", async () => {
    const c = await conectar({
      clientId: DEVICE,
      username: cred.user,
      password: cred.pass,
      will: { topic: `dev/${DEVICE}/state`, payload: Buffer.from('{"online":false}'), qos: 1, retain: true },
    });
    c.publish(`dev/${DEVICE}/state`, JSON.stringify({ online: true }), { qos: 1 });
    await esperar(async () => (await prisma.dispositivo.findUniqueOrThrow({ where: { deviceId: DEVICE } })).online);
    c.stream.destroy(); // corte abrupto
    expect(
      await esperar(async () => !(await prisma.dispositivo.findUniqueOrThrow({ where: { deviceId: DEVICE } })).online, 5000),
    ).toBe(true);
  });
});
