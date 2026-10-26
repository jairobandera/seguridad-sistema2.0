#include "red.h"
#include "consola.h"
#include <WiFi.h>
#include <ArduinoJson.h>
#include <esp_http_client.h>
#include <esp_crt_bundle.h>
#include "config.h"

namespace {
volatile bool conectado_ = false;
volatile uint8_t ultimoMotivo_ = 0;
volatile uint8_t fallosClave_ = 0;
volatile uint8_t fallosSinRed_ = 0;
unsigned long caidoDesde_ = 0;
unsigned long ultimoReintento_ = 0;
bool hayRed_ = false;

bool probando_ = false;
unsigned long pruebaDesde_ = 0;

bool esFalloClave(uint8_t m) {
  return m == WIFI_REASON_AUTH_FAIL || m == WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT || m == WIFI_REASON_HANDSHAKE_TIMEOUT ||
         m == WIFI_REASON_MIC_FAILURE || m == WIFI_REASON_AUTH_EXPIRE;
}
bool esSinRed(uint8_t m) {
  return m == WIFI_REASON_NO_AP_FOUND || m == WIFI_REASON_NO_AP_FOUND_W_COMPATIBLE_SECURITY ||
         m == WIFI_REASON_NO_AP_FOUND_IN_AUTHMODE_THRESHOLD || m == WIFI_REASON_NO_AP_FOUND_IN_RSSI_THRESHOLD;
}

void alEvento(arduino_event_id_t evento, arduino_event_info_t info) {
  switch (evento) {
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      conectado_ = true;
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED: {
      conectado_ = false;
      uint8_t m = info.wifi_sta_disconnected.reason;
      ultimoMotivo_ = m;
      if (esFalloClave(m)) fallosClave_++;
      if (esSinRed(m)) fallosSinRed_++;
      break;
    }
    default:
      break;
  }
}

void comenzar(const String& ssid, const String& pass) {
  WiFi.disconnect(false, true);
  delay(100);
  conectado_ = false;
  fallosClave_ = fallosSinRed_ = 0;
  WiFi.begin(ssid.c_str(), pass.c_str());
}
}  // namespace

