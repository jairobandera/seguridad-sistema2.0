import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { prisma } from "../src/core/prisma";
import { enviarPush } from "../src/core/notificaciones/push";
import { enviarSms } from "../src/core/notificaciones/sms";
import { _reiniciarEstadoInterno, cambiarAlarma } from "../src/modules/alarma/alarma.service";
import { _procesarMensaje } from "../src/modules/dispositivos/dispositivo.mqtt";
import { app, auth, crearBarrio, crearUsuario, escenario, limpiarBase, token, vincularPlaca } from "./ayudas";

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

    const otro = await crearUsuario("GUARDIA");
    await prisma.guardiaBarrio.create({ data: { usuarioId: otro.id, barrioId: e.barrio.id } });
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

const alarmas = () => vi.mocked(enviarPush).mock.calls.filter((c) => c[1].alarma);

describe("barrios y paquetes", () => {
  it("casa individual: avisa a la familia y por SMS, sin guardias ni alerta pendiente", async () => {
    await prisma.casa.update({ where: { id: e.casa.id }, data: { paquete: "INDIVIDUAL", barrioId: null } });
    await cambiarAlarma(e.dueno.id, e.casa.id, true);
    await puerta(true);
    const ev = await prisma.evento.findFirstOrThrow({ where: { tipo: "PUERTA_ABIERTA" }, include: { estado: true } });
    expect(ev.severidad).toBe("CRITICA");
    expect(ev.estado).toBeNull();
    expect(alarmas()[0][0]).toEqual(expect.arrayContaining([e.dueno.id, e.familiar.id]));
    expect(alarmas()[0][0]).not.toContain(e.guardia.id);
    expect(enviarSms).toHaveBeenCalled();
  });

  it("barrio con la guardia apagada: igual que individual y el guardia deja de ver la casa", async () => {
    await prisma.barrio.update({ where: { id: e.barrio.id }, data: { tieneGuardia: false } });
    await cambiarAlarma(e.dueno.id, e.casa.id, true);
    await puerta(true);
    expect(alarmas()[0][0]).not.toContain(e.guardia.id);
    expect(await prisma.eventoEstado.count()).toBe(0);
    expect((await request(app).get(`/api/guardia/casas/${e.casa.id}`).set(auth(e.t.guardia))).status).toBe(404);
  });

  it("un guardia de otro barrio no recibe la alarma ni ve la casa o sus alertas", async () => {
    const otro = await crearUsuario("GUARDIA");
    await crearBarrio(true, [otro.id]);
    const t = await token(otro.email);
    await cambiarAlarma(e.dueno.id, e.casa.id, true);
    await puerta(true);
    expect(alarmas()[0][0]).toContain(e.guardia.id);
    expect(alarmas()[0][0]).not.toContain(otro.id);
    const ev = await prisma.evento.findFirstOrThrow({ where: { tipo: "PUERTA_ABIERTA" } });
    expect((await request(app).get(`/api/guardia/casas/${e.casa.id}`).set(auth(t))).status).toBe(404);
    expect((await request(app).post(`/api/guardia/eventos/${ev.id}/tomar`).set(auth(t))).status).toBe(404);
    expect((await request(app).get("/api/guardia/casas").set(auth(t))).body).toHaveLength(0);
    expect((await request(app).get("/api/guardia/eventos").set(auth(t))).body.items).toHaveLength(0);
  });
});

describe("varios dispositivos por casa", () => {
  it("el estado trae todos, online es que estén todos y el aviso dice cuál se abrió", async () => {
    const segundo = await vincularPlaca(e.casa.id, "0A0B0C0D0E0F", "Ventana cocina");
    expect(segundo.disp.nombre).toBe("Ventana cocina");
    await _procesarMensaje(DEVICE, "state", { online: true, puerta: "cerrada" });
    const r = await request(app).get(`/api/casas/${e.casa.id}`).set(auth(e.t.dueno));
    expect(r.body.estado.dispositivos.map((d: { nombre: string }) => d.nombre)).toEqual(["Puerta principal", "Ventana cocina"]);
    expect(r.body.estado.online).toBe(false);
    expect(r.body.estado.dispositivosOffline).toBe(1);
    expect(r.body.estado.tieneGuardia).toBe(true);

    await cambiarAlarma(e.dueno.id, e.casa.id, true);
    await _procesarMensaje("0A0B0C0D0E0F", "event", { seq: 1, tipo: "PUERTA_ABIERTA", ts: ahora() });
    expect(alarmas()[0][1].cuerpo).toContain("Ventana cocina");
  });

  it("sin nombre elegido el segundo se llama Dispositivo 2; solo el dueño o el admin lo renombran", async () => {
    const { disp } = await vincularPlaca(e.casa.id, "0A0B0C0D0E0F");
    expect(disp.nombre).toBe("Dispositivo 2");
    const ruta = `/api/dispositivos/${disp.id}`;
    expect((await request(app).put(ruta).set(auth(e.t.familiar)).send({ nombre: "Garage" })).status).toBe(403);
    expect((await request(app).put(ruta).set(auth(e.t.guardia)).send({ nombre: "Garage" })).status).toBe(403);
    expect((await request(app).put(ruta).set(auth(e.t.ajeno)).send({ nombre: "Garage" })).status).toBe(404);
    expect((await request(app).put(ruta).set(auth(e.t.dueno)).send({ nombre: "" })).status).toBe(400);
    expect((await request(app).put(ruta).set(auth(e.t.admin)).send({ nombre: "Garage" })).body.nombre).toBe("Garage");
  });

  it("el código de vinculación guarda el nombre que eligió el dueño", async () => {
    const r = await request(app)
      .post(`/api/casas/${e.casa.id}/codigo-vinculacion`)
      .set(auth(e.t.dueno))
      .send({ nombre: "Puerta trasera" });
    expect(r.status).toBe(201);
    const c = await prisma.codigoVinculacion.findFirstOrThrow({ where: { casaId: e.casa.id, usadoEn: null } });
    expect(c.nombreDispositivo).toBe("Puerta trasera");
  });
});

