import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./core/config";
import { prisma } from "./core/prisma";
import { manejadorErrores, rutaNoEncontrada } from "./core/errores";
import { autenticar, requerirRol } from "./core/auth/middleware";
import { estadoBroker } from "./core/mqtt/broker";
import { authRouter } from "./modules/auth/auth.routes";
import { meRouter } from "./modules/me/me.routes";
import { casasRouter } from "./modules/casas/casas.routes";
import { contactosRouter } from "./modules/contactos/contactos.routes";
import { dispositivosRouter } from "./modules/dispositivos/dispositivos.routes";
import { guardiaRouter } from "./modules/guardia/guardia.routes";
import { adminRouter } from "./modules/admin/admin.routes";

export function crearApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  // Las cabeceras de seguridad web (~1 KB) no sirven para la placa y le llenan el búfer HTTP del ESP32
  const cabecerasWeb = helmet();
  app.use((req, res, next) => (req.path === "/api/dispositivos/provision" ? next() : cabecerasWeb(req, res, next)));
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false }));
  app.use(express.json({ limit: "100kb" }));

  // Salud: público y liviano (lo usa Render y cron-job.org para mantenerlo despierto)
  const salud: express.RequestHandler = async (_req, res) => {
    let db = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    res.status(db ? 200 : 503).json({ ok: db, db, mqtt: estadoBroker().activo, hora: new Date().toISOString() });
  };
  app.get("/health", salud);
  app.get("/api/health", salud);

  // Para el cron-job: escribe y lee de verdad en la base (Aiven Free apaga la base si no ve actividad)
  app.get("/api/salud", async (_req, res) => {
    const inicio = Date.now();
    try {
      const ahora = new Date();
      const [latido, usuarios, casas, dispositivos] = await prisma.$transaction([
        prisma.latido.upsert({
          where: { id: 1 },
          update: { ultimo: ahora, llamadas: { increment: 1 } },
          create: { id: 1, ultimo: ahora, llamadas: 1 },
        }),
        prisma.usuario.count(),
        prisma.casa.count(),
        prisma.dispositivo.count(),
      ]);
      res.json({
        ok: true,
        db: { escritura: true, lectura: true, ms: Date.now() - inicio, llamadas: latido.llamadas },
        conteos: { usuarios, casas, dispositivos },
        mqtt: estadoBroker().activo,
        hora: ahora.toISOString(),
      });
    } catch {
      res.status(503).json({ ok: false, db: { escritura: false, lectura: false, ms: Date.now() - inicio }, hora: new Date().toISOString() });
    }
  });

  app.use("/auth", authRouter);
  app.use("/api/dispositivos", dispositivosRouter); // /provision es público; el resto autentica adentro

  app.use("/api", autenticar);
  app.use("/api", meRouter);
  app.use("/api/casas", casasRouter);
  app.use("/api/contactos", requerirRol("CLIENTE"), contactosRouter);
  app.use("/api/guardia", guardiaRouter);
  app.use("/api/admin", adminRouter);

  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);
  return app;
}
