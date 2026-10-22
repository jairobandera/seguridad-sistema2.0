#include "almacen.h"
#include <Preferences.h>
#include <esp_random.h>
#include "config.h"

namespace {
Preferences prefs;
uint8_t secreto_[32];
EventoPuerta cola_[COLA_MAX_EVENTOS];
size_t colaN_ = 0;
uint32_t seq_ = 0;

void guardarCola() {
  if (colaN_ == 0) prefs.remove("cola");
  else prefs.putBytes("cola", cola_, colaN_ * sizeof(EventoPuerta));
}
}  // namespace

namespace almacen {

void iniciar() {
  prefs.begin("seg", false);
  if (prefs.getBytesLength("secret") != sizeof(secreto_)) {
    esp_fill_random(secreto_, sizeof(secreto_));
    prefs.putBytes("secret", secreto_, sizeof(secreto_));
  } else {
    prefs.getBytes("secret", secreto_, sizeof(secreto_));
  }
  seq_ = prefs.getUInt("seq", 0);
  size_t bytes = prefs.getBytesLength("cola");
  if (bytes && bytes % sizeof(EventoPuerta) == 0 && bytes <= sizeof(cola_)) {
    prefs.getBytes("cola", cola_, bytes);
    colaN_ = bytes / sizeof(EventoPuerta);
  }
}

String ssid() { return prefs.getString("ssid", ""); }
String pass() { return prefs.getString("pass", ""); }
void guardarWifi(const String& s, const String& p) {
  prefs.putString("ssid", s);
  prefs.putString("pass", p);
}

String apiUrl() { return prefs.getString("api", API_URL_DEFECTO); }
void guardarApiUrl(const String& url) { prefs.putString("api", url); }

bool vinculada() { return prefs.getBool("vinc", false) && prefs.getString("muser", "").length() > 0; }
String mqttUrl() { return prefs.getString("murl", ""); }
String mqttUser() { return prefs.getString("muser", ""); }
String mqttPass() { return prefs.getString("mpass", ""); }
void guardarMqtt(const String& url, const String& user, const String& pass) {
  prefs.putString("murl", url);
  prefs.putString("muser", user);
  prefs.putString("mpass", pass);
  prefs.putBool("vinc", true);
}
void borrarVinculacion() {
  prefs.remove("murl");
  prefs.remove("muser");
  prefs.remove("mpass");
  prefs.putBool("vinc", false);
}

const uint8_t* secreto() { return secreto_; }
String secretoHex() {
  char buf[65];
  for (int i = 0; i < 32; i++) sprintf(buf + i * 2, "%02x", secreto_[i]);
  buf[64] = 0;
  return String(buf);
}

uint32_t siguienteSeq() {
  seq_++;
  prefs.putUInt("seq", seq_);
  return seq_;
}
void reiniciarSeq() {
  seq_ = 0;
  prefs.putUInt("seq", 0);
}

bool colaVacia() { return colaN_ == 0; }
size_t colaTamano() { return colaN_; }
EventoPuerta colaPrimero() { return cola_[0]; }
void colaAgregar(const EventoPuerta& e) {
  if (colaN_ == COLA_MAX_EVENTOS) {
    // Cola llena: se descarta el más viejo
    memmove(cola_, cola_ + 1, (COLA_MAX_EVENTOS - 1) * sizeof(EventoPuerta));
    colaN_--;
  }
  cola_[colaN_++] = e;
  guardarCola();
}
void colaQuitarPrimero() {
  if (!colaN_) return;
  memmove(cola_, cola_ + 1, (colaN_ - 1) * sizeof(EventoPuerta));
  colaN_--;
  guardarCola();
}
void colaVaciar() {
  colaN_ = 0;
  guardarCola();
}

void borrarTodo() { prefs.clear(); }

}  // namespace almacen
