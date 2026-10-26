#include "consola.h"
#include <esp_log.h>
#include "config.h"
#include "mqtt_mgr.h"

Consola consola;

namespace {
// Lo último que se imprimió (al abrir el monitor se ve también lo de antes, incluido el arranque)
char buffer_[MONITOR_BUFFER];
uint32_t total_ = 0;    // bytes escritos desde que arrancó
uint32_t enviado_ = 0;  // hasta dónde ya se mandó
portMUX_TYPE mux_ = portMUX_INITIALIZER_UNLOCKED;

bool activo_ = false;
unsigned long hasta_ = 0;
unsigned long ultimoEnvio_ = 0;
vprintf_like_t vprintfOriginal_ = nullptr;

void guardar(const uint8_t* datos, size_t largo) {
  portENTER_CRITICAL(&mux_);
  for (size_t i = 0; i < largo; i++) buffer_[(total_ + i) % MONITOR_BUFFER] = static_cast<char>(datos[i]);
  total_ += largo;
  portEXIT_CRITICAL(&mux_);
}

// Mensajes internos del ESP32 ("E (433) esp-tls: ..."): al buffer y por el USB como siempre
int alLogInterno(const char* formato, va_list args) {
  char linea[256];
  va_list copia;
  va_copy(copia, args);
  int n = vsnprintf(linea, sizeof(linea), formato, copia);
  va_end(copia);
  if (n > 0) guardar(reinterpret_cast<const uint8_t*>(linea), n < (int)sizeof(linea) ? n : sizeof(linea) - 1);
  return vprintfOriginal_ ? vprintfOriginal_(formato, args) : n;
}
}  // namespace

size_t Consola::write(uint8_t c) { return write(&c, 1); }

size_t Consola::write(const uint8_t* datos, size_t largo) {
  Serial.write(datos, largo);
  guardar(datos, largo);
  return largo;
}

namespace monitor {

void iniciar() { vprintfOriginal_ = esp_log_set_vprintf(alLogInterno); }

void activar(bool activo) {
  if (activo && !activo_) {
    // Arranca mandando todo lo que hay en el buffer
    portENTER_CRITICAL(&mux_);
    enviado_ = total_ > MONITOR_BUFFER ? total_ - MONITOR_BUFFER : 0;
    portEXIT_CRITICAL(&mux_);
  }
  activo_ = activo;
  hasta_ = millis() + MONITOR_DURACION_MS;
}

bool activo() { return activo_; }

void enviarPendiente() {
  if (!activo_) return;
  if ((long)(millis() - hasta_) > 0) {
    activo_ = false;
    return;
  }
  if (!mqttmgr::conectado() || millis() - ultimoEnvio_ < MONITOR_ENVIO_MS) return;
  ultimoEnvio_ = millis();

  char trozo[MONITOR_TROZO];
  size_t n = 0;
  portENTER_CRITICAL(&mux_);
  // Si se imprimió más rápido de lo que se manda, se saltea lo que ya se pisó en el buffer
  if (total_ - enviado_ > MONITOR_BUFFER) enviado_ = total_ - MONITOR_BUFFER;
  while (enviado_ < total_ && n < sizeof(trozo)) trozo[n++] = buffer_[enviado_++ % MONITOR_BUFFER];
  portEXIT_CRITICAL(&mux_);
  if (n) mqttmgr::publicarLog(trozo, n);
}

}  // namespace monitor
