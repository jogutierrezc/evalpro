import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

import {
  Mail, CheckCircle, Loader2, Send, AlertCircle, RefreshCw,
  ChevronDown, ChevronRight, UserCheck, Clock, FileText, Users,
  Filter, Building2, MapPin, Search, Eye, Settings, Edit3,
} from 'lucide-react';

interface CompletedEvaluation {
  evaluationId: string;
  templateName: string;
  evaluatedName: string;
  completedAt: string;
}

interface NotifiableUser {
  userId: string;
  fullName: string;
  email: string | null;
  role: string;
  campus: string;
  officeName: string;
  completions: CompletedEvaluation[];
  evaluatorCount: number;
  // Stats
  totalEvals: number;
  completedEvals: number;
  allDone: boolean;
}

interface SentNotification {
  id: string;
  evaluator_id: string;
  evaluator_name: string;
  evaluator_email: string;
  sent_at: string;
  opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  click_count: number;
  source: string;
  status: string;
  evaluations_count: number;
}

export default function NotificationsModule() {
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [notifiableUsers, setNotifiableUsers] = useState<NotifiableUser[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [campusList, setCampusList] = useState<string[]>([]);
  const [officesList, setOfficesList] = useState<{ id: string; name: string }[]>([]);
  const [sentHistory, setSentHistory] = useState<SentNotification[]>([]);

  // Filters
  const [filterCampus, setFilterCampus] = useState('');
  const [filterOffice, setFilterOffice] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showTab, setShowTab] = useState<'pending' | 'history' | 'config'>('pending');

  // Email config
  const [emailConfig, setEmailConfig] = useState<any>({
    from_email: '',
    subject: '',
    html: '',
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Send state
  const [sendingMap, setSendingMap] = useState<Record<string, boolean>>({});
  const [sentMap, setSentMap] = useState<Record<string, 'sent' | 'failed' | null>>({});
  const [expandedUser, setExpandedUser] = useState<Set<string>>(new Set());
  const [expandedLog, setExpandedLog] = useState<Set<string>>(new Set());
  const [apiBaseUrl, setApiBaseUrl] = useState('');

  useEffect(() => {
    const isProd = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');
    setApiBaseUrl(isProd ? '' : window.location.origin);
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    setLoadingProgress(5);

    try {
      setLoadingStep('Cargando configuración...');
      setLoadingProgress(10);
      await loadEmailConfig();
      await loadSentHistory();

      setLoadingStep('Detectando período activo...');
      setLoadingProgress(20);
      await loadPendingData();

      setLoadingProgress(100);
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const loadEmailConfig = async () => {
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'email_template')
      .maybeSingle();

    if (data?.value) {
      setEmailConfig({
        from_email: data.value.from_email || 'notificaciones@evalpro.udes.edu.co',
        subject: data.value.subject || '✅ Evaluaciones Completadas — EvalPro UDES',
        html: data.value.html || '',
      });
    }
  };

  const saveEmailConfig = async () => {
    setSavingConfig(true);
    setConfigSaved(false);
    try {
      const { error } = await supabase.from('admin_settings').upsert({
        key: 'email_template',
        value: emailConfig,
      }, { onConflict: 'key' });
      if (error) throw error;
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (err: any) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const loadSentHistory = async () => {
    const { data } = await supabase
      .from('notification_log')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(100);

    setSentHistory((data as SentNotification[]) || []);
  };

  const loadPendingData = async () => {
    setLoadingStep('Detectando período activo...');
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: periodData } = await supabase
      .from('evaluation_periods')
      .select('id, year, is_active')
      .lte('start_date', todayStr)
      .gte('end_date', todayStr)
      .limit(1);

    const activePeriod = (periodData?.[0]?.is_active !== false) ? periodData?.[0] : null;
    if (!activePeriod) {
      setError('No hay período activo.');
      return;
    }

    setLoadingStep(`Período ${activePeriod.year} — Cargando datos...`);
    setLoadingProgress(25);

    // Cargar datos en paralelo: evaluaciones + tablas auxiliares para cálculo esperado
    const [
      { data: evaluations },
      { data: templates },
      { data: users },
      { data: offices },
      { data: periodFormTypes },
      { data: formTypeRelations },
      { data: formTypes },
      { data: roles },
      { data: userManagers },
      { data: periodCollaborators },
      { data: collaboratorOffices },
    ] = await Promise.all([
      supabase.from('evaluations').select('id, evaluator_id, evaluated_id, template_id, status, completed_at').eq('period_id', activePeriod.id),
      supabase.from('evaluation_templates').select('id, name, type').eq('is_active', true),
      supabase.from('users').select('id, full_name, email, role, campus, office_id'),
      supabase.from('offices').select('id, name'),
      supabase.from('evaluation_period_form_types').select('form_type_key').eq('period_id', activePeriod.id),
      supabase.from('form_type_relations').select('form_type_key, evaluator_role_key, evaluated_role_key'),
      supabase.from('form_types').select('key, roles, role_ids'),
      supabase.from('roles').select('key, label'),
      supabase.from('user_managers').select('user_id, manager_id'),
      supabase.from('period_collaborators').select('user_id').eq('period_id', activePeriod.id).eq('is_active', true),
      supabase.from('collaborator_offices').select('collaborator_id, office_id'),
    ]);

    setLoadingStep('Procesando datos...');
    setLoadingProgress(40);

    // --- Construir mapas auxiliares ---
    const templateMap = Object.fromEntries((templates || []).map((t: any) => [t.id, t.name]));
    const officeMap = Object.fromEntries((offices || []).map((o: any) => [o.id, o.name]));
    setOfficesList((offices || []).map((o: any) => ({ id: o.id, name: o.name })));

    const userMap: Record<string, any> = {};
    const campuses = new Set<string>();
    (users || []).forEach((u: any) => {
      userMap[u.id] = u;
      campuses.add(u.campus || 'Sin Campus');
    });
    setCampusList(Array.from(campuses).sort());

    // Templates grouped by form_type_key (type field)
    const templatesByType: Record<string, { id: string; name: string }[]> = {};
    (templates || []).forEach((t: any) => {
      if (!templatesByType[t.type]) templatesByType[t.type] = [];
      templatesByType[t.type].push({ id: t.id, name: t.name });
    });

    // Form types allowed for this period
    const allowedFormTypeKeys = (periodFormTypes || []).map((r: any) => r.form_type_key);

    // Relations grouped by form_type_key
    const relationsByFormType: Record<string, { evaluatorRole: string; evaluatedRole: string }[]> = {};
    (formTypeRelations || []).forEach((rel: any) => {
      if (!relationsByFormType[rel.form_type_key]) relationsByFormType[rel.form_type_key] = [];
      relationsByFormType[rel.form_type_key].push({
        evaluatorRole: rel.evaluator_role_key,
        evaluatedRole: rel.evaluated_role_key,
      });
    });

    // Role normalization
    const normalizeStr = (s: any) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const roleKeyMap: Record<string, string> = {};
    (roles || []).forEach((r: any) => {
      roleKeyMap[r.key] = r.key;
      roleKeyMap[normalizeStr(r.key)] = r.key;
      if (r.label) roleKeyMap[normalizeStr(r.label)] = r.key;
    });
    const resolveRoleKey = (role: string): string => roleKeyMap[role] || roleKeyMap[normalizeStr(role)] || role;

    // Subordinates by manager
    const subordinatesByManager: Record<string, string[]> = {};
    (userManagers || []).forEach((um: any) => {
      if (!subordinatesByManager[um.manager_id]) subordinatesByManager[um.manager_id] = [];
      if (!subordinatesByManager[um.manager_id].includes(um.user_id)) {
        subordinatesByManager[um.manager_id].push(um.user_id);
      }
    });
    (users || []).forEach((u: any) => {
      if (u.manager_id) {
        if (!subordinatesByManager[u.manager_id]) subordinatesByManager[u.manager_id] = [];
        if (!subordinatesByManager[u.manager_id].includes(u.id)) {
          subordinatesByManager[u.manager_id].push(u.id);
        }
      }
    });

    // Users by office
    const usersByOffice: Record<string, string[]> = {};
    (users || []).forEach((u: any) => {
      if (u.office_id) {
        if (!usersByOffice[u.office_id]) usersByOffice[u.office_id] = [];
        if (!usersByOffice[u.office_id].includes(u.id)) {
          usersByOffice[u.office_id].push(u.id);
        }
      }
    });
    const officeUsersMap: Record<string, string[]> = {};
    (collaboratorOffices || []).forEach((co: any) => {
      if (!officeUsersMap[co.office_id]) officeUsersMap[co.office_id] = [];
      if (!officeUsersMap[co.office_id].includes(co.collaborator_id)) {
        officeUsersMap[co.office_id].push(co.collaborator_id);
      }
    });

    const periodUserIds = new Set((periodCollaborators || []).map((r: any) => r.user_id));
    const hasPeriodCollaborators = periodUserIds.size > 0;

    setLoadingProgress(55);

    // --- Mapa de evaluaciones existentes en BD ---
    const existingEvals: Record<string, Record<string, Record<string, string>>> = {};
    (evaluations || []).forEach((ev: any) => {
      if (!existingEvals[ev.evaluator_id]) existingEvals[ev.evaluator_id] = {};
      if (!existingEvals[ev.evaluator_id][ev.evaluated_id]) existingEvals[ev.evaluator_id][ev.evaluated_id] = {};
      existingEvals[ev.evaluator_id][ev.evaluated_id][ev.template_id] = ev.status;
    });

    // --- Calcular evaluaciones ESPERADAS por usuario desde form_type_relations ---
    // Similar a PendingEvaluationsModule: para cada usuario, determinar qué evaluaciones
    // DEBERÍA tener según su rol + relaciones + templates
    const expectedByUser: Record<string, {
      expectedTotal: number;
      completedCount: number;
      items: CompletedEvaluation[];
    }> = {};

    for (const user of (users || [])) {
      if (hasPeriodCollaborators && !periodUserIds.has(user.id)) continue;

      const userRoleKey = resolveRoleKey(user.role || '');
      const userRoleNorm = normalizeStr(userRoleKey);
      if (!userRoleNorm) continue;

      for (const [formTypeKey, rels] of Object.entries(relationsByFormType)) {
        const templatesForType = templatesByType[formTypeKey] || [];
        if (templatesForType.length === 0) continue;

        for (const rel of rels) {
          if (normalizeStr(rel.evaluatorRole) !== userRoleNorm) continue;

          const isSelfEval = normalizeStr(rel.evaluatorRole) === normalizeStr(rel.evaluatedRole);

          if (isSelfEval) {
            // Self-evaluation
            for (const tpl of templatesForType) {
              if (!expectedByUser[user.id]) expectedByUser[user.id] = { expectedTotal: 0, completedCount: 0, items: [] };
              expectedByUser[user.id].expectedTotal++;

              const status = existingEvals[user.id]?.[user.id]?.[tpl.id];
              if (status === 'completed') {
                expectedByUser[user.id].completedCount++;
                // Find the actual evaluation data for this completed item
                const evalItem = (evaluations || []).find(
                  (ev: any) => ev.evaluator_id === user.id && ev.evaluated_id === user.id && ev.template_id === tpl.id
                );
                if (evalItem) {
                  expectedByUser[user.id].items.push({
                    evaluationId: evalItem.id,
                    templateName: tpl.name,
                    evaluatedName: user.full_name,
                    completedAt: evalItem.completed_at,
                  });
                }
              }
            }
          } else {
            // Evaluation of others: SOLO subordinados directos (jerarquía manager)
            // NO incluimos compañeros de oficina porque genera falsos positivos:
            // el simple hecho de compartir oficina NO significa que deban evaluarse.
            // Las evaluaciones a compañeros de oficina ya son capturadas por el
            // fallback dbByEvaluator si existen en BD.
            const allCandidateIds = subordinatesByManager[user.id] || [];

            for (const candId of allCandidateIds) {
              const candidate = userMap[candId];
              if (!candidate) continue;
              if (hasPeriodCollaborators && !periodUserIds.has(candId)) continue;

              const candRoleNorm = normalizeStr(resolveRoleKey(candidate.role || ''));
              if (candRoleNorm !== normalizeStr(rel.evaluatedRole)) continue;

              // Mismo campus
              const userCampus = (user.campus || '').toLowerCase();
              const candCampus = (candidate.campus || '').toLowerCase();
              if (userCampus && userCampus !== 'todas' && userCampus !== 'todos' && userCampus !== candCampus) continue;

              for (const tpl of templatesForType) {
                if (!expectedByUser[user.id]) expectedByUser[user.id] = { expectedTotal: 0, completedCount: 0, items: [] };
                expectedByUser[user.id].expectedTotal++;

                const status = existingEvals[user.id]?.[candId]?.[tpl.id];
                if (status === 'completed') {
                  expectedByUser[user.id].completedCount++;
                  const evalItem = (evaluations || []).find(
                    (ev: any) => ev.evaluator_id === user.id && ev.evaluated_id === candId && ev.template_id === tpl.id
                  );
                  if (evalItem) {
                    expectedByUser[user.id].items.push({
                      evaluationId: evalItem.id,
                      templateName: tpl.name,
                      evaluatedName: candidate.full_name,
                      completedAt: evalItem.completed_at,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    setLoadingProgress(70);

    // --- Fallback: usuarios con evaluaciones reales en BD (aunque no aparezcan en relations) ---
    // Agrúpalos por evaluator_id con sus items completados
    const evaluatedMap = Object.fromEntries((users || []).map((u: any) => [u.id, u.full_name]));
    const dbByEvaluator: Record<string, { total: number; completed: number; items: CompletedEvaluation[] }> = {};
    (evaluations || []).forEach((ev: any) => {
      if (!dbByEvaluator[ev.evaluator_id]) {
        dbByEvaluator[ev.evaluator_id] = { total: 0, completed: 0, items: [] };
      }
      dbByEvaluator[ev.evaluator_id].total++;
      if (ev.status === 'completed') {
        dbByEvaluator[ev.evaluator_id].completed++;
        dbByEvaluator[ev.evaluator_id].items.push({
          evaluationId: ev.id,
          templateName: templateMap[ev.template_id] || 'Evaluación',
          evaluatedName: evaluatedMap[ev.evaluated_id] || 'Desconocido',
          completedAt: ev.completed_at,
        });
      }
    });

    // --- Merge: usar expected como referencia, pero incluir DB como respaldo ---
    const allUserIds = new Set([
      ...Object.keys(expectedByUser),
      ...Object.keys(dbByEvaluator),
    ]);

    setLoadingProgress(85);

    const results: NotifiableUser[] = [];

    for (const userId of allUserIds) {
      const userData = userMap[userId];
      if (!userData) continue;

      const expected = expectedByUser[userId];
      const dbData = dbByEvaluator[userId];

      const dbTotal = dbData?.total || 0;
      const expectedTotal = expected?.expectedTotal || 0;

      // totalEvals: usar datos reales de BD si existen (son la fuente autoritativa)
      // Si no tiene nada en BD pero se esperan evaluaciones (de form_type_relations),
      // mostrar el total esperado para que aparezca como pendiente
      const totalEvals = dbTotal > 0 ? dbTotal : expectedTotal;

      // completedEvals: lo que realmente se completó en BD
      const completedEvals = Math.max(expected?.completedCount || 0, dbData?.completed || 0);

      // allDone: basado SOLO en evaluaciones reales de BD.
      // Si completó todo lo que está en BD, está listo para notificar.
      // Las evaluaciones "esperadas" de form_type_relations que NO existen
      // en BD NO deben impedir el envío de la notificación.
      const allDone = dbData ? dbData.completed === dbData.total : false;

      // Items completados
      let completions: CompletedEvaluation[] = [];
      if (dbData && dbData.items.length > 0) {
        completions = dbData.items;
      } else if (expected && expected.items.length > 0) {
        completions = expected.items;
      }

      const uniqueEvaluated = new Set(completions.map(i => i.evaluatedName));

      results.push({
        userId,
        fullName: userData.full_name,
        email: userData.email,
        role: userData.role,
        campus: userData.campus || 'Sin Campus',
        officeName: officeMap[userData.office_id] || 'Sin Oficina',
        completions,
        evaluatorCount: uniqueEvaluated.size,
        totalEvals,
        completedEvals,
        allDone,
      });
    }

    results.sort((a, b) => a.fullName.localeCompare(b.fullName));
    setAllUsers(users || []);
    setNotifiableUsers(results);
  };

  const sendNotification = async (user: NotifiableUser) => {
    if (!user.email) {
      setSentMap(prev => ({ ...prev, [user.userId]: 'failed' }));
      alert(`El usuario ${user.fullName} no tiene correo registrado.`);
      return;
    }

    setSendingMap(prev => ({ ...prev, [user.userId]: true }));
    setSentMap(prev => ({ ...prev, [user.userId]: null }));

    try {
      const session = await supabase.auth.getSession();
      const accessToken = session?.data?.session?.access_token;
      const baseUrl = apiBaseUrl || '';

      const response = await fetch(`${baseUrl}/api/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          collaboratorEmail: user.email,
          collaboratorName: user.fullName,
          adminId: user.userId,
          evaluations: user.completions.map(c => ({
            templateName: c.templateName,
            evaluatedName: c.evaluatedName,
            completedAt: c.completedAt,
          })),
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Error al enviar');

      setSentMap(prev => ({ ...prev, [user.userId]: 'sent' }));
      await loadSentHistory(); // Refresh history
    } catch (err: any) {
      console.error('Error sending:', err);
      setSentMap(prev => ({ ...prev, [user.userId]: 'failed' }));
      alert(`Error: ${err.message}`);
    } finally {
      setSendingMap(prev => ({ ...prev, [user.userId]: false }));
    }
  };

  const toggleUser = (id: string) => {
    setExpandedUser(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleLog = (id: string) => {
    setExpandedLog(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Filters
  const filteredUsers = useMemo(() => {
    let data = notifiableUsers;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      data = data.filter(u =>
        u.fullName.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.role?.toLowerCase().includes(term)
      );
    }
    if (filterCampus) data = data.filter(u => u.campus === filterCampus);
    if (filterOffice) data = data.filter(u => u.officeName === filterOffice);
    return data;
  }, [notifiableUsers, searchTerm, filterCampus, filterOffice]);

  const stats = useMemo(() => {
    const total = notifiableUsers.length;
    const allDone = notifiableUsers.filter(u => u.allDone).length;
    const pending = notifiableUsers.filter(u => !u.allDone).length;
    const sent = Object.values(sentMap).filter(v => v === 'sent').length;
    return { total, allDone, pending, sent, historyCount: sentHistory.length };
  }, [notifiableUsers, sentMap, sentHistory]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-md w-full">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-blue-200 rounded-full"></div>
              <div className="absolute top-0 left-0 w-16 h-16 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
              <Loader2 className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-blue-600 animate-pulse" />
            </div>
          </div>
          <p className="text-center text-gray-700 font-medium">{loadingStep}</p>
          <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500" style={{ width: `${loadingProgress}%` }}></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-4">
        <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-800 font-semibold mb-1">Error</p>
          <p className="text-amber-700 text-sm">{error}</p>
          <button onClick={loadAll} className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm"><RefreshCw className="w-4 h-4" /> Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Notificaciones por Correo</h2>
          <p className="text-gray-600">Gestión de notificaciones automáticas y manuales</p>
        </div>
        <button onClick={loadAll} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setShowTab('pending')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${showTab === 'pending' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
          <Mail className="w-4 h-4 inline mr-1.5" />Pendientes
        </button>
        <button onClick={() => setShowTab('history')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${showTab === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
          <Eye className="w-4 h-4 inline mr-1.5" />Historial ({stats.historyCount})
        </button>
        <button onClick={() => setShowTab('config')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${showTab === 'config' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
          <Edit3 className="w-4 h-4 inline mr-1.5" />Plantilla
        </button>
      </div>

      {/* Tab: Pending - with filters */}
      {showTab === 'pending' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg"><UserCheck className="w-5 h-5 text-blue-600" /></div>
                <div><p className="text-2xl font-bold text-gray-900">{stats.total}</p><p className="text-sm text-gray-500">Total evaluadores</p></div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="w-5 h-5 text-green-600" /></div>
                <div><p className="text-2xl font-bold text-gray-900">{stats.allDone}</p><p className="text-sm text-gray-500">Completaron todo</p></div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg"><Clock className="w-5 h-5 text-orange-600" /></div>
                <div><p className="text-2xl font-bold text-gray-900">{stats.pending}</p><p className="text-sm text-gray-500">Aún no completan</p></div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg"><Send className="w-5 h-5 text-emerald-600" /></div>
                <div><p className="text-2xl font-bold text-gray-900">{stats.sent}</p><p className="text-sm text-gray-500">Notificaciones enviadas</p></div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-5 h-5 text-gray-500" />
              <h3 className="font-semibold text-gray-900">Filtros</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Nombre o email..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Campus</label>
                <select value={filterCampus} onChange={e => setFilterCampus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm">
                  <option value="">Todos los campus</option>
                  {campusList.map(c => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Oficina</label>
                <select value={filterOffice} onChange={e => setFilterOffice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm">
                  <option value="">Todas las oficinas</option>
                  {officesList.map(o => (<option key={o.id} value={o.name}>{o.name}</option>))}
                </select>
              </div>
            </div>
          </div>

          {/* Users list */}
          {filteredUsers.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-green-800 font-semibold text-lg">
                {searchTerm || filterCampus || filterOffice ? 'Sin resultados con los filtros' : 'No hay datos'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map(user => {
                const isSending = sendingMap[user.userId];
                const sentStatus = sentMap[user.userId];
                const isExpanded = expandedUser.has(user.userId);
                const hasEmail = !!user.email;

                return (
                  <div key={user.userId} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all hover:shadow-md ${user.allDone ? 'border-green-100' : 'border-orange-100'}`}>
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${user.allDone ? 'bg-gradient-to-br from-green-500 to-green-600' : 'bg-gradient-to-br from-orange-500 to-orange-600'}`}>
                            {user.fullName.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{user.fullName}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                              <span>{user.role}</span>
                              {user.campus && <><span>·</span><span>{user.campus}</span></>}
                              <span>·</span>
                              <span className="flex items-center gap-1"><Users className="w-3 h-3" />{user.evaluatorCount} evaluado{user.evaluatorCount !== 1 ? 's' : ''}</span>
                              <span>·</span>
                              <span className={`font-medium ${user.allDone ? 'text-green-600' : 'text-orange-600'}`}>
                                {user.completedEvals}/{user.totalEvals}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!user.allDone && (
                            <span className="px-2.5 py-1 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium whitespace-nowrap">Faltan {user.totalEvals - user.completedEvals}</span>
                          )}
                          {user.allDone && sentStatus !== 'sent' && (
                            <button onClick={() => sendNotification(user)} disabled={isSending || !hasEmail}
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium">
                              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                              {isSending ? 'Enviando...' : 'Enviar correo'}
                            </button>
                          )}
                          {sentStatus === 'sent' && (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium">
                              <CheckCircle className="w-3.5 h-3.5" /> Enviado
                            </span>
                          )}
                          <button onClick={() => toggleUser(user.userId)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>

                      {isExpanded && user.completions.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-3">
                            Evaluaciones ({user.completions.length})
                          </p>
                          <div className="overflow-x-auto max-h-60 overflow-y-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50">
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Formulario</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Evaluado</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Completado</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {user.completions.map((c, idx) => (
                                  <tr key={c.evaluationId || idx} className="hover:bg-gray-50">
                                    <td className="px-3 py-2.5 text-gray-900">{c.templateName}</td>
                                    <td className="px-3 py-2.5 text-gray-600">{c.evaluatedName}</td>
                                    <td className="px-3 py-2.5 text-gray-500 text-xs">
                                      {new Date(c.completedAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Tab: History */}
      {showTab === 'history' && (
        <div className="space-y-3">
          {sentHistory.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
              <Eye className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-700 font-semibold">Sin historial de envíos</p>
              <p className="text-gray-500 text-sm">Las notificaciones enviadas aparecerán aquí.</p>
            </div>
          ) : (
            sentHistory.map(entry => {
              const isExpanded = expandedLog.has(entry.id);
              return (
                <div key={entry.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                        {entry.evaluator_name?.charAt(0) || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{entry.evaluator_name}</p>
                        <p className="text-xs text-gray-500">{entry.evaluator_email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="hidden sm:inline">{new Date(entry.sent_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      {entry.opened_at && (
                        <span className="flex items-center gap-1 text-green-600 font-medium">
                          <Eye className="w-3.5 h-3.5" /> Abierto ({entry.open_count})
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${entry.source === 'auto' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {entry.source === 'auto' ? 'Automático' : 'Manual'}
                      </span>
                      <button onClick={() => toggleLog(entry.id)} className="p-1 text-gray-400 hover:text-gray-600">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div><span className="text-gray-500">ID Mensaje:</span><p className="font-mono text-gray-700 truncate">{entry.resend_message_id || '—'}</p></div>
                        <div><span className="text-gray-500">Evaluaciones:</span><p className="font-medium text-gray-700">{entry.evaluations_count}</p></div>
                        <div><span className="text-gray-500">Enviado:</span><p className="text-gray-700">{new Date(entry.sent_at).toLocaleString('es-CO')}</p></div>
                        <div><span className="text-gray-500">Estado:</span>
                          <p className={`font-medium ${entry.status === 'opened' ? 'text-green-600' : entry.status === 'sent' ? 'text-blue-600' : 'text-gray-600'}`}>
                            {entry.status === 'opened' ? 'Abierto' : entry.status === 'sent' ? 'Enviado' : entry.status}
                          </p>
                        </div>
                      </div>
                      {entry.opened_at && (
                        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-xs text-green-700">
                            <Eye className="w-3 h-3 inline mr-1" />
                            Abierto {entry.open_count} vez/veces — {new Date(entry.opened_at).toLocaleString('es-CO')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab: Config */}
      {showTab === 'config' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-600" />
            Configuración de Plantilla de Correo
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Correo remitente (From)</label>
              <input type="email" value={emailConfig.from_email}
                onChange={e => setEmailConfig({ ...emailConfig, from_email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Asunto del correo</label>
              <input type="text" value={emailConfig.subject}
                onChange={e => setEmailConfig({ ...emailConfig, subject: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
              <p className="text-xs text-gray-400 mt-1">
                Placeholders disponibles: <code className="bg-gray-100 px-1 rounded">{'{{COLLABORATOR_NAME}}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{{YEAR}}'}</code>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plantilla HTML</label>
              <p className="text-xs text-gray-500 mb-2">
                Placeholders: <code className="bg-gray-100 px-1 rounded">{'{{COLLABORATOR_NAME}}'}</code> (nombre), <code className="bg-gray-100 px-1 rounded">{'{{EVALUATION_ROWS}}'}</code> (tabla de evaluaciones), <code className="bg-gray-100 px-1 rounded">{'{{YEAR}}'}</code> (año)
              </p>
              <textarea value={emailConfig.html}
                onChange={e => setEmailConfig({ ...emailConfig, html: e.target.value })}
                rows={16}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs font-mono" />
            </div>

            <div className="flex items-center gap-3">
              <button onClick={saveEmailConfig} disabled={savingConfig}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">
                {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {savingConfig ? 'Guardando...' : 'Guardar configuración'}
              </button>
              {configSaved && (
                <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Guardado exitosamente
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