describe("armado parcial", () => {
  const VENTANA = "0A0B0C0D0E0F";
  const armar = (excluir?: number[]) =>
    request(app).put(`/api/casas/${e.casa.id}/alarma`).set(auth(e.t.dueno)).send({ armada: true, excluir });

  it("lo que queda afuera no dispara; lo demás sí; al desarmar vuelve a incluir todo", async () => {
    const { disp: ventana } = await vincularPlaca(e.casa.id, VENTANA, "Ventana cocina");
    await _procesarMensaje(VENTANA, "event", { seq: 1, tipo: "PUERTA_ABIERTA", ts: ahora() });

    const r = await armar([ventana.id]);
    expect(r.status).toBe(200);
    expect(r.body.advertencia).toBeNull(); // la ventana abierta quedó afuera
    expect(r.body.estado.armadoParcial).toBe(true);
    expect(r.body.estado.dispositivos.find((d: { id: number }) => d.id === ventana.id).excluido).toBe(true);
    const ev = await prisma.evento.findFirstOrThrow({ where: { tipo: "ALARMA_ARMADA" }, orderBy: { id: "desc" } });
    expect(ev.valor).toBe("Sin: Ventana cocina");

    await _procesarMensaje(VENTANA, "event", { seq: 2, tipo: "PUERTA_CERRADA", ts: ahora() });
    await _procesarMensaje(VENTANA, "event", { seq: 3, tipo: "PUERTA_ABIERTA", ts: ahora() });
    expect(alarmas()).toHaveLength(0);

    await puerta(true); // la puerta principal sí está en la alarma
    expect(alarmas()).toHaveLength(1);

    await request(app).put(`/api/casas/${e.casa.id}/alarma`).set(auth(e.t.dueno)).send({ armada: false });
    expect(await prisma.dispositivo.count({ where: { excluidoAlarma: true } })).toBe(0);
  });

  it("armar todo con algo abierto avisa; no se puede dejar todo afuera ni excluir algo ajeno", async () => {
    const { disp: ventana } = await vincularPlaca(e.casa.id, VENTANA, "Ventana cocina");
    await _procesarMensaje(VENTANA, "event", { seq: 1, tipo: "PUERTA_ABIERTA", ts: ahora() });
    const principal = await prisma.dispositivo.findUniqueOrThrow({ where: { deviceId: DEVICE } });
    expect((await armar([ventana.id, principal.id])).status).toBe(400);
    expect((await armar([999999])).status).toBe(400);
    expect((await armar()).body.advertencia).toBe("puerta_abierta");
  });

  it("si un dispositivo que quedó afuera se desconecta, no genera alerta", async () => {
    const { disp: ventana } = await vincularPlaca(e.casa.id, VENTANA, "Ventana cocina");
    await _procesarMensaje(VENTANA, "state", { online: true, puerta: "cerrada" });
    await armar([ventana.id]);
    await _procesarMensaje(VENTANA, "state", { online: false });
    await new Promise((r) => setTimeout(r, 50));
    const off = await prisma.evento.findFirstOrThrow({ where: { tipo: "DISPOSITIVO_OFFLINE" }, include: { estado: true } });
    expect(off.severidad).toBe("INFO");
    expect(off.estado).toBeNull();
  });
});

describe("batería baja", () => {
  const bateria = (bat: number) => _procesarMensaje(DEVICE, "telemetry", { rssi: -60, bat, mv: 3300 + bat * 9 });
  const avisos = () => vi.mocked(enviarPush).mock.calls.filter((c) => c[1].tipo === "BATERIA");

  it("avisa una vez al 20 %, otra al 10 %, y se rearma recién al cargarla (30 %)", async () => {
    await bateria(50);
    await bateria(19);
    await bateria(21); // oscila: no repite
    await bateria(18);
    expect(avisos()).toHaveLength(1);
    expect(avisos()[0][1].titulo).toContain("Batería baja");
    expect(avisos()[0][0]).toEqual(expect.arrayContaining([e.dueno.id, e.familiar.id]));
    expect(avisos()[0][0]).not.toContain(e.guardia.id);

    await bateria(9);
    expect(avisos()).toHaveLength(2);
    expect(avisos()[1][1].titulo).toContain("muy baja");

    await bateria(80); // la cargaron
    await bateria(19);
    expect(avisos()).toHaveLength(3);
    const ev = await prisma.evento.findMany({ where: { tipo: "BATERIA_BAJA" }, orderBy: { id: "asc" } });
    expect(ev.map((x) => x.valor)).toEqual(["19", "9", "19"]);
  });

  it("si se desconecta con poca batería, el aviso dice que seguramente fue la batería", async () => {
    const desconexion = () => vi.mocked(enviarPush).mock.calls.filter((c) => c[1].tipo === "OFFLINE").at(-1)![1].cuerpo;
    await _procesarMensaje(DEVICE, "state", { online: true, puerta: "cerrada" });
    await bateria(60);
    await _procesarMensaje(DEVICE, "state", { online: false });
    await new Promise((r) => setTimeout(r, 50));
    expect(desconexion()).not.toContain("batería");

    await _procesarMensaje(DEVICE, "state", { online: true, puerta: "cerrada" });
    await bateria(8);
    await _procesarMensaje(DEVICE, "state", { online: false });
    await new Promise((r) => setTimeout(r, 50));
    expect(desconexion()).toContain("sin batería: tenía 8 %");
  });
});
