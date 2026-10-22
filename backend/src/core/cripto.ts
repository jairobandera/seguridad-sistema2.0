import crypto from "crypto";
import { config } from "./config";

export function tokenAleatorio(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(texto: string): string {
  return crypto.createHash("sha256").update(texto).digest("hex");
}

/** Contraseña temporal legible (sin caracteres ambiguos). */
export function passwordTemporal(largo = 10): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(largo);
  let out = "";
  for (let i = 0; i < largo; i++) out += alfabeto[bytes[i] % alfabeto.length];
  return out;
}

const clave = () => Buffer.from(config.DEVICE_SECRET_KEY, "hex");

/** Cifra con AES-256-GCM. Formato: iv.tag.datos (base64url). */
export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", clave(), iv);
  const datos = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, datos].map((b) => b.toString("base64url")).join(".");
}

export function descifrar(paquete: string): string {
  const [iv, tag, datos] = paquete.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", clave(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(datos), decipher.final()]).toString("utf8");
}

/**
 * Token de configuración BLE (ver docs/protocolo.md §1):
 * "<exp>.<hex(HMAC-SHA256(secret, deviceId|exp))>"
 */
export function tokenConfigPlaca(secretHex: string, deviceId: string, exp: number): string {
  const firma = crypto
    .createHmac("sha256", Buffer.from(secretHex, "hex"))
    .update(`${deviceId}|${exp}`)
    .digest("hex");
  return `${exp}.${firma}`;
}

export function igualesSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
