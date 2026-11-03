-- Add evaluator_role_id and evaluated_role_id columns to form_type_relations
-- These columns are used by the frontend for role-based filtering but were missing from the schema

begin;

-- Add evaluator_role_id column (FK to roles.id)
alter table form_type_relations
  add column if not exists evaluator_role_id uuid null
  references roles(id) on delete set null;

-- Add evaluated_role_id column (FK to roles.id)
alter table form_type_relations
  add column if not exists evaluated_role_id uuid null
  references roles(id) on delete set null;

-- Backfill role_ids from existing role keys
update form_type_relations ftr
set evaluator_role_id = r.id
from roles r
where r.key = ftr.evaluator_role_key
  and ftr.evaluator_role_id is null;

update form_type_relations ftr
set evaluated_role_id = r.id
from roles r
where r.key = ftr.evaluated_role_key
  and ftr.evaluated_role_id is null;

-- Add indexes for faster lookups
create index if not exists idx_ftr_evaluator_role_id on form_type_relations(evaluator_role_id);
create index if not exists idx_ftr_evaluated_role_id on form_type_relations(evaluated_role_id);

commit;
