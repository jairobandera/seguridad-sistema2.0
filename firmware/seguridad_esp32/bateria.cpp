#include "bateria.h"
#include "config.h"

namespace {
// Curva de descarga típica de una celda Li-ion (mV en reposo -> %)
const int TABLA_MV[] = {3300, 3500, 3650, 3750, 3850, 4000, 4200};
const int TABLA_PCT[] = {0, 5, 20, 40, 60, 80, 100};
const int TABLA_N = sizeof(TABLA_MV) / sizeof(TABLA_MV[0]);

// Ventana de muestras (mV en la batería): una cada BATERIA_INTERVALO_MS
int muestras_[BATERIA_VENTANA];
int cantidad_ = 0;
int siguiente_ = 0;
unsigned long ultimaMuestra_ = 0;

float mvSuave_ = 0;     // promedio móvil entre reportes
int pctReportado_ = -1;  // con histéresis para que no "baile"

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

// Una muestra: promedio de varias lecturas seguidas (~0.3 ms), ya llevada a la tensión de la batería
int leerMuestra() {
  uint32_t suma = 0;
  for (int i = 0; i < BATERIA_LECTURAS; i++) suma += analogReadMilliVolts(BATERIA_PIN);
  return static_cast<int>(suma / BATERIA_LECTURAS * BATERIA_DIVISOR * BATERIA_CALIBRACION);
}

void ordenar(int* v, int n) {
  for (int i = 1; i < n; i++) {
    int x = v[i], j = i - 1;
    while (j >= 0 && v[j] > x) {
      v[j + 1] = v[j];
      j--;
    }
    v[j + 1] = x;
  }
}
}  // namespace

namespace bateria {

void iniciar() {
  analogSetPinAttenuation(BATERIA_PIN, ADC_11db);  // rango completo (hasta ~3.1 V en el pin)
}

static void tomarMuestra() {
  ultimaMuestra_ = millis();
  muestras_[siguiente_] = leerMuestra();
  siguiente_ = (siguiente_ + 1) % BATERIA_VENTANA;
  if (cantidad_ < BATERIA_VENTANA) cantidad_++;
}

void actualizar() {
  if (cantidad_ && millis() - ultimaMuestra_ < BATERIA_INTERVALO_MS) return;
  tomarMuestra();
}

Lectura medir() {
  Lectura r;
  // Recién arrancada: se completa la ventana mínima en el momento
  while (cantidad_ < 4) tomarMuestra();
  int v[BATERIA_VENTANA];
  for (int i = 0; i < cantidad_; i++) v[i] = muestras_[i];
  ordenar(v, cantidad_);

  // Cuando transmite el WiFi la tensión cae un instante: se usa la franja alta (percentil 50 a 90),
  // que es la tensión real de la batería, y se descartan los picos de ruido de arriba.
  int p10 = cantidad_ / 10, p50 = cantidad_ / 2, p90 = (cantidad_ * 9) / 10;  // índices válidos (< cantidad_)
  int hasta = p90 > p50 ? p90 : p50 + 1;
  long suma = 0;
  for (int i = p50; i < hasta; i++) suma += v[i];
  int mv = static_cast<int>(suma / (hasta - p50));

  // Pin al aire: las muestras saltan mucho. Fuera de rango: no hay una 18650 conectada.
  int dispersion = v[p90] - v[p10];
  bool hayBateria = dispersion <= BATERIA_RUIDO_MAX_MV && mv >= BATERIA_MIN_MV && mv <= BATERIA_MAX_MV;
  if (!hayBateria) {
    mvSuave_ = 0;
    pctReportado_ = -1;
    r.mv = mv;
    return r;
  }

  mvSuave_ = mvSuave_ == 0 ? mv : mvSuave_ * 0.7f + mv * 0.3f;
  r.mv = static_cast<int>(mvSuave_);
  int pct = porcentaje(r.mv);
  // Histéresis: el % cambia recién con BATERIA_HISTERESIS_PCT de diferencia (o al llegar a 0/100)
  if (pctReportado_ < 0 || abs(pct - pctReportado_) >= BATERIA_HISTERESIS_PCT || pct == 0 || pct == 100) pctReportado_ = pct;
  r.pct = pctReportado_;
  return r;
}

}  // namespace bateria
