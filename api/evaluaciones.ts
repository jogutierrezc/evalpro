import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables for EvalPro API. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  global: { headers: { 'x-client-info': 'evalpro-api' } },
});

const normalizeIdValue = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const mapCategoryScores = (categoryScores: Record<string, number> | null | undefined) => {
  if (!categoryScores || typeof categoryScores !== 'object') return [];
  return Object.entries(categoryScores).map(([competency, score]) => ({ competency, score: Number(score) }));
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function setCorsHeaders(res: any) {
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
}

export default async function handler(req: any, res: any) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  // Set CORS headers on all responses
  setCorsHeaders(res);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  const documento = normalizeIdValue(req.query.documento ?? req.query.numero_documento ?? req.query.cedula);
  if (!documento) {
    return res.status(400).json({ error: 'Parámetro documento es requerido.' });
  }

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, identification, full_name, role, office_id, manager_id, campus')
      .eq('identification', documento)
      .maybeSingle();

    if (userError) {
      return res.status(500).json({ error: 'Error buscando colaborador en users.', details: userError.message });
    }

    let collaborator = user;
    if (!collaborator) {
      const { data: oldRecord, error: oldError } = await supabase
        .from('colaboradores')
        .select('id, identification, full_name, role, office_id, manager_id, campus')
        .eq('identification', documento)
        .maybeSingle();

      if (oldError) {
        return res.status(500).json({ error: 'Error buscando colaborador en colaboradores.', details: oldError.message });
      }
      collaborator = oldRecord;
    }

    if (!collaborator) {
      return res.status(404).json({ error: 'No se encontró un colaborador con ese documento.' });
    }

    const { data: evaluations, error: evaluationsError } = await supabase
      .from('evaluations')
      .select(
        `
        id,
        template_id,
        status,
        created_at,
        started_at,
        completed_at,
        evaluator_id,
        evaluated_id,
        evaluator:users!evaluator_id(id, full_name, identification, role),
        template:evaluation_templates!template_id(id, name, type, categories),
        results:evaluation_results(overall_score, category_scores, ai_analysis, recommendations)
      `,
      )
      .eq('evaluated_id', collaborator.id)
      .order('completed_at', { ascending: false });

    if (evaluationsError) {
      return res.status(500).json({ error: 'Error cargando evaluaciones.', details: evaluationsError.message });
    }

    const response = (evaluations || []).map((evaluation: any) => ({
      id: evaluation.id,
      template_id: evaluation.template_id,
      type: evaluation.template?.type || null,
      template_name: evaluation.template?.name || null,
      template_categories: evaluation.template?.categories || null,
      status: evaluation.status,
      created_at: evaluation.created_at,
      started_at: evaluation.started_at,
      completed_at: evaluation.completed_at,
      evaluator: evaluation.evaluator || null,
      evaluated: {
        id: collaborator.id,
        full_name: collaborator.full_name,
        identification: collaborator.identification,
        role: collaborator.role,
        campus: collaborator.campus,
      },
      result: {
        overall_score: evaluation.results?.[0]?.overall_score ?? null,
        category_scores: evaluation.results?.[0]?.category_scores ?? null,
        competencies: mapCategoryScores(evaluation.results?.[0]?.category_scores),
        ai_analysis: evaluation.results?.[0]?.ai_analysis ?? null,
        recommendations: evaluation.results?.[0]?.recommendations ?? null,
      },
    }));

    return res.status(200).json({ collaborator, evaluations: response });
  } catch (error: any) {
    return res.status(500).json({ error: 'Error inesperado al procesar la solicitud.', details: error?.message ?? String(error) });
  }
}
