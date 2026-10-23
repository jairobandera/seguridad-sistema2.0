-- Barrios (con guardia activable), paquete por casa y guardias por barrio.

-- CreateTable
CREATE TABLE `Barrio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `tieneGuardia` BOOLEAN NOT NULL DEFAULT true,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Barrio_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GuardiaBarrio` (
    `usuarioId` INTEGER NOT NULL,
    `barrioId` INTEGER NOT NULL,

    INDEX `GuardiaBarrio_barrioId_idx`(`barrioId`),
    PRIMARY KEY (`usuarioId`, `barrioId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Casa` ADD COLUMN `barrioId` INTEGER NULL,
    ADD COLUMN `paquete` ENUM('BARRIO', 'INDIVIDUAL') NOT NULL DEFAULT 'BARRIO';

-- AlterTable
ALTER TABLE `CodigoVinculacion` ADD COLUMN `nombreDispositivo` VARCHAR(191) NULL;

-- Datos: un barrio por cada texto de barrio que había; las casas sin barrio pasan a Individual
INSERT INTO `Barrio` (`nombre`)
    SELECT DISTINCT TRIM(`barrio`) FROM `Casa` WHERE `barrio` IS NOT NULL AND TRIM(`barrio`) <> '';
UPDATE `Casa` c JOIN `Barrio` b ON b.`nombre` = TRIM(c.`barrio`) SET c.`barrioId` = b.`id`;
UPDATE `Casa` SET `paquete` = 'INDIVIDUAL' WHERE `barrioId` IS NULL;
-- Los guardias que ya existían siguen viendo lo mismo que antes: todos los barrios
INSERT INTO `GuardiaBarrio` (`usuarioId`, `barrioId`)
    SELECT u.`id`, b.`id` FROM `Usuario` u CROSS JOIN `Barrio` b WHERE u.`rol` = 'GUARDIA';

-- AlterTable
ALTER TABLE `Casa` DROP COLUMN `barrio`;

-- CreateIndex
CREATE INDEX `Casa_barrioId_idx` ON `Casa`(`barrioId`);

-- AddForeignKey
ALTER TABLE `GuardiaBarrio` ADD CONSTRAINT `GuardiaBarrio_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuardiaBarrio` ADD CONSTRAINT `GuardiaBarrio_barrioId_fkey` FOREIGN KEY (`barrioId`) REFERENCES `Barrio`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Casa` ADD CONSTRAINT `Casa_barrioId_fkey` FOREIGN KEY (`barrioId`) REFERENCES `Barrio`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
