#include "mqtt_mgr.h"
#include <ArduinoJson.h>
#include <mqtt_client.h>
#include <esp_crt_bundle.h>
#include "config.h"

namespace {
esp_mqtt_client_handle_t cliente = nullptr;
String url_, user_, pass_, base_, topicEstado_, topicCmd_, lwt_;
volatile bool conectado_ = false;
volatile bool recienConectado_ = false;
volatile int rechazos_ = 0;
QueueHandle_t colaComandos = nullptr;
QueueHandle_t colaPublicados = nullptr;

void alEvento(void*, esp_event_base_t, int32_t id, void* datos) {
  auto* e = static_cast<esp_mqtt_event_handle_t>(datos);
  switch (static_cast<esp_mqtt_event_id_t>(id)) {
    case MQTT_EVENT_CONNECTED:
      conectado_ = true;
      recienConectado_ = true;
      rechazos_ = 0;
      esp_mqtt_client_subscribe(cliente, topicCmd_.c_str(), 1);
      break;
    case MQTT_EVENT_DISCONNECTED:
      conectado_ = false;
      break;
    case MQTT_EVENT_PUBLISHED:
      xQueueSend(colaPublicados, &e->msg_id, 0);
      break;
    case MQTT_EVENT_DATA: {
      // Los comandos son chicos: se ignoran mensajes fragmentados
      if (e->current_data_offset != 0 || e->data_len != e->total_data_len) break;
      JsonDocument doc;
      if (deserializeJson(doc, e->data, e->data_len) != DeserializationError::Ok) break;
      mqttmgr::Comando c = {};
      strlcpy(c.id, doc["id"] | "", sizeof(c.id));
      strlcpy(c.cmd, doc["cmd"] | "", sizeof(c.cmd));
      c.activo = doc["activo"].is<bool>() ? (doc["activo"].as<bool>() ? 1 : 0) : -1;
      xQueueSend(colaComandos, &c, 0);
      break;
    }
    case MQTT_EVENT_ERROR:
      if (e->error_handle && e->error_handle->error_type == MQTT_ERROR_TYPE_CONNECTION_REFUSED) {
        auto rc = e->error_handle->connect_return_code;
        if (rc == MQTT_CONNECTION_REFUSE_BAD_USERNAME || rc == MQTT_CONNECTION_REFUSE_NOT_AUTHORIZED) rechazos_++;
      }
      break;
    default:
      break;
  }
}

int publicar(const String& topic, const JsonDocument& doc, int qos, bool retain) {
  if (!cliente) return -1;
  String json;
  serializeJson(doc, json);
  // enqueue no bloquea: el mensaje se manda desde la tarea MQTT (y se reintenta si es QoS 1)
  return esp_mqtt_client_enqueue(cliente, topic.c_str(), json.c_str(), json.length(), qos, retain, true);
}
}  // namespace

namespace mqttmgr {

void configurar(const String& url, const String& user, const String& pass, const String& deviceId) {
  detener();
  if (!colaComandos) colaComandos = xQueueCreate(8, sizeof(Comando));
  if (!colaPublicados) colaPublicados = xQueueCreate(16, sizeof(int));
  url_ = url;
  user_ = user;
  pass_ = pass;
  base_ = "dev/" + deviceId;
  topicEstado_ = base_ + "/state";
  topicCmd_ = base_ + "/cmd";
  lwt_ = "{\"online\":false}";

  esp_mqtt_client_config_t cfg = {};
  cfg.broker.address.uri = url_.c_str();
  if (url_.startsWith("mqtts://") || url_.startsWith("wss://")) {
    cfg.broker.verification.crt_bundle_attach = esp_crt_bundle_attach;
  }
  cfg.credentials.client_id = user_.c_str();
  cfg.credentials.username = user_.c_str();
  cfg.credentials.authentication.password = pass_.c_str();
  cfg.session.keepalive = MQTT_KEEPALIVE_SEG;
  cfg.session.disable_clean_session = true;  // el servidor guarda los comandos si la placa se desconecta
  cfg.session.last_will.topic = topicEstado_.c_str();
  cfg.session.last_will.msg = lwt_.c_str();
  cfg.session.last_will.msg_len = lwt_.length();
  cfg.session.last_will.qos = 1;
  cfg.session.last_will.retain = 1;
  cfg.network.reconnect_timeout_ms = 5000;
  cfg.network.timeout_ms = 10000;
  cfg.buffer.size = 1024;

  cliente = esp_mqtt_client_init(&cfg);
  if (!cliente) return;
  esp_mqtt_client_register_event(cliente, MQTT_EVENT_ANY, alEvento, nullptr);
  esp_mqtt_client_start(cliente);
}

void detener() {
  if (cliente) {
    esp_mqtt_client_stop(cliente);
    esp_mqtt_client_destroy(cliente);
    cliente = nullptr;
  }
  conectado_ = false;
  recienConectado_ = false;
  rechazos_ = 0;
}

bool conectado() { return cliente && conectado_; }

bool recienConectado() {
  if (!recienConectado_) return false;
  recienConectado_ = false;
  return true;
}

int rechazos() { return rechazos_; }

int publicarEstado(bool puertaAbierta, const String& ssid, int rssi, const String& ip, const bateria::Lectura& bat) {
  JsonDocument doc;
  doc["online"] = true;
  doc["puerta"] = puertaAbierta ? "abierta" : "cerrada";
  doc["fw"] = FW_VERSION;
  doc["ssid"] = ssid;
  if (rssi < 0) doc["rssi"] = rssi;
  doc["ip"] = ip;
  if (bat.pct >= 0) {
    doc["bat"] = bat.pct;
    doc["mv"] = bat.mv;
  }
  return publicar(topicEstado_, doc, 1, true);
}

int publicarEvento(const EventoPuerta& e) {
  JsonDocument doc;
  doc["seq"] = e.seq;
  doc["tipo"] = e.abierta ? "PUERTA_ABIERTA" : "PUERTA_CERRADA";
  doc["ts"] = e.ts;
  return publicar(base_ + "/event", doc, 1, false);
}

int publicarTelemetria(int rssi, const bateria::Lectura& bat) {
  JsonDocument doc;
  if (rssi < 0) doc["rssi"] = rssi;
  doc["uptime"] = millis() / 1000;
  doc["heap"] = ESP.getFreeHeap();
  if (bat.pct >= 0) {
    doc["bat"] = bat.pct;
    doc["mv"] = bat.mv;
  }
  return publicar(base_ + "/telemetry", doc, 0, false);
}

int publicarAck(const char* id, bool ok, const char* error) {
  JsonDocument doc;
  doc["id"] = id;
  doc["ok"] = ok;
  if (error) doc["error"] = error;
  else doc["error"] = nullptr;
  return publicar(base_ + "/ack", doc, 1, false);
}

bool tomarComando(Comando& c) { return colaComandos && xQueueReceive(colaComandos, &c, 0) == pdTRUE; }
bool tomarPublicado(int& msgId) { return colaPublicados && xQueueReceive(colaPublicados, &msgId, 0) == pdTRUE; }

}  // namespace mqttmgr
