-- REVERSA DE EMERGENCIA de 20261117000000_security_rls_hardening.sql
--
-- Úsala solo si algo dejó de funcionar y necesitas recuperar el servicio YA mientras se corrige la política.
-- NO vuelve a abrir el acceso anónimo: anon sigue sin permisos. Solo permite que cualquier persona CON SESIÓN
-- lea y escriba (el comportamiento amplio de antes). Después hay que volver a aplicar la migración corregida.
--
-- Para dejarlo todo como antes de la migración (incluido anon) se necesita un respaldo de la base; no se recomienda.

begin;

do $$
declare
  t text;
  r record;
begin
  foreach t in array array[
    'users', 'offices', 'roles', 'user_managers', 'collaborator_offices', 'period_collaborators',
    'form_types', 'form_type_relations', 'evaluation_periods', 'evaluation_period_form_types',
    'evaluation_templates', 'evaluation_sections', 'evaluation_questions',
    'evaluations', 'evaluation_responses', 'evaluation_results', 'feedback_actas',
    'plan_registros', 'plan_seguimiento'
  ]
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', 'emergency_authenticated_' || t, t);
  end loop;
end $$;

commit;
