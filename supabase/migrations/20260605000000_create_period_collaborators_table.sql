-- Migration: create period_collaborators table
-- Permite asignar colaboradores a periodos específicos con snapshot de rol y estado activo

CREATE TABLE IF NOT EXISTS period_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES evaluation_periods(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true,
  role_in_period text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(period_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_period_collaborators_period ON period_collaborators(period_id);
CREATE INDEX IF NOT EXISTS idx_period_collaborators_user ON period_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_period_collaborators_active ON period_collaborators(period_id, is_active);

-- Disable RLS (consistent with other relation tables)
ALTER TABLE period_collaborators DISABLE ROW LEVEL SECURITY;
