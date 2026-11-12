import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  global: { headers: { 'x-client-info': 'evalpro-api' } },
});

const normalizeIdValue = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const mapCategoryScores = (categoryScores) => {
  if (!categoryScores || typeof categoryScores !== 'object') return [];
  return Object.entries(categoryScores).map(([competency, score]) => ({ competency, score: Number(score) }));
};

const allowedOrigin = process.env.API_ALLOWED_ORIGIN || '';
const corsHeaders = {
  ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin, Vary: 'Origin' } : {}),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const ADMIN_ROLES = ['admin', 'administrador', 'superadmin'];

// Autenticación: (1) clave de sistema en el encabezado x-api-key (variable EVALUACIONES_API_KEY), o
// (2) token de una persona con sesión (Authorization: Bearer <access_token> de Supabase Auth).
async function authenticate(req) {
  const apiKey = process.env.EVALUACIONES_API_KEY;
  const sent = req.headers['x-api-key'];
  if (apiKey && typeof sent === 'string' && sent.length === apiKey.length) {
    let diff = 0;
    for (let i = 0; i < apiKey.length; i++) diff |= apiKey.charCodeAt(i) ^ sent.charCodeAt(i);
    if (diff === 0) return { kind: 'system' };
  }
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: me } = await supabase.from('users').select('id, role').eq('id', data.user.id).maybeSingle();
  if (!me) return null;
  return { kind: 'user', id: me.id, isAdmin: ADMIN_ROLES.includes(String(me.role || '').toLowerCase()) };
}

// Una persona solo consulta lo suyo, a quien dirige o a quien evaluó. La administración, todo.
async function canRead(caller, collaboratorId) {
  if (caller.kind === 'system' || caller.isAdmin || caller.id === collaboratorId) return true;
  const [{ data: mgr }, { data: direct }, { data: evaluated }] = await Promise.all([
    supabase.from('user_managers').select('user_id').eq('manager_id', caller.id).eq('user_id', collaboratorId).limit(1),
    supabase.from('users').select('id').eq('id', collaboratorId).eq('manager_id', caller.id).limit(1),
    supabase.from('evaluations').select('id').eq('evaluator_id', caller.id).eq('evaluated_id', collaboratorId).limit(1),
  ]);
  return !!((mgr && mgr.length) || (direct && direct.length) || (evaluated && evaluated.length));
}

