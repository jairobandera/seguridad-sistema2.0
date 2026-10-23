import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const esquema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  ACCESS_TOKEN_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_DIAS: z.coerce.number().int().positive().default(30),
  // 32 bytes en hex (64 caracteres) para cifrar el secreto de cada placa
  DEVICE_SECRET_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "DEVICE_SECRET_KEY debe ser 64 caracteres hex"),

  CORS_ORIGINS: z.string().default(""),

  // Broker MQTT embebido. Las placas se conectan por WebSocket en {API}/mqtt.
  // En desarrollo se puede abrir además un puerto TCP (ej. 1883) para la red local.
  // Vacío = sin TCP (en Render no se define: solo entra HTTPS/WSS)
  MQTT_TCP_PORT: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().positive().optional()),
  // URL que se le entrega a la placa al vincularse (ej. wss://mi-api.onrender.com/mqtt o mqtt://192.168.1.10:1883)
  MQTT_PUBLIC_URL: z.string().default("ws://localhost:3000/mqtt"),
  // Segundos de espera antes de declarar offline una placa que se desconectó (evita falsas alarmas por cortes breves)
  DEVICE_OFFLINE_GRACIA_SEG: z.coerce.number().int().nonnegative().default(30),

  DEVICE_OFFLINE_SEG: z.coerce.number().int().positive().default(150),

  // Notificaciones
  EXPO_ACCESS_TOKEN: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  SMS_HABILITADO: bool.default("false"),
  SMS_MINUTOS_ENTRE_ALERTAS: z.coerce.number().int().nonnegative().default(5),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
});

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  const errores = resultado.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  // eslint-disable-next-line no-console
  console.error(`Configuración inválida en .env:\n${errores}`);
  process.exit(1);
}

export const config = {
  ...resultado.data,
  corsOrigins: resultado.data.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
  esProduccion: resultado.data.NODE_ENV === "production",
  esTest: resultado.data.NODE_ENV === "test",
};

export type Config = typeof config;
