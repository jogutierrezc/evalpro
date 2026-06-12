import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://abchjsydqtfbwivygpet.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2hqc3lkcXRmYndpdnlncGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTQxNzQsImV4cCI6MjA3NTQzMDE3NH0.KRYKMkJrGCdpAwNAFMpYS2sBSK9dAv9u664w-ugWq7A';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Login
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: 'JRANGEL@UDES.EDU.CO',
    password: '17041927',
  });
  if (authError) { console.log('Error login:', authError.message); return; }

  // Get user
  const { data: user } = await supabase.from('users').select('*').eq('email', 'JRANGEL@UDES.EDU.CO').single();
  console.log('=== USUARIO ===');
  console.log('Nombre:', user.full_name);
  console.log('Role:', user.role);
  console.log('Role ID:', user.role_id);

  // Get role info
  const { data: role } = await supabase.from('roles').select('*').eq('id', user.role_id).single();
  console.log('Rol key:', role.key, '| label:', role.label);

  // Check active period
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: periods } = await supabase.from('evaluation_periods').select('*')
    .lte('start_date', todayStr).gte('end_date', todayStr);
  const period = periods?.[0];
  
  if (!period) {
    console.log('\n❌ NO HAY PERIODO ACTIVO');
    console.log('Esto explica por qué no ve evaluaciones disponibles.');
    
    // List ALL periods to check
    const { data: allP } = await supabase.from('evaluation_periods').select('*');
    console.log('Todos los periodos:', JSON.stringify(allP, null, 2));
    return;
  }
  if (period.is_active === false) {
    console.log('\n❌ PERIODO EXISTE PERO is_active = false');
    console.log(JSON.stringify(period, null, 2));
    return;
  }

  console.log('\n✅ PERIODO ACTIVO:', period.year, period.start_date, '-', period.end_date);

  // Check form types for this period
  const { data: pfts } = await supabase.from('evaluation_period_form_types').select('form_type_key').eq('period_id', period.id);
  const ftKeys = (pfts || []).map(r => r.form_type_key);
  console.log('\nTipos de formulario del periodo:', ftKeys.length > 0 ? ftKeys : '❌ NINGUNO');

  if (ftKeys.length === 0) {
    console.log('\n❌ EL PERIODO NO TIENE TIPOS DE FORMULARIO ASIGNADOS');
    console.log('Esto explica por qué no ve evaluaciones.');
    return;
  }

  // Get form types details
  const { data: fts } = await supabase.from('form_types').select('*').in('key', ftKeys);
  console.log('\nDetalles form types:');
  fts?.forEach(ft => console.log(`  - ${ft.label} (${ft.key}) roles: [${(ft.roles||[]).join(', ')}]`));

  // Check if form_type includes user's role
  fts?.forEach(ft => {
    const includesRole = (ft.roles || []).includes(role.key);
    console.log(`  ¿${ft.key} incluye "${role.key}"? ${includesRole ? '✅ SI' : '❌ NO'}`);
  });

  // Get ALL relations for these form types
  const { data: relations } = await supabase.from('form_type_relations').select('*').in('form_type_key', ftKeys);
  console.log(`\nTotal relaciones en form_type_relations: ${(relations || []).length}`);
  
  if (!relations || relations.length === 0) {
    console.log('❌ NO HAY RELACIONES CONFIGURADAS en form_type_relations');
    return;
  }

  // Check for role_id being null after migration
  const nullIds = relations.filter(r => !r.evaluator_role_id || !r.evaluated_role_id);
  if (nullIds.length > 0) {
    console.log(`\n⚠️ ${nullIds.length} relaciones tienen role_id NULL (migración no funcionó):`);
    nullIds.forEach(r => console.log(`  - form_type: ${r.form_type_key}, evaluator_key: ${r.evaluator_role_key} (id: ${r.evaluator_role_id}), evaluated_key: ${r.evaluated_role_key} (id: ${r.evaluated_role_id})`));
  }

  // Find relations where user is evaluator
  const evalRels = relations.filter(r => {
    const matchById = r.evaluator_role_id === user.role_id;
    const matchByKey = r.evaluator_role_key === role.key;
    const matchNorm = (r.evaluator_role_key || '').toLowerCase().replace(/[^a-z0-9_]/g, '') === 
                      (role.key || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    return matchById || matchByKey || matchNorm;
  });

  console.log(`\n=== RELACIONES DONDE ${user.full_name} ES EVALUADOR ===`);
  console.log(`Buscando evaluator_role_key = "${role.key}" o evaluator_role_id = "${user.role_id}"`);

  if (evalRels.length === 0) {
    console.log('❌ NO SE ENCONTRARON RELACIONES para este rol');
    
    // Show what relations DO exist, so we can compare
    console.log('\nTODAS las relaciones disponibles:');
    relations.forEach(r => {
      const matchAttempt = r.evaluator_role_key === role.key ? ' <-- MATCH POR KEY' : 
                            r.evaluator_role_id === user.role_id ? ' <-- MATCH POR ID' : '';
      console.log(`  form_type=${r.form_type_key} | evaluator=${r.evaluator_role_key} (id:${r.evaluator_role_id}) | evaluated=${r.evaluated_role_key} (id:${r.evaluated_role_id})${matchAttempt}`);
    });
    
    // Check if role key matches with some normalization
    console.log('\nProbando matching flexible...');
    const userNorm = (role.key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    relations.forEach(r => {
      const evalNorm = (r.evaluator_role_key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (evalNorm === userNorm) console.log(`  ✅ Match por normalized: ${r.evaluator_role_key} == ${role.key}`);
    });
    
    return;
  }

  console.log(`✅ Encontradas ${evalRels.length} relaciones:`);
  evalRels.forEach(r => console.log(`  Evaluar a rol: ${r.evaluated_role_key} (form_type: ${r.form_type_key})`));

  // Get evaluated role keys
  const evalRoleKeys = [...new Set(evalRels.map(r => r.evaluated_role_key))];
  const evalRoleIds = [...new Set(evalRels.map(r => r.evaluated_role_id).filter(Boolean))];
  console.log(`\nRoles a evaluar: ${evalRoleKeys.join(', ')}`);

  // Find users with matching roles
  let query = supabase.from('users').select('id, full_name, identification, role, role_id, campus');
  if (evalRoleIds.length > 0) {
    query = query.in('role_id', evalRoleIds);
  } else {
    query = query.in('role', evalRoleKeys);
  }
  const { data: candidates } = await query;
  console.log(`\nUsuarios con esos roles: ${(candidates || []).length}`);

  if (!candidates || candidates.length === 0) {
    // Try normalized matching
    console.log('\n❌ No se encontraron usuarios con los roles exactos.');
    const { data: allUsers } = await supabase.from('users').select('role');
    const allRoleValues = [...new Set((allUsers || []).map(u => u.role))];
    console.log('Roles disponibles en DB:', allRoleValues);
    console.log('Roles buscados:', evalRoleKeys);
    return;
  }

  // Get user's subordinates
  const { data: managed } = await supabase.from('user_managers').select('user_id').eq('manager_id', user.id);
  const managedIds = new Set((managed || []).map(r => r.user_id));
  const { data: legacy } = await supabase.from('users').select('id').eq('manager_id', user.id);
  (legacy || []).forEach(u => managedIds.add(u.id));

  console.log(`\nDe esos, subordinados directos: ${candidates.filter(c => managedIds.has(c.id)).length}`);
  console.log('\nSUBORDINADOS CON ROL CORRECTO:');
  candidates.filter(c => managedIds.has(c.id)).forEach(c => 
    console.log(`  - ${c.full_name} (${c.identification}) - ${c.role}`)
  );

  console.log(`\nEN MISMA OFICINA (NO subordinados): ${candidates.filter(c => !managedIds.has(c.id)).length}`);
  candidates.filter(c => !managedIds.has(c.id)).forEach(c =>
    console.log(`  - ${c.full_name} (${c.identification}) - ${c.role}`)
  );
}

main().catch(console.error);
