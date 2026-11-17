-- Base inicial en PostgreSQL (Supabase). Reemplaza las migraciones de MySQL (Aiven).
-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'GUARDIA', 'CLIENTE');

-- CreateEnum
CREATE TYPE "RolCasa" AS ENUM ('DUENO', 'FAMILIAR');

-- CreateEnum
CREATE TYPE "Severidad" AS ENUM ('INFO', 'ALERTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "EstadoAtencion" AS ENUM ('PENDIENTE', 'EN_CURSO', 'RESUELTO', 'FALSA_ALARMA');

-- CreateEnum
CREATE TYPE "Paquete" AS ENUM ('BARRIO', 'INDIVIDUAL');

-- CreateTable
CREATE TABLE "Barrio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tieneGuardia" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "codigoRegistro" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Barrio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardiaBarrio" (
    "usuarioId" INTEGER NOT NULL,
    "barrioId" INTEGER NOT NULL,

    CONSTRAINT "GuardiaBarrio_pkey" PRIMARY KEY ("usuarioId","barrioId")
);

-- CreateTable
CREATE TABLE "Latido" (
    "id" INTEGER NOT NULL,
    "ultimo" TIMESTAMP(3) NOT NULL,
    "llamadas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Latido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Casa" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT,
    "calle" TEXT,
    "numero" TEXT,
    "manzana" TEXT,
    "paquete" "Paquete" NOT NULL DEFAULT 'BARRIO',
    "barrioId" INTEGER,
    "alarmaArmada" BOOLEAN NOT NULL DEFAULT false,
    "retardoEntradaSeg" INTEGER NOT NULL DEFAULT 0,
    "codigoFamilia" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Casa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CasaMiembro" (
    "id" SERIAL NOT NULL,
    "rol" "RolCasa" NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "casaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "CasaMiembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispositivo" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "nombre" TEXT,
    "tipo" TEXT,
    "firmwareVersion" TEXT,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "ultimaConexion" TIMESTAMP(3),
    "wifiSsid" TEXT,
    "wifiRssi" INTEGER,
    "bateria" INTEGER,
    "bateriaMv" INTEGER,
    "avisoBateria" INTEGER,
    "ip" TEXT,
    "puertaAbierta" BOOLEAN,
    "excluidoAlarma" BOOLEAN NOT NULL DEFAULT false,
    "secretEnc" TEXT,
    "mqttUsername" TEXT,
    "mqttPassHash" TEXT,
    "vinculadoEn" TIMESTAMP(3),
    "ultimoSeq" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "casaId" INTEGER,

    CONSTRAINT "Dispositivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodigoVinculacion" (
    "id" SERIAL NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nombreDispositivo" TEXT,
    "casaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "CodigoVinculacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecuperacionPassword" (
    "id" SERIAL NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "usadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "RecuperacionPassword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evento" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "severidad" "Severidad" NOT NULL DEFAULT 'INFO',
    "valor" TEXT,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recibidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origen" TEXT,
    "seq" INTEGER,
    "alarmaArmada" BOOLEAN NOT NULL DEFAULT false,
    "dispositivoId" INTEGER,
    "casaId" INTEGER,
    "usuarioId" INTEGER,

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoEstado" (
    "id" SERIAL NOT NULL,
    "estado" "EstadoAtencion" NOT NULL DEFAULT 'PENDIENTE',
    "nota" TEXT,
    "tomadoEn" TIMESTAMP(3),
    "resueltoEn" TIMESTAMP(3),
    "eventoId" INTEGER NOT NULL,
    "guardiaId" INTEGER,

    CONSTRAINT "EventoEstado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactoEmergencia" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "relacion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "ContactoEmergencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "canal" TEXT,
    "destino" TEXT,
    "entregado" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "enviadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER,
    "eventoId" INTEGER,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sesion" (
    "id" SERIAL NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUso" TIMESTAMP(3),
    "expiracion" TIMESTAMP(3) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "Sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "plataforma" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Camara" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "urlRTSP" TEXT,
    "urlWebRTC" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "tipo" TEXT,
    "casaId" INTEGER NOT NULL,

    CONSTRAINT "Camara_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Barrio_nombre_key" ON "Barrio"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Barrio_codigoRegistro_key" ON "Barrio"("codigoRegistro");

-- CreateIndex
CREATE INDEX "GuardiaBarrio_barrioId_idx" ON "GuardiaBarrio"("barrioId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Casa_codigo_key" ON "Casa"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Casa_codigoFamilia_key" ON "Casa"("codigoFamilia");

-- CreateIndex
CREATE INDEX "Casa_barrioId_idx" ON "Casa"("barrioId");

-- CreateIndex
CREATE INDEX "CasaMiembro_usuarioId_idx" ON "CasaMiembro"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "CasaMiembro_casaId_usuarioId_key" ON "CasaMiembro"("casaId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispositivo_deviceId_key" ON "Dispositivo"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispositivo_mqttUsername_key" ON "Dispositivo"("mqttUsername");

-- CreateIndex
CREATE UNIQUE INDEX "CodigoVinculacion_codigoHash_key" ON "CodigoVinculacion"("codigoHash");

-- CreateIndex
CREATE INDEX "RecuperacionPassword_usuarioId_idx" ON "RecuperacionPassword"("usuarioId");

-- CreateIndex
CREATE INDEX "Evento_casaId_fechaHora_idx" ON "Evento"("casaId", "fechaHora");

-- CreateIndex
CREATE INDEX "Evento_tipo_fechaHora_idx" ON "Evento"("tipo", "fechaHora");

-- CreateIndex
CREATE INDEX "Evento_dispositivoId_fechaHora_idx" ON "Evento"("dispositivoId", "fechaHora");

-- CreateIndex
CREATE UNIQUE INDEX "EventoEstado_eventoId_key" ON "EventoEstado"("eventoId");

-- CreateIndex
CREATE INDEX "EventoEstado_estado_idx" ON "EventoEstado"("estado");

-- CreateIndex
CREATE INDEX "Notificacion_eventoId_idx" ON "Notificacion"("eventoId");

-- CreateIndex
CREATE UNIQUE INDEX "Sesion_refreshHash_key" ON "Sesion"("refreshHash");

-- CreateIndex
CREATE INDEX "Sesion_usuarioId_idx" ON "Sesion"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- AddForeignKey
ALTER TABLE "GuardiaBarrio" ADD CONSTRAINT "GuardiaBarrio_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardiaBarrio" ADD CONSTRAINT "GuardiaBarrio_barrioId_fkey" FOREIGN KEY ("barrioId") REFERENCES "Barrio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Casa" ADD CONSTRAINT "Casa_barrioId_fkey" FOREIGN KEY ("barrioId") REFERENCES "Barrio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasaMiembro" ADD CONSTRAINT "CasaMiembro_casaId_fkey" FOREIGN KEY ("casaId") REFERENCES "Casa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasaMiembro" ADD CONSTRAINT "CasaMiembro_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispositivo" ADD CONSTRAINT "Dispositivo_casaId_fkey" FOREIGN KEY ("casaId") REFERENCES "Casa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodigoVinculacion" ADD CONSTRAINT "CodigoVinculacion_casaId_fkey" FOREIGN KEY ("casaId") REFERENCES "Casa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodigoVinculacion" ADD CONSTRAINT "CodigoVinculacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecuperacionPassword" ADD CONSTRAINT "RecuperacionPassword_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_dispositivoId_fkey" FOREIGN KEY ("dispositivoId") REFERENCES "Dispositivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_casaId_fkey" FOREIGN KEY ("casaId") REFERENCES "Casa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoEstado" ADD CONSTRAINT "EventoEstado_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoEstado" ADD CONSTRAINT "EventoEstado_guardiaId_fkey" FOREIGN KEY ("guardiaId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactoEmergencia" ADD CONSTRAINT "ContactoEmergencia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sesion" ADD CONSTRAINT "Sesion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camara" ADD CONSTRAINT "Camara_casaId_fkey" FOREIGN KEY ("casaId") REFERENCES "Casa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

