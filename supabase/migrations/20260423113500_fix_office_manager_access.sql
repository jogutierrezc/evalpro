-- Comprehensive RLS fix for Evaluations, Responses and Results
-- This ensures Office Managers can see ALL data for their office collaborators

-- 1. EVALUATIONS Table
DROP POLICY IF EXISTS "Users can view and manage their evaluations" ON evaluations;
DROP POLICY IF EXISTS "Office managers can view evaluations in their office" ON evaluations;

CREATE POLICY "Users can view their own evaluations"
  ON evaluations FOR SELECT
  TO authenticated
  USING (auth.uid() = evaluator_id OR auth.uid() = evaluated_id);

CREATE POLICY "Office managers can view evaluations in their office"
  ON evaluations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u1
      JOIN users u2 ON u1.office_id = u2.office_id
      WHERE u1.id = auth.uid() 
      AND u1.role = 'office_manager'
      AND u2.id = evaluations.evaluated_id
    )
  );

-- 2. EVALUATION_RESPONSES Table
DROP POLICY IF EXISTS "Users can view and create responses to their evaluations" ON evaluation_responses;
DROP POLICY IF EXISTS "Office managers can view responses in their office" ON evaluation_responses;

CREATE POLICY "Users can view their own responses"
  ON evaluation_responses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM evaluations 
      WHERE evaluations.id = evaluation_responses.evaluation_id 
      AND (evaluations.evaluator_id = auth.uid() OR evaluations.evaluated_id = auth.uid())
    )
  );

CREATE POLICY "Office managers can view responses in their office"
  ON evaluation_responses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM evaluations e
      JOIN users u1 ON u1.id = auth.uid()
      JOIN users u2 ON u2.id = e.evaluated_id
      WHERE e.id = evaluation_responses.evaluation_id
      AND u1.role = 'office_manager' 
      AND u1.office_id = u2.office_id
    )
  );

-- 3. EVALUATION_RESULTS Table (Update previous migration for consistency)
DROP POLICY IF EXISTS "Users can view their evaluation results" ON evaluation_results;
DROP POLICY IF EXISTS "Office managers can manage results in their office" ON evaluation_results;
DROP POLICY IF EXISTS "Evaluators can manage results for their evaluations" ON evaluation_results;

CREATE POLICY "Users can view their own results"
  ON evaluation_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM evaluations 
      WHERE evaluations.id = evaluation_results.evaluation_id 
      AND (evaluations.evaluator_id = auth.uid() OR evaluations.evaluated_id = auth.uid())
    )
  );

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

CREATE POLICY "Evaluators can manage results"
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
