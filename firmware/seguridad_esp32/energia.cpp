#include "energia.h"
#include "consola.h"
#include <WiFi.h>
#include "config.h"

namespace {
bool pedido_ = false;
bool ble_ = false;
bool aplicado_ = false;

void aplicar() {
  bool ahorro = pedido_ && !ble_;
  if (ahorro == aplicado_) return;
  aplicado_ = ahorro;
  // 80 MHz es el mínimo con el que funciona el WiFi
  setCpuFrequencyMhz(ahorro ? CPU_MHZ_AHORRO : CPU_MHZ_NORMAL);
  // Ahorro máximo: la radio duerme entre beacons del router (más demora para recibir, nada para enviar)
  WiFi.setSleep(ahorro ? WIFI_PS_MAX_MODEM : WIFI_PS_MIN_MODEM);
  consola.printf("[energia] %s (CPU %lu MHz)\n", ahorro ? "ahorro activado" : "modo normal", static_cast<unsigned long>(getCpuFrequencyMhz()));
}
}  // namespace

namespace energia {
void pedirAhorro(bool activo) {
  pedido_ = activo;
  aplicar();
}

void bluetoothAbierto(bool abierto) {
  ble_ = abierto;
  aplicar();
}

bool enAhorro() { return aplicado_; }
}  // namespace energia
