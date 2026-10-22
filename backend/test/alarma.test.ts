import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { prisma } from "../src/core/prisma";
import { enviarPush } from "../src/core/notificaciones/push";
import { enviarSms } from "../src/core/notificaciones/sms";
import { _reiniciarEstadoInterno, cambiarAlarma } from "../src/modules/alarma/alarma.service";
import { _procesarMensaje } from "../src/modules/dispositivos/dispositivo.mqtt";
import { app, auth, escenario, limpiarBase, vincularPlaca } from "./ayudas";

vi.mock("../src/core/notificaciones/push", () => ({ enviarPush: vi.fn(async () => 1), esTokenPushValido: () => true }));
vi.mock("../src/core/notificaciones/sms", () => ({ enviarSms: vi.fn(async () => ({ ok: true })), smsHabilitado: () => true }));
// El broker no corre en estos tests: la placa siempre figura "desconectada"
vi.mock("../src/core/mqtt/broker", () => ({
  alRecibirMensaje: vi.fn(),
  alCambiarConexion: vi.fn(),
  placaConectada: () => false,
  desconectarPlaca: vi.fn(),
  publicarComando: vi.fn(),
  estadoBroker: () => ({ activo: false, clientes: 0 }),
}));

const DEVICE = "A1B2C3D4E5F6";
let e: Awaited<ReturnType<typeof escenario>>;
let seq = 0;
const ahora = () => Math.floor(Date.now() / 1000);
const puerta = (abierta: boolean, extra: { seq?: number; ts?: number } = {}) =>
  _procesarMensaje(DEVICE, "event", { seq: extra.seq ?? ++seq, tipo: abierta ? "PUERTA_ABIERTA" : "PUERTA_CERRADA", ts: extra.ts ?? ahora() });

beforeEach(async () => {
  await limpiarBase();
  _reiniciarEstadoInterno();
  vi.mocked(enviarPush).mockClear();
  vi.mocked(enviarSms).mockClear();
  seq = 0;
  e = await escenario();
  await vincularPlaca(e.casa.id, DEVICE);
  await prisma.contactoEmergencia.create({ data: { usuarioId: e.dueno.id, nombre: "Mamá", telefono: "+5491199999999" } });
});

