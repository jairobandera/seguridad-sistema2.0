// =====================================================================
// Seguridad Residencial — firmware ESP32 v2
//
// - Sensor de puerta (reed switch) en GPIO14, con antirrebote.
// - Configuración por Bluetooth desde la app (solo en "modo configuración").
// - Vinculación segura a la casa con código de un solo uso.
// - MQTT con usuario propio, QoS 1 y última voluntad (offline inmediato).
// - Los eventos se guardan en flash y se reenvían si no había conexión.
// - Nunca se bloquea: el sensor se lee siempre, haya o no conexión.
//
// Protocolo: docs/protocolo.md     Guía: firmware/README.md
// =====================================================================
#include <WiFi.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include <esp_mac.h>
#include "config.h"
#include "almacen.h"
#include "led.h"
#include "sensor.h"
#include "red.h"
#include "mqtt_mgr.h"
#include "ble_prov.h"
#include "token.h"

static const unsigned long INDEFINIDO = 0xFFFFFFFFUL;

String deviceId;

// Modo configuración (Bluetooth abierto)
unsigned long configHasta = 0;  // 0 = cerrado, INDEFINIDO = hasta configurar
unsigned long configDesde = 0;
bool bleAbiertoPorCaida = false;

// Asistente de configuración en curso (comando "setup" de la app)
enum class Fase { NADA, WIFI, VINCULAR, MQTT };
struct Trabajo {
  Fase fase = Fase::NADA;
  String ssid, pass, codigo;
  String ssidAnterior, passAnterior;
  unsigned long desde = 0;
} trabajo;

bool escaneoPendiente = false;

// Envío de eventos de la cola (de a uno, esperando confirmación del servidor)
int enVuelo = -1;
unsigned long enVueloDesde = 0;

unsigned long ultimaTelemetria = 0;
unsigned long reinicioEn = 0;  // reinicio programado (después de mandar el ACK)
bool borrarAlReiniciar = false;