const setCorsHeaders = (res) => {
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  setCorsHeaders(res);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  const documento = normalizeIdValue(req.query?.documento || req.query?.numero_documento || req.query?.cedula);
  if (!documento) {
    return res.status(400).json({ error: 'Parámetro documento es requerido.' });
  }

  const caller = await authenticate(req);
  if (!caller) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ error: 'Autenticación requerida.' });
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

    const collaborator = user;

    if (!collaborator) {
      return res.status(404).json({ error: 'No se encontró un colaborador con ese documento.' });
    }

    if (!(await canRead(caller, collaborator.id))) {
      return res.status(403).json({ error: 'No tienes permiso para consultar a esta persona.' });
    }

    const { data: evaluations, error: evaluationsError } = await supabase
      .from('evaluations')
      .select(`
        id,
        template_id,
        status,
        created_at,
        started_at,
        completed_at,
        evaluator_id,
        evaluated_id,
        evaluator:users!evaluator_id(id, full_name, role),
        template:evaluation_templates!template_id(id, name, type, categories, description),
        results:evaluation_results(overall_score, category_scores, ai_analysis, recommendations)
      `)
      .eq('evaluated_id', collaborator.id)
      .order('created_at', { ascending: false });

    if (evaluationsError) {
      return res.status(500).json({ error: 'Error cargando evaluaciones.', details: evaluationsError.message });
    }

    const evaluationIds = (evaluations || []).map((evaluation) => evaluation.id);
    const templateIds = Array.from(new Set((evaluations || []).map((evaluation) => evaluation.template_id).filter(Boolean)));

    const [sectionsRes, questionsRes, responsesRes] = await Promise.all([
      templateIds.length
        ? supabase.from('evaluation_sections').select('id, template_id, title, category, order_index').in('template_id', templateIds)
        : Promise.resolve({ data: [], error: null }),
      templateIds.length
        ? supabase.from('evaluation_questions').select('id, template_id, section_id, question_text, question_type, options, order_index').in('template_id', templateIds)
        : Promise.resolve({ data: [], error: null }),
      evaluationIds.length
        ? supabase.from('evaluation_responses').select('id, evaluation_id, question_id, response_value, created_at').in('evaluation_id', evaluationIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (sectionsRes.error) {
      return res.status(500).json({ error: 'Error cargando secciones.', details: sectionsRes.error.message });
    }
    if (questionsRes.error) {
      return res.status(500).json({ error: 'Error cargando preguntas.', details: questionsRes.error.message });
    }
    if (responsesRes.error) {
      return res.status(500).json({ error: 'Error cargando respuestas.', details: responsesRes.error.message });
    }

    const sectionsByTemplate = new Map();
    (sectionsRes.data || []).forEach((section) => {
      const list = sectionsByTemplate.get(section.template_id) || [];
      list.push(section);
      sectionsByTemplate.set(section.template_id, list);
    });

    const questionsByTemplate = new Map();
    const questionById = new Map();
    (questionsRes.data || []).forEach((question) => {
      const list = questionsByTemplate.get(question.template_id) || [];
      list.push(question);
      questionsByTemplate.set(question.template_id, list);
      questionById.set(question.id, question);
    });

    const responsesByEvaluation = new Map();
    (responsesRes.data || []).forEach((response) => {
      const list = responsesByEvaluation.get(response.evaluation_id) || [];
      list.push(response);
      responsesByEvaluation.set(response.evaluation_id, list);
    });

    const buildSectionScores = (responses, questions) => {
      const sectionData = new Map();
      responses.forEach((response) => {
        const question = questionById.get(response.question_id);
        if (!question) return;
        const value = typeof response.response_value === 'number' ? response.response_value : Number(response.response_value);
        if (Number.isNaN(value)) return;
        const sectionId = question.section_id || 'no-section';
        const sectionKey = sectionId;
        const record = sectionData.get(sectionKey) || { total: 0, count: 0, title: question.category || 'Sin sección' };
        record.total += value;
        record.count += 1;
        if (question.section_id && question.section_id !== 'no-section') {
          const section = (sectionsByTemplate.get(question.template_id) || []).find((s) => s.id === question.section_id);
          if (section && section.title) record.title = section.title;
        }
        sectionData.set(sectionKey, record);
      });
      return Array.from(sectionData.values()).map((record) => ({
        section: record.title,
        average_score: record.count > 0 ? Number((record.total / record.count).toFixed(2)) : null,
        question_count: record.count,
      }));
    };

    const response = (evaluations || []).map((evaluation) => {
      const template = evaluation.template || {};
      const evalResponses = responsesByEvaluation.get(evaluation.id) || [];
      const templateQuestions = (questionsByTemplate.get(evaluation.template_id) || []).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      const templateSections = (sectionsByTemplate.get(evaluation.template_id) || []).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      const questionsWithResponses = templateQuestions.map((question) => {
        const response = evalResponses.find((r) => String(r.question_id) === String(question.id));
        const responseValue = response?.response_value ?? null;
        const numeric = typeof responseValue === 'number' ? responseValue : Number(responseValue);
        return {
          id: question.id,
          question_text: question.question_text,
          question_type: question.question_type,
          options: question.options,
          category: question.category,
          section_id: question.section_id,
          order_index: question.order_index,
          response: responseValue,
          score: Number.isNaN(numeric) ? null : numeric,
        };
      });

      const sections = templateSections.map((section) => ({
        id: section.id,
        title: section.title,
        category: section.category,
        order_index: section.order_index,
        questions: questionsWithResponses.filter((q) => q.section_id === section.id),
      }));

      const unsectionedQuestions = questionsWithResponses.filter((q) => !q.section_id);
      if (unsectionedQuestions.length) {
        sections.push({
          id: null,
          title: 'Sin sección',
          category: null,
          order_index: null,
          questions: unsectionedQuestions,
        });
      }

      const comments = questionsWithResponses
        .filter((q) => q.question_type !== 'rating' && q.response !== null && q.response !== undefined && String(q.response).trim() !== '')
        .map((q) => ({ question_id: q.id, question_text: q.question_text, comment: q.response }));

      const sectionScores = buildSectionScores(evalResponses, templateQuestions);

      return {
        id: evaluation.id,
        status: evaluation.status,
        created_at: evaluation.created_at,
        started_at: evaluation.started_at,
        completed_at: evaluation.completed_at,
        template: {
          id: template.id,
          name: template.name,
          type: template.type,
          description: template.description || null,
          categories: template.categories || null,
        },
        evaluator: evaluation.evaluator || null,
        evaluated: {
          id: collaborator.id,
          full_name: collaborator.full_name,
          identification: collaborator.identification,
          role: collaborator.role,
          campus: collaborator.campus,
        },
        sections,
        section_scores: sectionScores,
        comments,
        result: {
          overall_score: evaluation.results?.[0]?.overall_score ?? null,
          category_scores: evaluation.results?.[0]?.category_scores ?? null,
          competencies: mapCategoryScores(evaluation.results?.[0]?.category_scores),
          ai_analysis: evaluation.results?.[0]?.ai_analysis ?? null,
          recommendations: evaluation.results?.[0]?.recommendations ?? null,
        },
      };
    });

    return res.status(200).json({ collaborator, evaluations: response });
  } catch (error) {
    return res.status(500).json({ error: 'Error inesperado al procesar la solicitud.', details: error?.message || String(error) });
  }
}
