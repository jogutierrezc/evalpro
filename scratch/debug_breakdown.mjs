/**
 * 📊 Desglose completo de evaluaciones por tipo de formulario
 *
 * Muestra:
 *   - Pendientes desglosadas por template (en progreso vs sin iniciar, autoeval vs otros)
 *   - Todas las evaluaciones desglosadas por template (completadas vs pendientes)
 *
 * Uso: node scratch/debug_breakdown.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';

const URL = 'https://abchjsydqtfbwivygpet.supabase.co';

function readEnvVar(v) {
  const paths = ['.env', '.env.local'];
  if (process.env[v]) return process.env[v].trim();
  for (const p of paths) {
    if (existsSync(p)) {
      const c = readFileSync(p, 'utf-8');
      const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('^' + escaped + '\\s*=\\s*["\']?([^"\'\\r\\n]+)["\']?', 'm');
      const m = c.match(re);
      if (m) return m[1].trim();
    }
  }
  return null;
}

const key = readEnvVar('SUPABASE_SERVICE_ROLE_KEY') || readEnvVar('VITE_SUPABASE_ANON_KEY');
if (!key) { console.error('No key found'); process.exit(1); }

const supabase = createClient(URL, key);

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: periods } = await supabase
    .from('evaluation_periods')
    .select('id, year')
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1);
  const pid = periods?.[0]?.id;
  if (!pid) { console.log('No active period'); return; }
  console.log('Período:', periods[0].year, '(ID:', pid + ')\n');

  // Cargar templates
  const { data: tpls } = await supabase.from('evaluation_templates').select('id, name, type').eq('is_active', true);
  const tplMap = Object.fromEntries((tpls || []).map(t => [t.id, t]));

  // 1. SOLO PENDIENTES
  console.log('='.repeat(90));
  console.log('  EVALUACIONES PENDIENTES POR TIPO DE FORMULARIO');
  console.log('='.repeat(90));
  const { data: pending } = await supabase
    .from('evaluations')
    .select('id, evaluator_id, evaluated_id, template_id, status')
    .eq('period_id', pid)
    .neq('status', 'completed');

  const byPending = {};
  (pending || []).forEach(ev => {
    const t = tplMap[ev.template_id] || { name: '?', type: '?' };
    const key = t.type;
    if (!byPending[key]) byPending[key] = { type: t.type, name: t.name, total: 0, inProgress: 0, pending: 0, selfEval: 0, toOthers: 0 };
    byPending[key].total++;
    if (ev.status === 'in_progress') byPending[key].inProgress++;
    else byPending[key].pending++;
    if (ev.evaluator_id === ev.evaluated_id) byPending[key].selfEval++;
    else byPending[key].toOthers++;
  });

  console.log('Tipo'.padEnd(25) + 'Template'.padEnd(30) + 'Total  Prog.  Pend.  Auto  Otros');
  console.log('-'.repeat(90));
  Object.values(byPending).forEach(t => {
    const name = t.name.length > 27 ? t.name.slice(0, 24) + '...' : t.name;
    console.log(t.type.padEnd(25) + name.padEnd(30) +
      String(t.total).padStart(4) + '   ' +
      String(t.inProgress).padStart(3) + '   ' +
      String(t.pending).padStart(3) + '   ' +
      String(t.selfEval).padStart(3) + '   ' +
      String(t.toOthers).padStart(3));
  });
  console.log('-'.repeat(90));

  // 2. TODAS LAS EVALUACIONES
  console.log('\n' + '='.repeat(90));
  console.log('  TODAS LAS EVALUACIONES POR TIPO DE FORMULARIO');
  console.log('='.repeat(90));
  const { data: all } = await supabase
    .from('evaluations')
    .select('id, template_id, status')
    .eq('period_id', pid);

  const byAll = {};
  (all || []).forEach(ev => {
    const t = tplMap[ev.template_id] || { name: '?', type: '?' };
    if (!byAll[t.type]) byAll[t.type] = { type: t.type, templates: {} };
    if (!byAll[t.type].templates[t.name]) byAll[t.type].templates[t.name] = { name: t.name, total: 0, completed: 0, pending: 0 };
    byAll[t.type].templates[t.name].total++;
    if (ev.status === 'completed') byAll[t.type].templates[t.name].completed++;
    else byAll[t.type].templates[t.name].pending++;
  });

  let grandTotal = 0, grandCompleted = 0, grandPending = 0;
  Object.entries(byAll).forEach(([type, data]) => {
    console.log(`\n  📁 ${type}`);
    console.log('  ' + '-'.repeat(60));
    console.log('  Template'.padEnd(35) + 'Total  Compl.  Pdte.');
    Object.values(data.templates).forEach(t => {
      const name = t.name.length > 32 ? t.name.slice(0, 29) + '...' : t.name;
      console.log('  ' + name.padEnd(35) + String(t.total).padStart(5) + '   ' + String(t.completed).padStart(4) + '   ' + String(t.pending).padStart(4));
      grandTotal += t.total;
      grandCompleted += t.completed;
      grandPending += t.pending;
    });
  });

  console.log('\n' + '='.repeat(90));
  console.log('  GRAN TOTAL'.padEnd(47) + String(grandTotal).padStart(5) + '   ' + String(grandCompleted).padStart(4) + '   ' + String(grandPending).padStart(4));
  console.log('='.repeat(90));
  console.log(`  ✅ Completadas: ${grandCompleted}  |  🔴 Pendientes: ${grandPending}  |  📊 % Compl.: ${grandTotal > 0 ? Math.round(grandCompleted / grandTotal * 100) : 0}%`);
}

main().catch(console.error);
