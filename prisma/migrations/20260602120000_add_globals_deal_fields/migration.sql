ALTER TABLE `settings`
  ADD COLUMN `d4sign_status_return_field` VARCHAR(191) NULL,
  ADD COLUMN `signed_document_attach_fields` JSON NOT NULL DEFAULT (JSON_ARRAY());
