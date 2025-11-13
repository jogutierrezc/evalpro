-- Migration: add weight percentage to evaluation_questions
ALTER TABLE evaluation_questions
  ADD COLUMN IF NOT EXISTS weight numeric DEFAULT 0;

-- Optional: enforce weight between 0 and 100
-- ALTER TABLE evaluation_questions
--   ADD CONSTRAINT chk_evaluation_questions_weight CHECK (weight >= 0 AND weight <= 100);
