-- Enable RLS on form_type_relations
ALTER TABLE form_type_relations ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read access to all authenticated users
CREATE POLICY "Authenticated users can select form_type_relations"
  ON form_type_relations
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow admins to manage (insert/update/delete) form_type_relations
CREATE POLICY "Admins can manage form_type_relations"
  ON form_type_relations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