namespace red {

void iniciar() {
  WiFi.persistent(false);  // las credenciales las guardamos nosotros
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(true);     // necesario para que convivan WiFi y Bluetooth
  WiFi.onEvent(alEvento);
}

void conectar(const String& ssid, const String& pass) {
  hayRed_ = ssid.length() > 0;
  probando_ = false;
  if (!hayRed_) return;
  caidoDesde_ = millis();
  ultimoReintento_ = millis();
  // Recién probada y conectada a esta red: no cortarla (el siguiente paso usa la conexión)
  if (conectado() && WiFi.SSID() == ssid) return;
  comenzar(ssid, pass);
}

void actualizar() {
  if (conectado_) {
    caidoDesde_ = 0;
    return;
  }
  if (!hayRed_ || probando_) return;
  if (!caidoDesde_) caidoDesde_ = millis();
  // Respaldo de la reconexión automática del ESP32
  if (millis() - ultimoReintento_ > 30000UL) {
    ultimoReintento_ = millis();
    WiFi.reconnect();
  }
}

bool conectado() { return conectado_ && WiFi.status() == WL_CONNECTED; }

unsigned long caidoHace() {
  if (conectado() || !hayRed_ || !caidoDesde_) return 0;
  return millis() - caidoDesde_;
}

void probar(const String& ssid, const String& pass) {
  probando_ = true;
  hayRed_ = true;
  pruebaDesde_ = millis();
  comenzar(ssid, pass);
}

ResultadoWifi resultadoPrueba() {
  if (!probando_) return conectado() ? ResultadoWifi::OK : ResultadoWifi::TIMEOUT;
  ResultadoWifi r = ResultadoWifi::EN_CURSO;
  if (conectado()) r = ResultadoWifi::OK;
  else if (fallosClave_ >= 2) r = ResultadoWifi::CLAVE_INCORRECTA;
  else if (fallosSinRed_ >= 3) r = ResultadoWifi::RED_NO_ENCONTRADA;
  else if (millis() - pruebaDesde_ > WIFI_TIMEOUT_SETUP_MS) {
    r = esFalloClave(ultimoMotivo_) ? ResultadoWifi::CLAVE_INCORRECTA
        : esSinRed(ultimoMotivo_)   ? ResultadoWifi::RED_NO_ENCONTRADA
                                    : ResultadoWifi::TIMEOUT;
  }
  if (r != ResultadoWifi::EN_CURSO) probando_ = false;
  return r;
}

const char* motivo(ResultadoWifi r) {
  switch (r) {
    case ResultadoWifi::CLAVE_INCORRECTA: return "clave_incorrecta";
    case ResultadoWifi::RED_NO_ENCONTRADA: return "red_no_encontrada";
    default: return "timeout";
  }
}

void iniciarEscaneo() {
  WiFi.scanDelete();
  WiFi.scanNetworks(true, false);
}

int escaneoListo() {
  int n = WiFi.scanComplete();
  if (n == WIFI_SCAN_RUNNING) return -1;
  if (n < 0) return -2;
  return n;
}

String redesJson(int n) {
  JsonDocument doc;
  doc["r"] = "redes";
  JsonArray lista = doc["lista"].to<JsonArray>();
  // Ordenadas por señal y sin repetidos (un mismo SSID puede tener varios AP)
  int orden[64];
  int total = min(n, 64);
  for (int i = 0; i < total; i++) orden[i] = i;
  for (int i = 0; i < total; i++)
    for (int j = i + 1; j < total; j++)
      if (WiFi.RSSI(orden[j]) > WiFi.RSSI(orden[i])) std::swap(orden[i], orden[j]);
  int agregadas = 0;
  for (int k = 0; k < total && agregadas < 20; k++) {
    int i = orden[k];
    String s = WiFi.SSID(i);
    if (!s.length()) continue;
    bool repetida = false;
    for (JsonObject o : lista)
      if (s == o["ssid"].as<const char*>()) repetida = true;
    if (repetida) continue;
    JsonObject o = lista.add<JsonObject>();
    o["ssid"] = s;
    o["rssi"] = WiFi.RSSI(i);
    o["seguro"] = WiFi.encryptionType(i) != WIFI_AUTH_OPEN;
    agregadas++;
  }
  WiFi.scanDelete();
  String out;
  serializeJson(doc, out);
  return out;
}

String ssidActual() { return conectado() ? WiFi.SSID() : String(""); }
int rssi() { return conectado() ? WiFi.RSSI() : 0; }
String ip() { return conectado() ? WiFi.localIP().toString() : String(""); }
bool horaValida() { return time(nullptr) > 1700000000; }

RespuestaProvision provisionar(const String& api, const String& deviceId, const String& codigo, const String& secretHex) {
  RespuestaProvision resp;
  String url = api;
  while (url.endsWith("/")) url.remove(url.length() - 1);
  url += "/api/dispositivos/provision";

  JsonDocument cuerpo;
  cuerpo["deviceId"] = deviceId;
  cuerpo["codigo"] = codigo;
  cuerpo["secret"] = secretHex;
  cuerpo["fw"] = FW_VERSION;
  String json;
  serializeJson(cuerpo, json);

  esp_http_client_config_t cfg = {};
  cfg.url = url.c_str();
  cfg.method = HTTP_METHOD_POST;
  cfg.timeout_ms = 10000;
  cfg.buffer_size = 2048;  // las cabeceras de la respuesta pueden superar los 512 bytes por defecto
  cfg.buffer_size_tx = 1024;
  cfg.keep_alive_enable = false;
  cfg.crt_bundle_attach = esp_crt_bundle_attach;  // valida HTTPS con los certificados raíz incluidos
  esp_http_client_handle_t cli = esp_http_client_init(&cfg);
  if (!cli) return resp;
  esp_http_client_set_header(cli, "Content-Type", "application/json");
  esp_http_client_set_header(cli, "Connection", "close");

  esp_err_t err = esp_http_client_open(cli, json.length());
  if (err != ESP_OK) {
    consola.printf("[red] no se pudo conectar a %s (%s)\n", url.c_str(), esp_err_to_name(err));
  } else if (esp_http_client_write(cli, json.c_str(), json.length()) != static_cast<int>(json.length())) {
    resp.http = -1;
    consola.println("[red] provision: no se pudo enviar el pedido");
  } else if (esp_http_client_fetch_headers(cli) < 0) {
    // El servidor puede haber vinculado igual: la placa reintenta y el servidor reconoce el reintento
    resp.http = -1;
    consola.printf("[red] provision: no llego la respuesta (errno %d)\n", esp_http_client_get_errno(cli));
  } else {
    resp.http = esp_http_client_get_status_code(cli);
    String respuesta;
    char buf[256];
    int leidos;
    while ((leidos = esp_http_client_read(cli, buf, sizeof(buf))) > 0 && respuesta.length() < 2048) {
      respuesta.concat(buf, leidos);
    }
    JsonDocument doc;
    if (deserializeJson(doc, respuesta) == DeserializationError::Ok) {
      if (resp.http == 200) {
        resp.mqttUrl = doc["mqtt"]["url"] | "";
        resp.mqttUser = doc["mqtt"]["user"] | "";
        resp.mqttPass = doc["mqtt"]["pass"] | "";
      } else {
        resp.error = doc["error"] | "";
      }
    }
    if (resp.http != 200) consola.printf("[red] provision respondio HTTP %d %s\n", resp.http, resp.error.c_str());
  }
  esp_http_client_cleanup(cli);
  return resp;
}

}  // namespace red
