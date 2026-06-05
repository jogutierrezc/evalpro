-- Migration to add period_id to evaluations table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'evaluations' AND COLUMN_NAME = 'period_id') THEN
        ALTER TABLE evaluations ADD COLUMN period_id uuid REFERENCES evaluation_periods(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_evaluations_period_id ON evaluations(period_id);
    END IF;
END $$;

-- Update RLS policies to include period filtering if necessary
-- (Most existing policies use evaluated_id/evaluator_id which is still valid)
