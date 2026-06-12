import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://abchjsydqtfbwivygpet.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2hqc3lkcXRmYndpdnlncGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTQxNzQsImV4cCI6MjA3NTQzMDE3NH0.KRYKMkJrGCdpAwNAFMpYS2sBSK9dAv9u664w-ugWq7A';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // 1. Find user by email (case insensitive)
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .ilike('email', 'JRANGEL@UDES.EDU.CO')
    .maybeSingle();

  if (error) {
    console.log('Error finding user:', error);
  }

  if (!user) {
    console.log('=== USUARIO NO ENCONTRADO POR EMAIL ===');
    // Try listing a few users to see what's in the DB
    const { data: someUsers } = await supabase
      .from('users')
      .select('id, email, full_name, identification, role')
      .limit(10);
    console.log('Primeros 10 usuarios en DB:', JSON.stringify(someUsers, null, 2));
    return;
  }

  console.log('===================================');
  console.log('=== USUARIO ENCONTRADO ===');
  console.log('===================================');
  console.log(`ID: ${user.id}`);
  console.log(`Nombre: ${user.full_name}`);
  console.log(`Email: ${user.email}`);
  console.log(`Identificación: ${user.identification}`);
  console.log(`Rol (raw): ${user.role}`);
  console.log(`Role ID: ${user.role_id}`);
  console.log(`Campus: ${user.campus}`);
  console.log(`Office ID: ${user.office_id}`);
  console.log(`Manager ID: ${user.manager_id}`);
  console.log(JSON.stringify(user, null, 2));

  // 2. Get role info
  console.log('\n===================================');
  console.log('=== ROL DEL USUARIO ===');
  console.log('===================================');
  const { data: roleInfo } = await supabase
    .from('roles')
    .select('*')
    .eq('id', user.role_id)
    .maybeSingle();
  console.log(JSON.stringify(roleInfo, null, 2));
  
  // Also try by key
  const { data: roleByKey } = await supabase
    .from('roles')
    .select('*')
    .eq('key', user.role)
    .maybeSingle();
  console.log('Por key:', JSON.stringify(roleByKey, null, 2));

  // 3. Check user_managers (who reports to this user)
  console.log('\n===================================');
  console.log('=== SUBORDINADOS (user_managers) ===');
  console.log('===================================');
  const { data: managedUsers } = await supabase
    .from('user_managers')
    .select('user_id')
    .eq('manager_id', user.id);
  console.log(`Encontrados: ${(managedUsers || []).length}`);
  console.log('Raw:', JSON.stringify(managedUsers, null, 2));

  const managedIds = (managedUsers || []).map(r => r.user_id);
  if (managedIds.length > 0) {
    const { data: managedDetails } = await supabase
      .from('users')
      .select('id, full_name, identification, role, role_id, campus, email')
      .in('id', managedIds);
    console.log('Detalles subordinados:', JSON.stringify(managedDetails, null, 2));
  }

  // 4. Check users.manager_id (legacy)
  console.log('\n===================================');
  console.log('=== SUBORDINADOS (users.manager_id legacy) ===');
  console.log('===================================');
  const { data: legacyManaged } = await supabase
    .from('users')
    .select('id, full_name, identification, role, role_id, campus, email')
    .eq('manager_id', user.id);
  console.log(`Encontrados: ${(legacyManaged || []).length}`);
  console.log(JSON.stringify(legacyManaged, null, 2));

  // 5. Check offices
  console.log('\n===================================');
  console.log('=== OFICINAS DEL USUARIO ===');
  console.log('===================================');
  const { data: userOffices } = await supabase
    .from('collaborator_offices')
    .select('office_id')
    .eq('collaborator_id', user.id);
  console.log('collaborator_offices:', JSON.stringify(userOffices, null, 2));

  const officeIds = (userOffices || []).map(r => r.office_id);
  if (user.office_id) officeIds.push(user.office_id);
  
  if (officeIds.length > 0) {
    const { data: offices } = await supabase
      .from('offices')
      .select('id, name')
      .in('id', officeIds);
    console.log('Detalles oficinas:', JSON.stringify(offices, null, 2));
  }

  // 6. Same office colleagues
  console.log('\n===================================');
  console.log('=== COLABORADORES EN MISMAS OFICINAS ===');
  console.log('===================================');
  if (officeIds.length > 0) {
    const { data: sameOffice } = await supabase
      .from('collaborator_offices')
      .select('collaborator_id')
      .in('office_id', officeIds);
    
    const sameOfficeIds = Array.from(new Set((sameOffice || []).map(r => r.collaborator_id)));
    const filtered = sameOfficeIds.filter(id => id !== user.id);
    console.log(`Encontrados: ${filtered.length}`);
    
    if (filtered.length > 0) {
      const { data: colleagues } = await supabase
        .from('users')
        .select('id, full_name, identification, role, role_id, campus')
        .in('id', filtered);
      console.log('Detalles:', JSON.stringify(colleagues, null, 2));
    }
  }

  // 7. Active period
  console.log('\n===================================');
  console.log('=== PERIODO ACTIVO ===');
  console.log('===================================');
  
  // Get ALL periods first
  const { data: allPeriods } = await supabase
    .from('evaluation_periods')
    .select('*')
    .order('start_date', { ascending: false });
  console.log('Todos los periodos:', JSON.stringify(allPeriods, null, 2));

  const todayStr = new Date().toISOString().slice(0, 10);
  console.log('Hoy (UTC):', todayStr);
  
  const { data: activePeriods } = await supabase
    .from('evaluation_periods')
    .select('*')
    .lte('start_date', todayStr)
    .gte('end_date', todayStr);
  console.log('Periodos activos por fecha:', JSON.stringify(activePeriods, null, 2));

  const period = (activePeriods && activePeriods.length > 0) 
    ? (activePeriods[0].is_active === false ? null : activePeriods[0])
    : null;
  
  if (period) {
    console.log('Periodo activo:', period.year, period.start_date, '-', period.end_date);

    // 8. Form types for this period
    const { data: pfts } = await supabase
      .from('evaluation_period_form_types')
      .select('form_type_key')
      .eq('period_id', period.id);
    
    const formTypeKeys = (pfts || []).map(r => r.form_type_key);
    console.log('\nTipos de formulario del periodo:', JSON.stringify(formTypeKeys, null, 2));

    if (formTypeKeys.length > 0) {
      // 9. Form types details
      const { data: fts } = await supabase
        .from('form_types')
        .select('*')
        .in('key', formTypeKeys);
      console.log('\nDetalles tipos de formulario:', JSON.stringify(fts, null, 2));

      // 10. Relations for these form types
      const { data: relations } = await supabase
        .from('form_type_relations')
        .select('*')
        .in('form_type_key', formTypeKeys);
      console.log('\n=== RELACIONES (form_type_relations) ===');
      console.log(JSON.stringify(relations, null, 2));

      // Check if role_ids populated correctly after migration
      const { data: relationsWithNullIds } = await supabase
        .from('form_type_relations')
        .select('*')
        .in('form_type_key', formTypeKeys)
        .or('evaluator_role_id.is.null,evaluated_role_id.is.null');
      console.log('\nRelaciones con role_id NULL (problema!):', relationsWithNullIds?.length || 0);

      // 11. Matching relations for this user
      const userRoleKey = roleInfo?.key || user.role;
      console.log('\n=== EVALUACIONES QUE PUEDE HACER ===');
      console.log('User role key:', userRoleKey, 'User role_id:', user.role_id);
      
      const matchingRelations = (relations || []).filter(r => {
        const matchByKey = r.evaluator_role_key === userRoleKey;
        const matchById = user.role_id && r.evaluator_role_id === user.role_id;
        const matchNorm = (userRoleKey || '').toLowerCase() === (r.evaluator_role_key || '').toLowerCase();
        return matchByKey || matchById || matchNorm;
      });

      console.log('Relaciones donde es evaluador:', JSON.stringify(matchingRelations, null, 2));

      if (matchingRelations.length === 0) {
        console.log('⚠️ NO HAY RELACIONES donde este usuario sea evaluador');
        console.log('Revisa que form_type_relations tenga entradas con evaluator_role_key =', userRoleKey);
      }

      // 12. Templates
      const evalFormTypeKeys = Array.from(new Set(matchingRelations.map(r => r.form_type_key)));
      if (evalFormTypeKeys.length > 0) {
        const { data: templates } = await supabase
          .from('evaluation_templates')
          .select('id, name, type, description')
          .eq('is_active', true)
          .in('type', evalFormTypeKeys);
        console.log('\nPlantillas disponibles:', JSON.stringify(templates, null, 2));

        // 13. Candidates that match evaluated roles
        const evaluatedRoleKeys = Array.from(new Set(matchingRelations.map(r => r.evaluated_role_key)));
        console.log('\nRoles a evaluar:', evaluatedRoleKeys);

        // Get users with matching roles
        const { data: candidates } = await supabase
          .from('users')
          .select('id, full_name, identification, role, role_id, campus')
          .in('role', evaluatedRoleKeys);
        
        console.log(`\nCandidatos con rol ${JSON.stringify(evaluatedRoleKeys)}:`, (candidates || []).length);
        if (candidates && candidates.length > 0) {
          console.log('Detalles:', JSON.stringify(candidates, null, 2));
          
          // 14. Check which candidates are in manager relationship
          const allSubordinateIds = new Set([...managedIds, ...((legacyManaged || []).map(u => u.id))]);
          const directSubordinates = (candidates || []).filter(c => allSubordinateIds.has(c.id));
          
          console.log('\n=== SUBORDINADOS DIRECTOS CON ROL CORRECTO ===');
          console.log(`De ${(candidates || []).length} candidatos con rol correcto,`);
          console.log(`${directSubordinates.length} son subordinados directos:`);
          console.log(JSON.stringify(directSubordinates, null, 2));
          
          const officeOnly = (candidates || []).filter(c => !allSubordinateIds.has(c.id));
          console.log(`\n${officeOnly.length} son de la misma oficina pero NO subordinados directos:`);
          console.log(JSON.stringify(officeOnly, null, 2));
        } else {
          console.log('⚠️ NO HAY usuarios con los roles a evaluar');
          console.log('Roles evaluados (normalizados):', evaluatedRoleKeys.map(r => r.toLowerCase().replace(/[^a-z0-9_]/g, '')));
          console.log('Roles en DB:', [...new Set((await supabase.from('users').select('role')).data?.map(u => u.role) || [])]);
        }
      }
    }
  } else {
    console.log('⚠️ NO HAY PERIODO ACTIVO');
  }
}

main().catch(console.error);
