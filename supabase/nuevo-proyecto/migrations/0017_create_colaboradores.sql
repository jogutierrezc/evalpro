-- Migration: create colaboradores table
CREATE TABLE colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identification text NOT NULL UNIQUE,
  full_name text NOT NULL,
  email text,
  role text NOT NULL DEFAULT 'colaborador_vaf',
  office_id uuid REFERENCES offices(id),
  manager_id uuid REFERENCES users(id),
  campus text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Optional: add index on identification for faster lookups
CREATE INDEX idx_colaboradores_identification ON colaboradores(identification);

-- Optional: add check constraint for campus values
ALTER TABLE colaboradores
  ADD CONSTRAINT chk_colaboradores_campus CHECK (campus IN ('Valledupar', 'Bogota', 'Cúcuta', 'Bucaramanga', 'Arauca', 'Todas'));

-- Optional: add check constraint for role
ALTER TABLE colaboradores
  ADD CONSTRAINT chk_colaboradores_role CHECK (role IN ('colaborador_vaf', 'jefe_vaf', 'jefe_campus_vaf', 'employee', 'office_manager'));