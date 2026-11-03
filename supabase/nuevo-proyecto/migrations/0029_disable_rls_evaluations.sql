-- Migration: Disable RLS on evaluation-related tables to fix access issues
-- This allows the application to load evaluation templates and questions without authentication barriers

-- Disable RLS on evaluation templates so users can see available exams
ALTER TABLE evaluation_templates DISABLE ROW LEVEL SECURITY;

-- Disable RLS on evaluation questions so users can see exam questions
ALTER TABLE evaluation_questions DISABLE ROW LEVEL SECURITY;

-- Disable RLS on form_types to allow template type checking
ALTER TABLE form_types DISABLE ROW LEVEL SECURITY;

-- Disable RLS on form_type_relations for role-based template access
ALTER TABLE form_type_relations DISABLE ROW LEVEL SECURITY;

-- Disable RLS on roles table for role lookups
ALTER TABLE roles DISABLE ROW LEVEL SECURITY;

-- Disable RLS on evaluation_periods to check active periods
ALTER TABLE evaluation_periods DISABLE ROW LEVEL SECURITY;

-- Disable RLS on evaluation_period_form_types to check period assignments
ALTER TABLE evaluation_period_form_types DISABLE ROW LEVEL SECURITY;

-- Disable RLS on offices for office lookups
ALTER TABLE offices DISABLE ROW LEVEL SECURITY;

-- Keep RLS enabled on sensitive tables (evaluations, responses, results)
-- but relax the policies

-- Drop existing restrictive policies on evaluations
DROP POLICY IF EXISTS "Users can view their own evaluations" ON evaluations;
DROP POLICY IF EXISTS "Office managers can view evaluations in their office" ON evaluations;
DROP POLICY IF EXISTS "Users can create evaluations as evaluator" ON evaluations;
DROP POLICY IF EXISTS "Users can update their own evaluations" ON evaluations;

-- Create more permissive policies for evaluations
CREATE POLICY "Users can view and manage their evaluations"
  ON evaluations FOR ALL
  TO authenticated
  USING (auth.uid() = evaluator_id OR auth.uid() = evaluated_id);

CREATE POLICY "Users can create any evaluation"
  ON evaluations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Relax evaluation_responses policies
DROP POLICY IF EXISTS "Users can view responses to their evaluations" ON evaluation_responses;
DROP POLICY IF EXISTS "Office managers can view responses in their office" ON evaluation_responses;
DROP POLICY IF EXISTS "Evaluators can create responses" ON evaluation_responses;

CREATE POLICY "Users can view and create responses to their evaluations"
  ON evaluation_responses FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM evaluations 
      WHERE evaluations.id = evaluation_responses.evaluation_id 
      AND (evaluations.evaluator_id = auth.uid() OR evaluations.evaluated_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM evaluations 
      WHERE evaluations.id = evaluation_responses.evaluation_id 
      AND evaluations.evaluator_id = auth.uid()
    )
  );

-- Relax evaluation_results policies
DROP POLICY IF EXISTS "Users can view their own results" ON evaluation_results;
DROP POLICY IF EXISTS "Office managers can view results in their office" ON evaluation_results;

CREATE POLICY "Users can view their evaluation results"
  ON evaluation_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM evaluations 
      WHERE evaluations.id = evaluation_results.evaluation_id 
      AND (evaluations.evaluator_id = auth.uid() OR evaluations.evaluated_id = auth.uid())
    )
  );
