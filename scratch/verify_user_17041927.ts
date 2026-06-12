import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://abchjsydqtfbwivygpet.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2hqc3lkcXRmYndpdnlncGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTQxNzQsImV4cCI6MjA3NTQzMDE3NH0.KRYKMkJrGCdpAwNAFMpYS2sBSK9dAv9u664w-ugWq7A';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // 1. Find user by identification
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('identification', '17041927')
    .single();

  if (!user) {
    // Try a broader search
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, identification, full_name, role')
      .limit(50);
    console.log('=== No user found with 17041927 ===');
    console.log('Users in DB:', JSON.stringify(allUsers, null, 2));
    return;
  }

  console.log('=== USUARIO ENCONTRADO ===');
  console.log(JSON.stringify(user, null, 2));

  // 2. Get the user's role info
  const { data: roleInfo } = await supabase
    .from('roles')
    .select('*')
    .eq('id', user.role_id)
    .single();

  console.log('\n=== ROL DEL USUARIO ===');
  console.log(JSON.stringify(roleInfo, null, 2));

  // 3. Check who this user manages (user_managers table)
  const { data: managedUsers } = await supabase
    .from('user_managers')
    .select('user_id')
    .eq('manager_id', user.id);

  const managedIds = (managedUsers || []).map(r => r.user_id);
  
  console.log('\n=== SUBORDINADOS DIRECTOS (user_managers) ===');
  console.log('IDs:', managedIds);

  if (managedIds.length > 0) {
    const { data: managedDetails } = await supabase
      .from('users')
      .select('id, full_name, identification, role, campus')
      .in('id', managedIds);
    console.log('Detalles:', JSON.stringify(managedDetails, null, 2));
  }

  // 4. Check who this user manages (users.manager_id legacy)
  const { data: legacyManaged } = await supabase
    .from('users')
    .select('id, full_name, identification, role, campus')
    .eq('manager_id', user.id);

  console.log('\n=== SUBORDINADOS DIRECTOS (users.manager_id legacy) ===');
  console.log(JSON.stringify(legacyManaged, null, 2));

  // 5. Check user's office assignments
  const { data: userOffices } = await supabase
    .from('collaborator_offices')
    .select('office_id')
    .eq('collaborator_id', user.id);

  const officeIds = (userOffices || []).map(r => r.office_id);
  console.log('\n=== OFICINAS DEL USUARIO ===');
  console.log('Office IDs:', officeIds);

  if (officeIds.length > 0) {
    const { data: offices } = await supabase
      .from('offices')
      .select('id, name')
      .in('id', officeIds);
    console.log('Detalles:', JSON.stringify(offices, null, 2));
  }

  // 6. Check colleagues in same offices
  if (officeIds.length > 0) {
    const { data: sameOfficeUsers } = await supabase
      .from('collaborator_offices')
      .select('collaborator_id')
      .in('office_id', officeIds);
    
    const sameOfficeIds = Array.from(new Set((sameOfficeUsers || []).map(r => r.collaborator_id)));
    const filteredOfficeIds = sameOfficeIds.filter(id => id !== user.id);
    
    console.log('\n=== COLABORADORES EN MISMAS OFICINAS ===');
    console.log('IDs:', filteredOfficeIds);

    if (filteredOfficeIds.length > 0) {
      const { data: officeColleagues } = await supabase
        .from('users')
        .select('id, full_name, identification, role, campus')
        .in('id', filteredOfficeIds);
      console.log('Detalles:', JSON.stringify(officeColleagues, null, 2));
    }
  }

  // 7. Check active period
  const { data: periods } = await supabase
    .from('evaluation_periods')
    .select('*')
    .lte('start_date', new Date().toISOString().slice(0, 10))
    .gte('end_date', new Date().toISOString().slice(0, 10))
    .limit(1);

  console.log('\n=== PERIODO ACTIVO ===');
  console.log(JSON.stringify(periods, null, 2));

  if (periods && periods.length > 0) {
    const period = periods[0];
    
    // 8. Check form types linked to this period
    const { data: periodFormTypes } = await supabase
      .from('evaluation_period_form_types')
      .select('form_type_key')
      .eq('period_id', period.id);

    const formTypeKeys = (periodFormTypes || []).map(r => r.form_type_key);
    console.log('\n=== TIPOS DE FORMULARIO DEL PERIODO ===');
    console.log(JSON.stringify(formTypeKeys, null, 2));

    if (formTypeKeys.length > 0) {
      // 9. Check form_type_relations for these form types
      const { data: relations } = await supabase
        .from('form_type_relations')
        .select('*')
        .in('form_type_key', formTypeKeys);

      console.log('\n=== RELACIONES (form_type_relations) ===');
      console.log(JSON.stringify(relations, null, 2));

      // 10. Check if any relations match user as evaluator
      const userRoleKey = roleInfo?.key || user.role;
      console.log('\n=== EVALUACIONES QUE PUEDE HACER ===');
      
      const matchingRelations = (relations || []).filter(r => {
        const matchByKey = r.evaluator_role_key === userRoleKey;
        const matchById = r.evaluator_role_id === user.role_id;
        return matchByKey || matchById;
      });

      console.log('Relaciones donde es evaluador:', JSON.stringify(matchingRelations, null, 2));

      // 11. Check evaluation templates for matched form types
      const matchedFormTypes = Array.from(new Set(matchingRelations.map(r => r.form_type_key)));
      
      if (matchedFormTypes.length > 0) {
        const { data: templates } = await supabase
          .from('evaluation_templates')
          .select('id, name, type')
          .eq('is_active', true)
          .in('type', matchedFormTypes);

        console.log('\n=== PLANTILLAS DISPONIBLES ===');
        console.log(JSON.stringify(templates, null, 2));
      }
    }
  }
}

main().catch(console.error);
