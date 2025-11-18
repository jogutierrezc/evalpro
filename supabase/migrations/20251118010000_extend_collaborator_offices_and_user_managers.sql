-- Extend collaborator_offices to capture role-in-office and manager flag
begin;

-- Ensure collaborator_offices exists before altering
create table if not exists collaborator_offices (
  id bigserial primary key,
  collaborator_id uuid not null references users(id) on delete cascade,
  office_id uuid not null references offices(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(collaborator_id, office_id)
);

alter table collaborator_offices
  add column if not exists role_in_office text null,
  add column if not exists is_manager boolean default false;

-- Create user_managers table to allow multiple immediate managers per user
create table if not exists user_managers (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  manager_id uuid not null references users(id) on delete cascade,
  office_id uuid null references offices(id) on delete set null,
  created_at timestamptz default now(),
  unique(user_id, manager_id, office_id)
);

create index if not exists idx_user_managers_user on user_managers(user_id);
create index if not exists idx_user_managers_manager on user_managers(manager_id);

commit;
