import pino from "pino";
import { config } from "./config";

export const logger = pino({
  // En los tests no se muestra nada, salvo con LOG_TESTS=1 (para investigar un test que falla)
  level: config.esTest ? (process.env.LOG_TESTS ? "warn" : "silent") : config.LOG_LEVEL,
  redact: {
    paths: [
      "password",
      "*.password",
      "passwordHash",
      "*.passwordHash",
      "pass",
      "*.pass",
      "token",
      "*.token",
      "refreshToken",
      "*.refreshToken",
      "secret",
      "*.secret",
      "codigo",
      "*.codigo",
      "req.headers.authorization",
    ],
    censor: "[oculto]",
  },
  transport: config.esProduccion || config.esTest ? undefined : { target: "pino-pretty", options: { colorize: true } },
});
