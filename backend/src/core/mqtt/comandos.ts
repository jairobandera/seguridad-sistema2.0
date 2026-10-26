import crypto from "crypto";
import { logger } from "../logger";
import { placaConectada, publicarComando } from "./broker";

// "ahorro": hibernación con la alarma desarmada ({ activo: boolean }, ver firmware/energia.h)
// "monitor": monitor serial por internet ({ activo: boolean }, ver firmware/consola.h)
export type Comando = "factory_reset" | "open_ble" | "reboot" | "ping" | "ahorro" | "monitor";

interface Respuesta {
  ok: boolean;
  error: string | null;
}

const pendientes = new Map<string, (r: Respuesta) => void>();

/**
 * Manda un comando a la placa y espera su ACK.
 * Devuelve null si la placa no está conectada o no respondió a tiempo.
 */
export async function enviarComando(
  deviceId: string,
  cmd: Comando,
  timeoutMs = 10_000,
  datos: Record<string, unknown> = {},
): Promise<Respuesta | null> {
  if (!placaConectada(deviceId)) return null;
  const id = crypto.randomUUID();
  const espera = new Promise<Respuesta | null>((resolve) => {
    const t = setTimeout(() => {
      pendientes.delete(id);
      resolve(null);
    }, timeoutMs);
    pendientes.set(id, (r) => {
      clearTimeout(t);
      pendientes.delete(id);
      resolve(r);
    });
  });
  try {
    await publicarComando(deviceId, { ...datos, id, cmd });
  } catch (err) {
    logger.error({ err, deviceId, cmd }, "No se pudo publicar el comando");
    pendientes.get(id)?.({ ok: false, error: "publicacion" });
  }
  return espera;
}

/** Lo llama el handler de dev/{id}/ack. */
export function resolverAck(id: string, ok: boolean, error: string | null) {
  pendientes.get(id)?.({ ok, error });
}
