import http from "http";
import net, { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mqtt, { MqttClient } from "mqtt";
import { io as conectarSocket, Socket } from "socket.io-client";
import { cerrarBroker, crearBroker } from "../src/core/mqtt/broker";
import { iniciarSocket } from "../src/core/socket";
import { detenerManejadoresMqtt, iniciarManejadoresMqtt } from "../src/modules/dispositivos/dispositivo.mqtt";
import { detenerMonitor } from "../src/modules/dispositivos/monitor";
import { escenario, limpiarBase, vincularPlaca } from "./ayudas";

vi.mock("../src/core/notificaciones/push", () => ({ enviarPush: vi.fn(async () => 1), esTokenPushValido: () => true }));
vi.mock("../src/core/notificaciones/sms", () => ({ enviarSms: vi.fn(async () => ({ ok: true })), smsHabilitado: () => false }));

const DEVICE = "C1B2C3D4E5F6";
let tcp: net.Server;
let web: http.Server;
let placa: MqttClient;
let admin: Socket;
let cliente: Socket;
/** Comandos que recibió la placa. */
const comandos: { cmd: string; activo?: boolean }[] = [];

const esperar = async (cond: () => boolean, ms = 3000) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin && !cond()) await new Promise((r) => setTimeout(r, 30));
  return cond();
};

function socketCon(urlWeb: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = conectarSocket(urlWeb, { auth: { token }, transports: ["websocket"], reconnection: false });
    s.once("connect", () => resolve(s));
    s.once("connect_error", reject);
  });
}

beforeAll(async () => {
  await limpiarBase();
  const e = await escenario();
  const { mqtt: cred } = await vincularPlaca(e.casa.id, DEVICE);

  const broker = crearBroker();
  iniciarManejadoresMqtt();
  tcp = net.createServer(broker.handle);
  await new Promise<void>((r) => tcp.listen(0, r));
  web = http.createServer();
  iniciarSocket(web);
  await new Promise<void>((r) => web.listen(0, r));
  const urlWeb = `http://localhost:${(web.address() as AddressInfo).port}`;

  placa = mqtt.connect(`mqtt://localhost:${(tcp.address() as AddressInfo).port}`, {
    clientId: cred.user,
    username: cred.user,
    password: cred.pass,
    reconnectPeriod: 0,
  });
  await new Promise((r) => placa.once("connect", r));
  await new Promise((r) => placa.subscribe(`dev/${DEVICE}/cmd`, { qos: 1 }, r));
  placa.on("message", (_t, p) => comandos.push(JSON.parse(p.toString())));

  admin = await socketCon(urlWeb, e.t.admin);
  cliente = await socketCon(urlWeb, e.t.dueno);
});

afterAll(async () => {
  admin?.close();
  cliente?.close();
  placa?.end(true);
  detenerMonitor();
  await detenerManejadoresMqtt();
  await cerrarBroker();
  tcp.close();
  web.close();
});

describe("monitor serial por internet", () => {
  it("el admin lo abre, la placa recibe el comando y lo que imprime le llega solo a él", async () => {
    const r = await admin.timeout(3000).emitWithAck("monitor:abrir", { deviceId: DEVICE });
    expect(r).toEqual({ ok: true, online: true });
    expect(await esperar(() => comandos.some((c) => c.cmd === "monitor" && c.activo === true))).toBe(true);

    const alAdmin: string[] = [];
    const alCliente: string[] = [];
    admin.on("monitor:linea", (d: { texto: string }) => alAdmin.push(d.texto));
    cliente.on("monitor:linea", (d: { texto: string }) => alCliente.push(d.texto));
    placa.publish(`dev/${DEVICE}/log`, "[bateria] 3912 mV (30 %)\n");
    expect(await esperar(() => alAdmin.length > 0)).toBe(true);
    expect(alAdmin[0]).toContain("[bateria] 3912 mV");
    expect(alCliente).toHaveLength(0);
  });

  it("un cliente no puede abrir el monitor", async () => {
    await expect(cliente.timeout(500).emitWithAck("monitor:abrir", { deviceId: DEVICE })).rejects.toThrow();
  });

  it("al cerrarlo (era el único mirando) la placa deja de mandar", async () => {
    comandos.length = 0;
    admin.emit("monitor:cerrar", { deviceId: DEVICE });
    expect(await esperar(() => comandos.some((c) => c.cmd === "monitor" && c.activo === false))).toBe(true);
  });
});
