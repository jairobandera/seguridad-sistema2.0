import { PermissionsAndroid, Platform } from "react-native";
import { Buffer } from "buffer";
import type { BleManager as TBleManager, Device, Subscription } from "react-native-ble-plx";

// Protocolo BLE de la placa: docs/protocolo.md §1
export const SERVICIO = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
const RX = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E";
const TX = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";
const INFO = "6E400004-B5A3-F393-E0A9-E50E24DCCA9E";

let manager: TBleManager | null = null;

/** El Bluetooth necesita la app de desarrollo o la instalada (no funciona en Expo Go). */
export function bluetoothDisponible(): boolean {
  if (manager) return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BleManager } = require("react-native-ble-plx") as typeof import("react-native-ble-plx");
    manager = new BleManager();
    return true;
  } catch {
    return false;
  }
}

function ble(): TBleManager {
  if (!bluetoothDisponible() || !manager) throw new Error("Bluetooth no disponible en esta versión de la app");
  return manager;
}

export async function pedirPermisos(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  if (Platform.Version >= 31) {
    const r = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return Object.values(r).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
  }
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

export async function bluetoothEncendido(): Promise<boolean> {
  return (await ble().state()) === "PoweredOn";
}

export interface PlacaEncontrada {
  id: string;
  nombre: string;
  rssi: number | null;
}

/** Busca placas HUB-XXXX cercanas. Devuelve una función para detener la búsqueda. */
export function buscarPlacas(alEncontrar: (p: PlacaEncontrada) => void, alError: (msg: string) => void): () => void {
  const m = ble();
  m.startDeviceScan([SERVICIO], { allowDuplicates: false }, (error, d) => {
    if (error) {
      alError(error.message);
      return;
    }
    const nombre = d?.name ?? d?.localName ?? "";
    if (d && nombre.startsWith("HUB-")) alEncontrar({ id: d.id, nombre, rssi: d.rssi });
  });
  return () => m.stopDeviceScan();
}

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------
export interface InfoPlaca {
  r: "info";
  id: string;
  fw: string;
  vinculada: boolean;
  wifi: { ok: boolean; ssid: string; rssi?: number };
}

export interface RedWifi {
  ssid: string;
  rssi: number;
  seguro: boolean;
}

type Mensaje =
  | InfoPlaca
  | { r: "redes"; lista: RedWifi[] }
  | { r: "progreso"; fase: string }
  | { r: "error"; fase: string; motivo: string }
  | { r: "ok" };

export class ErrorPlaca extends Error {
  constructor(
    public fase: string,
    public motivo: string,
  ) {
    super(mensajeError(fase, motivo));
  }
}

export function mensajeError(fase: string, motivo: string): string {
  const textos: Record<string, string> = {
    clave_incorrecta: "La contraseña del WiFi es incorrecta.",
    red_no_encontrada: "El dispositivo no encuentra esa red. Acercalo al router y verificá que sea de 2,4 GHz.",
    timeout: fase === "mqtt" ? "El dispositivo no logró conectarse al servidor." : "El dispositivo no logró conectarse al WiFi.",
    codigo_invalido: "El código de vinculación venció. Volvé a intentar.",
    ya_vinculada: "Este dispositivo está vinculado a otra casa. Pedí que lo desvinculen primero.",
    sin_internet: "El dispositivo se conectó al WiFi pero no llega al servidor. Revisá que la red tenga internet.",
    servidor: "El servidor no pudo vincular el dispositivo. Probá de nuevo.",
    token_invalido: "El dispositivo rechazó la autorización. Volvé a intentar.",
    ocupado: "El dispositivo está ocupado con otra configuración. Esperá unos segundos.",
    json_invalido: "Datos inválidos.",
  };
  return textos[motivo] ?? `Error (${fase}: ${motivo})`;
}

/** Conexión con una placa por Bluetooth. */
export class ConexionPlaca {
  private dispositivo: Device | null = null;
  private sub: Subscription | null = null;
  private desconexion: Subscription | null = null;
  private bytes: number[] = [];
  private oyentes = new Set<(m: Mensaje) => void>();
  private mtu = 23;
  alDesconectar?: () => void;

  async conectar(id: string): Promise<void> {
    const m = ble();
    const d = await m.connectToDevice(id, { requestMTU: 185, timeout: 15000 });
    this.dispositivo = await d.discoverAllServicesAndCharacteristics();
    this.mtu = this.dispositivo.mtu || 23;
    this.sub = this.dispositivo.monitorCharacteristicForService(SERVICIO, TX, (error, c) => {
      if (error || !c?.value) return;
      this.recibir(Buffer.from(c.value, "base64"));
    });
    this.desconexion = m.onDeviceDisconnected(id, () => {
      this.limpiar();
      this.alDesconectar?.();
    });
  }

  private recibir(datos: Buffer) {
    for (const b of datos) {
      if (b === 0x0a) {
        const linea = Buffer.from(this.bytes).toString("utf8");
        this.bytes = [];
        try {
          const msg = JSON.parse(linea) as Mensaje;
          this.oyentes.forEach((fn) => fn(msg));
        } catch {
          /* línea corrupta: se ignora */
        }
      } else if (this.bytes.length < 4096) {
        this.bytes.push(b);
      }
    }
  }

  private async enviar(obj: object) {
    if (!this.dispositivo) throw new Error("No hay conexión con el dispositivo");
    const datos = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const trozo = Math.max(20, this.mtu - 3);
    for (let i = 0; i < datos.length; i += trozo) {
      await this.dispositivo.writeCharacteristicWithResponseForService(SERVICIO, RX, Buffer.from(datos.subarray(i, i + trozo)).toString("base64"));
    }
  }

  /** Espera un mensaje que cumpla la condición (o un error de la placa). */
  private esperar<T extends Mensaje>(cond: (m: Mensaje) => m is T, timeoutMs: number, alProgreso?: (fase: string) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.oyentes.delete(fn);
        reject(new Error("El dispositivo no respondió a tiempo"));
      }, timeoutMs);
      const fn = (m: Mensaje) => {
        if (m.r === "progreso") alProgreso?.(m.fase);
        if (m.r === "error") {
          clearTimeout(t);
          this.oyentes.delete(fn);
          reject(new ErrorPlaca(m.fase, m.motivo));
        } else if (cond(m)) {
          clearTimeout(t);
          this.oyentes.delete(fn);
          resolve(m);
        }
      };
      this.oyentes.add(fn);
    });
  }

  async leerInfo(): Promise<{ id: string; fw: string; vinculada: boolean }> {
    if (!this.dispositivo) throw new Error("No hay conexión con el dispositivo");
    const c = await this.dispositivo.readCharacteristicForService(SERVICIO, INFO);
    return JSON.parse(Buffer.from(c.value ?? "", "base64").toString("utf8"));
  }

  async info(): Promise<InfoPlaca> {
    const espera = this.esperar((m): m is InfoPlaca => m.r === "info", 8000);
    await this.enviar({ cmd: "info" });
    return espera;
  }

  async escanearRedes(): Promise<RedWifi[]> {
    const espera = this.esperar((m): m is { r: "redes"; lista: RedWifi[] } => m.r === "redes", 20000);
    await this.enviar({ cmd: "scan" });
    return (await espera).lista;
  }

  /** Configura WiFi (+ vinculación si hay código). Resuelve cuando la placa dice "listo". */
  async configurar(
    datos: { ssid: string; pass: string; codigo?: string; token?: string; api: string },
    alProgreso: (fase: string) => void,
  ): Promise<void> {
    const espera = this.esperar((m): m is { r: "progreso"; fase: string } => m.r === "progreso" && m.fase === "listo", 90000, alProgreso);
    await this.enviar({ cmd: "setup", ...datos });
    await espera;
  }

  async restablecer(token?: string): Promise<void> {
    const espera = this.esperar((m): m is { r: "ok" } => m.r === "ok", 8000);
    await this.enviar({ cmd: "factory_reset", token });
    await espera;
  }

  private limpiar() {
    this.sub?.remove();
    this.desconexion?.remove();
    this.sub = this.desconexion = null;
    this.dispositivo = null;
    this.bytes = [];
  }

  async desconectar() {
    const d = this.dispositivo;
    this.alDesconectar = undefined;
    this.limpiar();
    if (d) await d.cancelConnection().catch(() => undefined);
  }
}
