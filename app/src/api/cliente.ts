import { API_URL } from "@/config";
import { useSesion } from "@/store/sesion";
import type { Sesion } from "./tipos";

/** Error de la API con un mensaje listo para mostrar al usuario. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

const TIMEOUT_MS = 15_000;

async function fetchConTimeout(url: string, init: RequestInit): Promise<Response> {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: control.signal });
  } catch {
    throw new ApiError(0, "sin_conexion", "No hay conexión con el servidor. Revisá tu internet.");
  } finally {
    clearTimeout(t);
  }
}

async function leer(resp: Response): Promise<unknown> {
  if (resp.status === 204) return null;
  const texto = await resp.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function errorDe(resp: Response, cuerpo: unknown): ApiError {
  const c = (cuerpo ?? {}) as { error?: string; mensaje?: string };
  const mensaje =
    c.mensaje ?? (resp.status >= 500 ? "El servidor tuvo un problema. Probá de nuevo en un rato." : "No se pudo completar la acción");
  return new ApiError(resp.status, c.error ?? "error", mensaje);
}

// Renovación de sesión: una sola a la vez aunque fallen varias llamadas juntas
let renovando: Promise<boolean> | null = null;

export function renovarSesion(): Promise<boolean> {
  if (renovando) return renovando;
  renovando = (async () => {
    const { refreshToken, guardar, limpiar } = useSesion.getState();
    if (!refreshToken) return false;
    try {
      const resp = await fetchConTimeout(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (resp.status === 401) {
        await limpiar();
        return false;
      }
      if (!resp.ok) return false;
      await guardar((await leer(resp)) as Sesion);
      return true;
    } catch {
      return false;
    } finally {
      renovando = null;
    }
  })();
  return renovando;
}

interface Opciones {
  metodo?: "GET" | "POST" | "PUT" | "DELETE";
  cuerpo?: unknown;
  sinAuth?: boolean;
}

/** Llamada a la API. Si el token venció, lo renueva y reintenta una vez. */
export async function api<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  return (await apiConEstado<T>(ruta, opciones)).datos;
}

/** Igual que api() pero devuelve también el código HTTP (por ejemplo 202 = la placa no respondió). */
export async function apiConEstado<T>(ruta: string, opciones: Opciones = {}): Promise<{ status: number; datos: T }> {
  const hacer = () => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (opciones.cuerpo !== undefined) headers["Content-Type"] = "application/json";
    const token = useSesion.getState().accessToken;
    if (token && !opciones.sinAuth) headers.Authorization = `Bearer ${token}`;
    return fetchConTimeout(`${API_URL}${ruta}`, {
      method: opciones.metodo ?? "GET",
      headers,
      body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    });
  };

  let resp = await hacer();
  if (resp.status === 401 && !opciones.sinAuth) {
    if (await renovarSesion()) resp = await hacer();
  }
  const cuerpo = await leer(resp);
  if (!resp.ok) throw errorDe(resp, cuerpo);
  // OK pero sin JSON: casi siempre es la dirección del servidor mal configurada (le habla a otra página)
  if (cuerpo === null && resp.status !== 204) {
    throw new ApiError(resp.status, "respuesta_invalida", "El servidor respondió algo inesperado. Revisá la dirección del servidor.");
  }
  return { status: resp.status, datos: cuerpo as T };
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Ocurrió un error inesperado";
}