unsigned long botonDesde = 0;

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
String leerDeviceId() {
  // Se lee del eFuse: no depende de que el WiFi ya esté iniciado (WiFi.macAddress() puede dar ceros)
  uint8_t mac[6] = {0};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char buf[13];
  snprintf(buf, sizeof(buf), "%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(buf);
}

void responder(const JsonDocument& doc) {
  String s;
  serializeJson(doc, s);
  ble::enviar(s);
}

void progreso(const char* fase) {
  JsonDocument d;
  d["r"] = "progreso";
  d["fase"] = fase;
  responder(d);
  Serial.printf("[setup] %s\n", fase);
}

void error(const char* fase, const char* motivo) {
  JsonDocument d;
  d["r"] = "error";
  d["fase"] = fase;
  d["motivo"] = motivo;
  responder(d);
  Serial.printf("[setup] error %s: %s\n", fase, motivo);
}

void abrirModoConfig(unsigned long duracion) {
  configDesde = millis();
  configHasta = duracion == INDEFINIDO ? INDEFINIDO : millis() + duracion;
  ble::abrir(deviceId, almacen::vinculada());
}

void cerrarModoConfig() {
  configHasta = 0;
  bleAbiertoPorCaida = false;
  ble::cerrar();
}

bool modoConfig() { return configHasta != 0; }

void iniciarMqtt() {
  if (!almacen::vinculada()) return;
  mqttmgr::configurar(almacen::mqttUrl(), almacen::mqttUser(), almacen::mqttPass(), deviceId);
}

void publicarEstado() {
  if (mqttmgr::conectado()) mqttmgr::publicarEstado(sensor::puertaAbierta(), red::ssidActual(), red::rssi(), red::ip());
}

void programarReinicio(unsigned long ms, bool borrar) {
  reinicioEn = millis() + ms;
  borrarAlReiniciar = borrar;
}

// ---------------------------------------------------------------------
// Comandos por Bluetooth
// ---------------------------------------------------------------------
void comandoBle(const String& linea) {
  JsonDocument doc;
  if (deserializeJson(doc, linea) != DeserializationError::Ok) return error("comando", "json_invalido");
  String cmd = doc["cmd"] | "";

  if (cmd == "info") {
    JsonDocument r;
    r["r"] = "info";
    r["id"] = deviceId;
    r["fw"] = FW_VERSION;
    r["vinculada"] = almacen::vinculada();
    JsonObject w = r["wifi"].to<JsonObject>();
    w["ok"] = red::conectado();
    w["ssid"] = red::conectado() ? red::ssidActual() : almacen::ssid();
    if (red::conectado()) w["rssi"] = red::rssi();
    return responder(r);
  }

  if (cmd == "scan") {
    if (trabajo.fase != Fase::NADA) return error("comando", "ocupado");
    red::iniciarEscaneo();
    escaneoPendiente = true;
    return;
  }

  if (cmd == "setup") {
    if (trabajo.fase != Fase::NADA) return error("comando", "ocupado");
    String ssid = doc["ssid"] | "";
    String pass = doc["pass"] | "";
    String codigo = doc["codigo"] | "";
    String token = doc["token"] | "";
    String api = doc["api"] | "";
    if (!ssid.length() || ssid.length() > 32 || pass.length() > 64) return error("comando", "json_invalido");

    if (almacen::vinculada()) {
      // Placa vinculada: solo el dueño (con token del servidor) puede cambiar el WiFi
      if (!tokenConfigValido(token, deviceId, almacen::secreto(), red::horaValida())) return error("comando", "token_invalido");
      codigo = "";
    } else if (!codigo.length()) {
      return error("vinculacion", "codigo_invalido");
    }
    if (api.startsWith("http://") || api.startsWith("https://")) almacen::guardarApiUrl(api);

    trabajo.fase = Fase::WIFI;
    trabajo.ssid = ssid;
    trabajo.pass = pass;
    trabajo.codigo = codigo;
    trabajo.ssidAnterior = almacen::ssid();
    trabajo.passAnterior = almacen::pass();
    trabajo.desde = millis();
    progreso("wifi_conectando");
    red::probar(ssid, pass);
    return;
  }

  if (cmd == "factory_reset") {
    String token = doc["token"] | "";
    if (almacen::vinculada() && !tokenConfigValido(token, deviceId, almacen::secreto(), red::horaValida())) {
      return error("comando", "token_invalido");
    }
    JsonDocument r;
    r["r"] = "ok";
    responder(r);
    programarReinicio(800, true);
    return;
  }

  error("comando", "desconocido");
}

// ---------------------------------------------------------------------
// Asistente de configuración (no bloqueante, avanza en cada loop)
// ---------------------------------------------------------------------
void avanzarTrabajo() {
  switch (trabajo.fase) {
    case Fase::NADA:
      return;

    case Fase::WIFI: {
      red::ResultadoWifi r = red::resultadoPrueba();
      if (r == red::ResultadoWifi::EN_CURSO) return;
      if (r != red::ResultadoWifi::OK) {
        error("wifi", red::motivo(r));
        // Volver a la red anterior si había una
        red::conectar(trabajo.ssidAnterior, trabajo.passAnterior);
        trabajo.fase = Fase::NADA;
        return;
      }
      almacen::guardarWifi(trabajo.ssid, trabajo.pass);
      red::conectar(trabajo.ssid, trabajo.pass);  // deja activa la reconexión normal
      Serial.printf("[wifi] conectada a %s, IP %s\n", trabajo.ssid.c_str(), red::ip().c_str());
      progreso("wifi_ok");
      if (trabajo.codigo.length()) {
        trabajo.fase = Fase::VINCULAR;
      } else {
        trabajo.fase = Fase::MQTT;
        trabajo.desde = millis();
      }
      return;
    }

    case Fase::VINCULAR: {
      progreso("vinculando");
      red::RespuestaProvision p = red::provisionar(almacen::apiUrl(), deviceId, trabajo.codigo, almacen::secretoHex());
      trabajo.codigo = "";
      if (p.http == 200 && p.mqttUrl.length() && p.mqttUser.length() && p.mqttPass.length()) {
        almacen::guardarMqtt(p.mqttUrl, p.mqttUser, p.mqttPass);
        almacen::reiniciarSeq();
        almacen::colaVaciar();
        enVuelo = -1;
        ble::actualizarInfo(true);
        progreso("vinculada");
        iniciarMqtt();
        trabajo.fase = Fase::MQTT;
        trabajo.desde = millis();
        return;
      }
      const char* motivo = p.http == 0                    ? "sin_internet"
                           : p.error == "codigo_invalido" ? "codigo_invalido"
                           : p.error == "ya_vinculada"    ? "ya_vinculada"
                                                          : "servidor";
      error("vinculacion", motivo);
      trabajo.fase = Fase::NADA;
      return;
    }

    case Fase::MQTT:
      if (mqttmgr::conectado()) {
        progreso("mqtt_ok");
        progreso("listo");
        trabajo.fase = Fase::NADA;
        // Deja el Bluetooth unos segundos para que la app lea el resultado
        configHasta = millis() + 20000UL;
        return;
      }
      if (millis() - trabajo.desde > MQTT_TIMEOUT_SETUP_MS) {
        error("mqtt", "timeout");
        trabajo.fase = Fase::NADA;
      }
      return;
  }
}

// ---------------------------------------------------------------------
// Comandos por MQTT
// ---------------------------------------------------------------------
void comandosMqtt() {
  mqttmgr::Comando c;
  while (mqttmgr::tomarComando(c)) {
    String cmd = c.cmd;
    Serial.printf("[mqtt] comando %s\n", c.cmd);
    if (cmd == "ping") {
      mqttmgr::publicarAck(c.id, true, nullptr);
      publicarEstado();
    } else if (cmd == "open_ble") {
      mqttmgr::publicarAck(c.id, true, nullptr);
      abrirModoConfig(MODO_CONFIG_MS);
    } else if (cmd == "reboot") {
      mqttmgr::publicarAck(c.id, true, nullptr);
      programarReinicio(1500, false);
    } else if (cmd == "factory_reset") {
      mqttmgr::publicarAck(c.id, true, nullptr);
      programarReinicio(1500, true);
    } else {
      mqttmgr::publicarAck(c.id, false, "desconocido");
    }
  }
}

// ---------------------------------------------------------------------
// Eventos de puerta
// ---------------------------------------------------------------------
void registrarCambioPuerta(bool abierta) {
  Serial.printf("[puerta] %s\n", abierta ? "ABIERTA" : "CERRADA");
  if (almacen::vinculada()) {
    EventoPuerta e;
    e.seq = almacen::siguienteSeq();
    e.ts = red::horaValida() ? static_cast<uint32_t>(time(nullptr)) : 0;
    e.abierta = abierta ? 1 : 0;
    almacen::colaAgregar(e);
  }
  publicarEstado();
}

void enviarCola() {
  int id;
  while (mqttmgr::tomarPublicado(id)) {
    if (id == enVuelo) {
      almacen::colaQuitarPrimero();
      enVuelo = -1;
    }
  }
  if (!mqttmgr::conectado()) {
    enVuelo = -1;
    return;
  }
  // Sin confirmación en 15 s: se reenvía (el servidor descarta duplicados por seq)
  if (enVuelo >= 0 && millis() - enVueloDesde > 15000UL) enVuelo = -1;
  if (enVuelo < 0 && !almacen::colaVacia()) {
    enVuelo = mqttmgr::publicarEvento(almacen::colaPrimero());
    enVueloDesde = millis();
  }
}

// ---------------------------------------------------------------------
// Botón BOOT: 5 s = Bluetooth 10 min, 15 s = restablecer de fábrica
// ---------------------------------------------------------------------
void revisarBoton() {
  bool apretado = digitalRead(BOTON_PIN) == LOW;
  if (apretado && !botonDesde) botonDesde = millis();
  if (!apretado && botonDesde) {
    unsigned long dur = millis() - botonDesde;
    botonDesde = 0;
    if (dur >= BOTON_RESET_MS) {
      Serial.println("[boton] restablecer de fabrica");
      programarReinicio(100, true);
    } else if (dur >= BOTON_CONFIG_MS) {
      Serial.println("[boton] modo configuracion");
      abrirModoConfig(MODO_CONFIG_MS);
    }
  }
}

void actualizarLed() {
  if (botonDesde && millis() - botonDesde >= BOTON_RESET_MS) led::patron(PatronLed::RESET);
  else if (botonDesde && millis() - botonDesde >= BOTON_CONFIG_MS) led::patron(PatronLed::CONFIG);
  else if (modoConfig()) led::patron(PatronLed::CONFIG);
  else if (!red::conectado()) led::patron(PatronLed::SIN_WIFI);
  else if (!mqttmgr::conectado()) led::patron(PatronLed::SIN_MQTT);
  else led::patron(PatronLed::OK);
  led::actualizar();
}

// ---------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.printf("\n===== Seguridad Residencial v%s =====\n", FW_VERSION);

  esp_task_wdt_config_t wdt = {};
  wdt.timeout_ms = WATCHDOG_MS;
  wdt.trigger_panic = true;
  esp_task_wdt_reconfigure(&wdt);
  esp_task_wdt_add(nullptr);

  pinMode(BOTON_PIN, INPUT_PULLUP);
  led::iniciar();
  sensor::iniciar();
  almacen::iniciar();
  red::iniciar();
  deviceId = leerDeviceId();
  Serial.printf("deviceId: %s | vinculada: %s | eventos en cola: %u\n", deviceId.c_str(),
                almacen::vinculada() ? "si" : "no", static_cast<unsigned>(almacen::colaTamano()));

  configTzTime(ZONA_HORARIA, "pool.ntp.org", "time.google.com");

  red::conectar(almacen::ssid(), almacen::pass());
  iniciarMqtt();

  if (!almacen::ssid().length() || !almacen::vinculada()) {
    Serial.println("Sin configurar: Bluetooth abierto esperando la app");
    abrirModoConfig(INDEFINIDO);
  }
}

