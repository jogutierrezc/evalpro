/*
  # Evaluation System Schema

  ## Overview
  Complete schema for soft skills and labor profile evaluation system with role-based access.

  ## 1. New Tables

  ### `offices`
  - `id` (uuid, primary key)
  - `name` (text) - Office name
  - `description` (text, nullable) - Office description
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `users`
  - `id` (uuid, primary key, references auth.users)
  - `identification` (text, unique) - Cedula/ID number
  - `full_name` (text) - Full name
  - `email` (text)
  - `role` (text) - 'admin', 'office_manager', 'employee'
  - `office_id` (uuid, nullable, references offices)
  - `manager_id` (uuid, nullable, references users) - Reference to office manager
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `evaluation_templates`
  - `id` (uuid, primary key)
  - `name` (text) - Template name
  - `description` (text, nullable)
  - `type` (text) - 'soft_skills', 'self_evaluation', 'manager_to_employee', 'employee_to_manager'
  - `job_position` (text, nullable) - Specific job position or null for general
  - `is_active` (boolean)
  - `created_by` (uuid, references users)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `evaluation_questions`
  - `id` (uuid, primary key)
  - `template_id` (uuid, references evaluation_templates)
  - `question_text` (text)
  - `question_type` (text) - 'rating', 'multiple_choice', 'text'
  - `options` (jsonb, nullable) - For multiple choice questions
  - `order_index` (integer)
  - `created_at` (timestamptz)

  ### `evaluations`
  - `id` (uuid, primary key)
  - `template_id` (uuid, references evaluation_templates)
  - `evaluator_id` (uuid, references users) - Who is doing the evaluation
  - `evaluated_id` (uuid, references users) - Who is being evaluated
  - `status` (text) - 'pending', 'in_progress', 'completed'
  - `started_at` (timestamptz, nullable)
  - `completed_at` (timestamptz, nullable)
  - `created_at` (timestamptz)

  ### `evaluation_responses`
  - `id` (uuid, primary key)
  - `evaluation_id` (uuid, references evaluations)
  - `question_id` (uuid, references evaluation_questions)
  - `response_value` (jsonb) - Flexible storage for any response type
  - `created_at` (timestamptz)

  ### `evaluation_results`
  - `id` (uuid, primary key)
  - `evaluation_id` (uuid, references evaluations)
  - `overall_score` (numeric)
  - `category_scores` (jsonb) - Scores by category
  - `ai_analysis` (text, nullable) - AI-generated insights
  - `recommendations` (jsonb, nullable) - AI recommendations
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## 2. Security
  - Enable RLS on all tables
  - Admin: Full access to all data
  - Office Manager: Access to their office data and assigned employees
  - Employee: Access only to their own evaluations and results
*/

-- Create offices table
CREATE TABLE IF NOT EXISTS offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  identification text UNIQUE NOT NULL,
  full_name text NOT NULL,
  email text,
  role text NOT NULL CHECK (role IN ('admin', 'office_manager', 'employee')),
  office_id uuid REFERENCES offices(id) ON DELETE SET NULL,
  manager_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create evaluation_templates table
CREATE TABLE IF NOT EXISTS evaluation_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  type text NOT NULL CHECK (type IN ('soft_skills', 'self_evaluation', 'manager_to_employee', 'employee_to_manager')),
  job_position text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create evaluation_questions table
CREATE TABLE IF NOT EXISTS evaluation_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES evaluation_templates(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('rating', 'multiple_choice', 'text')),
  options jsonb,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create evaluations table
CREATE TABLE IF NOT EXISTS evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES evaluation_templates(id) ON DELETE CASCADE,
  evaluator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  evaluated_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create evaluation_responses table
CREATE TABLE IF NOT EXISTS evaluation_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES evaluation_questions(id) ON DELETE CASCADE,
  response_value jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create evaluation_results table
CREATE TABLE IF NOT EXISTS evaluation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  overall_score numeric,
  category_scores jsonb,
  ai_analysis text,
  recommendations jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for offices
CREATE POLICY "Admins can manage all offices"
  ON offices FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Office managers can view their office"
  ON offices FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.office_id = offices.id)
  );

CREATE POLICY "Employees can view their office"
  ON offices FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.office_id = offices.id)
  );

-- RLS Policies for users
CREATE POLICY "Admins can manage all users"
  ON users FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Office managers can view their office employees"
  ON users FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id OR
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND u.role = 'office_manager' 
      AND u.office_id = users.office_id
    )
  );

CREATE POLICY "Employees can view their own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- RLS Policies for evaluation_templates
CREATE POLICY "Admins can manage all templates"
  ON evaluation_templates FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "All authenticated users can view active templates"
  ON evaluation_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

-- RLS Policies for evaluation_questions
CREATE POLICY "Admins can manage all questions"
  ON evaluation_questions FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Users can view questions from active templates"
  ON evaluation_questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM evaluation_templates 
      WHERE evaluation_templates.id = evaluation_questions.template_id 
      AND evaluation_templates.is_active = true
    )
  );

-- RLS Policies for evaluations
CREATE POLICY "Admins can manage all evaluations"
  ON evaluations FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

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
      JOIN users u2 ON u2.id = evaluations.evaluated_id
      WHERE u1.id = auth.uid() 
      AND u1.role = 'office_manager' 
      AND u1.office_id = u2.office_id
    )
  );

CREATE POLICY "Users can create evaluations as evaluator"
  ON evaluations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = evaluator_id);

CREATE POLICY "Users can update their own evaluations"
  ON evaluations FOR UPDATE
  TO authenticated
  USING (auth.uid() = evaluator_id)
  WITH CHECK (auth.uid() = evaluator_id);

-- RLS Policies for evaluation_responses
CREATE POLICY "Admins can manage all responses"
  ON evaluation_responses FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Users can view responses to their evaluations"
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

CREATE POLICY "Evaluators can create responses"
  ON evaluation_responses FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM evaluations 
      WHERE evaluations.id = evaluation_responses.evaluation_id 
      AND evaluations.evaluator_id = auth.uid()
    )
  );

-- RLS Policies for evaluation_results
CREATE POLICY "Admins can manage all results"
  ON evaluation_results FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

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

CREATE POLICY "Office managers can view results in their office"
  ON evaluation_results FOR SELECT
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
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_identification ON users(identification);
CREATE INDEX IF NOT EXISTS idx_users_office_id ON users(office_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_evaluations_evaluator ON evaluations(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_evaluated ON evaluations(evaluated_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_status ON evaluations(status);
CREATE INDEX IF NOT EXISTS idx_evaluation_responses_evaluation ON evaluation_responses(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_questions_template ON evaluation_questions(template_id);