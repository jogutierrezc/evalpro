// Edge Function: administración de cuentas de acceso (Auth) para el módulo Usuarios.
//
// Acciones (POST JSON, campo "action"). Solo las puede ejecutar un administrador con sesión válida:
//   create { email, password }  -> crea la cuenta en Auth ya confirmada y devuelve { id }.
//                                  Si el correo ya existe en Auth pero sin fila en public.users (cuenta huérfana de un
//                                  borrado anterior), la reutiliza y le pone la nueva contraseña.
//   delete { userId }           -> borra la fila de public.users (y lo que cuelga de ella) y después la cuenta de Auth,
//                                  de modo que el correo queda libre para crear otro usuario.
//
// Secretos: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (automáticos).
// Despliegue: bash supabase/subir-funcion.sh admin-users   (o supabase functions deploy admin-users)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function requireAdmin(req: Request): Promise<string> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Falta la sesión.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sesión no válida.');
  const { data: me } = await admin.from('users').select('role').eq('id', data.user.id).maybeSingle();
  const role = String(me?.role ?? '').toLowerCase();
  if (!['admin', 'administrador', 'superadmin'].includes(role)) throw new HttpError(403, 'Solo el administrador puede hacer esto.');
  return data.user.id;
}

// Busca una cuenta de Auth por correo (supabase-js 2.39 no trae getUserByEmail).
async function findAuthByEmail(email: string) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new HttpError(500, error.message);
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function createAccount(email: string, password: string) {
  email = email.trim();
  if (!email || !password) throw new HttpError(400, 'Faltan correo o contraseña.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, `El correo «${email}» no es válido.`);
  // La clave inicial es la cédula: Auth exige un mínimo (6 por defecto) y rechaza cédulas más cortas.
  if (password.length < 6) throw new HttpError(400, 'La clave inicial (la cédula) debe tener al menos 6 caracteres.');

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (!error && data.user) return { id: data.user.id, reused: false };

  // Correo ya registrado: solo se reutiliza si no tiene perfil (cuenta huérfana).
  const existing = await findAuthByEmail(email);
  if (!existing) throw new HttpError(400, `No se pudo crear la cuenta de acceso: ${error?.message ?? 'error desconocido'}`);
  const { data: profile } = await admin.from('users').select('id').eq('id', existing.id).maybeSingle();
  if (profile) throw new HttpError(409, 'Ya existe un usuario con ese correo.');
  const { error: upErr } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  if (upErr) throw new HttpError(500, upErr.message);
  return { id: existing.id, reused: true };
}

async function deleteAccount(userId: string, callerId: string) {
  if (!userId) throw new HttpError(400, 'Falta userId.');
  if (userId === callerId) throw new HttpError(400, 'No puede eliminar su propia cuenta.');

  // Primero el perfil: si hay evaluaciones u otros datos que lo bloquean, se detiene aquí y la cuenta de Auth sigue intacta.
  const { error: delErr } = await admin.from('users').delete().eq('id', userId);
  if (delErr) throw new HttpError(409, `No se pudo eliminar el perfil: ${delErr.message}`);

  // Tablas heredadas que no siempre tienen cascada; si no existen se ignora el error.
  await admin.from('colaboradores').delete().eq('id', userId);

  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr && !/not found/i.test(authErr.message)) throw new HttpError(500, `Perfil eliminado, pero Auth falló: ${authErr.message}`);
  return { ok: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const callerId = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    if (body.action === 'create') return json(await createAccount(String(body.email ?? ''), String(body.password ?? '')));
    if (body.action === 'delete') return json(await deleteAccount(String(body.userId ?? ''), callerId));
    throw new HttpError(400, 'Acción desconocida.');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error('admin-users', e);
    return json({ error: 'Error interno.' }, 500);
  }
});
