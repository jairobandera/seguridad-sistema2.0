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

float mvSuave_ = 0;      // promedio móvil entre reportes (sin cargador)
int pctReportado_ = -1;  // el % que se informa
int bajasSeguidas_ = 0;  // sin cargador, el % baja recién si se confirma dos veces

// Carga (como un celular: el % se estima por tiempo, la tensión con el cargador no dice cuánto hay)
bool cargando_ = false;
float pctCarga_ = 0;
int mvMaxCarga_ = 0;                 // tensión más alta durante la carga (si cae mucho: lo desenchufaron)
unsigned long faseFinalDesde_ = 0;   // desde cuándo está en la fase final de la carga (0 = todavía no)
unsigned long reajusteEn_ = 0;       // tras desenchufar: cuándo tomar el % real (0 = nada pendiente)
unsigned long ultimaMedicion_ = 0;

// Tensión de las últimas mediciones: al enchufar el cargador sube de golpe
const int RECIENTES = 3;
int recientes_[RECIENTES];
int nRecientes_ = 0;
int iReciente_ = 0;

// Carga real de la celda (0-100) según la curva
int cargaCelda(int mv) {
  if (mv <= TABLA_MV[0]) return 0;
  if (mv >= TABLA_MV[TABLA_N - 1]) return 100;
  for (int i = 1; i < TABLA_N; i++) {
    if (mv <= TABLA_MV[i]) {
      return TABLA_PCT[i - 1] + (mv - TABLA_MV[i - 1]) * (TABLA_PCT[i] - TABLA_PCT[i - 1]) / (TABLA_MV[i] - TABLA_MV[i - 1]);
    }
  }
  return 100;
}

// % que le sirve al usuario: 0 % = BATERIA_MV_VACIA (la placa se apaga) y 100 % = BATERIA_MV_LLENA (recién cargada)
int porcentaje(int mv) {
  int vacia = cargaCelda(BATERIA_MV_VACIA);
  int llena = cargaCelda(BATERIA_MV_LLENA);
  if (llena <= vacia) return cargaCelda(mv);
  int pct = (cargaCelda(mv) - vacia) * 100 / (llena - vacia);
  return pct < 0 ? 0 : pct > 100 ? 100 : pct;
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

void olvidarBateria() {
  mvSuave_ = 0;
  pctReportado_ = -1;
  bajasSeguidas_ = 0;
  cargando_ = false;
  reajusteEn_ = 0;
  nRecientes_ = 0;
  ultimaMedicion_ = 0;
}

// ¿Está enchufado el cargador? Con la pata CHRG del TP4056 es exacto; si no, se deduce de la tensión.
bool detectarCarga(int mv) {
#ifdef BATERIA_PIN_CARGA
  (void)mv;
  return digitalRead(BATERIA_PIN_CARGA) == LOW;
#else
  if (!cargando_) {
    // Sin cargador la tensión solo baja (o se recupera unos pocos mV): un salto grande es el cargador
    int base = mv;
    for (int i = 0; i < nRecientes_; i++) base = recientes_[i] < base ? recientes_[i] : base;
    return pctReportado_ >= 0 && mv - base >= BATERIA_SALTO_CARGA_MV;
  }
  // Cargando la tensión sube o se mantiene: si cae mucho desde el máximo, lo desenchufaron
  return mvMaxCarga_ - mv < BATERIA_CAIDA_DESENCHUFE_MV;
#endif
}

void recordar(int mv) {
  recientes_[iReciente_] = mv;
  iReciente_ = (iReciente_ + 1) % RECIENTES;
  if (nRecientes_ < RECIENTES) nRecientes_++;
}
}  // namespace

namespace bateria {

void iniciar() {
  analogSetPinAttenuation(BATERIA_PIN, ADC_11db);  // rango completo (hasta ~3.1 V en el pin)
#ifdef BATERIA_PIN_CARGA
  pinMode(BATERIA_PIN_CARGA, INPUT_PULLUP);  // CHRG del TP4056 es de colector abierto
#endif
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
    olvidarBateria();
    r.mv = mv;
    return r;
  }

  unsigned long ahora = millis();
  float minutos = ultimaMedicion_ ? (ahora - ultimaMedicion_) / 60000.0f : 0;
  ultimaMedicion_ = ahora;

  bool antes = cargando_;
  cargando_ = detectarCarga(mv);
  recordar(mv);

  if (cargando_ && !antes) {
    // Recién enchufado: arranca desde el % que tenía (no desde la tensión, que subió de golpe)
    pctCarga_ = pctReportado_ >= 0 ? pctReportado_ : porcentaje(mv);
    mvMaxCarga_ = mv;
    faseFinalDesde_ = 0;
    reajusteEn_ = 0;
  } else if (!cargando_ && antes) {
    // Recién desenchufado: la tensión tarda unos minutos en asentarse; después se toma el % real
    mvSuave_ = mv;
    bajasSeguidas_ = 0;
    reajusteEn_ = (ahora + BATERIA_REAJUSTE_MS) | 1;
  }

  if (cargando_) {
    if (mv > mvMaxCarga_) mvMaxCarga_ = mv;
    float ritmo = BATERIA_CARGA_PCT_MIN;
    if (mv >= BATERIA_MV_CARGA_COMPLETA) {
      if (!faseFinalDesde_) faseFinalDesde_ = ahora | 1;
      if (pctCarga_ < 80) ritmo *= 4;  // la pila tenía más carga de la estimada: se pone al día sin saltar
    }
    pctCarga_ += minutos * ritmo;
    bool llena = faseFinalDesde_ && ahora - faseFinalDesde_ >= BATERIA_LLENA_TRAS_MS;
    // Como en un celular: 100 % recién cuando terminó de cargar
    if (llena) pctCarga_ = 100;
    else if (pctCarga_ > 99) pctCarga_ = 99;
    pctReportado_ = static_cast<int>(pctCarga_);
    r.mv = mv;
  } else {
    mvSuave_ = mvSuave_ == 0 ? mv : mvSuave_ * 0.7f + mv * 0.3f;
    int pct = porcentaje(static_cast<int>(mvSuave_));
    if (pctReportado_ < 0) {
      pctReportado_ = pct;
    } else if (reajusteEn_) {
      if ((long)(ahora - reajusteEn_) >= 0) {
        pctReportado_ = pct;
        reajusteEn_ = 0;
      }
    } else if (pct < pctReportado_) {
      // Sin cargador el % solo baja, y recién si se confirma dos veces (no por un bajón de un instante)
      if (++bajasSeguidas_ >= 2) {
        pctReportado_ = pct;
        bajasSeguidas_ = 0;
      }
    } else {
      bajasSeguidas_ = 0;
    }
    r.mv = static_cast<int>(mvSuave_);
  }
  r.pct = pctReportado_;
  r.cargando = cargando_;
  return r;
}

}  // namespace bateria
