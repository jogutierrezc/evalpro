-- Migration: add categories array to evaluation_templates and category text to evaluation_sections
ALTER TABLE evaluation_templates
  ADD COLUMN IF NOT EXISTS categories text[];

ALTER TABLE evaluation_sections
  ADD COLUMN IF NOT EXISTS category text;

-- Optional constraint to ensure category value is one of allowed categories (uncomment to enforce)
-- ALTER TABLE evaluation_sections
--   ADD CONSTRAINT chk_evaluation_sections_category CHECK (category IS NULL OR category IN ('Integridad','Compromiso con la calidad del trabajo','Institucional','Liderazgo','Empowerment','Proactividad','Orientacion a los resultados'));
