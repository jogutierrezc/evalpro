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
  if (authError) { console.log('❌ Login error:', authError.message); return; }
  console.log('✅ Logged in as JRANGEL\n');

  // Get user
  const { data: user } = await supabase.from('users').select('*').eq('email', 'JRANGEL@UDES.EDU.CO').single();
  const { data: role } = await supabase.from('roles').select('*').eq('id', user.role_id).single();
  console.log('User:', user.full_name, '| Role:', role.key, `(${role.label})`);

  // Get active period
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: periods } = await supabase.from('evaluation_periods').select('*')
    .lte('start_date', todayStr).gte('end_date', todayStr);
  const period = periods?.[0];
  if (!period || period.is_active === false) { console.log('❌ No active period'); return; }
  console.log('✅ Period:', period.year, `(${period.start_date} - ${period.end_date})`);

  // Get form types for period
  const { data: pfts } = await supabase.from('evaluation_period_form_types').select('form_type_key').eq('period_id', period.id);
  const ftKeys = [...new Set((pfts || []).map(r => r.form_type_key).filter(Boolean))];
  console.log('\nForm type keys in period:', ftKeys);

  // Get ALL evaluation templates (active ones)
  const { data: allTemplates } = await supabase.from('evaluation_templates').select('*').eq('is_active', true);
  console.log(`\nTotal active templates: ${(allTemplates || []).length}`);
  console.log('Templates and their types:');
  (allTemplates || []).forEach(t => {
    const inPeriod = ftKeys.includes(t.type);
    console.log(`  ${inPeriod ? '✅' : '❌'} "${t.name}" -> type="${t.type}"${inPeriod ? '' : ' (NO está en el periodo)'}`);
  });

  // Now check: for templates that ARE in the period,
  // does the form_type_relations have matching entries for Vicerrectorías_buc?
  const formTypesInPeriod = ftKeys;
  const { data: relations } = await supabase
    .from('form_type_relations')
    .select('*')
    .in('form_type_key', formTypesInPeriod);

  console.log(`\nRelations for period form types: ${(relations || []).length}`);

  // Check which relations match Vicerrectorías_buc as evaluator
  const evalRels = (relations || []).filter(r => {
    return r.evaluator_role_id === user.role_id || r.evaluator_role_key === role.key;
  });

  console.log(`\nRelations where ${role.key} is evaluator:`);
  if (evalRels.length === 0) {
    console.log('❌ NONE found!');
  } else {
    evalRels.forEach(r => {
      const hasTemplate = (allTemplates || []).some(t => t.type === r.form_type_key);
      console.log(`  ${hasTemplate ? '✅' : '❌'} form_type="${r.form_type_key}" -> evaluated=${r.evaluated_role_key}${hasTemplate ? '' : ' (NO existe plantilla con este type!)'}`);
    });
  }

  // Specifically check the Lider al Lider template
  console.log('\n--- ESPECÍFICO: Evaluación Líder al Líder ---');
  const liderTemplates = (allTemplates || []).filter(t => 
    t.name.toLowerCase().includes('lider') || t.name.toLowerCase().includes('líder')
  );
  console.log('Templates with "lider/líder":');
  liderTemplates.forEach(t => console.log(`  "${t.name}" type="${t.type}" active=${t.is_active}`));

  // Check if there's a template with type matching the form_type_key
  const liderFormTypeKey = 'Evaluación Líder al Líder: Direcciones a líderes de proceso o subproceso, jefes a coordinadores';
  const matchingTemplate = (allTemplates || []).filter(t => t.type === liderFormTypeKey);
  console.log(`\nTemplates with type="${liderFormTypeKey}": ${matchingTemplate.length}`);
  matchingTemplate.forEach(t => console.log(`  "${t.name}" active=${t.is_active}`));

  // Check for close matches
  console.log('\nClose matches for type:');
  (allTemplates || []).forEach(t => {
    const tNorm = (t.type || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const liderNorm = liderFormTypeKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (tNorm.includes('lider') || liderNorm.includes(tNorm.substring(0, 10))) {
      console.log(`  "${t.type}" -> "${t.name}"`);
    }
  });

  // Also check what the code does: 
  // In EvaluationsModule.tsx, the key matching is:
  // 1. Period has form types linked by key
  // 2. Templates are queried by .in('type', allowedForUser)
  // 3. allowedForUser comes from form_type_relations
  // So if template.type doesn't match form_type_key exactly, it won't show

  // Let me check: what are the actual form_type keys?
  const { data: formTypes } = await supabase.from('form_types').select('key, label');
  console.log('\nAll form types in DB:');
  (formTypes || []).forEach(ft => console.log(`  key="${ft.key}" -> label="${ft.label}"`));
}

main().catch(console.error);
