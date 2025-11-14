-- Create table to register types of forms and which roles they apply to
create table if not exists form_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  roles text[] not null default array[]::text[], -- array of role keys (e.g. 'jefe_vaf','office_manager')
  created_by uuid null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Optional: seed some default form types
insert into form_types (key, label, description, roles)
select * from (
  values
    ('soft_skills', 'Habilidades Blandas', 'Formularios de habilidades blandas', array['colaborador_vaf','jefe_vaf','office_manager']),
    ('self_evaluation', 'Autoevaluación', 'Formularios para autoevaluación', array['colaborador_vaf']),
    ('manager_to_employee', 'Jefe a Colaborador', 'Evaluaciones realizadas por jefes a colaboradores', array['jefe_vaf','office_manager']),
    ('employee_to_manager', 'Colaborador a Jefe', 'Evaluaciones de colaborador hacia su jefe', array['colaborador_vaf'])
) as t(key, label, description, roles)
where not exists (select 1 from form_types ft where ft.key = t.key);
