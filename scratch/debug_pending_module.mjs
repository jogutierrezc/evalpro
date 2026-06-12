/**
 * 🐞 DEBUG SCRIPT — PendingEvaluationsModule vs Datos Reales de BD
 *
 * Uso:
 *   node scratch/debug_pending_module.mjs
 *
 * Requiere: npm install (para @supabase/supabase-js)
 *           SUPABASE_SERVICE_ROLE_KEY o VITE_SUPABASE_ANON_KEY en .env
 *
 * Consulta TODAS las evaluaciones paginando de 200 en 200 para superar
 * el límite default de Supabase (1,000 registros).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://abchjsydqtfbwivygpet.supabase.co';

// ── Lee variables del .env ──
function readEnvVar(varName) {
  const envPaths = [
    resolve(__dirname, '..', '.env'),
    resolve(__dirname, '..', '.env.local'),
  ];
  if (process.env[varName]) return process.env[varName].trim();
  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8');
      const match = content.match(
        new RegExp(`^${varName}\\s*=\\s*['"]?([^'"\\r\\n]+)['"]?\\r?$`, 'm')
      );
      if (match) return match[1].trim();
    }
  }
  return null;
}

function getSupabaseKey() {
  if (process.argv[2]) {
    console.log('📌 Usando key desde argumento CLI');
    return process.argv[2];
  }
  const serviceKey = readEnvVar('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey) {
    console.log('📌 Usando SUPABASE_SERVICE_ROLE_KEY (sin RLS)');
    return serviceKey;
  }
  const anonKey = readEnvVar('VITE_SUPABASE_ANON_KEY');
  if (anonKey) {
    console.log('📌 Usando VITE_SUPABASE_ANON_KEY (con RLS)');
    return anonKey;
  }
  console.error('\n❌ ERROR: No se encontró SUPABASE_SERVICE_ROLE_KEY ni VITE_SUPABASE_ANON_KEY.');
  console.error('   Agrégalas en tu .env o pásala como argumento.\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, getSupabaseKey());

// ── Helpers ──
const normalizeStr = (s) => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const SEP = '─'.repeat(70);

// ─── Paginación: obtiene TODAS las filas de una consulta ───
async function fetchAll(table, select, filters, pageSize = 200) {
  const allRows = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const to = from + pageSize - 1;
    let query = supabase.from(table).select(select);
    for (const f of filters) query = query[f.method](...f.args);
    const { data, error } = await query.range(from, to);
    if (error) throw error;
    if (data) allRows.push(...data);
    hasMore = data && data.length === pageSize;
    from += pageSize;
    if (allRows.length % 1000 === 0 && allRows.length > 0) {
      console.log(`      ... ${allRows.length} registros cargados de ${table}`);
    }
  }
  return allRows;
}

// ─── Análisis principal ───
async function runAnalysis(period) {
  console.log(`\n📦 2. Cargando datos desde BD (paginando de 200 en 200)...`);

  // Primero contar cuántas evaluaciones hay
  const { count: totalEvalCount, error: countErr } = await supabase
    .from('evaluations')
    .select('id', { count: 'exact', head: true })
    .eq('period_id', period.id);
  if (countErr) { console.error('❌ ERROR contando evaluaciones:', countErr); return; }
  console.log(`   ℹ️  Total evaluaciones en período: ${totalEvalCount}`);

  // Cargar todo en paralelo
  const [evaluations, { data: templates }, { data: users }, { data: offices },
    { data: periodFormTypes }, { data: formTypes }, { data: formTypeRelations }] = await Promise.all([
    fetchAll('evaluations', 'id, evaluator_id, evaluated_id, template_id, status', [
      { method: 'eq', args: ['period_id', period.id] },
    ]),
    supabase.from('evaluation_templates').select('id, name, type').eq('is_active', true),
    supabase.from('users').select('id, full_name, email, role, campus, office_id'),
    supabase.from('offices').select('id, name'),
    supabase.from('evaluation_period_form_types').select('form_type_key').eq('period_id', period.id),
    supabase.from('form_types').select('key, roles'),
    supabase.from('form_type_relations').select('form_type_key, evaluator_role_key, evaluated_role_key'),
  ]);

  const totalEvals = evaluations?.length || 0;
  console.log(`   ✅ Evaluaciones:        ${totalEvals} / ${totalEvalCount}`);
  console.log(`   ✅ Templates activos:   ${templates?.length || 0}`);
  console.log(`   ✅ Usuarios:            ${users?.length || 0}`);
  console.log(`   ✅ Oficinas:            ${offices?.length || 0}`);
  console.log(`   ✅ Form types período:  ${periodFormTypes?.length || 0}`);
  console.log(`   ✅ Tipos formulario:    ${formTypes?.length || 0}`);
  console.log(`   ✅ Form type relations: ${formTypeRelations?.length || 0}`);

  if (!evaluations && !users) {
    console.log('\n⚠️  No se pudieron cargar datos. Verifica la conexión a Supabase.');
    return;
  }

  // ── Verificación: coinciden los conteos? ──
  if (totalEvals !== totalEvalCount) {
    console.log(`\n⚠️  DISCREPANCIA: se cargaron ${totalEvals} eval(es) pero el conteo exacto es ${totalEvalCount}`);
    console.log(`   → ${totalEvalCount - totalEvals} eval(es) no se pudieron obtener (posible problema de permisos)`);
  } else {
    console.log(`   ✅ Conteos coinciden: ${totalEvals} == ${totalEvalCount}`);
  }

  console.log(`\n🗺️  3. Procesando datos...`);

  // ── Maps ──
  const templateMap = Object.fromEntries((templates || []).map(t => [t.id, t.name]));
  const officeMap = Object.fromEntries((offices || []).map(o => [o.id, o.name]));
  const userMap = {};
  let nullCampusCount = 0, nullOfficeCount = 0;
  (users || []).forEach(u => {
    userMap[u.id] = u;
    if (!u.campus) nullCampusCount++;
    if (!u.office_id) nullOfficeCount++;
  });

  const allowedFormTypeKeys = new Set((periodFormTypes || []).map(r => r.form_type_key));
  const templatesByType = {};
  (templates || []).forEach(t => {
    if (!templatesByType[t.type]) templatesByType[t.type] = [];
    templatesByType[t.type].push({ id: t.id, name: t.name });
  });
  const formTypesByKey = {};
  (formTypes || []).forEach(ft => { formTypesByKey[ft.key] = ft.roles || []; });

  const selfEvalRelations = (formTypeRelations || []).filter(
    r => normalizeStr(r.evaluator_role_key) === normalizeStr(r.evaluated_role_key)
  );

  console.log(`   ✅ ${Object.keys(userMap).length} usuarios indexados`);
  console.log(`   ⚠️  ${nullCampusCount} sin campus, ${nullOfficeCount} sin office_id`);
  console.log(`   ✅ ${allowedFormTypeKeys.size} form types activos en período`);
  console.log(`   ℹ️  ${selfEvalRelations.length} form_type_relations de autoevaluación`);

  // ── 4. Simular PendingEvaluationsModule ──
  console.log(`\n🔍 4. Simulando PendingEvaluationsModule...\n`);

  const byEvaluator = {};
  (evaluations || []).forEach(ev => {
    if (!byEvaluator[ev.evaluator_id]) {
      byEvaluator[ev.evaluator_id] = { total: 0, completed: 0, pendingItems: [], inProgressItems: [] };
    }
    byEvaluator[ev.evaluator_id].total++;
    if (ev.status === 'completed') {
      byEvaluator[ev.evaluator_id].completed++;
    } else {
      const evaluatedUser = userMap[ev.evaluated_id];
      const item = {
        templateName: templateMap[ev.template_id] || 'Evaluación',
        evaluatedName: evaluatedUser?.full_name || 'Desconocido',
        status: ev.status,
        isSelfEval: ev.evaluated_id === ev.evaluator_id,
      };
      if (ev.status === 'in_progress') {
        byEvaluator[ev.evaluator_id].inProgressItems.push(item);
      } else {
        byEvaluator[ev.evaluator_id].pendingItems.push(item);
      }
    }
  });

  const detectMissingSelfEvals = (user) => {
    const missing = [];
    const userRoleNorm = normalizeStr(user.role || '');
    if (!userRoleNorm || allowedFormTypeKeys.size === 0) return missing;
    for (const [ftKey, roles] of Object.entries(formTypesByKey)) {
      if (!allowedFormTypeKeys.has(ftKey)) continue;
      if (!roles.some(r => normalizeStr(r) === userRoleNorm)) continue;
      const tmpls = templatesByType[ftKey] || [];
      for (const tpl of tmpls) {
        const exists = (evaluations || []).some(
          ev => ev.evaluator_id === user.id && ev.evaluated_id === user.id && ev.template_id === tpl.id
        );
        if (!exists) {
          missing.push({
            templateName: tpl.name,
            evaluatedName: `${user.full_name} (Autoevaluación)`,
            status: 'not_done',
            isSelfEval: true,
          });
        }
      }
    }
    return missing;
  };

  const allUserIds = new Set([...Object.keys(byEvaluator), ...(users || []).map(u => u.id)]);
  const evaluators = [];

  for (const userId of allUserIds) {
    const userData = userMap[userId];
    if (!userData) continue;
    const dbData = byEvaluator[userId];
    const missingSelf = detectMissingSelfEvals(userData);
    const hasPending = dbData && (dbData.pendingItems.length > 0 || dbData.inProgressItems.length > 0);
    const hasMissingSelf = missingSelf.length > 0;
    if (!hasPending && !hasMissingSelf) continue;
    evaluators.push({
      userId, fullName: userData.full_name, email: userData.email, role: userData.role,
      campus: userData.campus || 'Sin Campus',
      officeName: officeMap[userData.office_id] || 'Sin Oficina',
      pending: dbData?.pendingItems || [],
      inProgress: dbData?.inProgressItems || [],
      completedCount: dbData?.completed || 0,
      missingSelfEvals: missingSelf,
    });
  }
  evaluators.sort((a, b) => a.fullName.localeCompare(b.fullName));

  // ─────────────────────────────────────
  // REPORTE
  // ─────────────────────────────────────
  console.log(SEP);
  console.log('  📊 REPORTE COMPARATIVO');
  console.log(`${SEP}\n`);

  const completedInDB = evaluations?.filter(e => e.status === 'completed').length || 0;
  const pendingInDB = evaluations?.filter(e => e.status !== 'completed').length || 0;
  const selfEvalsInDB = evaluations?.filter(e => e.evaluator_id === e.evaluated_id).length || 0;
  const selfEvalsCompleted = evaluations?.filter(e => e.evaluator_id === e.evaluated_id && e.status === 'completed').length || 0;

  const totalPeople = evaluators.length;
  const totalMissingSelf = evaluators.reduce((s, e) => s + e.missingSelfEvals.length, 0);
  const totalPendingFromDB = evaluators.reduce((s, e) => s + e.pending.length + e.inProgress.length, 0);
  const totalCompletedInModule = evaluators.reduce((s, e) => s + e.completedCount, 0);
  const evaluatorsWithMissing = evaluators.filter(e => e.missingSelfEvals.length > 0).length;
  const evaluatorsWithDBPending = evaluators.filter(e => e.pending.length + e.inProgress.length > 0).length;

  console.log('═══ DATOS REALES DE BD (sin filtrar) ═══');
  console.log(`   Total evaluaciones:               ${totalEvals}`);
  console.log(`   ├─ Completadas:                   ${completedInDB}`);
  console.log(`   ├─ Pendientes/En progreso:         ${pendingInDB}`);
  console.log(`   └─ Autoevaluaciones:              ${selfEvalsInDB} (${selfEvalsCompleted} completadas)`);
  console.log(`   Evaluadores únicos:               ${new Set((evaluations || []).map(e => e.evaluator_id)).size}`);
  console.log(`   Evaluados únicos:                 ${new Set((evaluations || []).map(e => e.evaluated_id)).size}`);
  console.log(`   Usuarios totales:                 ${users?.length || 0}\n`);

  console.log('═══ LO QUE MUESTRA EL MÓDULO ═══');
  console.log(`   Personas con pendientes:          ${totalPeople}`);
  console.log(`   ├─ Con autoevals faltantes:       ${evaluatorsWithMissing} (${totalMissingSelf} faltantes)`);
  console.log(`   ├─ Con DB pendientes:             ${evaluatorsWithDBPending} (${totalPendingFromDB} pendientes)`);
  console.log(`   ├─ Ambas:                         ${evaluators.filter(e => e.missingSelfEvals.length > 0 && (e.pending.length + e.inProgress.length) > 0).length}`);
  console.log(`   └─ Solo autoevals faltantes:      ${evaluators.filter(e => e.missingSelfEvals.length > 0 && e.pending.length === 0 && e.inProgress.length === 0).length}`);
  console.log(`   Completadas (acumulado):          ${totalCompletedInModule}\n`);

  // ── Verificación ──
  console.log('═══ VERIFICACIÓN DE CONSISTENCIA ═══\n');
  const orphanEvalCount = (evaluations || []).filter(ev => !userMap[ev.evaluator_id]).length;
  const orphanEvalCount2 = (evaluations || []).filter(ev => !userMap[ev.evaluated_id]).length;
  if (orphanEvalCount + orphanEvalCount2 === 0) {
    console.log('   ✅ No hay evaluaciones huérfanas');
  } else {
    console.log(`   ⚠️  ${orphanEvalCount} eval(es) con evaluador_id no existente`);
    console.log(`   ⚠️  ${orphanEvalCount2} eval(es) con evaluated_id no existente`);
  }
  console.log(pendingInDB === totalPendingFromDB
    ? `   ✅ pendingInDB (${pendingInDB}) == pendingModule (${totalPendingFromDB})`
    : `   ❌ DISCREPANCIA: pendingInDB=${pendingInDB} vs pendingModule=${totalPendingFromDB}`);

  // ── Autoevals: form_types.roles vs form_type_relations ──
  if (selfEvalRelations.length > 0) {
    let missingByRelations = 0;
    for (const user of users || []) {
      const userRoleNorm = normalizeStr(user.role);
      if (!userRoleNorm || !userMap[user.id]) continue;
      for (const rel of selfEvalRelations) {
        if (normalizeStr(rel.evaluator_role_key) !== userRoleNorm) continue;
        if (!allowedFormTypeKeys.has(rel.form_type_key)) continue;
        const tmpls = templatesByType[rel.form_type_key] || [];
        for (const tpl of tmpls) {
          const exists = (evaluations || []).some(
            ev => ev.evaluator_id === user.id && ev.evaluated_id === user.id && ev.template_id === tpl.id
          );
          if (!exists) missingByRelations++;
        }
      }
    }
    if (totalMissingSelf === missingByRelations) {
      console.log(`   ✅ Autoevals: form_types.roles (${totalMissingSelf}) == form_type_relations (${missingByRelations})`);
    } else {
      console.log(`   ⚠️  Autoevals: form_types.roles (${totalMissingSelf}) != form_type_relations (${missingByRelations})`);
    }
  }

  // ── Desglose por campus ──
  console.log(`\n${SEP}`);
  console.log('  🏫 DESGLOSE POR CAMPUS');
  console.log(`${SEP}\n`);
  const campuses = {};
  evaluators.forEach(ev => {
    if (!campuses[ev.campus]) campuses[ev.campus] = { people: 0, missing: 0, pending: 0, completed: 0 };
    campuses[ev.campus].people++;
    campuses[ev.campus].missing += ev.missingSelfEvals.length;
    campuses[ev.campus].pending += ev.pending.length + ev.inProgress.length;
    campuses[ev.campus].completed += ev.completedCount;
  });
  console.log('   Campus                          Personas  Autoeval  SinCompl  Complet.');
  console.log('   ' + '─'.repeat(68));
  Object.entries(campuses).sort(([a], [b]) => a.localeCompare(b)).forEach(([campus, data]) => {
    console.log(`   ${campus.padEnd(32)} ${String(data.people).padStart(5)}   ${String(data.missing).padStart(5)}   ${String(data.pending).padStart(5)}   ${String(data.completed).padStart(5)}`);
  });
  console.log('   ' + '─'.repeat(68));
  console.log(`   ${'TOTAL'.padEnd(32)} ${String(totalPeople).padStart(5)}   ${String(totalMissingSelf).padStart(5)}   ${String(totalPendingFromDB).padStart(5)}   ${String(totalCompletedInModule).padStart(5)}`);

  // ── TOP 15 ──
  console.log(`\n${SEP}`);
  console.log('  ⚠️  TOP 15 — Usuarios con más pendientes');
  console.log(`${SEP}\n`);
  const sorted = [...evaluators].sort((a, b) =>
    (b.missingSelfEvals.length + b.pending.length + b.inProgress.length) -
    (a.missingSelfEvals.length + a.pending.length + a.inProgress.length)
  ).slice(0, 15);
  if (sorted.length > 0) {
    console.log('   Usuario              Campus         Rol            Autoeval  BD Pdte.  Complet.');
    console.log('   ' + '─'.repeat(78));
    sorted.forEach(ev => {
      const pTotal = ev.pending.length + ev.inProgress.length;
      console.log(`   ${ev.fullName.padEnd(20)}  ${(ev.campus||'').padEnd(14)}  ${(ev.role||'').padEnd(14)}  ${String(ev.missingSelfEvals.length).padStart(5)}     ${String(pTotal).padStart(5)}    ${String(ev.completedCount).padStart(5)}`);
    });
  }

  // ── Solo autoevals ──
  const onlyMissing = evaluators.filter(e => e.missingSelfEvals.length > 0 && e.pending.length === 0 && e.inProgress.length === 0);
  if (onlyMissing.length > 0) {
    console.log(`\n${SEP}`);
    console.log(`  👤 ${onlyMissing.length} usuario(s) con SOLO autoevaluaciones faltantes`);
    console.log(`${SEP}\n`);
    onlyMissing.slice(0, 10).forEach(ev => {
      console.log(`   • ${ev.fullName.padEnd(25)} (${ev.role?.padEnd(20)}) — ${ev.campus} / ${ev.officeName}`);
      ev.missingSelfEvals.forEach(m => console.log(`       └ ${m.templateName}`));
    });
    if (onlyMissing.length > 10) console.log(`   ... y ${onlyMissing.length - 10} más`);
  }

  // ── Resumen ──
  console.log(`\n${SEP}`);
  console.log('  📋 RESUMEN');
  console.log(`${SEP}\n`);
  console.log(`   BD:          ${totalEvals} evaluaciones (${completedInDB} completadas, ${pendingInDB} pendientes)`);
  console.log(`   Módulo:      ${totalPeople} personas, ${totalMissingSelf} autoevals faltantes, ${totalPendingFromDB} BD pendientes`);
  console.log(`   Solo autoev: ${onlyMissing.length} personas, solo BD: ${evaluatorsWithDBPending} personas`);
  console.log(`   Sin campus:  ${nullCampusCount}, sin oficina: ${nullOfficeCount}`);
  console.log(`\n   ${pendingInDB === totalPendingFromDB ? '✅ TODO COINCIDE' : '⚠️  HAY DISCREPANCIAS'} — pendingModule (${totalPendingFromDB}) ${pendingInDB === totalPendingFromDB ? '==' : '!='} pendingInDB (${pendingInDB})`);
  console.log(`\n${SEP}\n`);
}

// ─── Entry point ───
async function main() {
  console.log(`\n${SEP}`);
  console.log('  🐞 DEBUG — PendingEvaluationsModule vs BD');
  console.log(`${SEP}\n`);

  console.log('📅 1. Buscando período activo...');
  const today = new Date().toISOString().slice(0, 10);
  const { data: periods } = await supabase
    .from('evaluation_periods')
    .select('id, year, start_date, end_date, is_active')
    .lte('start_date', today).gte('end_date', today).limit(1);

  if (!periods?.length) {
    const { data: allPeriods } = await supabase
      .from('evaluation_periods')
      .select('id, year, start_date, end_date, is_active')
      .order('end_date', { ascending: false }).limit(1);
    if (allPeriods?.length) {
      console.log(`   ⚠️  Sin período activo hoy. Usando último: ${allPeriods[0].year} (ends ${allPeriods[0].end_date})`);
      return runAnalysis(allPeriods[0]);
    }
    console.log('❌ No hay períodos.');
    return;
  }

  const period = periods[0];
  console.log(`   ✅ Período activo: ${period.year} (${period.start_date} → ${period.end_date})`);
  await runAnalysis(period);
}

main().catch(err => { console.error('\n❌ Error:', err); process.exit(1); });
