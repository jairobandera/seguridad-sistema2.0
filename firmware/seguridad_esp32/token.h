#pragma once
#include <Arduino.h>

// Verifica el token de configuración que genera el backend para el dueño:
//   "<exp>.<hex(HMAC-SHA256(secreto, deviceId|exp))>"   (docs/protocolo.md §1)
// Si la placa tiene hora, exige que no esté vencido. Sin hora, confía en la ventana BLE (máx. 10 min).
bool tokenConfigValido(const String& token, const String& deviceId, const uint8_t* secreto, bool hayHora);
