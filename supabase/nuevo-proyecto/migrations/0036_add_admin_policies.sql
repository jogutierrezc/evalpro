-- Add admin policies for evaluation tables
-- This ensures admins can see and manage all evaluation data

-- 1. EVALUATIONS Table
DROP POLICY IF EXISTS "Admins can manage all evaluations" ON evaluations;
CREATE POLICY "Admins can manage all evaluations"
  ON evaluations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND (users.role = 'admin' OR users.role = 'administrador')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND (users.role = 'admin' OR users.role = 'administrador')
    )
  );

-- 2. EVALUATION_RESPONSES Table
DROP POLICY IF EXISTS "Admins can manage all responses" ON evaluation_responses;
CREATE POLICY "Admins can manage all responses"
  ON evaluation_responses FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND (users.role = 'admin' OR users.role = 'administrador')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND (users.role = 'admin' OR users.role = 'administrador')
    )
  );

-- 3. EVALUATION_RESULTS Table
DROP POLICY IF EXISTS "Admins can manage all results" ON evaluation_results;
CREATE POLICY "Admins can manage all results"
  ON evaluation_results FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND (users.role = 'admin' OR users.role = 'administrador')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND (users.role = 'admin' OR users.role = 'administrador')
    )
  );
