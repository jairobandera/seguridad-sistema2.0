import http from "http";
import { config } from "./core/config";
import { logger } from "./core/logger";
import { prisma } from "./core/prisma";
import { crearApp } from "./app";
import { iniciarSocket } from "./core/socket";
import { cerrarBroker, iniciarBroker } from "./core/mqtt/broker";
import { detenerManejadoresMqtt, iniciarManejadoresMqtt } from "./modules/dispositivos/dispositivo.mqtt";

const server = http.createServer(crearApp());
iniciarSocket(server);
iniciarBroker(server);
iniciarManejadoresMqtt();

server.listen(config.PORT, "0.0.0.0", () => {
  logger.info(`Servidor escuchando en http://0.0.0.0:${config.PORT}`);
});

async function apagar(senal: string) {
  logger.info(`${senal}: cerrando...`);
  server.close();
  await detenerManejadoresMqtt();
  await cerrarBroker();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void apagar("SIGTERM"));
process.on("SIGINT", () => void apagar("SIGINT"));
