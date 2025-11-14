create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  created_by uuid null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Seed common roles if they don't exist
insert into roles (key, label, description)
select * from (
  values
    ('colaborador_vaf', 'Colaborador VAF', 'Colaborador del programa VAF'),
    ('jefe_vaf', 'Jefe VAF', 'Jefe inmediato VAF'),
    ('jefe_campus_vaf', 'Jefe Campus VAF', 'Jefe de campus VAF'),
    ('office_manager', 'Jefe de Oficina', 'Responsable de oficina'),
    ('admin', 'Administrador', 'Administrador del sistema'),
    ('employee', 'Colaborador', 'Empleado general')
) as t(key, label, description)
where not exists (select 1 from roles r where r.key = t.key);
