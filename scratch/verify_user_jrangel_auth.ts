import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://abchjsydqtfbwivygpet.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2hqc3lkcXRmYndpdnlncGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTQxNzQsImV4cCI6MjA3NTQzMDE3NH0.KRYKMkJrGCdpAwNAFMpYS2sBSK9dAv9u664w-ugWq7A';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // 1. Login as the user
  console.log('=== INICIANDO SESIÓN ===');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'JRANGEL@UDES.EDU.CO',
    password: '17041927',
  });

  if (authError) {
    console.log('Error de autenticación:', authError.message);
    return;
  }

  console.log('✅ Sesión iniciada como:', authData.user?.email);
  console.log('User ID:', authData.user?.id);

  // Now queries will use the authenticated session

  // 2. Get user profile
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (userError) {
    console.log('Error obteniendo usuario:', userError);
    return;
  }

  console.log('\n===================================');
  console.log('=== USUARIO ===');
  console.log('===================================');
  console.log(JSON.stringify(user, null, 2));

  // 3. Get role info
  console.log('\n===================================');
  console.log('=== ROL ===');
  console.log('===================================');
  const { data: roleInfo } = await supabase
    .from('roles')
    .select('*')
    .eq('id', user.role_id)
    .maybeSingle();
  console.log('Por role_id:', JSON.stringify(roleInfo, null, 2));

  const { data: roleByKey } = await supabase
    .from('roles')
    .select('*')
    .eq('key', user.role)
    .maybeSingle();
  console.log('Por key:', JSON.stringify(roleByKey, null, 2));

  // 4. Check user_managers (subordinates)
  console.log('\n===================================');
  console.log('=== SUBORDINADOS (user_managers) ===');
  console.log('===================================');
  const { data: managedUsers } = await supabase
    .from('user_managers')
    .select('user_id, manager_id, office_id')
    .eq('manager_id', user.id);
  console.log(`Encontrados: ${(managedUsers || []).length}`);
  console.log(JSON.stringify(managedUsers, null, 2));

  const managedIds = (managedUsers || []).map(r => r.user_id);
  if (managedIds.length > 0) {
    const { data: details } = await supabase
      .from('users')
      .select('id, full_name, identification, role, role_id, campus')
      .in('id', managedIds);
    console.log('Detalles:', JSON.stringify(details, null, 2));
  }

  // 5. Check legacy managers
  console.log('\n===================================');
  console.log('=== SUBORDINADOS (users.manager_id legacy) ===');
  console.log('===================================');
  const { data: legacyManaged } = await supabase
    .from('users')
    .select('id, full_name, identification, role, role_id, campus')
    .eq('manager_id', user.id);
  console.log(`Encontrados: ${(legacyManaged || []).length}`);
  console.log(JSON.stringify(legacyManaged, null, 2));

  // Combine all subordinate IDs
  const allSubordinateIds = new Set([
    ...managedIds,
    ...((legacyManaged || []).map(u => u.id))
  ]);
  console.log(`\nTotal subordinados únicos: ${allSubordinateIds.size}`);
  console.log('IDs:', [...allSubordinateIds]);

  // 6. Check offices
  console.log('\n===================================');
  console.log('=== OFICINAS ===');
  console.log('===================================');
  const { data: userOffices } = await supabase
    .from('collaborator_offices')
    .select('office_id')
    .eq('collaborator_id', user.id);
  console.log('collaborator_offices:', JSON.stringify(userOffices, null, 2));

  const officeIds = [...((userOffices || []).map(r => r.office_id))];
  if (user.office_id) officeIds.push(user.office_id);
  
  const uniqueOfficeIds = [...new Set(officeIds.filter(Boolean))];
  console.log('Office IDs únicos:', uniqueOfficeIds);

  if (uniqueOfficeIds.length > 0) {
    const { data: offices } = await supabase
      .from('offices')
      .select('id, name')
      .in('id', uniqueOfficeIds);
    console.log('Nombres:', JSON.stringify(offices, null, 2));
  }

  // 7. Same office colleagues
  console.log('\n===================================');
  console.log('=== COLABORADORES EN MISMAS OFICINAS ===');
  console.log('===================================');
  let officeColleagueIds: string[] = [];
  if (uniqueOfficeIds.length > 0) {
    const { data: sameOffice } = await supabase
      .from('collaborator_offices')
      .select('collaborator_id')
      .in('office_id', uniqueOfficeIds);
    officeColleagueIds = [...new Set((sameOffice || []).map(r => r.collaborator_id))];
    const filtered = officeColleagueIds.filter(id => id !== user.id);
    console.log(`Encontrados (excluyendo self): ${filtered.length}`);

    if (filtered.length > 0) {
      const { data: colleagues } = await supabase
        .from('users')
        .select('id, full_name, identification, role, role_id, campus')
        .in('id', filtered);
      console.log('Detalles:', JSON.stringify(colleagues, null, 2));
    }
  }

  // 8. Periods
  console.log('\n===================================');
  console.log('=== PERIODOS ===');
  console.log('===================================');
  const { data: allPeriods } = await supabase
    .from('evaluation_periods')
    .select('*')
    .order('start_date', { ascending: false });
  console.log('Todos:', JSON.stringify(allPeriods, null, 2));

  const todayStr = new Date().toISOString().slice(0, 10);
  console.log('Hoy:', todayStr);

  const { data: activeByDate } = await supabase
    .from('evaluation_periods')
    .select('*')
    .lte('start_date', todayStr)
    .gte('end_date', todayStr);
  console.log('Activos por fecha:', JSON.stringify(activeByDate, null, 2));

  const period = (activeByDate && activeByDate.length > 0)
    ? (activeByDate[0].is_active === false ? null : activeByDate[0])
    : null;

  if (!period) {
    console.log('⚠️ NO HAY PERIODO ACTIVO');
    return;
  }

  console.log(`✅ Periodo activo: ${period.year} (${period.start_date} - ${period.end_date})`);

  // 9. Form types for this period
  const { data: pfts } = await supabase
    .from('evaluation_period_form_types')
    .select('form_type_key')
    .eq('period_id', period.id);
  const formTypeKeys = (pfts || []).map(r => r.form_type_key);
  console.log('\nTipos de formulario del periodo:', formTypeKeys);

  if (formTypeKeys.length === 0) {
    console.log('⚠️ EL PERIODO NO TIENE TIPOS DE FORMULARIO ASIGNADOS');
    return;
  }

  // 10. Form types details
  const { data: fts } = await supabase
    .from('form_types')
    .select('*')
    .in('key', formTypeKeys);
  console.log('\nDetalles form types:', JSON.stringify(fts, null, 2));

  // 11. Relations
  const { data: relations } = await supabase
    .from('form_type_relations')
    .select('*')
    .in('form_type_key', formTypeKeys);
  console.log('\n=== RELACIONES (form_type_relations) ===');
  console.log(JSON.stringify(relations, null, 2));

  // Check for null role_ids
  const nullRoleIds = (relations || []).filter(r => !r.evaluator_role_id || !r.evaluated_role_id);
  if (nullRoleIds.length > 0) {
    console.log(`\n⚠️ ${nullRoleIds.length} relaciones tienen role_id NULL (la migración no backfilleó correctamente)`);
  }

  // 12. Matching evaluator relations for this user
  const userRoleKey = roleInfo?.key || roleByKey?.key || user.role;
  const userRoleId = user.role_id || roleInfo?.id || roleByKey?.id;
  console.log(`\n=== RELACIONES DONDE ${user.full_name} ES EVALUADOR ===`);
  console.log(`Role key: ${userRoleKey}, Role ID: ${userRoleId}`);

  const userRoleNorm = (userRoleKey || '').toLowerCase().replace(/[^a-z0-9_]/g, '').trim();

  const evaluatorRels = (relations || []).filter(r => {
    const matchById = userRoleId && r.evaluator_role_id === userRoleId;
    const matchByKey = r.evaluator_role_key === userRoleKey;
    const matchNorm = (r.evaluator_role_key || '').toLowerCase().replace(/[^a-z0-9_]/g, '').trim() === userRoleNorm;
    return matchById || matchByKey || matchNorm;
  });

  console.log(`Encontradas: ${evaluatorRels.length}`);
  console.log(JSON.stringify(evaluatorRels, null, 2));

  if (evaluatorRels.length === 0) {
    console.log(`\n⚠️ NO HAY relaciones donde este usuario sea evaluador.`);
    console.log(`Esto explica por qué no ve personas a evaluar.`);
    console.log(`\nPosibles causas:`);
    console.log(`1. Las relaciones en form_type_relations no incluyen el rol "${userRoleKey}" como evaluador`);
    console.log(`2. El role_key almacenado no coincide exactamente`);
    
    // Show expected values
    console.log(`\nBuscando relaciones con evaluator_role_key similar...`);
    const similarRels = (relations || []).filter(r => {
      const evalNorm = (r.evaluator_role_key || '').toLowerCase();
      return evalNorm.includes('jefe') || evalNorm.includes('lider') || evalNorm.includes('director');
    });
    console.log(`Relaciones con roles de jefatura:`, JSON.stringify(similarRels, null, 2));
    return;
  }

  // 13. Get evaluated role keys
  const evalRoleKeys = [...new Set(evaluatorRels.map(r => r.evaluated_role_key))];
  const evalRoleIds = [...new Set(evaluatorRels.map(r => r.evaluated_role_id).filter(Boolean))];
  console.log(`\nRoles a evaluar (keys): ${evalRoleKeys}`);
  console.log(`Roles a evaluar (ids): ${evalRoleIds}`);

  // 14. Find candidates with matching roles
  let query = supabase.from('users').select('id, full_name, identification, role, role_id, campus');
  
  if (evalRoleIds.length > 0) {
    query = query.in('role_id', evalRoleIds);
  } else {
    query = query.in('role', evalRoleKeys);
  }

  const { data: candidates } = await query;
  console.log(`\nCandidatos con roles a evaluar: ${(candidates || []).length}`);
  console.log(JSON.stringify(candidates, null, 2));

  if (!candidates || candidates.length === 0) {
    // Try broader match
    console.log(`\n⚠️ No hay usuarios con esos roles exactos.`);
    console.log(`Probando matching por normalización...`);
    
    const { data: allUsers } = await supabase.from('users').select('id, full_name, identification, role, role_id, campus');
    const allRoles = [...new Set((allUsers || []).map(u => u.role))];
    console.log(`Roles en DB:`, allRoles);
    
    // Try normalized matching
    const evalNorms = evalRoleKeys.map(k => k.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const matchedByNorm = (allUsers || []).filter(u => {
      const roleNorm = (u.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return evalNorms.some(en => roleNorm === en);
    });
    console.log(`Candidatos por matching normalizado: ${matchedByNorm.length}`);
    console.log(JSON.stringify(matchedByNorm, null, 2));
    
    candidates = matchedByNorm as any;
  }

  // 15. Check which candidates are subordinates
  if (candidates && candidates.length > 0) {
    console.log('\n===================================');
    console.log('=== SUBORDINADOS DIRECTOS CON ROL CORRECTO ===');
    console.log('===================================');
    const directSubs = candidates.filter(c => allSubordinateIds.has(c.id));
    console.log(`${directSubs.length} de ${candidates.length} candidatos son subordinados directos:`);
    console.log(JSON.stringify(directSubs, null, 2));

    const others = candidates.filter(c => !allSubordinateIds.has(c.id));
    if (others.length > 0) {
      console.log(`\n${others.length} son de misma oficina pero NO subordinados directos:`);
      console.log(JSON.stringify(others, null, 2));
    }

    if (directSubs.length === 0 && candidates.length > 0) {
      console.log('\n⚠️ HAY candidatos con el rol correcto pero NO son subordinados directos.');
      console.log('Esto indica que las relaciones jefe-colaborador NO están configuradas en user_managers');
      console.log('IDs de subordinados esperados:', [...allSubordinateIds]);
      console.log('IDs de candidatos:', candidates.map(c => c.id));
    }
  }
}

main().catch(console.error);
