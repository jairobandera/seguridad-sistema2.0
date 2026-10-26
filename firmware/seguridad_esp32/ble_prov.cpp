#include "ble_prov.h"
#include "consola.h"
#include <NimBLEDevice.h>
#include <ArduinoJson.h>
#include "config.h"

namespace {
NimBLEServer* servidor = nullptr;
NimBLECharacteristic* tx = nullptr;
NimBLECharacteristic* info = nullptr;
bool abierto_ = false;
volatile bool conectado_ = false;
volatile uint16_t mtu_ = 23;
String deviceId_;
std::string buffer_;
QueueHandle_t lineas = nullptr;  // char* reservados con malloc

String infoJson(bool vinculada) {
  JsonDocument doc;
  doc["id"] = deviceId_;
  doc["fw"] = FW_VERSION;
  doc["vinculada"] = vinculada;
  String s;
  serializeJson(doc, s);
  return s;
}

class CallbacksServidor : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*, NimBLEConnInfo&) override {
    conectado_ = true;
    mtu_ = 23;
    buffer_.clear();
  }
  void onDisconnect(NimBLEServer*, NimBLEConnInfo&, int) override {
    conectado_ = false;
    buffer_.clear();
    // advertiseOnDisconnect está activo por defecto: vuelve a anunciarse solo
  }
  void onMTUChange(uint16_t mtu, NimBLEConnInfo&) override { mtu_ = mtu; }
};

class CallbacksRx : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    // Corre en la tarea de NimBLE: solo acumula y encola, nada bloqueante
    NimBLEAttValue v = c->getValue();
    for (size_t i = 0; i < v.length(); i++) {
      char ch = static_cast<char>(v.data()[i]);
      if (ch == '\n') {
        if (!buffer_.empty()) {
          char* copia = strdup(buffer_.c_str());
          if (copia && xQueueSend(lineas, &copia, 0) != pdTRUE) free(copia);
        }
        buffer_.clear();
      } else if (ch != '\r') {
        if (buffer_.size() >= BLE_MAX_LINEA) buffer_.clear();  // línea demasiado larga: se descarta
        buffer_.push_back(ch);
      }
    }
  }
};

CallbacksServidor cbServidor;
CallbacksRx cbRx;
}  // namespace

namespace ble {

void abrir(const String& deviceId, bool vinculada) {
  if (abierto_) return;
  deviceId_ = deviceId;
  if (!lineas) lineas = xQueueCreate(6, sizeof(char*));
  String nombre = "HUB-" + deviceId.substring(deviceId.length() - 4);

  NimBLEDevice::init(nombre.c_str());
  NimBLEDevice::setMTU(BLE_MTU);
  servidor = NimBLEDevice::createServer();
  servidor->setCallbacks(&cbServidor, false);

  NimBLEService* servicio = servidor->createService(BLE_SERVICIO_UUID);
  tx = servicio->createCharacteristic(BLE_TX_UUID, NIMBLE_PROPERTY::NOTIFY);
  NimBLECharacteristic* rx = servicio->createCharacteristic(BLE_RX_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  rx->setCallbacks(&cbRx);
  info = servicio->createCharacteristic(BLE_INFO_UUID, NIMBLE_PROPERTY::READ);
  info->setValue(infoJson(vinculada).c_str());

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(BLE_SERVICIO_UUID);
  adv->setName(nombre.c_str());
  adv->enableScanResponse(true);
  adv->start();
  abierto_ = true;
  consola.printf("[ble] Bluetooth abierto como %s\n", nombre.c_str());
}

void cerrar() {
  if (!abierto_) return;
  NimBLEDevice::deinit(true);  // libera la memoria para WiFi/TLS
  servidor = nullptr;
  tx = info = nullptr;
  abierto_ = false;
  conectado_ = false;
  char* l;
  while (lineas && xQueueReceive(lineas, &l, 0) == pdTRUE) free(l);
  consola.println("[ble] Bluetooth cerrado");
}

bool abierto() { return abierto_; }
bool clienteConectado() { return abierto_ && conectado_; }

bool tomarLinea(String& linea) {
  char* l = nullptr;
  if (!lineas || xQueueReceive(lineas, &l, 0) != pdTRUE) return false;
  linea = l;
  free(l);
  return true;
}

void enviar(const String& json) {
  if (!clienteConectado() || !tx) return;
  String datos = json + "\n";
  size_t trozo = mtu_ > 3 ? mtu_ - 3 : 20;
  for (size_t i = 0; i < datos.length(); i += trozo) {
    size_t n = min(trozo, datos.length() - i);
    tx->notify(reinterpret_cast<const uint8_t*>(datos.c_str() + i), n);
    delay(10);  // da tiempo a la pila BLE entre fragmentos
  }
}

void actualizarInfo(bool vinculada) {
  if (info) info->setValue(infoJson(vinculada).c_str());
}

}  // namespace ble
