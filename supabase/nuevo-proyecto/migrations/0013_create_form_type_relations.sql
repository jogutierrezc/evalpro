-- Create table to store who-evaluates-whom relationships per form_type
-- Columns:
-- id: serial PK
-- form_type_key: references form_types(key)
-- evaluator_role_key: role key that is the evaluator
-- evaluated_role_key: role key that will be evaluated
-- created_at

begin;

create table if not exists form_type_relations (
  id bigserial primary key,
  form_type_key text not null,
  evaluator_role_key text not null,
  evaluated_role_key text not null,
  created_at timestamptz default now()
);

-- FK to form_types.key if present
alter table form_type_relations
  add constraint fk_ftr_form_type_key
  foreign key (form_type_key) references form_types(key) on delete cascade;

create index if not exists idx_form_type_relations_form_type_key on form_type_relations(form_type_key);
create index if not exists idx_form_type_relations_evaluator_role on form_type_relations(evaluator_role_key);
create index if not exists idx_form_type_relations_evaluated_role on form_type_relations(evaluated_role_key);

commit;
