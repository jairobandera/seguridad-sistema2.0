#pragma once
#include <Arduino.h>

// "Monitor serial por internet": todo lo que se imprime (con `consola.printf(...)` y los mensajes internos del
// ESP32) sale por el USB como siempre y además queda en un buffer. Con el monitor activo (comando "monitor" desde
// el panel del admin) se manda por MQTT a dev/{id}/log. Ver docs/protocolo.md §3.
class Consola : public Print {
 public:
  size_t write(uint8_t c) override;
  size_t write(const uint8_t* datos, size_t largo) override;
};

extern Consola consola;

namespace monitor {
// Engancha los mensajes internos del ESP32 (esp_log). Llamar después de Serial.begin().
void iniciar();
// Prende o apaga el envío. Prendido se apaga solo si no se renueva (el servidor lo renueva cada minuto).
void activar(bool activo);
bool activo();
// Desde el loop: manda lo acumulado (cada ~500 ms, de a trozos).
void enviarPendiente();
}  // namespace monitor
