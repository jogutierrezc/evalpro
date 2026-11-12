-- Mis Colaboradores: quien evalúa a una persona (o es su jefe) puede LEER las autoevaluaciones de esa persona.
--
-- Problema: la lectura de evaluations / evaluation_responses / evaluation_results está limitada a "soy evaluador o
-- evaluado" (más office_manager por rol literal). Una autoevaluación tiene evaluador = evaluado = la persona, así que
-- el jefe que la evalúa NO la veía: Mis Colaboradores siempre mostraba 0 autoevaluaciones, sin importar periodo o fechas.
--
-- Alcance (mínimo necesario):
--   * solo SELECT, nunca escritura;
--   * solo autoevaluaciones (evaluator_id = evaluated_id);
--   * solo de personas a las que el usuario evaluó alguna vez, o de las que es jefe (user_managers / users.manager_id).
-- Se usan funciones SECURITY DEFINER para evitar la recursión de políticas sobre la misma tabla.

create or replace function public.can_read_self_evaluation(p_person uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null and p_person is not null and (
    exists (select 1 from public.evaluations e where e.evaluator_id = auth.uid() and e.evaluated_id = p_person)
    or exists (select 1 from public.user_managers m where m.manager_id = auth.uid() and m.user_id = p_person)
    or exists (select 1 from public.users u where u.id = p_person and u.manager_id = auth.uid())
  );
$$;

create or replace function public.can_read_self_evaluation_by_id(p_evaluation uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.evaluations e
     where e.id = p_evaluation
       and e.evaluator_id = e.evaluated_id
       and public.can_read_self_evaluation(e.evaluated_id)
  );
$$;

grant execute on function public.can_read_self_evaluation(uuid) to authenticated;
grant execute on function public.can_read_self_evaluation_by_id(uuid) to authenticated;

drop policy if exists "Managers can read team self-evaluations" on public.evaluations;
create policy "Managers can read team self-evaluations"
  on public.evaluations for select to authenticated
  using (evaluator_id = evaluated_id and public.can_read_self_evaluation(evaluated_id));

drop policy if exists "Managers can read team self-evaluation responses" on public.evaluation_responses;
create policy "Managers can read team self-evaluation responses"
  on public.evaluation_responses for select to authenticated
  using (public.can_read_self_evaluation_by_id(evaluation_id));

drop policy if exists "Managers can read team self-evaluation results" on public.evaluation_results;
create policy "Managers can read team self-evaluation results"
  on public.evaluation_results for select to authenticated
  using (public.can_read_self_evaluation_by_id(evaluation_id));
