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

describe("salud", () => {
  it("/api/salud escribe y lee en la base (para que no se apague) y es pública", async () => {
    const a = await request(app).get("/api/salud");
    const b = await request(app).get("/api/salud");
    expect(a.status).toBe(200);
    expect(b.body.db).toMatchObject({ escritura: true, lectura: true });
    expect(b.body.db.llamadas).toBe(a.body.db.llamadas + 1);
    expect(b.body.conteos.usuarios).toBeGreaterThan(0);
  });
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

  it("barrios: solo el admin los gestiona; nombre único", async () => {
    expect((await request(app).post("/api/admin/barrios").set(auth(e.t.guardia)).send({ nombre: "Otro" })).status).toBe(403);
    const r = await request(app).post("/api/admin/barrios").set(auth(e.t.admin)).send({ nombre: "Los Pinos", tieneGuardia: false });
    expect(r.status).toBe(201);
    expect(r.body.tieneGuardia).toBe(false);
    expect((await request(app).post("/api/admin/barrios").set(auth(e.t.admin)).send({ nombre: "Los Pinos" })).status).toBe(409);
  });

  it("paquete: Barrio exige barrio; Individual no tiene barrio ni guardia", async () => {
    const sinBarrio = await request(app).post("/api/admin/casas").set(auth(e.t.admin)).send({ calle: "A", paquete: "BARRIO" });
    expect(sinBarrio.status).toBe(400);
    const ind = await request(app)
      .post("/api/admin/casas")
      .set(auth(e.t.admin))
      .send({ calle: "B", paquete: "INDIVIDUAL", barrioId: e.barrio.id });
    expect(ind.status).toBe(201);
    expect(ind.body.barrioId).toBeNull();
    expect(ind.body.tieneGuardia).toBe(false);
    const sistemas = await request(app).get("/api/admin/sistemas").set(auth(e.t.admin));
    expect(sistemas.body.individuales.casas).toBeGreaterThanOrEqual(2);
    expect(sistemas.body.barrios.find((b: { id: number }) => b.id === e.barrio.id).guardias).toHaveLength(1);
  });

  it("los barrios de un guardia se guardan y se devuelven", async () => {
    const r = await request(app).put(`/api/admin/usuarios/${e.guardia.id}`).set(auth(e.t.admin)).send({ barrioIds: [e.barrio.id] });
    expect(r.status).toBe(200);
    const lista = await request(app).get("/api/admin/usuarios?rol=GUARDIA").set(auth(e.t.admin));
    expect(lista.body.find((u: { id: number }) => u.id === e.guardia.id).barrioIds).toEqual([e.barrio.id]);
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

    // Si a la placa no le llegó la respuesta, puede repetir el canje (misma placa y mismo secreto)
    const reintento = await request(app).post("/api/dispositivos/provision").send({ deviceId: "C1B2C3D4E5F6", codigo: r.body.codigo, secret });
    expect(reintento.status).toBe(200);
    expect(reintento.body.mqtt.pass).not.toBe(ok.body.mqtt.pass);
    const otroSecreto = await request(app)
      .post("/api/dispositivos/provision")
      .send({ deviceId: "C1B2C3D4E5F6", codigo: r.body.codigo, secret: "ef".repeat(32) });
    expect(otroSecreto.status).toBe(400);
    // Respuesta liviana para el ESP32: sin las cabeceras de seguridad web
    expect(reintento.headers["content-security-policy"]).toBeUndefined();
    expect(reintento.headers["ratelimit-policy"]).toBeUndefined();
  });

  it("reiniciar: solo dueño o admin; si no está conectado avisa que hay que desenchufarlo", async () => {
    const ruta = `/api/dispositivos/${dispositivoId}/reiniciar`;
    expect((await request(app).post(ruta).set(auth(e.t.familiar))).status).toBe(403);
    expect((await request(app).post(ruta).set(auth(e.t.ajeno))).status).toBe(404);
    const r = await request(app).post(ruta).set(auth(e.t.dueno));
    expect(r.status).toBe(202);
    expect(r.body.mensaje).toMatch(/Desenchufalo/);
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

describe("registro desde la app", () => {
  let n = 0;
  const datos = (extra: Record<string, unknown> = {}) => ({
    nombre: "Nuevo",
    apellido: "Vecino",
    email: `registro${++n}-${Date.now()}@test.com`,
    password: "ClaveSegura1",
    ...extra,
  });
  const direccion = { calle: "Los Pinos", numero: "10" };
  const registrar = (d: Record<string, unknown>) => request(app).post("/auth/registro").send(d);
  const misCasas = async (token: string) => (await request(app).get("/api/casas/mias").set(auth(token))).body;

  it("sin código crea una casa individual a su nombre y queda logueado", async () => {
    const r = await registrar(datos({ direccion }));
    expect(r.status).toBe(201);
    expect(r.body.usuario.rol).toBe("CLIENTE");
    const [casa] = await misCasas(r.body.accessToken);
    expect(casa.paquete).toBe("INDIVIDUAL");
    expect(casa.rolCasa).toBe("DUENO");
    expect(casa.calle).toBe("Los Pinos");
  });

  it("pide la dirección, rechaza emails repetidos y códigos que no existen", async () => {
    expect((await registrar(datos())).status).toBe(400);
    const d = datos({ direccion });
    expect((await registrar(d)).status).toBe(201);
    expect((await registrar({ ...d, nombre: "Otro" })).status).toBe(409);
    expect((await registrar(datos({ direccion, codigo: "B-NOEXISTE" }))).status).toBe(400);
  });

  it("con el código del barrio queda en ese barrio y el guardia ve su casa; regenerarlo invalida el anterior", async () => {
    const g = await request(app).post(`/api/admin/barrios/${e.barrio.id}/codigo`).set(auth(e.t.admin));
    const codigo: string = g.body.codigoRegistro;
    expect(codigo).toMatch(/^B-[A-Z2-9]{6}$/);
    expect((await request(app).post(`/api/admin/barrios/${e.barrio.id}/codigo`).set(auth(e.t.guardia))).status).toBe(403);

    const r = await registrar(datos({ direccion: { ...direccion, numero: "77" }, codigo: codigo.toLowerCase() }));
    expect(r.status).toBe(201);
    const [casa] = await misCasas(r.body.accessToken);
    expect(casa.paquete).toBe("BARRIO");
    expect(casa.barrio).toBe(e.barrio.nombre);
    const delGuardia = await request(app).get("/api/guardia/casas").set(auth(e.t.guardia));
    expect(delGuardia.body.map((c: { id: number }) => c.id)).toContain(casa.id);

    await request(app).post(`/api/admin/barrios/${e.barrio.id}/codigo`).set(auth(e.t.admin));
    expect((await registrar(datos({ direccion, codigo }))).status).toBe(400);
  });

  it("con el código de familia se suma como familiar; solo el dueño lo genera y lo ve", async () => {
    expect((await request(app).post(`/api/casas/${e.casa.id}/codigo-familia`).set(auth(e.t.familiar))).status).toBe(403);
    const g = await request(app).post(`/api/casas/${e.casa.id}/codigo-familia`).set(auth(e.t.dueno));
    expect(g.body.codigoFamilia).toMatch(/^F-[A-Z2-9]{6}$/);

    const r = await registrar(datos({ codigo: g.body.codigoFamilia }));
    expect(r.status).toBe(201);
    const [casa] = await misCasas(r.body.accessToken);
    expect(casa.id).toBe(e.casa.id);
    expect(casa.rolCasa).toBe("FAMILIAR");
    expect(casa.codigoFamilia).toBeNull();
    const delDueno = (await misCasas(e.t.dueno)).find((c: { id: number }) => c.id === e.casa.id);
    expect(delDueno.codigoFamilia).toBe(g.body.codigoFamilia);
  });
});
