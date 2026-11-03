-- Fix RLS policies for evaluation_results to allow office managers and evaluators to manage results
-- This allows saving AI analysis and scores

DROP POLICY IF EXISTS "Admins can manage all results" ON evaluation_results;
DROP POLICY IF EXISTS "Users can view their own results" ON evaluation_results;
DROP POLICY IF EXISTS "Office managers can view results in their office" ON evaluation_results;

-- 1. Admins: Full access
CREATE POLICY "Admins can manage all results"
  ON evaluation_results FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- 2. Evaluators: Can view and update results for evaluations they performed
CREATE POLICY "Evaluators can manage results for their evaluations"
  ON evaluation_results FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM evaluations 
      WHERE evaluations.id = evaluation_results.evaluation_id 
      AND evaluations.evaluator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM evaluations 
      WHERE evaluations.id = evaluation_results.evaluation_id 
      AND evaluations.evaluator_id = auth.uid()
    )
  );

-- 3. Office Managers: Can view and update results for their office
CREATE POLICY "Office managers can manage results in their office"
  ON evaluation_results FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM evaluations e
      JOIN users u1 ON u1.id = auth.uid()
      JOIN users u2 ON u2.id = e.evaluated_id
      WHERE e.id = evaluation_results.evaluation_id
      AND u1.role = 'office_manager' 
      AND u1.office_id = u2.office_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM evaluations e
      JOIN users u1 ON u1.id = auth.uid()
      JOIN users u2 ON u2.id = e.evaluated_id
      WHERE e.id = evaluation_results.evaluation_id
      AND u1.role = 'office_manager' 
      AND u1.office_id = u2.office_id
    )
  );

-- 4. Evaluated Users: Can view their own results
CREATE POLICY "Users can view their own results"
  ON evaluation_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM evaluations 
      WHERE evaluations.id = evaluation_results.evaluation_id 
      AND evaluations.evaluated_id = auth.uid()
    )
  );
