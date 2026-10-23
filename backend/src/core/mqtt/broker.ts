import http from "http";
import net from "net";
import { Duplex } from "stream";
import Aedes, { AuthenticateError, Client, createBroker } from "aedes";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "../config";
import { logger } from "../logger";
import { prisma } from "../prisma";
import { igualesSeguro, sha256 } from "../cripto";

/**
 * Broker MQTT embebido (docs/protocolo.md §3).
 * - Las placas se autentican con usuario = deviceId y la contraseña entregada al vincularse.
 * - Cada placa solo puede publicar en dev/{su id}/{state,event,telemetry,ack}
 *   y suscribirse a dev/{su id}/cmd.
 * - Transporte: WebSocket en /mqtt (wss:// detrás de Render) y, opcionalmente, TCP.
 */

export type TipoMensaje = "state" | "event" | "telemetry" | "ack";
export type ManejadorMensaje = (deviceId: string, tipo: TipoMensaje, payload: Buffer) => void;
export type ManejadorConexion = (deviceId: string, conectado: boolean) => void;

const TOPIC_PLACA = /^dev\/([0-9A-F]{12})\/(state|event|telemetry|ack)$/;

let broker: Aedes | null = null;
let tcpServer: net.Server | null = null;
let wss: WebSocketServer | null = null;
const manejadores: ManejadorMensaje[] = [];
const manejadoresConexion: ManejadorConexion[] = [];

function errorAuth(): AuthenticateError {
  const e = new Error("Usuario o clave incorrectos") as AuthenticateError;
  e.returnCode = 4; // BAD_USERNAME_OR_PASSWORD
  return e;
}

// Falla nuestra (ej. MySQL todavía no arrancó): la placa no debe tomarlo como desvinculación
function errorServidor(): AuthenticateError {
  const e = new Error("Servidor no disponible") as AuthenticateError;
  e.returnCode = 3; // SERVER_UNAVAILABLE
  return e;
}

// `clients` existe en Aedes pero no está en sus tipos
const clientesDe = (b: Aedes | null) => ((b as unknown as { clients?: Record<string, Client> })?.clients ?? {});

const deviceIdDe = (c: Client | null): string | undefined => (c as unknown as { deviceId?: string } | null)?.deviceId;

export function crearBroker(): Aedes {
  broker = createBroker({
    heartbeatInterval: 60_000,
    connectTimeout: 15_000,
    authenticate: (client, username, password, done) => {
      (async () => {
        if (!username || !password || client.id !== username) return done(errorAuth(), false);
        const disp = await prisma.dispositivo.findUnique({
          where: { mqttUsername: username },
          select: { deviceId: true, mqttPassHash: true, casaId: true },
        });
        if (!disp?.mqttPassHash || !disp.casaId || !igualesSeguro(disp.mqttPassHash, sha256(password.toString()))) {
          logger.warn({ username }, "MQTT: autenticación rechazada");
          return done(errorAuth(), false);
        }
        (client as unknown as { deviceId: string }).deviceId = disp.deviceId;
        done(null, true);
      })().catch((err) => {
        logger.error({ err }, "MQTT: error autenticando");
        done(errorServidor(), false);
      });
    },
    authorizePublish: (client, packet, cb) => {
      if (!client) return cb(null); // publicaciones internas del backend
      const m = TOPIC_PLACA.exec(packet.topic);
      if (!m || m[1] !== deviceIdDe(client)) return cb(new Error("topic no permitido"));
      if (packet.retain && m[2] !== "state") packet.retain = false;
      cb(null);
    },
    authorizeSubscribe: (client, sub, cb) => {
      // null = suscripción denegada (SUBACK 0x80) sin cortar la conexión
      if (sub.topic !== `dev/${deviceIdDe(client)}/cmd`) return cb(null, null);
      cb(null, sub);
    },
  });

  broker.on("publish", (packet) => {
    const m = TOPIC_PLACA.exec(packet.topic);
    if (!m) return;
    for (const h of manejadores) h(m[1], m[2] as TipoMensaje, packet.payload as Buffer);
  });
  broker.on("clientReady", (c) => {
    const id = deviceIdDe(c);
    if (id) manejadoresConexion.forEach((h) => h(id, true));
  });
  broker.on("clientDisconnect", (c) => {
    const id = deviceIdDe(c);
    if (id) manejadoresConexion.forEach((h) => h(id, false));
  });
  broker.on("clientError", (c, err) => logger.debug({ id: c.id, err: err.message }, "MQTT: error de cliente"));
  return broker;
}

/**
 * Stream para aedes sobre un WebSocket. aedes escribe cada paquete MQTT en varios pedazos (encabezado,
 * largo, cuerpo...) y cada `write` sería un mensaje WebSocket aparte: el cliente MQTT del ESP32 no
 * rearma paquetes partidos entre mensajes. Se junta todo lo escrito en el mismo ciclo y se manda junto.
 */
export function streamMqttWs(ws: WebSocket): Duplex {
  let pendientes: Buffer[] = [];
  const stream = new Duplex({
    read() {},
    write(chunk: Buffer, _enc, cb) {
      pendientes.push(chunk);
      if (pendientes.length === 1) {
        setImmediate(() => {
          const datos = Buffer.concat(pendientes);
          pendientes = [];
          if (ws.readyState === ws.OPEN) ws.send(datos);
        });
      }
      cb();
    },
    final(cb) {
      ws.close();
      cb();
    },
    destroy(err, cb) {
      ws.terminate();
      cb(err);
    },
  });
  ws.on("message", (datos: Buffer) => stream.push(datos));
  ws.on("close", () => stream.push(null));
  ws.on("error", (err) => stream.destroy(err));
  return stream;
}

/** Monta el broker en el servidor HTTP (ruta /mqtt) y opcionalmente en TCP. */
export function iniciarBroker(server: http.Server) {
  const b = broker ?? crearBroker();
  wss = new WebSocketServer({ noServer: true, handleProtocols: (p) => (p.has("mqtt") ? "mqtt" : false) });
  server.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/mqtt")) return; // lo maneja Socket.IO
    wss!.handleUpgrade(req, socket as Duplex & net.Socket, head, (ws) => {
      b.handle(streamMqttWs(ws), req);
    });
  });
  if (config.MQTT_TCP_PORT) {
    tcpServer = net.createServer(b.handle);
    tcpServer.listen(config.MQTT_TCP_PORT, () => logger.info(`MQTT TCP escuchando en :${config.MQTT_TCP_PORT}`));
  }
  logger.info("Broker MQTT listo en /mqtt");
}

export function alRecibirMensaje(h: ManejadorMensaje) {
  manejadores.push(h);
}

export function alCambiarConexion(h: ManejadorConexion) {
  manejadoresConexion.push(h);
}

export function publicarComando(deviceId: string, payload: object): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!broker) return reject(new Error("broker no iniciado"));
    broker.publish(
      { cmd: "publish", topic: `dev/${deviceId}/cmd`, payload: Buffer.from(JSON.stringify(payload)), qos: 1, retain: false, dup: false },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

export function placaConectada(deviceId: string): boolean {
  return !!clientesDe(broker)[deviceId];
}

export function desconectarPlaca(deviceId: string) {
  clientesDe(broker)[deviceId]?.close();
}

export function estadoBroker() {
  return { activo: !!broker && !broker.closed, clientes: broker?.connectedClients ?? 0 };
}

export async function cerrarBroker() {
  tcpServer?.close();
  wss?.close();
  await new Promise<void>((r) => (broker ? broker.close(() => r()) : r()));
  broker = null;
  manejadores.length = 0;
  manejadoresConexion.length = 0;
}
