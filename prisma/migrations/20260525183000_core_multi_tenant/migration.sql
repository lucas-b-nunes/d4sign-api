-- Migration: core_multi_tenant
-- Substitui a tabela bitrix_domains pelas tabelas core_app_codes, core_domains,
-- core_apps e core_credentials. Todas as tabelas dependentes passam a referenciar
-- core_apps.id no lugar de bitrix_domains.id.

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Remover tabelas dependentes de bitrix_domains (serão recriadas abaixo)
DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `webhook_logs`;
DROP TABLE IF EXISTS `documents`;
DROP TABLE IF EXISTS `d4sign_credentials`;
DROP TABLE IF EXISTS `instances`;
DROP TABLE IF EXISTS `settings`;
DROP TABLE IF EXISTS `bitrix_domains`;

SET FOREIGN_KEY_CHECKS = 1;

-- 2. Criar tabela core_app_codes
CREATE TABLE `core_app_codes` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `secret` LONGTEXT NOT NULL,
    `description` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `core_app_codes_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. Criar tabela core_domains
CREATE TABLE `core_domains` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `core_domains_name_key`(`name`),
    UNIQUE INDEX `core_domains_member_id_key`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. Criar tabela core_apps
CREATE TABLE `core_apps` (
    `id` VARCHAR(191) NOT NULL,
    `domain_id` VARCHAR(191) NOT NULL,
    `app_code_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `installed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `core_apps_domain_id_app_code_id_key`(`domain_id`, `app_code_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 5. Criar tabela core_credentials
CREATE TABLE `core_credentials` (
    `id` VARCHAR(191) NOT NULL,
    `app_id` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(191) NOT NULL,
    `client_secret` LONGTEXT NOT NULL,
    `access_token` LONGTEXT NULL,
    `refresh_token` LONGTEXT NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `core_credentials_app_id_key`(`app_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 6. Recriar settings
CREATE TABLE `settings` (
    `id` VARCHAR(191) NOT NULL,
    `app_id` VARCHAR(191) NOT NULL,
    `fields` LONGTEXT NULL,
    `groups` LONGTEXT NULL,
    `deal_settings` LONGTEXT NULL,
    `verify_settings` LONGTEXT NULL,
    `contact_settings` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `settings_app_id_key`(`app_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 7. Recriar instances
CREATE TABLE `instances` (
    `id` VARCHAR(191) NOT NULL,
    `app_id` VARCHAR(191) NOT NULL,
    `url_enviar_documento` VARCHAR(2048) NULL,
    `url_enviar_documento_envelope` VARCHAR(2048) NULL,
    `url_cancelar_documento` VARCHAR(2048) NULL,
    `url_update_subscription_groups` VARCHAR(2048) NULL,
    `load_documents` VARCHAR(2048) NULL,
    `load_document` VARCHAR(2048) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `instances_app_id_key`(`app_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 8. Recriar d4sign_credentials
CREATE TABLE `d4sign_credentials` (
    `id` VARCHAR(191) NOT NULL,
    `app_id` VARCHAR(191) NOT NULL,
    `token_api` LONGTEXT NOT NULL,
    `crypt_key` LONGTEXT NULL,
    `hmac_secret` LONGTEXT NULL,
    `default_safe_uuid` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `d4sign_credentials_app_id_key`(`app_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 9. Recriar documents
CREATE TABLE `documents` (
    `id` VARCHAR(191) NOT NULL,
    `app_id` VARCHAR(191) NOT NULL,
    `uuid_doc` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(191) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `status_id` INTEGER NULL,
    `status_name` VARCHAR(255) NULL,
    `raw_last_payload` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `documents_uuid_doc_key`(`uuid_doc`),
    INDEX `documents_app_id_entity_type_entity_id_idx`(`app_id`, `entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 10. Recriar webhook_logs
CREATE TABLE `webhook_logs` (
    `id` VARCHAR(191) NOT NULL,
    `app_id` VARCHAR(191) NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'd4sign',
    `headers_hash` VARCHAR(128) NULL,
    `body_json` JSON NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `processing_error` LONGTEXT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `webhook_logs_received_at_idx`(`received_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 11. Recriar audit_logs
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `app_id` VARCHAR(191) NULL,
    `actor` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `meta` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 12. Adicionar FKs
ALTER TABLE `core_apps` ADD CONSTRAINT `core_apps_domain_id_fkey`
    FOREIGN KEY (`domain_id`) REFERENCES `core_domains`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `core_apps` ADD CONSTRAINT `core_apps_app_code_id_fkey`
    FOREIGN KEY (`app_code_id`) REFERENCES `core_app_codes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `core_credentials` ADD CONSTRAINT `core_credentials_app_id_fkey`
    FOREIGN KEY (`app_id`) REFERENCES `core_apps`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `settings` ADD CONSTRAINT `settings_app_id_fkey`
    FOREIGN KEY (`app_id`) REFERENCES `core_apps`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `instances` ADD CONSTRAINT `instances_app_id_fkey`
    FOREIGN KEY (`app_id`) REFERENCES `core_apps`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `d4sign_credentials` ADD CONSTRAINT `d4sign_credentials_app_id_fkey`
    FOREIGN KEY (`app_id`) REFERENCES `core_apps`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `documents` ADD CONSTRAINT `documents_app_id_fkey`
    FOREIGN KEY (`app_id`) REFERENCES `core_apps`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `webhook_logs` ADD CONSTRAINT `webhook_logs_app_id_fkey`
    FOREIGN KEY (`app_id`) REFERENCES `core_apps`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_app_id_fkey`
    FOREIGN KEY (`app_id`) REFERENCES `core_apps`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
