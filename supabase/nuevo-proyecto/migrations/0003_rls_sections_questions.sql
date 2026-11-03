-- Tabla base que existia en la BD antigua pero nunca tuvo migracion (creada a mano).
CREATE TABLE IF NOT EXISTS evaluation_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES evaluation_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE evaluation_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_questions
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES evaluation_sections(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS order_in_section integer;
CREATE INDEX IF NOT EXISTS idx_evaluation_sections_template ON evaluation_sections(template_id);

-- Migration: Allow template owner or admin to manage evaluation_sections and evaluation_questions
-- Run this in Supabase SQL editor after review. Make a backup before applying.

-- Policies for evaluation_sections
CREATE POLICY "Template owner or admin can insert sections"
  ON evaluation_sections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM evaluation_templates
      WHERE evaluation_templates.id = evaluation_sections.template_id
      AND (
        evaluation_templates.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
      )
    )
  );

CREATE POLICY "Template owner or admin can update sections"
  ON evaluation_sections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM evaluation_templates
      WHERE evaluation_templates.id = evaluation_sections.template_id
      AND (
        evaluation_templates.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM evaluation_templates
      WHERE evaluation_templates.id = evaluation_sections.template_id
      AND (
        evaluation_templates.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
      )
    )
  );

CREATE POLICY "Template owner or admin can delete sections"
  ON evaluation_sections FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM evaluation_templates
      WHERE evaluation_templates.id = evaluation_sections.template_id
      AND (
        evaluation_templates.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
      )
    )
  );

-- Policies for evaluation_questions
CREATE POLICY "Template owner or admin can insert questions"
  ON evaluation_questions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM evaluation_templates
      WHERE evaluation_templates.id = evaluation_questions.template_id
      AND (
        evaluation_templates.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
      )
    )
  );

CREATE POLICY "Template owner or admin can update questions"
  ON evaluation_questions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM evaluation_templates
      WHERE evaluation_templates.id = evaluation_questions.template_id
      AND (
        evaluation_templates.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM evaluation_templates
      WHERE evaluation_templates.id = evaluation_questions.template_id
      AND (
        evaluation_templates.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
      )
    )
  );

CREATE POLICY "Template owner or admin can delete questions"
  ON evaluation_questions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM evaluation_templates
      WHERE evaluation_templates.id = evaluation_questions.template_id
      AND (
        evaluation_templates.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
      )
    )
  );

-- Optional: index to speed up lookups by section
CREATE INDEX IF NOT EXISTS idx_evaluation_questions_section_id ON evaluation_questions(section_id);

-- End migration
