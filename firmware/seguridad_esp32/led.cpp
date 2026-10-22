#include "led.h"
#include "config.h"

namespace {
PatronLed actual = PatronLed::APAGADO;
unsigned long inicio = 0;

void escribir(bool on) { digitalWrite(LED_PIN, on ? LED_ENCENDIDO : !LED_ENCENDIDO); }

// Destellos de 120 ms separados 200 ms, repetidos cada `periodo`
bool destellos(unsigned long t, int cantidad, unsigned long periodo) {
  unsigned long fase = t % periodo;
  for (int i = 0; i < cantidad; i++) {
    unsigned long desde = i * 320UL;
    if (fase >= desde && fase < desde + 120UL) return true;
  }
  return false;
}
}  // namespace

namespace led {
void iniciar() {
  pinMode(LED_PIN, OUTPUT);
  escribir(false);
}

void patron(PatronLed p) {
  if (p == actual) return;
  actual = p;
  inicio = millis();
}

void actualizar() {
  unsigned long t = millis() - inicio;
  switch (actual) {
    case PatronLed::APAGADO: escribir(false); break;
    case PatronLed::CONFIG: escribir((t / 150) % 2 == 0); break;
    case PatronLed::SIN_WIFI: escribir(destellos(t, 2, 2000)); break;
    case PatronLed::SIN_MQTT: escribir(destellos(t, 3, 2000)); break;
    case PatronLed::OK: escribir(destellos(t, 1, 5000)); break;
    case PatronLed::RESET: escribir(true); break;
  }
}
}  // namespace led
