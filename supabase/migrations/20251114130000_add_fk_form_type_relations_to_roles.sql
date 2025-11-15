-- Add foreign keys from form_type_relations to roles table
-- This ensures that evaluator_role_key and evaluated_role_key must exist in roles.key

begin;

-- Add FK for evaluator_role_key -> roles.key
alter table form_type_relations
  add constraint fk_ftr_evaluator_role_key
  foreign key (evaluator_role_key) references roles(key) on delete cascade;

-- Add FK for evaluated_role_key -> roles.key  
alter table form_type_relations
  add constraint fk_ftr_evaluated_role_key
  foreign key (evaluated_role_key) references roles(key) on delete cascade;

commit;
