#include "bateria.h"
#include "config.h"

namespace {
// Curva de descarga típica de una celda Li-ion (mV en reposo -> %)
const int TABLA_MV[] = {3300, 3500, 3650, 3750, 3850, 4000, 4200};
const int TABLA_PCT[] = {0, 5, 20, 40, 60, 80, 100};
const int TABLA_N = sizeof(TABLA_MV) / sizeof(TABLA_MV[0]);

int porcentaje(int mv) {
  if (mv <= TABLA_MV[0]) return 0;
  if (mv >= TABLA_MV[TABLA_N - 1]) return 100;
  for (int i = 1; i < TABLA_N; i++) {
    if (mv <= TABLA_MV[i]) {
      return TABLA_PCT[i - 1] + (mv - TABLA_MV[i - 1]) * (TABLA_PCT[i] - TABLA_PCT[i - 1]) / (TABLA_MV[i] - TABLA_MV[i - 1]);
    }
  }
  return 100;
}
}  // namespace

namespace bateria {

void iniciar() {
  analogSetPinAttenuation(BATERIA_PIN, ADC_11db);  // rango completo (hasta ~3.1 V en el pin)
}

Lectura medir() {
  Lectura r;
  uint32_t suma = 0;
  uint32_t minimo = UINT32_MAX, maximo = 0;
  for (int i = 0; i < BATERIA_MUESTRAS; i++) {
    uint32_t v = analogReadMilliVolts(BATERIA_PIN);
    suma += v;
    if (v < minimo) minimo = v;
    if (v > maximo) maximo = v;
  }
  r.mv = static_cast<int>(suma / BATERIA_MUESTRAS * BATERIA_DIVISOR);
  // Pin al aire: las lecturas saltan mucho. Fuera de rango: no hay una 18650 conectada.
  bool estable = (maximo - minimo) * BATERIA_DIVISOR <= BATERIA_RUIDO_MAX_MV;
  if (estable && r.mv >= BATERIA_MIN_MV && r.mv <= BATERIA_MAX_MV) r.pct = porcentaje(r.mv);
  return r;
}

}  // namespace bateria
