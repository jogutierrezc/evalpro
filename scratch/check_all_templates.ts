import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://abchjsydqtfbwivygpet.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2hqc3lkcXRmYndpdnlncGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTQxNzQsImV4cCI6MjA3NTQzMDE3NH0.KRYKMkJrGCdpAwNAFMpYS2sBSK9dAv9u664w-ugWq7A';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  await supabase.auth.signInWithPassword({ email: 'JRANGEL@UDES.EDU.CO', password: '17041927' });

  // 1. Get ALL form types with their keys and labels
  const { data: formTypes } = await supabase.from('form_types').select('*');
  console.log('=== TODOS LOS TIPOS DE FORMULARIO ===');
  (formTypes || []).forEach(ft => {
    console.log(`\n  key="${ft.key}"`);
    console.log(`  label="${ft.label}"`);
    console.log(`  roles: [${(ft.roles || []).join(', ')}]`);
    console.log(`  role_ids: ${JSON.stringify(ft.role_ids)}`);
  });

  // 2. Get ALL evaluation templates (active AND inactive)
  const { data: allTemplates } = await supabase.from('evaluation_templates').select('*');
  console.log('\n\n=== TODAS LAS PLANTILLAS ===');
  (allTemplates || []).forEach(t => {
    console.log(`\n  name="${t.name}"`);
    console.log(`  type="${t.type}"`);
    console.log(`  is_active=${t.is_active}`);
    
    // Check if type matches any form_type key or label
    const matchingKey = (formTypes || []).find(ft => ft.key === t.type);
    const matchingLabel = (formTypes || []).find(ft => ft.label === t.type);
    if (matchingKey) console.log(`  ✅ type coincide con KEY de: "${matchingKey.label}"`);
    else if (matchingLabel) console.log(`  ⚠️ type coincide con LABEL de: "${matchingLabel.key}" (debería ser la KEY!)`);
    else console.log(`  ❌ type NO coincide con ningún form_type`);
  });

  // 3. Specifically check for LIDER templates
  console.log('\n\n=== FILTRO: Plantillas que podrían ser "Evaluación Líder al Líder" ===');
  (allTemplates || []).filter(t => 
    t.name.toLowerCase().includes('lider') || 
    t.name.toLowerCase().includes('líder') ||
    t.name.toLowerCase().includes('lider') ||
    t.type.toLowerCase().includes('lider') ||
    t.type.toLowerCase().includes('líder')
  ).forEach(t => {
    console.log(`\n  name="${t.name}"`);
    console.log(`  type="${t.type}"`);
    console.log(`  is_active=${t.is_active}`);
    
    // Double check type
    const matchingKey = (formTypes || []).find(ft => ft.key === t.type);
    const matchingLabel = (formTypes || []).find(ft => ft.label === t.type);
    if (matchingKey) console.log(`  ✅ type = KEY de: "${matchingKey.label}"`);
    else if (matchingLabel) console.log(`  ⚠️ type = LABEL de: "${matchingLabel.key}"`);
    else console.log(`  ❌ type no coincide`);
  });
}

main().catch(console.error);
