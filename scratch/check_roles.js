import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await supabase.from('users').select('role').limit(20);
    if (error) console.error(error);
    else {
        const roles = [...new Set(data.map(u => u.role))];
        console.log('Unique Roles:', roles);
    }
}
run();
