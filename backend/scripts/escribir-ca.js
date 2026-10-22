// Escribe el certificado CA de Aiven (variable DATABASE_CA_CERT) en prisma/ca.pem
// para que Prisma pueda verificar la conexión SSL a MySQL (sslcert=./ca.pem).
const fs = require("fs");
const path = require("path");

const pem = process.env.DATABASE_CA_CERT;
if (pem) {
  const destino = path.join(__dirname, "..", "prisma", "ca.pem");
  fs.writeFileSync(destino, pem.replace(/\\n/g, "\n"));
  console.log("Certificado CA de la base escrito en prisma/ca.pem");
}
