import { beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { prisma } from "../src/core/prisma";
import { app, auth, CLAVE, escenario, limpiarBase, vincularPlaca } from "./ayudas";

vi.mock("../src/core/notificaciones/push", () => ({ enviarPush: vi.fn(async () => 1), esTokenPushValido: () => true }));
vi.mock("../src/core/notificaciones/sms", () => ({ enviarSms: vi.fn(async () => ({ ok: true })), smsHabilitado: () => false }));

let e: Awaited<ReturnType<typeof escenario>>;
let dispositivoId: number;
let dispositivoAjenoId: number;

beforeAll(async () => {
  await limpiarBase();
  e = await escenario();
  dispositivoId = (await vincularPlaca(e.casa.id, "A1B2C3D4E5F6")).disp.id;
  dispositivoAjenoId = (await vincularPlaca(e.casaAjena.id, "B1B2C3D4E5F6")).disp.id;
});

describe("auth", () => {
  it("rechaza sin token", async () => {
    expect((await request(app).get("/api/me")).status).toBe(401);
  });

  it("/api/me nunca expone el hash ni la versión de token", async () => {
    const r = await request(app).get("/api/me").set(auth(e.t.dueno));
    expect(r.status).toBe(200);
    expect(r.body.passwordHash).toBeUndefined();
    expect(r.body.tokenVersion).toBeUndefined();
    expect(r.body.casas).toHaveLength(1);
  });

  it("refresh rota el token y el viejo deja de servir", async () => {
    const login = await request(app).post("/auth/login").send({ email: e.familiar.email, password: CLAVE });
    const r1 = await request(app).post("/auth/refresh").send({ refreshToken: login.body.refreshToken });
    expect(r1.status).toBe(200);
    const r2 = await request(app).post("/auth/refresh").send({ refreshToken: login.body.refreshToken });
    expect(r2.status).toBe(401);
  });

  it("un usuario desactivado pierde el acceso al instante", async () => {
    const tAjeno = e.t.ajeno;
    await request(app).put(`/api/admin/usuarios/${e.ajeno.id}`).set(auth(e.t.admin)).send({ activo: false });
    expect((await request(app).get("/api/me").set(auth(tAjeno))).status).toBe(401);
    await request(app).put(`/api/admin/usuarios/${e.ajeno.id}`).set(auth(e.t.admin)).send({ activo: true });
    const login = await request(app).post("/auth/login").send({ email: e.ajeno.email, password: CLAVE });
    e.t.ajeno = login.body.accessToken;
  });
});

describe("admin", () => {
  it("solo un ADMIN puede crear usuarios (antes cualquiera podía crear un ADMIN)", async () => {
    const datos = { nombre: "X", apellido: "Y", email: "nuevo-admin@test.com", rol: "ADMIN" };
    for (const t of [e.t.dueno, e.t.guardia]) {
      expect((await request(app).post("/api/admin/usuarios").set(auth(t)).send(datos)).status).toBe(403);
    }
    const r = await request(app).post("/api/admin/usuarios").set(auth(e.t.admin)).send(datos);
    expect(r.status).toBe(201);
    expect(r.body.passwordTemporal).toHaveLength(10);
    expect(r.body.usuario.debeCambiarPassword).toBe(true);
  });

  it("un admin no puede desactivarse a sí mismo", async () => {
    const r = await request(app).put(`/api/admin/usuarios/${e.admin.id}`).set(auth(e.t.admin)).send({ activo: false });
    expect(r.status).toBe(400);
  });
});

describe("casas", () => {
  it("un cliente no ve casas ajenas", async () => {
    expect((await request(app).get(`/api/casas/${e.casaAjena.id}/eventos`).set(auth(e.t.dueno))).status).toBe(404);
    expect((await request(app).get(`/api/casas/${e.casa.id}/eventos`).set(auth(e.t.familiar))).status).toBe(200);
  });

  it("dueño y familiar arman; el guardia no", async () => {
    expect((await request(app).put(`/api/casas/${e.casa.id}/alarma`).set(auth(e.t.familiar)).send({ armada: true })).status).toBe(200);
    expect((await request(app).put(`/api/casas/${e.casa.id}/alarma`).set(auth(e.t.guardia)).send({ armada: false })).status).toBe(403);
  });

  it("armar dos veces no cambia el estado ni duplica eventos (antes alternaba)", async () => {
    await request(app).put(`/api/casas/${e.casa.id}/alarma`).set(auth(e.t.dueno)).send({ armada: true });
    await request(app).put(`/api/casas/${e.casa.id}/alarma`).set(auth(e.t.dueno)).send({ armada: true });
    const casa = await prisma.casa.findUniqueOrThrow({ where: { id: e.casa.id } });
    expect(casa.alarmaArmada).toBe(true);
    const armados = await prisma.evento.count({ where: { casaId: e.casa.id, tipo: "ALARMA_ARMADA" } });
    expect(armados).toBe(1);
  });

  it("solo el dueño genera códigos y agrega familiares", async () => {
    expect((await request(app).post(`/api/casas/${e.casa.id}/codigo-vinculacion`).set(auth(e.t.familiar))).status).toBe(403);
    expect((await request(app).post(`/api/casas/${e.casa.id}/codigo-vinculacion`).set(auth(e.t.guardia))).status).toBe(403);
    expect((await request(app).post(`/api/casas/${e.casa.id}/codigo-vinculacion`).set(auth(e.t.dueno))).status).toBe(201);
    const r = await request(app).post(`/api/casas/${e.casa.id}/miembros`).set(auth(e.t.familiar)).send({ email: e.ajeno.email });
    expect(r.status).toBe(403);
  });
});

describe("placas", () => {
  it("nadie puede resetear ni ver la placa de otra casa", async () => {
    expect((await request(app).post(`/api/dispositivos/${dispositivoAjenoId}/reset`).set(auth(e.t.dueno))).status).toBe(404);
    expect((await request(app).get(`/api/dispositivos/${dispositivoAjenoId}`).set(auth(e.t.dueno))).status).toBe(404);
    expect((await request(app).post(`/api/dispositivos/${dispositivoId}/token-config`).set(auth(e.t.familiar))).status).toBe(403);
  });

  it("el token de configuración tiene el formato exp.firma", async () => {
    const r = await request(app).post(`/api/dispositivos/${dispositivoId}/token-config`).set(auth(e.t.dueno));
    expect(r.status).toBe(200);
    expect(r.body.token).toMatch(/^\d+\.[0-9a-f]{64}$/);
  });

  it("vinculación: código usado, vencido o placa de otra casa", async () => {
    const r = await request(app).post(`/api/casas/${e.casa.id}/codigo-vinculacion`).set(auth(e.t.dueno));
    const secret = "cd".repeat(32);
    const otraCasa = await request(app)
      .post("/api/dispositivos/provision")
      .send({ deviceId: "B1B2C3D4E5F6", codigo: r.body.codigo, secret });
    expect(otraCasa.status).toBe(409);
    const ok = await request(app).post("/api/dispositivos/provision").send({ deviceId: "C1B2C3D4E5F6", codigo: r.body.codigo, secret });
    expect(ok.status).toBe(200);
    expect(ok.body.mqtt.user).toBe("C1B2C3D4E5F6");
    const reuso = await request(app).post("/api/dispositivos/provision").send({ deviceId: "D1B2C3D4E5F6", codigo: r.body.codigo, secret });
    expect(reuso.status).toBe(400);
  });

  it("ya no existen los endpoints que permitían falsear eventos o estados", async () => {
    expect((await request(app).post("/api/eventos").set(auth(e.t.dueno)).send({})).status).toBe(404);
    expect((await request(app).post("/api/dispositivos/online").set(auth(e.t.dueno)).send({ deviceId: "x" })).status).toBe(404);
  });
});

describe("contactos", () => {
  it("máximo 2, teléfono normalizado y solo los propios", async () => {
    const c1 = await request(app).post("/api/contactos").set(auth(e.t.dueno)).send({ nombre: "Mamá", telefono: "+54 9 11 2345-6789" });
    expect(c1.status).toBe(201);
    expect(c1.body.telefono).toBe("+5491123456789");
    expect((await request(app).post("/api/contactos").set(auth(e.t.dueno)).send({ nombre: "B", telefono: "+59899123456" })).status).toBe(201);
    expect((await request(app).post("/api/contactos").set(auth(e.t.dueno)).send({ nombre: "C", telefono: "+59899123457" })).status).toBe(400);
    expect((await request(app).post("/api/contactos").set(auth(e.t.familiar)).send({ nombre: "X", telefono: "123" })).status).toBe(400);
    expect((await request(app).delete(`/api/contactos/${c1.body.id}`).set(auth(e.t.familiar))).status).toBe(404);
    expect((await request(app).get("/api/contactos").set(auth(e.t.guardia))).status).toBe(403);
  });
});

describe("guardia", () => {
  it("el cliente no accede al panel de guardia", async () => {
    expect((await request(app).get("/api/guardia/casas").set(auth(e.t.dueno))).status).toBe(403);
    expect((await request(app).get("/api/guardia/casas").set(auth(e.t.guardia))).status).toBe(200);
  });
});
