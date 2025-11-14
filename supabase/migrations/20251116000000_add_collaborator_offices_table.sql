-- Migration: add collaborator_offices table for many-to-many relationship
-- Keep office_id in colaboradores table as primary office

-- Create collaborator_offices table
CREATE TABLE collaborator_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  office_id uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(collaborator_id, office_id)
);

-- Add index for faster queries
CREATE INDEX idx_collaborator_offices_collaborator_id ON collaborator_offices(collaborator_id);
CREATE INDEX idx_collaborator_offices_office_id ON collaborator_offices(office_id);

-- Note: office_id remains in colaboradores table