-- collaborator_offices.collaborator_id debe apuntar a public.users, no a la tabla vieja «colaboradores».
--
-- Síntoma: al crear un usuario que no es jefe, el insert en collaborator_offices falla con
--   23503 «Key is not present in table "colaboradores"» (constraint collaborator_offices_collaborator_id_fkey)
-- porque en esta base la tabla se creó con la migración 20251116 (FK a colaboradores) y la 20251118 «create table if not
-- exists» no la reemplazó. La app solo escribe en colaboradores para roles de jefatura, así que el resto de usuarios
-- quedaba sin su oficina asociada.
--
-- Se crea la FK nueva como NOT VALID: se aplica a todo insert/update nuevo y no falla por filas viejas que apunten a
-- ids que ya no existen. Idempotente. Ejecútala a mano en el SQL Editor de la instancia de EvalPro.
--
-- Filas viejas que no cuadran (para revisar):
--   select co.* from public.collaborator_offices co left join public.users u on u.id = co.collaborator_id where u.id is null;

alter table public.collaborator_offices drop constraint if exists collaborator_offices_collaborator_id_fkey;
alter table public.collaborator_offices
  add constraint collaborator_offices_collaborator_id_fkey
  foreign key (collaborator_id) references public.users(id) on delete cascade not valid;

-- Columnas que usa la app y que solo trae la versión extendida de la tabla
alter table public.collaborator_offices add column if not exists role_in_office text null;
alter table public.collaborator_offices add column if not exists is_manager boolean default false;
alter table public.collaborator_offices add column if not exists updated_at timestamptz default now();
