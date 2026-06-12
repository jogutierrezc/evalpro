/**
 * Diagnóstico: fecha actual vs período activo
 * Uso: node scratch/debug_date.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';

const URL = 'https://abchjsydqtfbwivygpet.supabase.co';
function r(v) {
  const p = ['.env', '.env.local'];
  if (process.env[v]) return process.env[v].trim();
  for (const e of p) {
    if (existsSync(e)) {
      const c = readFileSync(e, 'utf-8');
      const re = new RegExp('^' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*["\']?([^"\'\\r\\n]+)["\']?', 'm');
      const m = c.match(re);
      if (m) return m[1].trim();
    }
  }
  return null;
}
const key = r('SUPABASE_SERVICE_ROLE_KEY') || r('VITE_SUPABASE_ANON_KEY');
if (!key) { console.log('No key'); process.exit(1); }
const s = createClient(URL, key);

(async () => {
  // Fecha actual desde varias perspectivas
  const now = new Date();
  const utcDate = now.toISOString().slice(0, 10);
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
  console.log('Fecha UTC:        ', utcDate);
  console.log('Fecha Local (getLocalDateString):', localDate);
  console.log('Timezone offset:  ', now.getTimezoneOffset(), 'minutos');
  console.log('Hora actual:      ', now.toString());

  // Consultar TODOS los períodos para ver fechas reales
  const { data: periods } = await s.from('evaluation_periods').select('id, year, start_date, end_date, is_active').order('start_date', { ascending: false });
  console.log('\nPeríodos en BD:');
  (periods || []).forEach(p => {
    const matchUTC = p.start_date <= utcDate && p.end_date >= utcDate;
    const matchLocal = p.start_date <= localDate && p.end_date >= localDate;
    console.log(`  ${p.id.slice(0,8)}... ${p.year} | ${p.start_date} → ${p.end_date} | activo=${p.is_active} | matchUTC=${matchUTC} | matchLocal=${matchLocal}`);
  });

  // Consulta exacta que hace el módulo
  console.log('\nConsulta del módulo con getLocalDateString:');
  const { data: q1 } = await s.from('evaluation_periods').select('id, year').lte('start_date', localDate).gte('end_date', localDate).limit(1);
  console.log('  Resultado:', q1 ? q1.length + ' períodos' : 'null', q1?.[0]?.year || '');

  console.log('\nConsulta con UTC date:');
  const { data: q2 } = await s.from('evaluation_periods').select('id, year').lte('start_date', utcDate).gte('end_date', utcDate).limit(1);
  console.log('  Resultado:', q2 ? q2.length + ' períodos' : 'null', q2?.[0]?.year || '');
})();
