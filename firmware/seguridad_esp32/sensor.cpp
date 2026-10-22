#include "sensor.h"
#include "config.h"

namespace {
bool estable = false;       // último estado confirmado (true = abierta)
bool lecturaPrevia = false;
unsigned long cambioDesde = 0;

// Imán cerca del reed switch = contacto cerrado = LOW (con pull-up) = puerta cerrada.
// Si se corta el cable, queda HIGH = "abierta" (falla segura).
bool leerAbierta() { return digitalRead(SENSOR_PIN) == HIGH; }
}  // namespace

namespace sensor {
void iniciar() {
  pinMode(SENSOR_PIN, INPUT_PULLUP);
  delay(5);
  estable = lecturaPrevia = leerAbierta();
  cambioDesde = millis();
}

bool actualizar() {
  bool l = leerAbierta();
  if (l != lecturaPrevia) {
    lecturaPrevia = l;
    cambioDesde = millis();
    return false;
  }
  if (l != estable && millis() - cambioDesde >= ANTIRREBOTE_MS) {
    estable = l;
    return true;
  }
  return false;
}

bool puertaAbierta() { return estable; }
}  // namespace sensor
