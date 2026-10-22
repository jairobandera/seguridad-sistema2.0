-- CreateTable
CREATE TABLE `Usuario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `apellido` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `telefono` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `rol` ENUM('ADMIN', 'GUARDIA', 'CLIENTE') NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `debeCambiarPassword` BOOLEAN NOT NULL DEFAULT false,
    `tokenVersion` INTEGER NOT NULL DEFAULT 0,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Usuario_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Casa` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NULL,
    `calle` VARCHAR(191) NULL,
    `numero` VARCHAR(191) NULL,
    `manzana` VARCHAR(191) NULL,
    `barrio` VARCHAR(191) NULL,
    `alarmaArmada` BOOLEAN NOT NULL DEFAULT false,
    `retardoEntradaSeg` INTEGER NOT NULL DEFAULT 0,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Casa_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CasaMiembro` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rol` ENUM('DUENO', 'FAMILIAR') NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `casaId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,

    INDEX `CasaMiembro_usuarioId_idx`(`usuarioId`),
    UNIQUE INDEX `CasaMiembro_casaId_usuarioId_key`(`casaId`, `usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Dispositivo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `deviceId` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NULL,
    `tipo` VARCHAR(191) NULL,
    `firmwareVersion` VARCHAR(191) NULL,
    `online` BOOLEAN NOT NULL DEFAULT false,
    `ultimaConexion` DATETIME(3) NULL,
    `wifiSsid` VARCHAR(191) NULL,
    `wifiRssi` INTEGER NULL,
    `ip` VARCHAR(191) NULL,
    `puertaAbierta` BOOLEAN NULL,
    `secretEnc` TEXT NULL,
    `mqttUsername` VARCHAR(191) NULL,
    `mqttPassHash` VARCHAR(191) NULL,
    `vinculadoEn` DATETIME(3) NULL,
    `ultimoSeq` INTEGER NOT NULL DEFAULT 0,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `casaId` INTEGER NULL,

    UNIQUE INDEX `Dispositivo_deviceId_key`(`deviceId`),
    UNIQUE INDEX `Dispositivo_mqttUsername_key`(`mqttUsername`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CodigoVinculacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigoHash` VARCHAR(191) NOT NULL,
    `expiraEn` DATETIME(3) NOT NULL,
    `usadoEn` DATETIME(3) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `casaId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,

    UNIQUE INDEX `CodigoVinculacion_codigoHash_key`(`codigoHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Evento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` VARCHAR(191) NOT NULL,
    `severidad` ENUM('INFO', 'ALERTA', 'CRITICA') NOT NULL DEFAULT 'INFO',
    `valor` VARCHAR(191) NULL,
    `fechaHora` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `recibidoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `origen` VARCHAR(191) NULL,
    `seq` INTEGER NULL,
    `alarmaArmada` BOOLEAN NOT NULL DEFAULT false,
    `dispositivoId` INTEGER NULL,
    `casaId` INTEGER NULL,
    `usuarioId` INTEGER NULL,

    INDEX `Evento_casaId_fechaHora_idx`(`casaId`, `fechaHora`),
    INDEX `Evento_tipo_fechaHora_idx`(`tipo`, `fechaHora`),
    INDEX `Evento_dispositivoId_fechaHora_idx`(`dispositivoId`, `fechaHora`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventoEstado` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `estado` ENUM('PENDIENTE', 'EN_CURSO', 'RESUELTO', 'FALSA_ALARMA') NOT NULL DEFAULT 'PENDIENTE',
    `nota` TEXT NULL,
    `tomadoEn` DATETIME(3) NULL,
    `resueltoEn` DATETIME(3) NULL,
    `eventoId` INTEGER NOT NULL,
    `guardiaId` INTEGER NULL,

    UNIQUE INDEX `EventoEstado_eventoId_key`(`eventoId`),
    INDEX `EventoEstado_estado_idx`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContactoEmergencia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `telefono` VARCHAR(191) NOT NULL,
    `relacion` VARCHAR(191) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `usuarioId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notificacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` VARCHAR(191) NOT NULL,
    `mensaje` TEXT NOT NULL,
    `canal` VARCHAR(191) NULL,
    `destino` VARCHAR(191) NULL,
    `entregado` BOOLEAN NOT NULL DEFAULT false,
    `error` TEXT NULL,
    `enviadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `usuarioId` INTEGER NULL,
    `eventoId` INTEGER NULL,

    INDEX `Notificacion_eventoId_idx`(`eventoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Sesion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `refreshHash` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `inicio` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ultimoUso` DATETIME(3) NULL,
    `expiracion` DATETIME(3) NOT NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `usuarioId` INTEGER NOT NULL,

    UNIQUE INDEX `Sesion_refreshHash_key`(`refreshHash`),
    INDEX `Sesion_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PushToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token` VARCHAR(191) NOT NULL,
    `plataforma` VARCHAR(191) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,
    `usuarioId` INTEGER NOT NULL,

    UNIQUE INDEX `PushToken_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Camara` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `urlRTSP` TEXT NULL,
    `urlWebRTC` TEXT NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `tipo` VARCHAR(191) NULL,
    `casaId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CasaMiembro` ADD CONSTRAINT `CasaMiembro_casaId_fkey` FOREIGN KEY (`casaId`) REFERENCES `Casa`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CasaMiembro` ADD CONSTRAINT `CasaMiembro_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Dispositivo` ADD CONSTRAINT `Dispositivo_casaId_fkey` FOREIGN KEY (`casaId`) REFERENCES `Casa`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CodigoVinculacion` ADD CONSTRAINT `CodigoVinculacion_casaId_fkey` FOREIGN KEY (`casaId`) REFERENCES `Casa`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CodigoVinculacion` ADD CONSTRAINT `CodigoVinculacion_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evento` ADD CONSTRAINT `Evento_dispositivoId_fkey` FOREIGN KEY (`dispositivoId`) REFERENCES `Dispositivo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evento` ADD CONSTRAINT `Evento_casaId_fkey` FOREIGN KEY (`casaId`) REFERENCES `Casa`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evento` ADD CONSTRAINT `Evento_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventoEstado` ADD CONSTRAINT `EventoEstado_eventoId_fkey` FOREIGN KEY (`eventoId`) REFERENCES `Evento`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventoEstado` ADD CONSTRAINT `EventoEstado_guardiaId_fkey` FOREIGN KEY (`guardiaId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContactoEmergencia` ADD CONSTRAINT `ContactoEmergencia_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notificacion` ADD CONSTRAINT `Notificacion_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notificacion` ADD CONSTRAINT `Notificacion_eventoId_fkey` FOREIGN KEY (`eventoId`) REFERENCES `Evento`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sesion` ADD CONSTRAINT `Sesion_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PushToken` ADD CONSTRAINT `PushToken_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Camara` ADD CONSTRAINT `Camara_casaId_fkey` FOREIGN KEY (`casaId`) REFERENCES `Casa`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

