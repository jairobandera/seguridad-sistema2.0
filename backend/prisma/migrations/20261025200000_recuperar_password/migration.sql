-- "Olvidé mi contraseña": códigos de 6 dígitos que llegan por email
CREATE TABLE `RecuperacionPassword` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigoHash` VARCHAR(191) NOT NULL,
    `expiraEn` DATETIME(3) NOT NULL,
    `intentos` INTEGER NOT NULL DEFAULT 0,
    `usadoEn` DATETIME(3) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `usuarioId` INTEGER NOT NULL,

    INDEX `RecuperacionPassword_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `RecuperacionPassword` ADD CONSTRAINT `RecuperacionPassword_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

