ALTER TABLE `template_mappings`
  ADD COLUMN `document_name` VARCHAR(191) NULL,
  ADD COLUMN `signers_emails` JSON NOT NULL DEFAULT (JSON_ARRAY());
