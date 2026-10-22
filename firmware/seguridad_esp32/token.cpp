#include "token.h"
#include <mbedtls/md.h>

bool tokenConfigValido(const String& token, const String& deviceId, const uint8_t* secreto, bool hayHora) {
  int punto = token.indexOf('.');
  if (punto <= 0 || token.length() - punto - 1 != 64) return false;
  String expTxt = token.substring(0, punto);
  String firma = token.substring(punto + 1);
  firma.toLowerCase();

  uint32_t exp = strtoul(expTxt.c_str(), nullptr, 10);
  if (hayHora) {
    uint32_t ahora = static_cast<uint32_t>(time(nullptr));
    if (exp < ahora || exp > ahora + 3600) return false;
  }

  String mensaje = deviceId + "|" + expTxt;
  uint8_t mac[32];
  const mbedtls_md_info_t* md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (mbedtls_md_hmac(md, secreto, 32, reinterpret_cast<const uint8_t*>(mensaje.c_str()), mensaje.length(), mac) != 0) {
    return false;
  }
  char esperado[65];
  for (int i = 0; i < 32; i++) sprintf(esperado + i * 2, "%02x", mac[i]);
  esperado[64] = 0;

  // Comparación en tiempo constante
  uint8_t dif = 0;
  for (int i = 0; i < 64; i++) dif |= static_cast<uint8_t>(esperado[i] ^ firma[i]);
  return dif == 0;
}
