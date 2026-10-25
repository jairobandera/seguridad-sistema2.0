import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { prisma } from "../src/core/prisma";
import { enviarCorreo } from "../src/core/notificaciones/correo";
import { app, CLAVE, crearUsuario, limpiarBase } from "./ayudas";

vi.mock("../src/core/notificaciones/push", () => ({ enviarPush: vi.fn(async () => 1), esTokenPushValido: () => true }));
vi.mock("../src/core/notificaciones/sms", () => ({ enviarSms: vi.fn(async () => ({ ok: true })), smsHabilitado: () => false }));
vi.mock("../src/core/notificaciones/correo", () => ({
  enviarCorreo: vi.fn(async () => ({ ok: true })),
  correoHabilitado: () => true,
}));

const enviado = vi.mocked(enviarCorreo);
/** El código que "llegó" en el último email. */
const ultimoCodigo = () => /\b(\d{6})\b/.exec(enviado.mock.calls.at(-1)![0].texto)![1];

let email: string;

beforeAll(async () => {
  await limpiarBase();
});

beforeEach(async () => {
  enviado.mockClear();
  email = (await crearUsuario("CLIENTE")).email;
});

describe("olvidé mi contraseña", () => {
  it("con el código del email elige otra contraseña sin la anterior y cierra las otras sesiones", async () => {
    const vieja = await request(app).post("/auth/login").send({ email, password: CLAVE });

    expect((await request(app).post("/auth/olvide-password").send({ email: email.toUpperCase() })).status).toBe(204);
    expect(enviado).toHaveBeenCalledTimes(1);
    expect(enviado.mock.calls[0][0].para).toBe(email);

    const r = await request(app)
      .post("/auth/restablecer-password")
      .send({ email, codigo: ultimoCodigo(), nueva: "NuevaClave99" });
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTruthy();

    expect((await request(app).post("/auth/login").send({ email, password: CLAVE })).status).toBe(401);
    expect((await request(app).post("/auth/login").send({ email, password: "NuevaClave99" })).status).toBe(200);
    expect((await request(app).post("/auth/refresh").send({ refreshToken: vieja.body.refreshToken })).status).toBe(401);
  });

  it("el código sirve una sola vez", async () => {
    await request(app).post("/auth/olvide-password").send({ email });
    const codigo = ultimoCodigo();
    const datos = { email, codigo, nueva: "OtraClave123" };
    expect((await request(app).post("/auth/restablecer-password").send(datos)).status).toBe(200);
    expect((await request(app).post("/auth/restablecer-password").send(datos)).status).toBe(400);
  });

  it("un email que no está registrado responde igual y no manda nada", async () => {
    const r = await request(app).post("/auth/olvide-password").send({ email: "nadie@test.com" });
    expect(r.status).toBe(204);
    expect(enviado).not.toHaveBeenCalled();
  });

  it("no manda dos emails seguidos a la misma cuenta", async () => {
    await request(app).post("/auth/olvide-password").send({ email });
    await request(app).post("/auth/olvide-password").send({ email });
    expect(enviado).toHaveBeenCalledTimes(1);
  });

  it("después de 5 códigos equivocados hay que pedir uno nuevo", async () => {
    await request(app).post("/auth/olvide-password").send({ email });
    const bueno = ultimoCodigo();
    const malo = bueno === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post("/auth/restablecer-password").send({ email, codigo: malo, nueva: "NuevaClave99" });
      expect(r.body.error).toBe("codigo_invalido");
    }
    const r = await request(app).post("/auth/restablecer-password").send({ email, codigo: bueno, nueva: "NuevaClave99" });
    expect(r.body.error).toBe("demasiados_intentos");
  });

  it("un código vencido no sirve", async () => {
    await request(app).post("/auth/olvide-password").send({ email });
    const codigo = ultimoCodigo();
    await prisma.recuperacionPassword.updateMany({ data: { expiraEn: new Date(Date.now() - 1000) } });
    const r = await request(app).post("/auth/restablecer-password").send({ email, codigo, nueva: "NuevaClave99" });
    expect(r.status).toBe(400);
  });
});
