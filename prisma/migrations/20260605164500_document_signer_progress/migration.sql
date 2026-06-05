ALTER TABLE `documents`
  ADD COLUMN `signer_total` INT NULL,
  ADD COLUMN `signed_signer_emails` JSON NOT NULL DEFAULT ('[]');