describe("puerta", () => {
  it("con la alarma desarmada solo registra (sin sirena para guardias)", async () => {
    await puerta(true);
    const ev = await prisma.evento.findFirstOrThrow({ where: { tipo: "PUERTA_ABIERTA" }, include: { estado: true } });
    expect(ev.severidad).toBe("INFO");
    expect(ev.estado).toBeNull();
    expect(enviarSms).not.toHaveBeenCalled();
    const alarmas = vi.mocked(enviarPush).mock.calls.filter((c) => c[1].alarma);
    expect(alarmas).toHaveLength(0);
  });

  it("con la alarma armada: alerta crítica pendiente, push con sirena a miembros+guardias y SMS a dueño y contactos", async () => {
    await cambiarAlarma(e.dueno.id, e.casa.id, true);
    await puerta(true);
    const ev = await prisma.evento.findFirstOrThrow({ where: { tipo: "PUERTA_ABIERTA" }, include: { estado: true } });
    expect(ev.severidad).toBe("CRITICA");
    expect(ev.estado?.estado).toBe("PENDIENTE");
    const push = vi.mocked(enviarPush).mock.calls.find((c) => c[1].alarma)!;
    expect(push[0]).toEqual(expect.arrayContaining([e.dueno.id, e.familiar.id, e.guardia.id]));
    expect(push[0]).not.toContain(e.ajeno.id);
    const destinos = vi.mocked(enviarSms).mock.calls.map((c) => c[0]);
    expect(destinos.sort()).toEqual(["+5491100000001", "+5491199999999"]);
  });

  it("no repite SMS dentro de la ventana anti-spam, pero sí las push", async () => {
    await cambiarAlarma(e.dueno.id, e.casa.id, true);
    await puerta(true);
    await puerta(false);
    await puerta(true);
    expect(vi.mocked(enviarSms)).toHaveBeenCalledTimes(2); // una tanda (2 teléfonos)
    expect(vi.mocked(enviarPush).mock.calls.filter((c) => c[1].alarma)).toHaveLength(2);
  });

  it("descarta eventos repetidos (mismo seq) que reenvía la placa", async () => {
    await puerta(true, { seq: 5 });
    await puerta(true, { seq: 5 });
    await puerta(true, { seq: 3 });
    expect(await prisma.evento.count({ where: { tipo: "PUERTA_ABIERTA" } })).toBe(1);
  });

  it("eventos viejos de la cola de la placa se registran sin disparar alarma", async () => {
    await cambiarAlarma(e.dueno.id, e.casa.id, true);
    await puerta(true, { ts: ahora() - 3600 });
    const ev = await prisma.evento.findFirstOrThrow({ where: { tipo: "PUERTA_ABIERTA" } });
    expect(ev.severidad).toBe("INFO");
    expect(ev.valor).toBe("registrado_sin_conexion");
    expect(enviarSms).not.toHaveBeenCalled();
  });

  it("retardo de entrada: si se desarma a tiempo no hay alarma", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await prisma.casa.update({ where: { id: e.casa.id }, data: { retardoEntradaSeg: 20 } });
      await cambiarAlarma(e.dueno.id, e.casa.id, true);
      await puerta(true);
      await cambiarAlarma(e.dueno.id, e.casa.id, false);
      await vi.advanceTimersByTimeAsync(25_000);
      expect(vi.mocked(enviarPush).mock.calls.filter((c) => c[1].alarma)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("conexión de la placa", () => {
  it("offline con alarma armada crea alerta y avisa; al volver crea ONLINE una sola vez", async () => {
    await cambiarAlarma(e.dueno.id, e.casa.id, true);
    await _procesarMensaje(DEVICE, "state", { online: true, puerta: "cerrada", ssid: "Casa", rssi: -60 });
    await _procesarMensaje(DEVICE, "state", { online: false });
    await new Promise((r) => setTimeout(r, 50)); // gracia = 0 s en tests
    await _procesarMensaje(DEVICE, "telemetry", { rssi: -60 });
    const offline = await prisma.evento.findMany({ where: { tipo: "DISPOSITIVO_OFFLINE" }, include: { estado: true } });
    expect(offline).toHaveLength(1);
    expect(offline[0].estado?.estado).toBe("PENDIENTE");
    expect(await prisma.evento.count({ where: { tipo: "DISPOSITIVO_ONLINE" } })).toBe(2); // conexión inicial + vuelta
    const d = await prisma.dispositivo.findUniqueOrThrow({ where: { deviceId: DEVICE } });
    expect(d.online).toBe(true);
    expect(d.wifiSsid).toBe("Casa");
  });
});

describe("guardias", () => {
  it("tomar y resolver; un segundo guardia no puede tomar la misma alerta", async () => {
    await cambiarAlarma(e.dueno.id, e.casa.id, true);
    await puerta(true);
    const ev = await prisma.evento.findFirstOrThrow({ where: { tipo: "PUERTA_ABIERTA" } });
    const pendientes = await request(app).get("/api/guardia/eventos").set(auth(e.t.guardia));
    expect(pendientes.body.items.map((i: { id: number }) => i.id)).toContain(ev.id);

    const tomada = await request(app).post(`/api/guardia/eventos/${ev.id}/tomar`).set(auth(e.t.guardia));
    expect(tomada.status).toBe(200);
    expect(tomada.body.estado.estado).toBe("EN_CURSO");

    const { crearUsuario, token } = await import("./ayudas");
    const otro = await crearUsuario("GUARDIA");
    const r = await request(app).post(`/api/guardia/eventos/${ev.id}/tomar`).set(auth(await token(otro.email)));
    expect(r.status).toBe(409);

    const res = await request(app)
      .post(`/api/guardia/eventos/${ev.id}/resolver`)
      .set(auth(e.t.guardia))
      .send({ resultado: "FALSA_ALARMA", nota: "La dueña olvidó desarmar" });
    expect(res.body.estado.estado).toBe("FALSA_ALARMA");
    expect(res.body.estado.nota).toBe("La dueña olvidó desarmar");
  });
});
