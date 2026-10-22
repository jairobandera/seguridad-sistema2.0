import pino from "pino";
import { config } from "./config";

export const logger = pino({
  level: config.esTest ? "silent" : config.LOG_LEVEL,
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
