#pragma once
#include <Arduino.h>

// Patrones del LED de la placa:
//   CONFIG     parpadeo rápido continuo (Bluetooth abierto, esperando la app)
//   SIN_WIFI   2 destellos cada 2 s
//   SIN_MQTT   3 destellos cada 2 s (hay WiFi pero no llega al servidor)
//   OK         1 destello corto cada 5 s
//   RESET      encendido fijo (soltá el botón para restablecer)
enum class PatronLed { APAGADO, CONFIG, SIN_WIFI, SIN_MQTT, OK, RESET };

namespace led {
void iniciar();
void patron(PatronLed p);
void actualizar();
}  // namespace led
