-- evaluation_sections tenía RLS activo y solo políticas de INSERT/UPDATE/DELETE:
-- nadie podía leerlas, y los exportes/reportes salían sin secciones.
alter table evaluation_sections enable row level security;

drop policy if exists "Authenticated can view sections" on evaluation_sections;
create policy "Authenticated can view sections"
  on evaluation_sections for select
  to authenticated
  using (true);
