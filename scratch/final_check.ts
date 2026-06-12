import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://abchjsydqtfbwivygpet.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2hqc3lkcXRmYndpdnlncGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkOTQxNzQsImV4cCI6MjA3NTQzMDE3NH0.KRYKMkJrGCdpAwNAFMpYS2sBSK9dAv9u664w-ugWq7A';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  await supabase.auth.signInWithPassword({ email: 'JRANGEL@UDES.EDU.CO', password: '17041927' });

  // Get the form type
  const { data: ft } = await supabase
    .from('form_types')
    .select('*')
    .eq('key', 'Evaluación Líder al Líder: Direcciones a líderes de proceso o subproceso, jefes a coordinadores')
    .single();
  
  console.log('=== FORM TYPE ===');
  console.log('Key length:', ft?.key?.length);
  console.log('Key chars:', ft?.key?.split('').map((c,i) => `${i}:${c.charCodeAt(0)}`).join(' '));
  console.log('Label:', ft?.label);
  console.log('Label length:', ft?.label?.length);

  // Try to find template with exact type match using SQL raw query
  const { data: exact } = await supabase
    .from('evaluation_templates')
    .select('id, name, type, type_len')
    .eq('type', 'Evaluación Líder al Líder: Direcciones a líderes de proceso o subproceso, jefes a coordinadores');
  console.log('\nExact match:', exact?.length || 0);
  
  // Using ilike
  const { data: ilike } = await supabase
    .from('evaluation_templates')
    .select('id, name, type')
    .ilike('type', '%Líder al Líder%');
  console.log('ILike match:', ilike?.length || 0, JSON.stringify(ilike));

  // Check if there are MORE templates not returned earlier (pagination?)
  const { count } = await supabase
    .from('evaluation_templates')
    .select('id', { count: 'exact', head: true });
  console.log('\nTotal templates in DB:', count);

  // Get ALL with full details
  const { data: all } = await supabase
    .from('evaluation_templates')
    .select('id, name, type, is_active');
  console.log('\nALL templates:');
  all?.forEach(t => {
    console.log(`  ID=${t.id} name="${t.name}" type="${t.type}" len=${t.type.length} active=${t.is_active}`);
  });
}

main().catch(console.error);
