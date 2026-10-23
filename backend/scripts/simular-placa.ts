/**
 * Simulador de placa: hace lo mismo que la ESP32 (docs/protocolo.md) para probar sin hardware.
 *
 *   pnpm simular -- --codigo <código de vinculación>   vincula una placa nueva y queda conectada
 *   pnpm simular                                         usa las credenciales guardadas
 *
 * Teclas: [a] abrir puerta  [c] cerrar puerta  [q] salir
 * Opciones: --id A1B2C3D4E5F6  --api http://localhost:3000  --secuencia (abre y cierra y sale)
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import mqtt from "mqtt";

const args = process.argv.slice(2);
const opcion = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const API = opcion("api") ?? "http://localhost:3000";
const DEVICE_ID = (opcion("id") ?? "AABBCCDDEEFF").toUpperCase();
const ARCHIVO = path.join(__dirname, `.placa-${DEVICE_ID}.json`);
// --bat 75 simula una batería al 75 %
const BAT = opcion("bat") !== undefined ? { bat: Number(opcion("bat")), mv: 3300 + Number(opcion("bat")) * 9 } : {};

interface Credenciales {
  url: string;
  user: string;
  pass: string;
  secret: string;
  seq: number;
}

async function provisionar(codigo: string): Promise<Credenciales> {
  const secret = crypto.randomBytes(32).toString("hex");
  const r = await fetch(`${API}/api/dispositivos/provision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: DEVICE_ID, codigo, secret, fw: "sim-2.0.0" }),
  });
  const cuerpo = (await r.json()) as { mqtt: { url: string; user: string; pass: string }; casaId: number };
  if (!r.ok) throw new Error(`Vinculación rechazada: ${JSON.stringify(cuerpo)}`);
  const cred = { ...cuerpo.mqtt, secret, seq: 0 };
  fs.writeFileSync(ARCHIVO, JSON.stringify(cred, null, 2));
  console.log(`Placa ${DEVICE_ID} vinculada a la casa ${cuerpo.casaId}`);
  return cred;
}

async function main() {
  const codigo = opcion("codigo");
  let cred: Credenciales;
  if (codigo) cred = await provisionar(codigo);
  else if (fs.existsSync(ARCHIVO)) cred = JSON.parse(fs.readFileSync(ARCHIVO, "utf8"));
  else throw new Error("No hay credenciales guardadas. Pasá --codigo <código> (lo genera la app o POST /api/casas/:id/codigo-vinculacion).");

  // En la PC, la URL mqtt://IP:1884 se puede reemplazar por localhost
  const url = cred.url.replace(/\/\/[^:/]+:1884/, "//localhost:1884");
  let puertaAbierta = false;
  const base = `dev/${DEVICE_ID}`;
  const cliente = mqtt.connect(url, {
    clientId: DEVICE_ID,
    username: cred.user,
    password: cred.pass,
    clean: false,
    keepalive: 30,
    will: { topic: `${base}/state`, payload: Buffer.from(JSON.stringify({ online: false })), qos: 1, retain: true },
  });

  const guardar = () => fs.writeFileSync(ARCHIVO, JSON.stringify(cred, null, 2));
  const estado = () =>
    cliente.publish(
      `${base}/state`,
      JSON.stringify({ online: true, puerta: puertaAbierta ? "abierta" : "cerrada", fw: "sim-2.0.0", ssid: "Simulador", rssi: -55, ip: "127.0.0.1", ...BAT }),
      { qos: 1, retain: true },
    );
  const puerta = (abierta: boolean) => {
    puertaAbierta = abierta;
    cred.seq += 1;
    guardar();
    cliente.publish(
      `${base}/event`,
      JSON.stringify({ seq: cred.seq, tipo: abierta ? "PUERTA_ABIERTA" : "PUERTA_CERRADA", ts: Math.floor(Date.now() / 1000) }),
      { qos: 1 },
    );
    estado();
    console.log(`→ Puerta ${abierta ? "ABIERTA" : "CERRADA"} (seq ${cred.seq})`);
  };

  cliente.on("connect", () => {
    console.log(`Conectada a ${url}`);
    cliente.subscribe(`${base}/cmd`, { qos: 1 });
    estado();
    if (args.includes("--secuencia")) {
      setTimeout(() => puerta(true), 1000);
      setTimeout(() => puerta(false), 3000);
      setTimeout(() => cliente.end(false, () => process.exit(0)), 5000);
    }
  });
  cliente.on("error", (e) => console.error("Error MQTT:", e.message));
  cliente.on("message", (_t, payload) => {
    const { id, cmd } = JSON.parse(payload.toString());
    console.log(`← Comando: ${cmd}`);
    cliente.publish(`${base}/ack`, JSON.stringify({ id, ok: true, error: null }), { qos: 1 });
    if (cmd === "factory_reset") {
      fs.rmSync(ARCHIVO, { force: true });
      console.log("Reset de fábrica: credenciales borradas");
      setTimeout(() => process.exit(0), 500);
    }
  });

  const telemetria = setInterval(() => {
    cliente.publish(`${base}/telemetry`, JSON.stringify({ rssi: -55, uptime: Math.round(process.uptime()), heap: 100000, ...BAT }));
  }, 60_000);
  telemetria.unref();

  if (process.stdin.isTTY && !args.includes("--secuencia")) {
    console.log("Teclas: [a] abrir  [c] cerrar  [q] salir");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (k) => {
      const t = k.toString();
      if (t === "a") puerta(true);
      if (t === "c") puerta(false);
      if (t === "q" || t === "\u0003") cliente.end(false, () => process.exit(0));
    });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
