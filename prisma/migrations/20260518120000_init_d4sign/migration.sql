-- Schema unificado d4sign-app (idempotente para DB já migrado pelo clicksign-app)

CREATE TABLE IF NOT EXISTS `bitrix_domains` (
    `id` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `access_token` TEXT NOT NULL,
    `refresh_token` TEXT NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `app_id` VARCHAR(191) NULL,
    `app_secret` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bitrix_domains_domain_key`(`domain`),
    UNIQUE INDEX `bitrix_domains_member_id_key`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `settings` (
    `id` VARCHAR(191) NOT NULL,
    `domain_id` VARCHAR(191) NOT NULL,
    `fields` TEXT NULL,
    `groups` TEXT NULL,
    `deal_settings` TEXT NULL,
    `verify_settings` TEXT NULL,
    `contact_settings` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `settings_domain_id_key`(`domain_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `instances` (
    `id` VARCHAR(191) NOT NULL,
    `domain_id` VARCHAR(191) NOT NULL,
    `url_enviar_documento` VARCHAR(2048) NULL,
    `url_enviar_documento_envelope` VARCHAR(2048) NULL,
    `url_cancelar_documento` VARCHAR(2048) NULL,
    `url_update_subscription_groups` VARCHAR(2048) NULL,
    `load_documents` VARCHAR(2048) NULL,
    `load_document` VARCHAR(2048) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `instances_domain_id_key`(`domain_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `d4sign_credentials` (
    `id` VARCHAR(191) NOT NULL,
    `bitrix_domain_id` VARCHAR(191) NOT NULL,
    `token_api` TEXT NOT NULL,
    `crypt_key` TEXT NULL,
    `hmac_secret` TEXT NULL,
    `default_safe_uuid` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `d4sign_credentials_bitrix_domain_id_key`(`bitrix_domain_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `documents` (
    `id` VARCHAR(191) NOT NULL,
    `bitrix_domain_id` VARCHAR(191) NOT NULL,
    `uuid_doc` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(191) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `status_id` INTEGER NULL,
    `status_name` VARCHAR(255) NULL,
    `raw_last_payload` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `documents_uuid_doc_key`(`uuid_doc`),
    INDEX `documents_bitrix_domain_id_entity_type_entity_id_idx`(`bitrix_domain_id`, `entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `webhook_logs` (
    `id` VARCHAR(191) NOT NULL,
    `bitrix_domain_id` VARCHAR(191) NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'd4sign',
    `headers_hash` VARCHAR(128) NULL,
    `body_json` JSON NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `processing_error` TEXT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `webhook_logs_received_at_idx`(`received_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `bitrix_domain_id` VARCHAR(191) NULL,
    `actor` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `meta` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
