-- AlterTable: identifica a plataforma CRM de cada tenant (Bitrix24 existente é o default)
ALTER TABLE `core_domains` ADD COLUMN `platform` ENUM('BITRIX24', 'HUBSPOT') NOT NULL DEFAULT 'BITRIX24';

-- CreateIndex
CREATE INDEX `core_domains_platform_idx` ON `core_domains`(`platform`);
