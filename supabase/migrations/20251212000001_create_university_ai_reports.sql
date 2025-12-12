create table if not exists university_ai_reports (
  report_type text primary key,
  report jsonb not null,
  updated_at timestamptz default now()
);

alter table university_ai_reports enable row level security;

create policy "Allow read access to all authenticated users"
  on university_ai_reports for select
  to authenticated
  using (true);

create policy "Allow insert/update access to all authenticated users"
  on university_ai_reports for all
  to authenticated
  using (true)
  with check (true);
