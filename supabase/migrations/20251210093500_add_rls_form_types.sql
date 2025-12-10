-- Enable RLS on form_types table
ALTER TABLE form_types ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read access to all authenticated users (needed for form selection)
CREATE POLICY "Authenticated users can select form_types"
  ON form_types
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow admins to insert/update/delete form_types
CREATE POLICY "Admins can manage form_types"
  ON form_types
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
