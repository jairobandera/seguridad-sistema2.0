# AGENTS.md — Seguridad Residencial v2

## Arquitectura
- `backend/`: Node 20, Express 5, TypeScript, Prisma 5 (**MySQL**), Socket.IO, broker MQTT embebido (aedes) en `/mqtt` (WebSocket) y TCP opcional (`MQTT_TCP_PORT`, 1884 en local), Expo Push, Twilio.
- `app/`: Expo SDK 58 + Expo Router (`src/app/`), React Native Paper, TanStack Query, Zustand, react-native-ble-plx.
- `firmware/seguridad_esp32/`: Arduino-ESP32 core 3.x, NimBLE-Arduino 2.x, ArduinoJson 7, esp-mqtt. Partición "Minimal SPIFFS".
- **Contrato único**: `docs/protocolo.md`. Si cambiás un mensaje BLE/MQTT/Socket/API, actualizalo ahí y en los tres lados.

## Reglas
- Toda ruta valida con zod y verifica permisos con `requerirRol` + `verificarAccesoCasa`/`verificarAccesoDispositivo` (`backend/src/core/auth/`).
- Nunca devolver `passwordHash`: usar `selectUsuarioPublico`.
- El `deviceId` de MQTT se toma **solo del topic**. Los mensajes de cada placa se procesan en orden (`dispositivo.mqtt.ts`).
- Toda la lógica de alarmas (severidad, push, SMS, anti-spam, retardo) vive en `backend/src/modules/alarma/alarma.service.ts`.
- Firmware: nada bloqueante en callbacks (BLE/MQTT encolan, `loop()` procesa); nunca imprimir claves.
- App: usar `npx expo install` para dependencias; consultar la documentación de Expo de la versión 58 antes de usar APIs nativas.

## Comandos
```bash
# backend (XAMPP MySQL encendido)
npx pnpm@10 install
npx prisma migrate dev
npx pnpm@10 dev
npx pnpm@10 test
npx pnpm@10 typecheck
npx tsx scripts/simular-placa.ts --codigo <c>     # placa simulada

# app
npm install
npx expo start
npx tsc --noEmit
npx eslint src
npx expo-doctor

# firmware (CLI del Arduino IDE)
arduino-cli compile --fqbn esp32:esp32:esp32:PartitionScheme=min_spiffs firmware/seguridad_esp32
```
