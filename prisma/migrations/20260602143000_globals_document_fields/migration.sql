-- Renomear status + trocar anexo de JSON array para campo único
ALTER TABLE `settings`
  CHANGE COLUMN `d4sign_status_return_field` `d4sign_document_status_field` VARCHAR(191) NULL;

ALTER TABLE `settings`
  ADD COLUMN `d4sign_document_attach_field` VARCHAR(191) NULL;

UPDATE `settings`
SET `d4sign_document_attach_field` = JSON_UNQUOTE(JSON_EXTRACT(`signed_document_attach_fields`, '$[0]'))
WHERE JSON_LENGTH(COALESCE(`signed_document_attach_fields`, JSON_ARRAY())) > 0;

ALTER TABLE `settings`
  DROP COLUMN `signed_document_attach_fields`;
