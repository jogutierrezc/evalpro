import { createClient } from '@supabase/supabase-js';

// Try to load env vars if possible, or hardcode for this debug script if needed
// Assuming we can run this with ts-node and it picks up .env or we pass them
const supabaseUrl = 'https://abchjsydqtfbwivygpet.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2hqc3lkcXRmYndpdnlncGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NTQxNzQsImV4cCI6MjA3NTQzMDE3NH0.KRYKMkJrGCdpAwNAFMpYS2sBSK9dAv9u664w-ugWq7A';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('--- ROLES ---');
    const { data: roles } = await supabase.from('roles').select('*');
    console.table(roles);

    console.log('\n--- FORM TYPE RELATIONS ---');
    const { data: rels } = await supabase.from('form_type_relations').select('*');
    console.table(rels);

    console.log('\n--- FORM TYPE: Evaluación Líder al equipo ---');
    const { data: ft } = await supabase.from('form_types').select('*').ilike('label', '%Líder al equipo%');
    console.log(ft);

    console.log('\n--- ROLE: Vicerrectorías_buc (ID: eef81dc8...) ---');
    const { data: role } = await supabase.from('roles').select('*').eq('id', 'eef81dc8-258e-4b70-bc59-f0156c0992b0');
    console.log(role);

    console.log('\n--- ALL FORM TYPES (Key, Label) ---');
    const { data: fts } = await supabase.from('form_types').select('key, label');
    (fts || []).forEach(ft => console.log(`${ft.key}: ${ft.label}`));

    // console.log('\n--- FORM TYPES ---');
    // const { data: fts } = await supabase.from('form_types').select('*');
    // console.table(fts);

    // console.log('\n--- FORM TYPE RELATIONS (Filtered for Rectoria) ---');
    // // Check if any relation exists for Rectoria ID or Key
    // const { data: rels_filtered } = await supabase.from('form_type_relations').select('*')
    //     .or(`evaluator_role_key.eq.Rectoria,evaluator_role_id.eq.bdb3e099-2d32-4a29-831c-5f299b9917a9`);
    // console.table(rels_filtered);
}

run();
