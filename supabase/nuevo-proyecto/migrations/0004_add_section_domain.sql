-- Migration: Add domain_key to evaluation_sections to map sections to Goleman domains
ALTER TABLE evaluation_sections
  ADD COLUMN IF NOT EXISTS domain_key text;

-- Optional: you can add a check constraint to ensure values are one of the known domains
-- ALTER TABLE evaluation_sections
--   ADD CONSTRAINT chk_evaluation_sections_domain_key CHECK (domain_key IS NULL OR domain_key IN ('autoconciencia','autogestion','conciencia_social','gestion_relaciones'));
