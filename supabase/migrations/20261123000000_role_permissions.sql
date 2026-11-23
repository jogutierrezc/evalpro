-- Permisos de módulos por rol (qué opciones del menú ve cada rol).
--
-- Compatibilidad: un rol SIN filas aquí conserva el comportamiento anterior (reglas del código). Al guardar un rol desde
-- Administración > Roles se escribe una fila centinela '__configured__' más una fila por módulo permitido; desde ese
-- momento el rol usa solo lo que está en esta tabla.
-- Qué formularios responde cada rol y a quién evalúa NO cambia: sigue en form_types.roles y form_type_relations.
-- La seguridad de los datos sigue en las políticas RLS; esto solo decide qué se muestra.

create table if not exists public.role_permissions (
  role_key   text not null references public.roles(key) on update cascade on delete cascade,
  module_id  text not null,
  created_at timestamptz not null default now(),
  primary key (role_key, module_id)
);

alter table public.role_permissions enable row level security;

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

drop policy if exists role_permissions_admin_write on public.role_permissions;
create policy role_permissions_admin_write on public.role_permissions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
