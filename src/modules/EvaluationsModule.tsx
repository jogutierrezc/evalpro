import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Evaluation, EvaluationTemplate, User } from '../lib/supabase';
import { FileText, Clock, CheckCircle, Play } from 'lucide-react';
import { EvaluationForm } from './evaluations/EvaluationForm';

export function EvaluationsModule() {
  const { user } = useAuth();
  const [activePeriod, setActivePeriod] = useState<null | { id: string; year: number; start_date: string; end_date: string }>(null);
  const [evaluations, setEvaluations] = useState<
    (Evaluation & { template?: EvaluationTemplate; evaluator?: User; evaluated?: User })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);
  const [availableSoftTemplates, setAvailableSoftTemplates] = useState<EvaluationTemplate[]>([]);
  const [takenTemplatesMap, setTakenTemplatesMap] = useState<Record<string, boolean>>({});
  const [managerCandidates, setManagerCandidates] = useState<User[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Record<string, string>>({});
  const [evaluateOther, setEvaluateOther] = useState<Record<string, boolean>>({});
  const [personId, setPersonId] = useState<string | null>(null);
  const [evaluationCandidatesByTemplate, setEvaluationCandidatesByTemplate] = useState<Record<string, User[]>>({});

  // After migrating colaboradores into users, prefer the users.id as the person identifier
  const getPersonIdForUser = async (u: any) => {
    if (!u) return null;
    return (u as any).id || null;
  };

  useEffect(() => {
    // resolve current actor id (prefer colaboradores.id when available)
    (async () => {
      try {
        const pid = await getPersonIdForUser(user);
        setPersonId(pid || (user ? (user as any).id : null));
      } catch (e) {
        setPersonId(user ? (user as any).id : null);
      }
    })();

    loadEvaluations();
    loadAvailableSoftTemplates();
  }, [user]);

  const loadEvaluations = async () => {
    try {
      let query = supabase.from('evaluations').select('*');

      if (user?.role === 'admin') {
        query = query.order('created_at', { ascending: false });
      } else if (user?.role === 'office_manager') {
        const { data: officeUsers } = await supabase
          .from('users')
          .select('id')
          .eq('office_id', user.office_id);

        const userIds = officeUsers?.map((u) => u.id) || [];
        query = query.or(`evaluator_id.in.(${userIds.join(',')}),evaluated_id.in.(${userIds.join(',')})`);
      } else {
        query = query.or(`evaluator_id.eq.${user?.id},evaluated_id.eq.${user?.id}`);
      }

      const { data: evaluationsData, error } = await query;
      if (error) throw error;

      const evaluationsWithDetails = await Promise.all(
        (evaluationsData || []).map(async (evaluation) => {
          const templateRes = await supabase.from('evaluation_templates').select('*').eq('id', evaluation.template_id).single();

          // Try to load evaluator from users (colaboradores migrated into users)
          let evaluatorData: any = null;
          try {
            const { data: u } = await supabase.from('users').select('*').eq('id', evaluation.evaluator_id).maybeSingle();
            evaluatorData = u || null;
          } catch (e) {
            evaluatorData = null;
          }

          // Try to load evaluated from users
          let evaluatedData: any = null;
          try {
            const { data: u2 } = await supabase.from('users').select('*').eq('id', evaluation.evaluated_id).maybeSingle();
            evaluatedData = u2 || null;
          } catch (e) {
            evaluatedData = null;
          }

          return {
            ...evaluation,
            template: templateRes.data,
            evaluator: evaluatorData,
            evaluated: evaluatedData,
          };
        })
      );

      setEvaluations(evaluationsWithDetails);
    } catch (error) {
      console.error('Error loading evaluations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableSoftTemplates = async () => {
    try {
      

      // Find active period covering today
      const today = new Date().toISOString().slice(0, 10);
      const { data: periodData } = await supabase
        .from('evaluation_periods')
        .select('*')
        .lte('start_date', today)
        .gte('end_date', today)
        .limit(1);

      const period = (periodData && periodData.length > 0) ? periodData[0] : null;
      setActivePeriod(period || null);

      // Normalize user's role to canonical role.key using `roles` table (fallback: treat stored label as key)
      let canonicalRole: string | null = null;
      if (user) {
        try {
          const { data: rolesData } = await supabase.from('roles').select('*');
          if (rolesData && rolesData.length > 0) {
            // if user's role already matches a key, use it; otherwise try to match by label
            const byKey = (rolesData || []).find((r: any) => r.key === user.role);
            if (byKey) canonicalRole = byKey.key;
            else {
              const byLabel = (rolesData || []).find((r: any) => (r.label || '').toString().toLowerCase() === (user.role || '').toString().toLowerCase());
              canonicalRole = byLabel ? byLabel.key : (user.role as string);
            }
          } else {
            canonicalRole = user.role as string;
          }
        } catch (err) {
          canonicalRole = user.role as string;
        }
      }

      // If there is an active period, only show templates whose type is linked to the period
      if (period) {
        const { data: pfts } = await supabase.from('evaluation_period_form_types').select('form_type_key').eq('period_id', period.id);
        const allowedKeys = (pfts || []).map((r: any) => r.form_type_key);

        if (allowedKeys.length === 0) {
          setAvailableSoftTemplates([]);
          setTakenTemplatesMap({});
          return;
        }

        // load form_types to check role membership
        const { data: fts } = await supabase.from('form_types').select('*').in('key', allowedKeys);
        // DEBUG: show role and allowed keys
        console.debug('[Evaluations] canonicalRole=', canonicalRole, 'allowedKeys=', allowedKeys, 'fts_count=', (fts||[]).length);
        // Also include form types that explicitly target this user's role via form_type_relations (evaluated_role_key)
        let relationKeys: string[] = [];
        if (canonicalRole) {
          // ensure allowedKeys are canonical form_type keys; if not, try to resolve labels
          const normalizedAllowed: string[] = [];
          for (const k of allowedKeys) {
            let kKey = k;
            try {
              const { data: ft1 } = await supabase.from('form_types').select('key').eq('key', k).limit(1);
              if (!ft1 || ft1.length === 0) {
                const { data: ft2 } = await supabase.from('form_types').select('key,label');
                const matched = (ft2 || []).find((f: any) => (f.label || '').toString().toLowerCase() === (k || '').toString().toLowerCase());
                if (matched) kKey = matched.key;
              }
            } catch (e) {
              // ignore
            }
            normalizedAllowed.push(kKey);
          }

          const { data: rels } = await supabase.from('form_type_relations').select('form_type_key').in('form_type_key', normalizedAllowed).eq('evaluated_role_key', canonicalRole);
          relationKeys = (rels || []).map((r: any) => r.form_type_key);
        }

        const allowedForUser = Array.from(new Set([...(fts || []).filter((ft: any) => Array.isArray(ft.roles) ? ft.roles.includes(canonicalRole as any) : false).map((ft: any) => ft.key), ...relationKeys]));
        console.debug('[Evaluations] relationKeys=', relationKeys, 'allowedForUser=', allowedForUser);

        if (allowedForUser.length === 0) {
          setAvailableSoftTemplates([]);
          setTakenTemplatesMap({});
          return;
        }

        const { data: templates, error: tplErr } = await supabase
          .from('evaluation_templates')
          .select('*')
          .eq('is_active', true)
          .in('type', allowedForUser)
          .order('created_at', { ascending: false });

        if (tplErr) throw tplErr;

        let tplList: EvaluationTemplate[] = templates || [];
        // If no templates found by `type` keys, be tolerant: fetch all active templates
        // and match template.type against allowed keys OR allowed labels (in case DB stored labels)
        if (tplList.length === 0) {
          const { data: allTemplates, error: allTplErr } = await supabase
            .from('evaluation_templates')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

          if (allTplErr) throw allTplErr;

          const allowedLabels = (fts || []).map((ft: any) => (ft.label || '').toString().toLowerCase());

          const tolerant = (allTemplates || []).filter((t: any) => {
            const tType = (t.type || '').toString();
            if (allowedForUser.includes(tType)) return true;
            if (allowedLabels.includes(tType.toLowerCase())) return true;
            return false;
          });

          tplList.push(...(tolerant as EvaluationTemplate[]));
          // assign below once for unified flow
        }

        // Load evaluation candidates per template based on form_type_relations where user is evaluator
        if (user && canonicalRole) {
          try {
            console.debug('[EvaluationsModule] Loading relation-based candidates. User role:', user.role, 'Canonical role:', canonicalRole);
            
            // find all form_type_keys where user's role is evaluator
            const { data: evaluatorRels } = await supabase
              .from('form_type_relations')
              .select('form_type_key,evaluated_role_key')
              .eq('evaluator_role_key', canonicalRole);

            console.debug('[EvaluationsModule] Evaluator relations found:', evaluatorRels);

            if (evaluatorRels && evaluatorRels.length > 0) {
              // group by form_type_key -> evaluated_role_keys
              const relsByFormType: Record<string, string[]> = {};
              evaluatorRels.forEach((rel: any) => {
                if (!relsByFormType[rel.form_type_key]) relsByFormType[rel.form_type_key] = [];
                relsByFormType[rel.form_type_key].push(rel.evaluated_role_key);
              });

              // Helper to filter candidates by office and campus with exceptions
              const filterByOfficeAndCampus = async (cands: any[], roleKey: string): Promise<any[]> => {
                if (!user) return [];
                const evaluatorId = (user as any).id;
                const evaluatorCampus = (user as any).campus || '';

                // Load office mappings for evaluator and candidates in one query
                const candidateIds = cands.map((c) => c.id);
                const { data: officeLinks } = await supabase
                  .from('collaborator_offices')
                  .select('collaborator_id,office_id')
                  .in('collaborator_id', [evaluatorId, ...candidateIds]);

                const officesByUser: Record<string, Set<string>> = {};
                (officeLinks || []).forEach((l: any) => {
                  if (!officesByUser[l.collaborator_id]) officesByUser[l.collaborator_id] = new Set();
                  officesByUser[l.collaborator_id].add(l.office_id);
                });

                const evalOffices = officesByUser[evaluatorId] || new Set<string>();

                // Map role key -> label for exceptions
                const { data: rolesRef } = await supabase.from('roles').select('key,label');
                const roleLabel = (rolesRef || []).find((r: any) => r.key === roleKey)?.label || roleKey;
                const lowerKey = (roleKey || '').toString().toLowerCase();
                const lowerLabel = (roleLabel || '').toString().toLowerCase();

                const isLiderVAF = lowerKey.includes('coordinador general de la vaf') || lowerLabel.includes('líder vaf') || lowerLabel.includes('lider vaf');
                const isRectoria = lowerKey.includes('rectoria') || lowerLabel.includes('rectoria');
                const isVicerrectoria = lowerKey.includes('vicerrectoria') || lowerLabel.includes('vicerrectoria');

                return cands.filter((cand) => {
                  const candCampus = (cand.campus || '').toString();
                  const candOffices = officesByUser[cand.id] || new Set<string>();
                  const shareOffice = Array.from(candOffices).some((o) => evalOffices.has(o));
                  const campusMatches = !evaluatorCampus || evaluatorCampus === 'Todas' || evaluatorCampus === '' ? true : candCampus === evaluatorCampus;

                  if (isLiderVAF) {
                    // Lider VAF: ignore campus, require shared office per base rule
                    return shareOffice;
                  }
                  if (isRectoria || isVicerrectoria) {
                    // Rectoría/Vicerrectoría: constrain by campus, ignore office overlap
                    return campusMatches;
                  }
                  // Others: require both same office and same campus
                  return shareOffice && campusMatches;
                });
              };

              // for each template in tplList, resolve candidates
              const candidatesMap: Record<string, User[]> = {};
              for (const tpl of tplList) {
                const evaluatedRoles = relsByFormType[tpl.type] || [];
                console.debug('[EvaluationsModule] Template:', tpl.name, 'type:', tpl.type, 'evaluatedRoles:', evaluatedRoles);
                
                if (evaluatedRoles.length === 0) {
                  candidatesMap[tpl.id] = [];
                  continue;
                }
                // load all users whose canonical role matches any of evaluatedRoles
                const { data: rolesData } = await supabase.from('roles').select('*');
                const roleKeyToLabel: Record<string, string> = {};
                (rolesData || []).forEach((r: any) => { roleKeyToLabel[r.key] = r.label; });

                const evaluatedLabels = evaluatedRoles.map((k) => roleKeyToLabel[k] || k);
                const { data: candidateUsers } = await supabase.from('users').select('*').in('role', [...evaluatedRoles, ...evaluatedLabels]);
                console.debug('[EvaluationsModule] Found', (candidateUsers || []).length, 'candidate users (pre-filter) for template', tpl.name);
                const filtered = await filterByOfficeAndCampus((candidateUsers as any) || [], canonicalRole);
                console.debug('[EvaluationsModule] Filtered candidates (by office/campus):', filtered.length);
                candidatesMap[tpl.id] = filtered;
              }
              setEvaluationCandidatesByTemplate(candidatesMap);
              console.debug('[EvaluationsModule] Final candidatesMap:', candidatesMap);
            }

            // Also load same-office candidates for manager flows
            const { data: candidates } = await supabase
              .from('users')
              .select('*')
              .eq('office_id', user.office_id);
            setManagerCandidates((candidates as any) || []);
          } catch (err) {
            console.error('Error loading candidates', err);
            setManagerCandidates([]);
            setEvaluationCandidatesByTemplate({});
          }
        }

        if (!user || tplList.length === 0) {
          setTakenTemplatesMap({});
          setAvailableSoftTemplates(tplList);
          return;
        }

        const templateIds = tplList.map((t) => t.id);

        // fetch evaluations for this user that use these templates
        const personIdLookup = await getPersonIdForUser(user);
        const evaluatedLookupId = personIdLookup || user.id;
        const { data: existingEvals, error: evalErr } = await supabase
          .from('evaluations')
          .select('template_id')
          .eq('evaluated_id', evaluatedLookupId)
          .in('template_id', templateIds);

        if (evalErr) throw evalErr;

        const taken: Record<string, boolean> = {};
        (existingEvals || []).forEach((e: any) => {
          if (e.template_id) taken[e.template_id] = true;
        });

        setTakenTemplatesMap(taken);
        return;
      }

      // Default: no active period — show templates according to user's role (non-admins)
      let tplList: EvaluationTemplate[] = [];
      if (user && (user.role as string) !== 'admin') {
        // Load all form types and pick those that include the user's role
        const { data: allFormTypes, error: ftErr } = await supabase.from('form_types').select('*');
        if (ftErr) throw ftErr;
        // include types that include user's role OR that target the user's role via relations
        let relKeysAll: string[] = [];
        if (user) {
          const canonical = canonicalRole || (user.role as string);
          const { data: relsAll } = await supabase.from('form_type_relations').select('form_type_key').eq('evaluated_role_key', canonical);
          relKeysAll = (relsAll || []).map((r: any) => r.form_type_key);
        }
        const allowedKeysForUser = Array.from(new Set([...(allFormTypes || []).filter((ft: any) => Array.isArray(ft.roles) ? ft.roles.includes(canonicalRole) : false).map((ft: any) => ft.key), ...relKeysAll]));

        if (allowedKeysForUser.length === 0) {
          setAvailableSoftTemplates([]);
          setTakenTemplatesMap({});
          return;
        }

        const { data: templates, error: tplErr } = await supabase
          .from('evaluation_templates')
          .select('*')
          .eq('is_active', true)
          .in('type', allowedKeysForUser)
          .order('created_at', { ascending: false });

        if (tplErr) throw tplErr;

        tplList = templates || [];
      } else {
        // admin: show all active templates
        const { data: templates, error: tplErr } = await supabase.from('evaluation_templates').select('*').eq('is_active', true).order('created_at', { ascending: false });
        if (tplErr) throw tplErr;
        tplList = templates || [];
      }
      setAvailableSoftTemplates(tplList);

      if (!user || tplList.length === 0) {
        setTakenTemplatesMap({});
        return;
      }

      const templateIds = tplList.map((t) => t.id);

      // fetch evaluations for this user that use these templates
      const personIdLookup = await getPersonIdForUser(user);
      const evaluatedLookupId = personIdLookup || user.id;
      const { data: existingEvals, error: evalErr } = await supabase
      .from('evaluations')
      .select('template_id')
      .eq('evaluated_id', evaluatedLookupId)
      .in('template_id', templateIds);

      if (evalErr) throw evalErr;

      const taken: Record<string, boolean> = {};
      (existingEvals || []).forEach((e: any) => {
        if (e.template_id) taken[e.template_id] = true;
      });

      setTakenTemplatesMap(taken);
    } catch (error) {
      console.error('Error loading available soft-skill templates:', error);
    }
  };

    const handleAdminTakeTemplate = async (template: EvaluationTemplate) => {
        if (!user) return;
      // allow admin to create a test evaluation for themselves
      try {
        const { data, error } = await supabase
          .from('evaluations')
          .insert([
            {
              template_id: template.id,
                evaluator_id: user.id,
                evaluated_id: user.id,
              status: 'pending',
            },
          ])
          .select('*')
          .single();

        if (error) throw error;

        if (data) setSelectedEvaluation(data as Evaluation);
      } catch (err) {
        console.error('Error creating admin test evaluation', err);
        alert('No se pudo crear la evaluación de prueba');
      }
    };

  const handleStartEvaluation = (evaluation: Evaluation) => {
    setSelectedEvaluation(evaluation);
  };

  const handleTakeForEvaluated = async (template: EvaluationTemplate, evaluatedId: string) => {
    if (!user) return;
    if (!evaluatedId) { alert('Selecciona un colaborador para evaluar'); return; }

    try {
      const evaluatorId = await getPersonIdForUser(user) || (user as any).id;
      const { data, error } = await supabase
        .from('evaluations')
        .insert([
          {
            template_id: template.id,
            evaluator_id: evaluatorId,
            evaluated_id: evaluatedId,
            status: 'pending',
          },
        ])
        .select('*')
        .single();

      if (error) throw error;

      setSelectedEvaluation(data as Evaluation);
    } catch (err) {
      console.error('Error creating evaluation for evaluated:', err);
      alert('No se pudo crear la evaluación');
    }
  };

  const handleTakeSoftSkill = async (template: EvaluationTemplate) => {
    if (!user) return;

    // double-check if already taken
    if (takenTemplatesMap[template.id]) {
      alert('Ya has tomado esta prueba');
      return;
    }

    try {
      const collabId = await getPersonIdForUser(user) || (user as any).id;
      const { data, error } = await supabase
        .from('evaluations')
        .insert([
          {
            template_id: template.id,
            evaluator_id: collabId,
            evaluated_id: collabId,
            status: 'pending',
          },
        ])
        .select('*')
        .single();

      if (error) throw error;

      // mark as taken locally
      setTakenTemplatesMap((m) => ({ ...m, [template.id]: true }));

      if (data) {
        setSelectedEvaluation(data as Evaluation);
      }
    } catch (error) {
      console.error('Error creating evaluation:', error);
      alert('No se pudo iniciar la evaluación');
    }
  };

  const handleCloseForm = () => {
    setSelectedEvaluation(null);
    loadEvaluations();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-orange-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Pendiente',
      in_progress: 'En Progreso',
      completed: 'Completada',
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  if (selectedEvaluation) {
    return <EvaluationForm evaluation={selectedEvaluation} onClose={handleCloseForm} />;
  }

  const currentPersonId = personId || (user ? (user as any).id : null);
  const myEvaluations = evaluations.filter((e) => e.evaluator_id === currentPersonId);
  const otherEvaluations = evaluations.filter((e) => e.evaluator_id !== currentPersonId);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Evaluaciones</h1>
        <p className="text-gray-600">Gestiona y completa tus evaluaciones</p>
      </div>
      {activePeriod && (
        <div className="mb-6 p-4 rounded bg-yellow-50 border border-yellow-200">
          <div className="font-medium">Periodo activo: {activePeriod.year}</div>
          <div className="text-sm text-gray-700">Abierto desde {new Date(activePeriod.start_date).toLocaleDateString()} hasta {new Date(activePeriod.end_date).toLocaleDateString()}</div>
        </div>
      )}
      {/* Available global soft-skills tests (single-use per user) */}
      {availableSoftTemplates.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Pruebas Disponibles</h2>
          <div className="space-y-3">
            {availableSoftTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow flex items-center justify-between"
              >
                <div>
                  <h3 className="font-semibold text-gray-900">{template.name}</h3>
                  <p className="text-sm text-gray-600">{template.description}</p>
                </div>
                <div>
                  {user?.role === 'admin' ? (
                    <button onClick={() => handleAdminTakeTemplate(template)} className="px-4 py-2 rounded-lg text-white bg-green-600 hover:bg-green-700">Crear prueba (Admin)</button>
                  ) : (() => {
                    // Allow any user to take the test for themselves; optionally evaluate a colleague
                    return (
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={!!evaluateOther[template.id]}
                            onChange={(e) => setEvaluateOther({ ...evaluateOther, [template.id]: e.target.checked })}
                          />
                          Evaluar a otro colaborador
                        </label>

                        {evaluateOther[template.id] ? (
                          <>
                            <select className="border rounded p-2 text-sm" value={selectedCandidate[template.id] || ''} onChange={(e) => setSelectedCandidate({ ...selectedCandidate, [template.id]: e.target.value })}>
                              <option value="">Selecciona colaborador</option>
                              {(() => {
                                const relationCandidates = evaluationCandidatesByTemplate[template.id] || [];
                                const candidateList = relationCandidates.length > 0 ? relationCandidates : managerCandidates;
                                console.debug('[EvaluationsModule UI] Template:', template.name, 'relationCandidates:', relationCandidates.length, 'managerCandidates:', managerCandidates.length, 'using:', candidateList.length);
                                return candidateList.map((c) => (
                                  <option key={c.id} value={c.id}>{c.full_name} ({c.role || c.identification})</option>
                                ));
                              })()}
                            </select>
                            <button
                              onClick={() => handleTakeForEvaluated(template, selectedCandidate[template.id])}
                              className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700"
                            >
                              Crear evaluación
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleTakeSoftSkill(template)}
                            disabled={!!takenTemplatesMap[template.id]}
                            className={`px-4 py-2 rounded-lg text-white transition-colors ${
                              takenTemplatesMap[template.id] ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                          >
                            {takenTemplatesMap[template.id] ? 'Ya tomado' : 'Tomar prueba'}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {myEvaluations.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Mis Evaluaciones Pendientes</h2>
          <div className="space-y-3">
            {myEvaluations
              .filter((e) => e.status !== 'completed')
              .map((evaluation) => (
                <div
                  key={evaluation.id}
                  className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {getStatusIcon(evaluation.status)}
                        <h3 className="font-semibold text-gray-900">{evaluation.template?.name}</h3>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">
                        Evaluando a: <span className="font-medium">{evaluation.evaluated?.full_name}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Creada: {new Date(evaluation.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleStartEvaluation(evaluation)}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      {evaluation.status === 'pending' ? 'Comenzar' : 'Continuar'}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {user?.role !== 'employee' && otherEvaluations.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Todas las Evaluaciones</h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Formulario</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Evaluador</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Evaluado</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Estado</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {otherEvaluations.map((evaluation) => (
                    <tr key={evaluation.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{evaluation.template?.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{evaluation.evaluator?.full_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{evaluation.evaluated?.full_name}</td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            evaluation.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : evaluation.status === 'in_progress'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {getStatusLabel(evaluation.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(evaluation.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {evaluations.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No hay evaluaciones disponibles en este momento
        </div>
      )}
    </div>
  );
}
