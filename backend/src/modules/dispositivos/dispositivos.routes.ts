import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../../core/config";
import { HttpError } from "../../core/errores";
import { leerId } from "../../core/validar";
import { descifrar, tokenConfigPlaca } from "../../core/cripto";
import { autenticar, usuarioDe } from "../../core/auth/middleware";
import { verificarAccesoDispositivo } from "../../core/auth/acceso";
import { enviarComando } from "../../core/mqtt/comandos";
import { desvincular, dispositivoPublico, provisionar } from "./dispositivo.service";
import { esquemaNombreDispositivo } from "../casas/casas.routes";
import { prisma } from "../../core/prisma";
import { emitirEstadoCasa } from "../alarma/alarma.service";

export const dispositivosRouter = Router();

const TOKEN_CONFIG_SEG = 600;

const limiteProvision = rateLimit({
  windowMs: 60_000,
  limit: config.esTest ? 1000 : 10,
  standardHeaders: false, // respuesta liviana para el ESP32
  legacyHeaders: false,
  message: { error: "demasiados_intentos", mensaje: "Demasiados intentos" },
});

/** Lo llama la placa (sin JWT): canjea el código de vinculación. */
dispositivosRouter.post("/provision", limiteProvision, async (req, res) => {
  const datos = z
    .object({
      deviceId: z.string().regex(/^[0-9A-F]{12}$/, "deviceId inválido"),
      codigo: z.string().min(10).max(100),
      secret: z.string().regex(/^[0-9a-fA-F]{64}$/, "secret inválido"),
      fw: z.string().max(20).optional(),
    })
    .parse(req.body);
  res.json(await provisionar(datos));
});

dispositivosRouter.use(autenticar);

dispositivosRouter.get("/:id", async (req, res) => {
  const disp = await verificarAccesoDispositivo(usuarioDe(req), leerId(req.params.id));
  res.json(dispositivoPublico(disp));
});

/** Cambiar el nombre ("Puerta trasera"): dueño o admin. */
dispositivosRouter.put("/:id", async (req, res) => {
  const disp = await verificarAccesoDispositivo(usuarioDe(req), leerId(req.params.id), { gestion: true });
  const { nombre } = z.object({ nombre: esquemaNombreDispositivo }).parse(req.body);
  const actualizado = await prisma.dispositivo.update({ where: { id: disp.id }, data: { nombre } });
  await emitirEstadoCasa(actualizado.casaId);
  res.json(dispositivoPublico(actualizado));
});

/** Token para reconfigurar el WiFi por Bluetooth una placa ya vinculada. */
dispositivosRouter.post("/:id/token-config", async (req, res) => {
  const disp = await verificarAccesoDispositivo(usuarioDe(req), leerId(req.params.id), { gestion: true });
  if (!disp.secretEnc) throw new HttpError(409, "sin_vincular", "La placa no está vinculada");
  const exp = Math.floor(Date.now() / 1000) + TOKEN_CONFIG_SEG;
  res.json({ token: tokenConfigPlaca(descifrar(disp.secretEnc), disp.deviceId, exp), expiraEn: new Date(exp * 1000).toISOString() });
});

/** Pide a la placa que abra el Bluetooth (para cambiar el WiFi). */
dispositivosRouter.post("/:id/modo-config", async (req, res) => {
  const disp = await verificarAccesoDispositivo(usuarioDe(req), leerId(req.params.id), { gestion: true });
  const r = await enviarComando(disp.deviceId, "open_ble");
  if (!r?.ok) {
    return res.status(202).json({
      ok: false,
      mensaje: "La placa no respondió. Mantené apretado su botón 5 segundos para activar el Bluetooth.",
    });
  }
  res.json({ ok: true });
});

/** Reinicia la placa sin borrar nada (si quedó trabada o con la conexión inestable). */
dispositivosRouter.post("/:id/reiniciar", async (req, res) => {
  const disp = await verificarAccesoDispositivo(usuarioDe(req), leerId(req.params.id), { gestion: true });
  const r = await enviarComando(disp.deviceId, "reboot");
  if (!r?.ok) {
    return res.status(202).json({
      ok: false,
      mensaje: "El dispositivo no está conectado, así que no se puede reiniciar desde la app. Desenchufalo, esperá 5 segundos y volvé a enchufarlo.",
    });
  }
  res.json({ ok: true });
});

/** Restablece la placa de fábrica y la desvincula. */
dispositivosRouter.post("/:id/reset", async (req, res) => {
  const disp = await verificarAccesoDispositivo(usuarioDe(req), leerId(req.params.id), { gestion: true });
  const r = await enviarComando(disp.deviceId, "factory_reset");
  if (!r?.ok) {
    return res.status(202).json({
      ok: false,
      mensaje: "La placa no respondió. Podés desvincularla igual y restablecerla manteniendo su botón 15 segundos.",
    });
  }
  await desvincular(disp, "reset");
  res.json({ ok: true });
});

/** Desvincula sin hablar con la placa (por ejemplo si está rota o sin conexión). */
dispositivosRouter.delete("/:id/vinculo", async (req, res) => {
  const disp = await verificarAccesoDispositivo(usuarioDe(req), leerId(req.params.id), { gestion: true });
  await desvincular(disp);
  res.status(204).end();
});
