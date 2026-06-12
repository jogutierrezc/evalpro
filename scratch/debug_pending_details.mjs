/**
 * 🔍 Muestra el detalle completo de las evaluaciones pendientes en BD
 *
 * Uso: node scratch/debug_pending_details.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';

const SUPABASE_URL = 'https://abchjsydqtfbwivygpet.supabase.co';

function readEnvVar(varName) {
  const envPaths = ['.env', '.env.local'];
  if (process.env[varName]) return process.env[varName].trim();
  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8');
      const re = new RegExp('^' + varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*["\\\']?([^"\\\'\\r\\n]+)["\\\']?', 'm');
      const match = content.match(re);
      if (match) return match[1].trim();
    }
  }
  return null;
}

const key = readEnvVar('SUPABASE_SERVICE_ROLE_KEY') || readEnvVar('VITE_SUPABASE_ANON_KEY');
if (!key) { console.error('No key found'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, key);

async function main() {
  // Período activo
  const today = new Date().toISOString().slice(0, 10);
  const { data: periods } = await supabase
    .from('evaluation_periods')
    .select('id, year')
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1);
  const periodId = periods?.[0]?.id;
  if (!periodId) { console.log('❌ No hay período activo'); return; }
  console.log('📅 Período:', periods[0].year, '(ID:', periodId + ')\n');

  // Evaluaciones pendientes
  const { data: pendientes, error } = await supabase
    .from('evaluations')
    .select('id, evaluator_id, evaluated_id, template_id, status, started_at, completed_at, created_at')
    .eq('period_id', periodId)
    .neq('status', 'completed');

  if (error) { console.error('❌ Error:', error); return; }
  if (!pendientes?.length) { console.log('✅ No hay evaluaciones pendientes'); return; }

  // Cargar nombres
  const userIds = new Set();
  pendientes.forEach(e => { userIds.add(e.evaluator_id); userIds.add(e.evaluated_id); });
  const tplIds = pendientes.map(e => e.template_id);

  const [{ data: users }, { data: templates }] = await Promise.all([
    supabase.from('users').select('id, full_name, email, role, campus').in('id', [...userIds]),
    supabase.from('evaluation_templates').select('id, name, type').in('id', tplIds),
  ]);

  const userMap = Object.fromEntries((users || []).map(u => [u.id, u]));
  const tplMap = Object.fromEntries((templates || []).map(t => [t.id, t]));

  const SEP = '══════════════════════════════════════════════════';
  console.log(SEP);
  console.log('  ' + pendientes.length + ' EVALUACIONES PENDIENTES');
  console.log(SEP + '\n');

  pendientes.forEach((ev, i) => {
    const evaluator = userMap[ev.evaluator_id] || {};
    const evaluated = userMap[ev.evaluated_id] || {};
    const tpl = tplMap[ev.template_id] || {};
    const isSelf = ev.evaluator_id === ev.evaluated_id;
    const statusIcon = ev.status === 'in_progress' ? '🟡' : '🔴';

    console.log(`┌─ Evaluación #${i + 1} ${statusIcon} ${ev.status === 'in_progress' ? 'EN PROGRESO' : 'PENDIENTE'}`);
    console.log(`│ ID:         ${ev.id}`);
    console.log(`│ Evaluador:  ${evaluator.full_name || '?'} (${evaluator.email || '?'})`);
    console.log(`│   Rol:      ${evaluator.role || '?'}`);
    console.log(`│   Campus:   ${evaluator.campus || '?'}`);
    console.log(`│ Evaluado:   ${evaluated.full_name || '?'} (${evaluated.email || '?'})`);
    console.log(`│   Rol:      ${evaluated.role || '?'}`);
    console.log(`│   Campus:   ${evaluated.campus || '?'}`);
    console.log(`│ Autoeval:   ${isSelf ? '✅ SÍ' : '❌ NO'}`);
    console.log(`│ Template:   ${tpl.name || '?'} (tipo: ${tpl.type || '?'})`);
    console.log(`│ Creada:     ${ev.created_at || '?'}`);
    console.log(`│ Iniciada:   ${ev.started_at || '❌ Nunca'}`);
    console.log(`│ Completada: ${ev.completed_at || '❌ Nunca'}`);
    console.log(`└${'─'.repeat(55)}\n`);
  });

  console.log(SEP);
  console.log('  📊 RESUMEN');
  console.log(SEP);
  console.log(`  Total pendientes:     ${pendientes.length}`);
  console.log(`  ├─ En progreso:       ${pendientes.filter(e => e.status === 'in_progress').length}`);
  console.log(`  └─ Sin iniciar:       ${pendientes.filter(e => e.status !== 'in_progress').length}`);
  console.log(`  Autoevaluaciones:     ${pendientes.filter(e => e.evaluator_id === e.evaluated_id).length}`);
  console.log(`  Evaluaciones a otros: ${pendientes.filter(e => e.evaluator_id !== e.evaluated_id).length}`);
  console.log(SEP);
}

main().catch(console.error);
