
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
    const { data: evals, error } = await supabase
        .from('evaluations')
        .select(`
            id,
            created_at,
            status,
            evaluated:users!evaluated_id!inner(id, full_name, email, role, office_id),
            responses:evaluation_responses(response_value),
            results:evaluation_results(overall_score, category_scores)
        `)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Evaluations found:', evals?.length);
    evals?.forEach(ev => {
        console.log(`Eval ID: ${ev.id}`);
        console.log(`User: ${ev.evaluated?.full_name}`);
        console.log(`Results:`, ev.results);
        if (Array.isArray(ev.results) && ev.results.length > 0) {
            console.log(`Overall Score: ${ev.results[0].overall_score}`);
        }
        console.log(`Responses count: ${ev.responses?.length}`);
        console.log('---');
    });
}

testQuery();
