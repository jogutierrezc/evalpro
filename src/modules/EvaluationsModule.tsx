import { PageHeader } from '../components/ui/PageHeader';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Evaluation, EvaluationTemplate, User } from '../lib/supabase';
import { FileText, Clock, CheckCircle, Play } from 'lucide-react';
import { EvaluationForm } from './evaluations/EvaluationForm';


interface EvaluationsModuleProps {
  onNavigate: (module: string) => void;
}

export function EvaluationsModule({ onNavigate }: EvaluationsModuleProps) {
  const { user } = useAuth();
  const [activePeriod, setActivePeriod] = useState<null | { id: string; year: number; start_date: string; end_date: string }>(null);
  const [evaluations, setEvaluations] = useState<
    (Evaluation & { template?: EvaluationTemplate; evaluator?: User; evaluated?: User })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);
  const [availableSoftTemplates, setAvailableSoftTemplates] = useState<EvaluationTemplate[]>([]);
  const [takenTemplatesMap, setTakenTemplatesMap] = useState<Record<string, boolean>>({});
  const [canSelfEval, setCanSelfEval] = useState<Record<string, boolean>>({});
  const [canEvaluateOthers, setCanEvaluateOthers] = useState<Record<string, boolean>>({});

  const [selectedCandidate, setSelectedCandidate] = useState<Record<string, string>>({});
  const [evaluateOther, setEvaluateOther] = useState<Record<string, boolean>>({});
  const [personId, setPersonId] = useState<string | null>(null);
  const [evaluationCandidatesByTemplate, setEvaluationCandidatesByTemplate] = useState<Record<string, User[]>>({});
  const [, setDiagnostic] = useState<any>(null);
  useState(false);

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

      // Filtrar por período activo si existe (usando fecha local con timezone)
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: periodData } = await supabase
        .from('evaluation_periods')
        .select('id, start_date, end_date, is_active')
        .lte('start_date', todayStr)
        .gte('end_date', todayStr)
        .limit(1);
      let currentPeriod = (periodData && periodData.length > 0) ? periodData[0] : null;
      
      // Verificar is_active: si el período existe pero is_active es false, no se considera activo
      if (currentPeriod && currentPeriod.is_active === false) {
        currentPeriod = null;
      }

      if (currentPeriod && user?.role !== 'admin') {
        query = query.eq('period_id', currentPeriod.id);
      }

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

      // Consultas en lote (3 en total) en lugar de 3 por evaluación (antes N+1).
      const rows = evaluationsData || [];
      const uniq = (vals: (string | null | undefined)[]) => [...new Set(vals.filter((v): v is string => !!v))];
      const templateIds = uniq(rows.map((e) => e.template_id));
      const userIds = uniq(rows.flatMap((e) => [e.evaluator_id, e.evaluated_id]));

      const [templatesRes, usersRes] = await Promise.all([
        templateIds.length
          ? supabase.from('evaluation_templates').select('*').in('id', templateIds)
          : Promise.resolve({ data: [] as any[] }),
        userIds.length
          ? supabase.from('users').select('*').in('id', userIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const templateById = new Map((templatesRes.data || []).map((t: any) => [t.id, t]));
      const userById = new Map((usersRes.data || []).map((u: any) => [u.id, u]));

      const evaluationsWithDetails = rows.map((evaluation) => ({
        ...evaluation,
        template: templateById.get(evaluation.template_id) ?? null,
        evaluator: userById.get(evaluation.evaluator_id) ?? null,
        evaluated: userById.get(evaluation.evaluated_id) ?? null,
      }));

      setEvaluations(evaluationsWithDetails);
    } catch (error) {
      console.error('Error loading evaluations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableSoftTemplates = async () => {
    try {


      // Find active period covering today (fecha local con timezone)
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: periodData } = await supabase
        .from('evaluation_periods')
        .select('*')
        .lte('start_date', todayStr)
        .gte('end_date', todayStr)
        .limit(1);

      let period = (periodData && periodData.length > 0) ? periodData[0] : null;
      
      // Verificar is_active: si el período existe pero is_active es false, no se considera activo
      if (period && period.is_active === false) {
        period = null;
      }
      
      setActivePeriod(period || null);

      // Normalize user's role to canonical role.key using `roles` table (fallback: try matching by label/key,
      // remove diacritics and case differences). This reduces cases where older rows store labels instead of keys.
      let canonicalRole: string | null = null;
      const normalizeStr = (s: any) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[^\w\s-]/g, '').replace(/[\u0300-\u036f]/g, '').trim();
      let rolesData: any[] = [];
      if (user) {
        try {
          const { data } = await supabase.from('roles').select('*');
          rolesData = (data as any) || [];
          if (rolesData && rolesData.length > 0) {
            // try direct key match
            const byKey = rolesData.find((r: any) => r.key === user.role);
            if (byKey) canonicalRole = byKey.key;
            else {
              // try matching by label after normalizing accents/case
              const target = normalizeStr(user.role);
              const byLabel = rolesData.find((r: any) => normalizeStr(r.label) === target || normalizeStr(r.key) === target);
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
        console.debug('[Evaluations] canonicalRole=', canonicalRole, 'allowedKeys=', allowedKeys, 'fts_count=', (fts || []).length);
        // Also include form types that explicitly target this user's role via form_type_relations (evaluated_role_key)
        let relationKeys: string[] = [];
        // ensure allowedKeys are canonical form_type keys; if not, try to resolve labels
        let normalizedAllowed: string[] = [];

        // Use ID-based logic if available
        const userRoleId = user?.role_id;

        if (canonicalRole) {
          // Una sola lectura de form_types (antes: una consulta por clave permitida).
          const { data: formTypeRows } = allowedKeys.length
            ? await supabase.from('form_types').select('key,label')
            : { data: [] as any[] };
          const formTypeKeys = new Set((formTypeRows || []).map((f: any) => f.key));
          for (const k of allowedKeys) {
            let kKey = k;
            if (!formTypeKeys.has(k)) {
              const matched = (formTypeRows || []).find((f: any) => (f.label || '').toString().toLowerCase() === (k || '').toString().toLowerCase());
              if (matched) kKey = matched.key;
            }
            normalizedAllowed.push(kKey);
          }

          // Fetch relations where user is either evaluated OR evaluator
          const { data: allRels } = await supabase.from('form_type_relations')
            .select('*')
            .in('form_type_key', normalizedAllowed);

          const userRoleNorm = normalizeStr(canonicalRole);
          const relevantRels = (allRels || []).filter((r: any) => {
            if (userRoleId) {
              if (r.evaluated_role_id === userRoleId || r.evaluator_role_id === userRoleId) return true;
            }
            return normalizeStr(r.evaluated_role_key) === userRoleNorm || normalizeStr(r.evaluator_role_key) === userRoleNorm;
          });
          relationKeys = relevantRels.map((r: any) => r.form_type_key);
        }

        const allowedForUser = Array.from(new Set([
          ...(fts || []).filter((ft: any) => {
            if (userRoleId && ft.role_ids && Array.isArray(ft.role_ids)) {
              if (ft.role_ids.includes(userRoleId)) return true;
            }
            return Array.isArray(ft.roles) ? ft.roles.includes(canonicalRole as any) : false;
          }).map((ft: any) => ft.key),
          ...relationKeys
        ]));
        console.debug('[Evaluations] relationKeys=', relationKeys, 'allowedForUser=', allowedForUser);

        // Save diagnostic info for UI inspection
        setDiagnostic({
          canonicalRole,
          allowedKeys,
          normalizedAllowed,
          relationKeys,
          allowedForUser,
          ftsCount: (fts || []).length,
        });

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

            // Load all form_type_relations and filter client-side using normalized comparisons.
            let evaluatorRels: any[] = [];
            try {
              const { data: allRels } = await supabase.from('form_type_relations').select('form_type_key,evaluated_role_key,evaluator_role_key');
              const rels = (allRels || []) as any[];

              // build a set of normalized evaluator identifiers to match against (key, label, raw role)
              const normalizedTargets = new Set<string>();
              if (canonicalRole) normalizedTargets.add(normalizeStr(canonicalRole));
              if (user && (user as any).role) normalizedTargets.add(normalizeStr((user as any).role));
              // include any roles from rolesData that match the user's role normalized
              const matchedRoleEntry = rolesData && rolesData.length > 0 ? rolesData.find((r: any) => normalizeStr(r.key) === normalizeStr((user as any).role) || normalizeStr(r.label) === normalizeStr((user as any).role)) : null;
              if (matchedRoleEntry) {
                normalizedTargets.add(normalizeStr(matchedRoleEntry.key));
                normalizedTargets.add(normalizeStr(matchedRoleEntry.label));
              }

              evaluatorRels = rels.filter((rel) => {
                const relEvalNorm = normalizeStr(rel.evaluator_role_key || '');
                return normalizedTargets.has(relEvalNorm);
              });
            } catch (e) {
              evaluatorRels = [];
            }

            console.debug('[EvaluationsModule] Evaluator relations found (normalized filter):', evaluatorRels);

            // group by form_type_key -> evaluated_role_keys (deduplicated)
            const relsByFormType: Record<string, string[]> = {};
            (evaluatorRels || []).forEach((rel: any) => {
              if (!relsByFormType[rel.form_type_key]) relsByFormType[rel.form_type_key] = [];
              if (!relsByFormType[rel.form_type_key].includes(rel.evaluated_role_key)) relsByFormType[rel.form_type_key].push(rel.evaluated_role_key);
            });

            // Pre-fetch potential candidates (Strict & Office)
            const evaluatorId = (user as any).id;

            // 1. Strict Candidates (Direct Subordinates)
            const { data: managedRows } = await supabase.from('user_managers').select('user_id').eq('manager_id', evaluatorId);
            const managedIdsFromTable = (managedRows || []).map((r: any) => r.user_id).filter(Boolean);
            const { data: directManaged } = await supabase.from('users').select('id').eq('manager_id', evaluatorId);
            const directManagedIds = (directManaged || []).map((r: any) => r.id).filter(Boolean);
            const strictCandidateIds = Array.from(new Set([...(managedIdsFromTable || []), ...(directManagedIds || [])]));

            // 2. Office Candidates (Same Office/Campus)
            // load evaluator's office links
            const { data: evalLinks } = await supabase.from('collaborator_offices').select('office_id').eq('collaborator_id', user.id);
            const officeIds = (evalLinks || []).map((l: any) => l.office_id).filter(Boolean);
            let officeCandidateIds: string[] = [];
            if (officeIds.length > 0) {
              const { data: colLinks } = await supabase.from('collaborator_offices').select('collaborator_id').in('office_id', officeIds);
              officeCandidateIds = Array.from(new Set((colLinks || []).map((l: any) => l.collaborator_id).filter(Boolean)));
            }
            // fallback to user.office_id
            if (user.office_id) {
              const { data: officeUsers } = await supabase.from('users').select('id').eq('office_id', user.office_id);
              const officeUserIds = (officeUsers || []).map((u: any) => u.id).filter(Boolean);
              officeCandidateIds = Array.from(new Set([...officeCandidateIds, ...officeUserIds]));
            }
            // Remove self from office candidates
            officeCandidateIds = officeCandidateIds.filter(id => id !== evaluatorId);

            // Fetch user details for all potential candidates to filter by role
            let allPotentialUsers: any[] = [];

            // Fix: Allow broad access for high-level roles (e.g. Vicerrector evaluating Directors)
            // This ensures they can see candidates across the entire campus, not just their office or direct reports.
            const isBroadAccess = ['vicerrector', 'rector'].some(k => normalizeStr(canonicalRole).includes(k));

            if (isBroadAccess) {
              console.debug('[EvaluationsModule] High-level role detected, loading campus users for broad candidate search.');
              const evaluatorCampus = (user as any).campus;
              let query = supabase.from('users').select('*');

              // If specific campus, limit to it. If 'Todas' or undefined, fetch all (assuming high-level oversight).
              if (evaluatorCampus && evaluatorCampus !== 'Todas') {
                query = query.eq('campus', evaluatorCampus);
              }

              const { data: broadUsers } = await query;
              const userMap = new Map();
              (broadUsers || []).forEach((u: any) => userMap.set(u.id, u));

              // Ensure strict candidates (direct reports) are included even if different campus
              const missingStrict = strictCandidateIds.filter(id => !userMap.has(id));
              if (missingStrict.length > 0) {
                const { data: extra } = await supabase.from('users').select('*').in('id', missingStrict);
                (extra || []).forEach((u: any) => userMap.set(u.id, u));
              }

              allPotentialUsers = Array.from(userMap.values());
            } else {
              // Standard behavior: Restricted to Office + Direct Reports
              const allPotentialIds = Array.from(new Set([...strictCandidateIds, ...officeCandidateIds]));
              if (allPotentialIds.length > 0) {
                const { data: usersData } = await supabase.from('users').select('*').in('id', allPotentialIds);
                allPotentialUsers = usersData || [];
              }
            }

            // ─── Filter candidates by period_collaborators (solo si hay datos asignados) ───
            if (period && allPotentialUsers.length > 0) {
              const { data: pcData } = await supabase
                .from('period_collaborators')
                .select('user_id')
                .eq('period_id', period.id)
                .eq('is_active', true);
              const periodUserIds = new Set((pcData || []).map((r: any) => r.user_id));
              if (periodUserIds.size > 0) {
                allPotentialUsers = allPotentialUsers.filter(u => periodUserIds.has(u.id));
              }
              // Si period_collaborators está vacío, se muestran todos los candidatos normales
            }

            // Helper to filter users by role list
            const filterUsersByRoles = (users: any[], targetRoles: string[]) => {
              const targetRolesNormalized = new Set<string>();
              // resolve labels
              const roleKeyToLabel: Record<string, string> = {};
              (rolesData || []).forEach((r: any) => { roleKeyToLabel[r.key] = r.label; });

              targetRoles.forEach(r => targetRolesNormalized.add(normalizeStr(r)));
              targetRoles.forEach(k => {
                const label = roleKeyToLabel[k];
                if (label) targetRolesNormalized.add(normalizeStr(label));
              });

              return users.filter(u => {
                const r = normalizeStr(u.role);
                return targetRolesNormalized.has(r);
              });
            };

            // for each template in tplList, resolve candidates
            const candidatesMap: Record<string, User[]> = {};
            const selfEvalMap: Record<string, boolean> = {};
            const evalOthersMap: Record<string, boolean> = {};

            // Create lookup map for form types to check roles
            const formTypeMap: Record<string, any> = {};
            (fts || []).forEach((ft: any) => { formTypeMap[ft.key] = ft; });

            for (const tpl of tplList) {
              const evaluatedRoles = relsByFormType[tpl.type] || [];
              console.debug('[EvaluationsModule] Template:', tpl.name, 'type:', tpl.type, 'evaluatedRoles:', evaluatedRoles, 'canonicalRole:', canonicalRole);

              // Determine if self-evaluation is allowed
              let canSelf = false;
              const ft = formTypeMap[tpl.type];

              // 1. Check form_type_relations for self-evaluation (PRIORITARIO)
              // Si existe una relación donde evaluator_role_key == evaluated_role_key == user's role
              // entonces es autoevaluación permitida
              if (canonicalRole) {
                const userRoleNorm = normalizeStr(canonicalRole);
                if (evaluatedRoles.some(r => normalizeStr(r) === userRoleNorm)) {
                  canSelf = true;
                  console.debug('[EvaluationsModule] Self-eval ALLOWED via form_type_relations for', tpl.name);
                }
              }

              // 2. Fallback: Direct role assignment in form_type.roles
              // Solo si no se encontró en relations, verificar en form_types.roles
              if (!canSelf && ft && ft.roles && Array.isArray(ft.roles) && canonicalRole) {
                if (ft.roles.includes(canonicalRole) ||
                  ft.roles.some((r: string) => normalizeStr(r) === normalizeStr(canonicalRole))) {
                  canSelf = true;
                  console.debug('[EvaluationsModule] Self-eval ALLOWED via form_types.roles for', tpl.name);
                }
              }

              selfEvalMap[tpl.id] = canSelf;
              console.debug('[EvaluationsModule] Final canSelf for', tpl.name, ':', canSelf);

              if (evaluatedRoles.length === 0) {
                candidatesMap[tpl.id] = [];
                evalOthersMap[tpl.id] = false;
                continue;
              }

              // Filter strict candidates by role
              const strictUsers = allPotentialUsers.filter(u => strictCandidateIds.includes(u.id));
              const strictFiltered = filterUsersByRoles(strictUsers, evaluatedRoles);

              if (strictFiltered.length > 0) {
                candidatesMap[tpl.id] = strictFiltered;
                console.debug(`[EvaluationsModule] Template ${tpl.name}: Found ${strictFiltered.length} strict candidates.`);
              } else {
                // Fallback to office candidates, BUT filtered by role
                const officeUsers = allPotentialUsers.filter(u => officeCandidateIds.includes(u.id));
                const officeFiltered = filterUsersByRoles(officeUsers, evaluatedRoles);

                // Apply strict campus filter for office fallback
                const evaluatorCampus = (user as any).campus || '';
                const finalOfficeCandidates = officeFiltered.filter(cand => {
                  const candCampus = (cand.campus || '').toString();
                  const campusMatches = !evaluatorCampus || evaluatorCampus === 'Todas' || evaluatorCampus === '' ? true : candCampus === evaluatorCampus;
                  return campusMatches;
                });

                candidatesMap[tpl.id] = finalOfficeCandidates;
                console.debug(`[EvaluationsModule] Template ${tpl.name}: Found ${finalOfficeCandidates.length} office fallback candidates (filtered by role).`);
              }

              // Check if there are candidates to evaluate (excluding self, which is already excluded from officeCandidates)
              // strictCandidates might include self if I manage myself? Unlikely.
              // But let's be safe and filter self out for evalOthersMap
              const others = (candidatesMap[tpl.id] || []).filter(c => c.id !== user.id);
              evalOthersMap[tpl.id] = others.length > 0;
            }
            setEvaluationCandidatesByTemplate(candidatesMap);
            setCanSelfEval(selfEvalMap);
            setCanEvaluateOthers(evalOthersMap);

            // Update diagnostics
            setDiagnostic((d: any) => ({
              ...(d || {}),
              candidatesCountByTemplate: Object.fromEntries(Object.entries(candidatesMap).map(([k, v]) => [k, (v || []).length])),
              strictCandidatesCount: strictCandidateIds.length,
              officeCandidatesCount: officeCandidateIds.length
            }));

          } catch (err) {
            console.error('Error loading candidates', err);
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

      // Default: no active period — NO ALLOW NEW EVALUATIONS
      setAvailableSoftTemplates([]);
      setTakenTemplatesMap({});
      return;
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
            period_id: activePeriod?.id || null,
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
            period_id: activePeriod?.id || null,
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
            period_id: activePeriod?.id || null,
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
  const otherEvaluations = evaluations.filter((e) => e.evaluator_id !== currentPersonId && e.evaluated_id !== currentPersonId);

  return (
    <div className="space-y-6">
      <PageHeader title="Evaluaciones" description="Gestiona y completa tus evaluaciones" />
      {activePeriod && (
        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Período Activo</span>
          </div>
          <div className="text-lg font-bold text-gray-900">Período {activePeriod.year}</div>
          <div className="text-sm text-gray-600 mt-0.5">
            <span className="font-medium">Inicio:</span> {new Date(activePeriod.start_date).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })} &nbsp;|&nbsp;
            <span className="font-medium">Cierre:</span> {new Date(activePeriod.end_date).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {(() => {
              const now = new Date();
              const end = new Date(activePeriod.end_date);
              const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              if (daysLeft > 0) return `Quedan ${daysLeft} día${daysLeft !== 1 ? 's' : ''} para completar las evaluaciones.`;
              if (daysLeft === 0) return 'Último día del período de evaluación.';
              return 'El período de evaluación ha finalizado.';
            })()}
          </div>
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
                    const canSelf = canSelfEval[template.id];
                    const canOther = canEvaluateOthers[template.id];
                    const isEvaluatingOther = evaluateOther[template.id] || (!canSelf && canOther);

                    if (!canSelf && !canOther) {
                      return <span className="text-sm text-gray-500 italic">No disponible para tu rol</span>;
                    }

                    return (
                      <div className="flex items-center gap-2">
                        {canSelf && canOther && (
                          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!evaluateOther[template.id]}
                              onChange={(e) => setEvaluateOther({ ...evaluateOther, [template.id]: e.target.checked })}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Evaluar a otro colaborador
                          </label>
                        )}

                        {/* If only canOther, show label as static text or just show the dropdown directly */}
                        {!canSelf && canOther && (
                          <span className="text-sm font-medium text-gray-700 mr-2">Evaluación de Colaborador:</span>
                        )}

                        {isEvaluatingOther ? (
                          <>
                            <select
                              className="border rounded p-2 text-sm max-w-[200px]"
                              value={selectedCandidate[template.id] || ''}
                              onChange={(e) => setSelectedCandidate({ ...selectedCandidate, [template.id]: e.target.value })}
                            >
                              <option value="">Selecciona colaborador</option>
                              {(() => {
                                const relationCandidates = evaluationCandidatesByTemplate[template.id] || [];
                                // Filter out self just in case
                                const candidateList = relationCandidates.filter(c => c.id !== user?.id);
                                return candidateList.map((c) => (
                                  <option key={c.id} value={c.id}>{c.full_name} ({c.role || c.identification})</option>
                                ));
                              })()}
                            </select>
                            <button
                              onClick={() => handleTakeForEvaluated(template, selectedCandidate[template.id])}
                              className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={!selectedCandidate[template.id]}
                            >
                              Crear evaluación
                            </button>
                          </>
                        ) : (
                          takenTemplatesMap[template.id] ? (
                            <button
                              onClick={() => onNavigate('self-report')}
                              className="px-4 py-2 rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors flex items-center gap-2"
                            >
                              <FileText className="w-4 h-4" />
                              Leer mi informe
                            </button>
                          ) : (
                            <button
                              onClick={() => handleTakeSoftSkill(template)}
                              className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                            >
                              Tomar prueba
                            </button>
                          )
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
        <>
          {/* Pending Evaluations */}
          {myEvaluations.some(e => e.status !== 'completed') && (
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

          {/* Completed Evaluations */}
          {myEvaluations.some(e => e.status === 'completed') && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Evaluaciones Realizadas</h2>
              <div className="space-y-3">
                {myEvaluations
                  .filter((e) => e.status === 'completed')
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
                            Evaluado: <span className="font-medium">{evaluation.evaluated?.full_name}</span>
                          </p>
                          <p className="text-xs text-gray-500">
                            Completada: {new Date(evaluation.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => window.open(`?module=technical-report&id=${evaluation.id}`, '_blank')}
                          className="flex items-center gap-2 bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                          Ver Informe Técnico
                        </button>
                      </div>
                    </div>
                  ))}

              </div>
            </div>
          )}
        </>
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
                          className={`px-2 py-1 rounded text-xs font-medium ${evaluation.status === 'completed'
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