void loop() {
  esp_task_wdt_reset();

  if (sensor::actualizar()) registrarCambioPuerta(sensor::puertaAbierta());
  revisarBoton();
  red::actualizar();

  String linea;
  while (ble::tomarLinea(linea)) comandoBle(linea);

  if (escaneoPendiente) {
    int n = red::escaneoListo();
    if (n >= 0) {
      escaneoPendiente = false;
      ble::enviar(red::redesJson(n));
    } else if (n == -2) {
      escaneoPendiente = false;
      ble::enviar("{\"r\":\"redes\",\"lista\":[]}");
    }
  }

  avanzarTrabajo();

  // MQTT
  if (mqttmgr::recienConectado()) {
    Serial.println("[mqtt] conectado");
    publicarEstado();
  }
  comandosMqtt();
  enviarCola();
  if (mqttmgr::conectado() && millis() - ultimaTelemetria > TELEMETRIA_MS) {
    ultimaTelemetria = millis();
    mqttmgr::publicarTelemetria(red::rssi());
  }
  // El servidor rechaza nuestras credenciales: la placa fue desvinculada
  if (almacen::vinculada() && mqttmgr::rechazos() >= MQTT_RECHAZOS_DESVINCULAR) {
    Serial.println("[mqtt] credenciales rechazadas: placa desvinculada");
    mqttmgr::detener();
    almacen::borrarVinculacion();
    almacen::colaVaciar();
    ble::actualizarInfo(false);
    abrirModoConfig(INDEFINIDO);
  }

  // WiFi caído mucho tiempo (¿cambiaron el router?): abre el Bluetooth para reconfigurar
  if (!modoConfig() && red::caidoHace() > WIFI_CAIDO_ABRE_BLE_MS) {
    Serial.println("WiFi caido hace 5 min: Bluetooth abierto");
    abrirModoConfig(MODO_CONFIG_MS);
    bleAbiertoPorCaida = true;
  }
  if (bleAbiertoPorCaida && red::conectado() && !ble::clienteConectado() && trabajo.fase == Fase::NADA) {
    cerrarModoConfig();
  }

  // Cierre del modo configuración
  if (modoConfig() && configHasta != INDEFINIDO && (long)(millis() - configHasta) > 0 && !ble::clienteConectado() &&
      trabajo.fase == Fase::NADA) {
    cerrarModoConfig();
  }
  if (configHasta == INDEFINIDO && almacen::vinculada() && red::conectado() && trabajo.fase == Fase::NADA &&
      !ble::clienteConectado() && millis() - configDesde > 60000UL) {
    cerrarModoConfig();
  }

  if (reinicioEn && (long)(millis() - reinicioEn) > 0) {
    if (borrarAlReiniciar) almacen::borrarTodo();
    Serial.println("Reiniciando...");
    Serial.flush();
    ESP.restart();
  }

  actualizarLed();
  delay(5);
}
