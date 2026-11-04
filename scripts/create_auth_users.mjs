// Crea en auth.users del proyecto NUEVO las cuentas de public.users del export .sql, con el mismo UUID.
// Uso (PowerShell):
//   $env:SUPABASE_URL="https://xxxx.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="..."
//   node scripts/create_auth_users.mjs ruta\export.sql [--dry]
// Email: el de la fila, o <identification>@evaluation.local. Contraseña inicial: la identificación.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [file, flag] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!file || !url || !key) {
  console.error('Faltan: archivo .sql, SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const dry = flag === '--dry';

const PREFIX = "SELECT public.__evalpro_import_rows('public.users', '";
const SUFFIX = "'::jsonb);";
const users = [];
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line.startsWith(PREFIX)) continue;
  const end = line.lastIndexOf(SUFFIX);
  if (end < 0) continue;
  users.push(...JSON.parse(line.slice(PREFIX.length, end).replace(/''/g, "'")));
}
console.log(`${users.length} usuarios en el archivo${dry ? ' (dry run)' : ''}`);

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
let ok = 0, existed = 0, failed = 0;

for (const u of users) {
  const email = (u.email && String(u.email).trim()) || `${u.identification}@evaluation.local`;
  if (dry) continue;
  const { error } = await admin.auth.admin.createUser({
    id: u.id,
    email,
    password: String(u.identification),
    email_confirm: true,
  });
  if (!error) ok++;
  else if (/already|registered|exists/i.test(error.message)) existed++;
  else {
    failed++;
    console.error(`FALLÓ ${u.id} (${email}): ${error.message}`);
  }
}
console.log(`Creadas: ${ok} | ya existían: ${existed} | fallidas: ${failed}`);
