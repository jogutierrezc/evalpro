-- Create table for evaluation periods and link to form types
CREATE TABLE IF NOT EXISTS evaluation_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean DEFAULT false,
  created_by uuid NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Each period can have multiple form types associated (by key)
CREATE TABLE IF NOT EXISTS evaluation_period_form_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES evaluation_periods(id) ON DELETE CASCADE,
  form_type_key text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_evaluation_periods_year ON evaluation_periods(year);
CREATE INDEX IF NOT EXISTS idx_evaluation_period_form_types_period ON evaluation_period_form_types(period_id);
