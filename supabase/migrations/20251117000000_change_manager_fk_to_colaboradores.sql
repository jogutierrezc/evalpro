-- Migration: change colaboradores.manager_id FK to reference colaboradores(id) (self-referential)

-- Drop existing FK to users if present
ALTER TABLE IF EXISTS colaboradores DROP CONSTRAINT IF EXISTS colaboradores_manager_id_fkey;

-- Add self-referential FK so manager_id points to another row in colaboradores
ALTER TABLE colaboradores
  ADD CONSTRAINT colaboradores_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES colaboradores(id) ON DELETE SET NULL;

-- Note: This makes manager_id reference the colaboradores table (a manager is also a colaborador)
