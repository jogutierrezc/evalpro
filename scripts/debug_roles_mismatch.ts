
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('--- Roles Table ---');
    const { data: roles } = await supabase.from('roles').select('key, label');
    // Log first 10 roles
    console.log(JSON.stringify(roles?.slice(0, 10), null, 2));

    // Find "Director" related roles
    console.log('--- Director Roles ---');
    const directors = roles?.filter(r => r.key.toLowerCase().includes('director') || r.label.toLowerCase().includes('director'));
    console.log(JSON.stringify(directors, null, 2));

    console.log('--- Form Types Table ---');
    const { data: fts } = await supabase.from('form_types').select('key, roles');
    console.log(JSON.stringify(fts, null, 2));
}

main();
