import { useState, useEffect, useRef } from 'react';
import { supabase, User, Office, UserRole, Role } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Search, Upload, X, ChevronLeft, ChevronRight, Users, Filter, Download, Save, Mail, CheckCircle2, AlertTriangle, RotateCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../contexts/AuthContext';
import { callCorreos } from '../correos/api';

/** Un usuario recién creado al que se le envía (o se le intentó enviar) el correo de bienvenida. La clave solo vive en memoria. */
type MailEntry = { id: string; name: string; email: string; password: string; status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'; error?: string };
/** Resultado de un alta (individual o masiva) que se muestra al administrador. */
type Alta = { title: string; working: boolean; step: string; created: number; updated: number; rowErrors: string[]; mails: MailEntry[]; progress: { done: number; total: number } | null };

/** Convierte el error técnico (Postgres, PostgREST, Edge Function) en una frase que diga qué falló y qué hacer. */
function friendlyError(e: any): string {
  const raw = String(e?.message || e?.error || (typeof e === 'string' ? e : '') || '').trim();
  const code = String(e?.code || '');
  const text = `${raw} ${e?.details || ''}`;
  if (code === '23505' || /duplicate key/i.test(text)) {
    if (/identification/i.test(text)) return 'Ya existe un usuario con esa cédula.';
    if (/email/i.test(text)) return 'Ya existe un usuario con ese correo.';
    return 'Ya existe un usuario con esos datos (cédula o correo repetidos).';
  }
  if (code === '42501' || /row-level security|permission denied/i.test(text)) return 'La base de datos rechazó el guardado por permisos (RLS). Tu usuario debe tener rol administrador.';
  if (code === '23503' || /foreign key/i.test(text)) return 'El rol, la oficina o el jefe elegido no existe en la base de datos.';
  if (code === '23514' || /check constraint/i.test(text)) return 'Un valor no cumple una restricción de la base de datos (por ejemplo, el rol).';
  if (code === 'PGRST204' || /column .* does not exist|schema cache/i.test(text)) return 'La tabla de usuarios no tiene una columna que la app intenta guardar: falta aplicar migraciones.';
  if (/Failed to send a request|FunctionsFetchError|Failed to fetch|NetworkError/i.test(text)) return 'No se pudo contactar la función «admin-users». Revisa que esté desplegada en el servidor y que haya conexión.';
  if (/non-2xx/i.test(text)) return 'La función «admin-users» respondió con un error sin detalle. Revisa su despliegue y sus registros.';
  return raw || 'Error desconocido (revisa la consola del navegador).';
}


export function UsersManagement() {
  const [users, setUsers] = useState<(User & { office?: Office; offices?: Office[]; manager?: User; managers?: User[] })[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    identification: '',
    full_name: '',
    email: '',
    role: 'colaborador_vaf' as UserRole,
    office_ids: [] as string[],
    manager_ids: [] as string[],
    campus: '',
  });
  const [officeQuery, setOfficeQuery] = useState('');
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('');
  const [managerQuery, setManagerQuery] = useState('');
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const [campusFilter, setCampusFilter] = useState<string>('');
  const { user: adminUser } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [alta, setAlta] = useState<Alta | null>(null);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const altaRef = useRef<Alta | null>(null);
  altaRef.current = alta;

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // load canonical roles from DB to map form values
    (async () => {
      try {
        const { data, error } = await supabase.from('roles').select('key,label').order('label');
        if (error) throw error;
        setRoles((data as Role[]) || []);
      } catch (err) {
        console.error('Error loading roles in UsersManagement:', err);
      }
    })();
  }, []);

  // Crea la cuenta de acceso (Auth) mediante la función admin-users, que usa la llave de servicio: no cambia la sesión del
  // administrador, deja la cuenta confirmada y reutiliza correos huérfanos de usuarios ya borrados.
  // Devuelve la misma forma que signUp ({ data: { user: { id } }, error }) para no tocar los flujos que la usan.
  const signUpPreserveCreator = async (opts: { email: string; password: string }) => {
    const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'create', ...opts } });
    if (error) {
      let message = error.message;
      const status = (error as any).context?.status ?? 400;
      let raw = '';
      try {
        raw = await (error as any).context?.text?.() ?? '';
        let j: any = null;
        try { j = JSON.parse(raw); } catch { /* no es JSON */ }
        message = j?.error || j?.message || j?.msg || message;
      } catch { /* sin cuerpo */ }
      if (status === 404) message = 'La función «admin-users» no está desplegada en el servidor (404). Despliégala con: bash supabase/subir-funcion.sh admin-users';
      else if (status === 401 || status === 403) message = message || 'Tu sesión no tiene permiso de administrador para crear usuarios.';
      else if (message === error.message) message = friendlyError(error) + ` [HTTP ${status}${raw ? `: ${raw.slice(0, 200)}` : ''}]`;
      console.error('admin-users', status, raw);
      return { data: null as any, error: { message, status } as any };
    }
    return { data: { user: { id: data.id } } as any, error: null };
  };

  // Sync collaborator_offices: add new ones, remove missing ones
  const ensureCollaboratorOffices = async (userId: string | null | undefined, officeIds: string[] | undefined) => {
    if (!userId) return;
    const targetIds = (officeIds || []).filter(Boolean);

    try {
      // Get existing relations
      const { data: existing, error } = await supabase
        .from('collaborator_offices')
        .select('id, office_id')
        .eq('collaborator_id', userId);

      if (error) throw error;

      const existingRows = (existing as any[]) || [];
      const existingOfficeIds = new Set(existingRows.map(r => r.office_id));

      // Identify additions and removals
      const toAdd = targetIds.filter(id => !existingOfficeIds.has(id));
      const toRemove = existingRows.filter(r => !targetIds.includes(r.office_id));

      // Execute additions
      if (toAdd.length > 0) {
        const rows = toAdd.map(office_id => ({ collaborator_id: userId, office_id }));
        const { error: insErr } = await supabase.from('collaborator_offices').insert(rows);
        if (insErr) console.error('Error inserting collaborator_offices:', insErr);
      }

      // Execute removals
      if (toRemove.length > 0) {
        const idsToRemove = toRemove.map(r => r.id);
        const { error: delErr } = await supabase.from('collaborator_offices').delete().in('id', idsToRemove);
        if (delErr) console.error('Error deleting collaborator_offices:', delErr);
      }

    } catch (e) {
      console.error('Error syncing collaborator_offices for user:', e);
    }
  };

  // Helper to create or update a corresponding `colaboradores` row when a user
  // with a manager role is created. Uses the same id as the created user so
  // evaluations and lookups that prefer `colaboradores.id` will match.
  const upsertCollaboratorForUser = async (userId: string | null | undefined, payload: { identification: string; full_name: string; email?: string | null; role: string; campus?: string | null; manager_id?: string | null; office_id?: string | null }) => {
    if (!userId) return;
    try {
      // Only create collaborator entries for manager-type roles
      const managerRoles = ['office_manager', 'jefe_vaf', 'jefe_campus_vaf'];
      if (!managerRoles.includes(payload.role)) return;

      // Map user role to collaborator role keys if necessary
      const collabRole = payload.role === 'office_manager' ? 'office_manager' : payload.role === 'jefe_vaf' ? 'jefe_vaf' : payload.role === 'jefe_campus_vaf' ? 'jefe_campus_vaf' : 'colaborador_vaf';

      // Check if a collaborator with this id already exists
      const { data: existingById } = await supabase.from('colaboradores').select('id').eq('id', userId).maybeSingle();
      if (existingById && existingById.id) {
        await supabase.from('colaboradores').update({ full_name: payload.full_name, email: payload.email || null, role: collabRole, campus: payload.campus || null, updated_at: new Date().toISOString() }).eq('id', userId);
        return;
      }

      // If not, try to find by identification and upsert using that id
      const { data: existingByIdent } = await supabase.from('colaboradores').select('id').eq('identification', payload.identification).maybeSingle();
      if (existingByIdent && existingByIdent.id) {
        await supabase.from('colaboradores').update({ id: existingByIdent.id, full_name: payload.full_name, email: payload.email || null, role: collabRole, campus: payload.campus || null, updated_at: new Date().toISOString() }).eq('id', existingByIdent.id);
        return;
      }

      // Insert a new collaborator using the user id so they link
      await supabase.from('colaboradores').insert([{ id: userId, identification: payload.identification, full_name: payload.full_name, email: payload.email || null, role: collabRole, manager_id: payload.manager_id || null, campus: payload.campus || null, updated_at: new Date().toISOString() }]);
      // Ensure collaborator_offices relation exists if an office_id was provided
      if (payload.office_id) {
        try {
          const { data: existingRel } = await supabase.from('collaborator_offices').select('office_id').eq('collaborator_id', userId).eq('office_id', payload.office_id).maybeSingle();
          if (!existingRel) {
            await supabase.from('collaborator_offices').insert([{ collaborator_id: userId, office_id: payload.office_id }]);
          }
        } catch (e) {
          console.warn('Could not ensure collaborator_offices mapping for user->office', e);
        }
      }
    } catch (e) {
      console.error('Error upserting collaborator for user:', e);
    }
  };

  const loadData = async () => {
    try {
      const [usersRes, officesRes, collabOfficesRes, userManagersRes] = await Promise.all([
        supabase.from('users').select('*').order('full_name'),
        supabase.from('offices').select('*').order('name'),
        supabase.from('collaborator_offices').select('*'),
        supabase.from('user_managers').select('*'),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (officesRes.error) throw officesRes.error;
      if (userManagersRes.error) throw userManagersRes.error;

      const allUsers = usersRes.data || [];
      const userManagers = (userManagersRes.data as any[]) || [];

      const managersByUser: Record<string, string[]> = {};
      userManagers.forEach((um) => {
        if (!managersByUser[um.user_id]) managersByUser[um.user_id] = [];
        if (um.manager_id) managersByUser[um.user_id].push(um.manager_id);
      });

      const usersWithRelations = allUsers.map((user) => {
        const officeIds = (collabOfficesRes.data || [])
          .filter((co: any) => co.collaborator_id === user.id)
          .map((co: any) => co.office_id);
        const userOffices = (officesRes.data || []).filter((o: any) => officeIds.includes(o.id));
        const office = userOffices[0] || officesRes.data?.find((o: any) => o.id === user.office_id) || null;
        const manager = allUsers.find((u) => u.id === user.manager_id);
        const managerIds = managersByUser[user.id] || (user.manager_id ? [user.manager_id] : []);
        const managers = managerIds.map((mid) => allUsers.find((u) => u.id === mid)).filter(Boolean) as User[];
        return { ...user, office, offices: userOffices, manager, managers };
      });

      setUsers(usersWithRelations);
      setOffices(officesRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sync helpers for user_managers table based on selected IDs
  const upsertUserManagers = async (userId: string | null | undefined, managerIds: string[] | undefined, officeIds?: string[] | undefined) => {
    if (!userId) return;
    const targetIds = (managerIds || []).filter(Boolean);
    try {
      const { data: existing, error } = await supabase
        .from('user_managers')
        .select('id, manager_id, office_id')
        .eq('user_id', userId);
      if (error) throw error;
      const existingRows = (existing as any[]) || [];
      const existingIds = new Set(existingRows.map((r) => r.manager_id));
      const toAdd = targetIds.filter((id) => !existingIds.has(id));
      const toRemove = existingRows.filter((r) => !targetIds.includes(r.manager_id));

      // Insert new relations (pick first selected office if provided for uniqueness triple)
      if (toAdd.length > 0) {
        const officeId = officeIds && officeIds.length > 0 ? officeIds[0] : null;
        const rows = toAdd.map((manager_id) => ({ user_id: userId, manager_id, office_id: officeId }));
        const { error: insErr } = await supabase.from('user_managers').insert(rows);
        if (insErr) console.error('Error inserting user_managers:', insErr);
      }

      // Remove stale relations
      for (const row of toRemove) {
        const { error: delErr } = await supabase.from('user_managers').delete().eq('id', row.id);
        if (delErr) console.error('Error deleting user_managers row:', delErr);
      }
    } catch (e) {
      console.error('Error syncing user_managers:', e);
    }
  };

  // Determine allowed manager candidates based on the selected role
  const getManagerCandidatesForRole = (selectedRoleKey: string | undefined) => {
    if (!selectedRoleKey) return [] as User[];

    // Helper: find role keys by label (case-insensitive)
    const roleKeysByLabels = (labels: string[]) => {
      const lower = labels.map((l) => l.toLowerCase());
      const keys = (roles || [])
        .filter((r) => r.label && lower.includes(r.label.toLowerCase()))
        .map((r) => r.key);
      return keys;
    };

    const leadershipLabels = ['Lider VAF', 'Rectoria', 'Vicerrectoria Académica'];
    const directorProgramLabel = ['Director de Programa'];
    const liderProcesoLabels = ['Lider de Proceso', 'Subproceso VAF', 'Lider de Proceso VAF'];


    // Manager candidates for coordination roles: Bienestar, Directors, Leaders, Rectoría, Vicerrectoría
    const coordinationManagerLabels = [
      'Dirección de bienestar institucional',
      'Direccion de bienestar institucional',
      'Director de Programa',
      'Directores de Programa',
      'Lider VAF',
      'Líder VAF',
      'Lider de Proceso',
      'Líderes de Proceso',
      'Subproceso VAF',
      'Subprocesos VAF',
      'Lider de Proceso VAF',
      'Rectoria',
      'Rectoría',
      'Vicerrectoria Académica',
      'Vicerrectoría Académica',
    ];

    const rolesWithLeadershipAsManager = [
      'Colaborador',
      'Colaboradores',
      'Colaboradores VAF',
      'Coordinador Académico',
      'Directores de Programa',
      'Jefe de campus VAF',
      'Lideres de Proceso',
      'Subprocesos VAF',
      'Personal Operativo',
    ];

    // New coordination roles requiring manager
    const coordinationRoles = [
      'Coordinación de Extensión',
      'Coordinacion de Extension',
      'Coordinación Desarrollo Profesoral',
      'Coordinacion Desarrollo Profesoral',
      'Coordinación de Gestión Curricular',
      'Coordinacion de Gestion Curricular',
      'Coordinador Académico',
      'Coordinadores Académicos',
      'Coordinador Academico',
      'Coordinadores Academicos',
    ];

    let managerRoleKeys: string[] = [];

    const selRoleLabel = (roles || []).find((r) => r.key === selectedRoleKey)?.label || '';
    const selLabelLower = selRoleLabel.toLowerCase();

    // If the selected role is a Director de Programa, prefer Vicerrectoría roles as managers
    const vicerrectoriaLabels = ['Vicerrectoria Académica', 'Vicerrectoría Académica', 'Vicerrectorias', 'Vicerrectoría'];
    if (selLabelLower.includes('director de programa') || selectedRoleKey.toLowerCase().includes('director_programa') || selectedRoleKey.toLowerCase().includes('director')) {
      managerRoleKeys = roleKeysByLabels(vicerrectoriaLabels);
    }

    // Check if role is one of the new coordination roles
    const isCoordinationRole = coordinationRoles.some((rlabel) =>
      selLabelLower.includes(rlabel.toLowerCase()) ||
      selectedRoleKey.toLowerCase().includes(rlabel.toLowerCase().replace(/\s+/g, '_'))
    );

    if (isCoordinationRole) {
      // Coordination roles can have: Bienestar, Directors, Leaders, Rectoría, Vicerrectoría
      managerRoleKeys = roleKeysByLabels(coordinationManagerLabels);
    } else if (selLabelLower.includes('coordinador acad') || selectedRoleKey.toLowerCase().includes('coordinador')) {
      managerRoleKeys = roleKeysByLabels(directorProgramLabel);
    } else if (selLabelLower.includes('colaborador vaf') || selectedRoleKey.toLowerCase().includes('colaborador_vaf')) {
      managerRoleKeys = roleKeysByLabels(liderProcesoLabels);
    } else if (rolesWithLeadershipAsManager.some((rlabel) => selLabelLower.includes(rlabel.toLowerCase()) || selectedRoleKey.toLowerCase().includes(rlabel.toLowerCase().replace(/\s+/g, '_')))) {
      managerRoleKeys = roleKeysByLabels(leadershipLabels);
    }

    // Default fallback canonical keys if mapping not found
    if (managerRoleKeys.length === 0) {
      managerRoleKeys = ['lider_vaf', 'rectoria', 'vicerrectoria_academica', 'director_programa', 'lider_proceso', 'subproceso_vaf'];
    }

    // Lowercase keywords to match labels/keys loosely
    const leadershipKeywords = ['lider', 'lider vaf', 'rector', 'rectoria', 'vicerrector', 'vicerrectoria', 'director', 'jefe', 'coordinador', 'lider de proceso', 'subproceso'];

    // Helper to get role label for a user by matching roles table
    const getRoleLabelForUser = (roleKey: string | undefined) => {
      if (!roleKey) return '';
      return (roles || []).find((r) => r.key === roleKey)?.label?.toLowerCase() || '';
    };

    // Candidates match if their role key is in managerRoleKeys OR their role label/key contains leadership keywords
    let candidates = (users || []).filter((u) => {
      const roleKey = (u.role || '').toLowerCase();
      const roleLabel = getRoleLabelForUser(u.role).toLowerCase();

      const matchesCanonical = managerRoleKeys.some((k) => roleKey === k || roleKey.includes(k));
      const matchesKeyword = leadershipKeywords.some((kw) => roleKey.includes(kw) || roleLabel.includes(kw));
      return matchesCanonical || matchesKeyword;
    });

    // Prefer candidates in the same selected office(s) when present
    // Prefer candidates in the same selected office(s) by sorting them to the top,
    // but DO NOT exclude others (like Vicerrectoría) who may be in central offices.
    if (formData.office_ids && formData.office_ids.length > 0) {
      candidates.sort((a, b) => {
        const aIsSame = ((a as any).office_id && formData.office_ids.includes((a as any).office_id)) || ((a as any).offices && (a as any).offices.some((o: any) => formData.office_ids.includes(o.id)));
        const bIsSame = ((b as any).office_id && formData.office_ids.includes((b as any).office_id)) || ((b as any).offices && (b as any).offices.some((o: any) => formData.office_ids.includes(o.id)));
        if (aIsSame && !bIsSame) return -1;
        if (!aIsSame && bIsSame) return 1;
        return 0;
      });
    }

    return candidates;
  };

  // Allow any user to have managers (bosses). Include users with campus 'Todas' as universal managers.
  // If role-specific filtering yields no results, fall back to all users. Exclude the editing user.
  const managerCandidates = (() => {
    const roleBased = getManagerCandidatesForRole(formData.role as string) || [];
    const universalCampus = users.filter((u) => ((u.campus || '').toString().toLowerCase() === 'todas'));
    let base = roleBased.length > 0 ? [...roleBased, ...universalCampus] : [...users, ...universalCampus];
    // Deduplicate by id while preserving order
    const seen = new Set<string>();
    const dedup: typeof users = [];
    for (const u of base) {
      if (!u || !u.id) continue;
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      dedup.push(u);
    }
    return dedup.filter((u) => u.id !== editingUser?.id);
  })();



  const getFallbackManagerCandidates = () => {
    const fallbackKeys = ['lider_vaf', 'rectoria', 'vicerrectoria_academica', 'director_programa', 'lider_proceso', 'subproceso_vaf', 'office_manager'];
    const keywords = ['lider', 'rector', 'vicerrector', 'director', 'jefe', 'coordinador', 'manager', 'oficina'];
    const byKey = (users || []).filter((u) => fallbackKeys.includes(u.role));
    const byKeyword = (users || []).filter((u) => {
      const key = (u.role || '').toLowerCase();
      const label = (roles || []).find((r) => r.key === u.role)?.label?.toLowerCase() || '';
      return keywords.some((kw) => key.includes(kw) || label.includes(kw));
    });
    // Merge unique
    const map = new Map<string, typeof users[0]>();
    byKey.concat(byKeyword).forEach((u) => { if (u && u.id) map.set(u.id, u); });
    return Array.from(map.values());
  };

  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const makeEntry = (id: string, name: string, email: string, password: string): MailEntry => {
    const real = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.toLowerCase().endsWith('@evaluation.local');
    return { id, name, email, password, status: real ? 'pending' : 'skipped', error: real ? undefined : 'No tiene un correo real registrado.' };
  };

  // Envía el correo de bienvenida por lotes. Un fallo nunca deshace la creación: el usuario queda creado y se marca «sin enviar».
  const sendWelcome = async (entries: MailEntry[]) => {
    const targets = entries.filter((m) => m.status === 'pending' || m.status === 'failed');
    if (!adminUser || targets.length === 0) { setAlta((a) => (a ? { ...a, working: false, step: '' } : a)); return; }
    const patch = (ids: string[], f: (m: MailEntry) => MailEntry) => setAlta((a) => (a ? { ...a, mails: a.mails.map((m) => (ids.includes(m.id) ? f(m) : m)) } : a));
    setAlta((a) => (a ? { ...a, working: true, step: 'Enviando correos de bienvenida' } : a));
    const BATCH = 8;
    for (let i = 0; i < targets.length; i += BATCH) {
      const part = targets.slice(i, i + BATCH);
      const ids = part.map((m) => m.id);
      patch(ids, (m) => ({ ...m, status: 'sending', error: undefined }));
      let wait = 0;
      try {
        const res: any = await callCorreos(adminUser, 'usuario_bienvenida', { users: part.map((m) => ({ userId: m.id, password: m.password })) });
        const byId: Record<string, any> = {};
        (res?.results ?? []).forEach((r: any) => { byId[r.userId] = r; });
        patch(ids, (m) => {
          const r = byId[m.id];
          if (!r) return { ...m, status: 'failed', error: 'El servidor no devolvió resultado.' };
          return { ...m, status: r.status === 'sent' ? 'sent' : r.status === 'skipped' ? 'skipped' : 'failed', error: r.error };
        });
        wait = Math.min(Number(res?.waitMs) || 0, 30000);
      } catch (e: any) {
        patch(ids, (m) => ({ ...m, status: 'failed', error: e?.message || 'No se pudo contactar el servicio de correos.' }));
      }
      if (wait > 0 && i + BATCH < targets.length) await pause(wait);
    }
    setAlta((a) => (a ? { ...a, working: false, step: '' } : a));
  };

  const retryFailedMails = () => {
    const failed = (altaRef.current?.mails ?? []).filter((m) => m.status === 'failed');
    if (failed.length) void sendWelcome(failed);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    let createdEntry: MailEntry | null = null;

    try {
      // Map the selected role to a canonical role.key from `roles` table
      const knownRoleKeys = (roles || []).map((r) => r.key);
      const resolveRoleKey = (input: string) => {
        if (!input) return 'colaborador_vaf';
        // direct match
        if (knownRoleKeys.includes(input)) return input;
        // match by label (case-insensitive)
        const byLabel = (roles || []).find((r) => r.label && r.label.toLowerCase() === input.toLowerCase());
        if (byLabel) return byLabel.key;
        const lower = input.toLowerCase();
        // explicit legacy mappings
        if (['colaborador', 'colaborador vaf', 'colaborador_vaf', 'employee', 'empleado'].includes(lower)) return 'colaborador_vaf';
        if (['jefe de oficina', 'jefe_de_oficina', 'jefe_oficina', 'office_manager'].includes(lower)) return 'office_manager';
        if (['jefe vaf', 'jefe_vaf'].includes(lower)) return 'jefe_vaf';
        if (['jefe campus vaf', 'jefe_campus_vaf'].includes(lower)) return 'jefe_campus_vaf';
        if (['admin', 'administrador', 'administrador del sistema'].includes(lower)) return 'admin';
        return 'colaborador_vaf';
      };

      const roleToSave = resolveRoleKey(formData.role as string);
      const roleIdToSave = (roles || []).find(r => r.key === roleToSave)?.id;

      const userData = {
        identification: formData.identification,
        full_name: formData.full_name,
        email: formData.email || null,
        role: roleToSave,
        role_id: roleIdToSave, // Save role_id
        office_id: formData.office_ids && formData.office_ids.length > 0 ? formData.office_ids[0] : null,
        manager_id: formData.manager_ids && formData.manager_ids.length > 0 ? formData.manager_ids[0] : null,
        campus: formData.campus || null,
        updated_at: new Date().toISOString(),
      };

      if (editingUser) {
        const { error } = await supabase.from('users').update(userData).eq('id', editingUser.id);
        if (error) throw error;
        await upsertUserManagers(editingUser.id, formData.manager_ids, formData.office_ids);
        await ensureCollaboratorOffices(editingUser.id, formData.office_ids);
      } else {
        // La cuenta de acceso (Auth) usa como clave inicial la cédula; users.id debe coincidir con la cuenta.
        const identification = formData.identification.trim();
        const emailToUse = (formData.email || '').trim() || `${identification}@evaluation.local`;
        const passwordToUse = identification;
        if (!identification) throw new Error('Falta la cédula.');
        if (passwordToUse.length < 6) throw new Error('La cédula debe tener al menos 6 caracteres: se usa como clave inicial de acceso.');

        const { data: signUpData, error: signUpError } = await signUpPreserveCreator({ email: emailToUse, password: passwordToUse });
        if (signUpError) throw new Error(signUpError.message);
        const createdUserId: string | null = (signUpData as any)?.user?.id || null;
        if (!createdUserId) throw new Error('La función admin-users no devolvió el id de la cuenta creada.');

        const { error: userError } = await supabase.from('users').insert([{ ...userData, id: createdUserId, email: emailToUse, role: roleToSave }]);
        if (userError) {
          console.error('Error inserting into users table:', userError);
          throw new Error(`La cuenta de acceso se creó pero no se pudo guardar el perfil: ${friendlyError(userError)} (puedes reintentar: la cuenta se reutiliza).`);
        }
        await upsertCollaboratorForUser(createdUserId, {
          identification: formData.identification,
          full_name: formData.full_name,
          email: emailToUse,
          role: roleToSave,
          campus: formData.campus || null,
          manager_id: formData.manager_ids && formData.manager_ids.length > 0 ? formData.manager_ids[0] : null,
        });
        await ensureCollaboratorOffices(createdUserId, formData.office_ids);
        await upsertUserManagers(createdUserId, formData.manager_ids, formData.office_ids);
        createdEntry = makeEntry(createdUserId, formData.full_name, emailToUse, passwordToUse);
      }

      resetForm();
      loadData();
      if (createdEntry) {
        const entry = createdEntry;
        setAlta({ title: 'Usuario creado', working: entry.status === 'pending', step: '', created: 1, updated: 0, rowErrors: [], mails: [entry], progress: null });
        void sendWelcome([entry]);
      }
    } catch (error: any) {
      console.error('Error saving user:', error);
      setFormError(friendlyError(error));
    }
  };

  const handleEdit = (user: User & { managers?: User[]; offices?: Office[]; office?: Office }) => {
    setEditingUser(user);
    setFormData({
      identification: user.identification,
      full_name: user.full_name,
      email: user.email || '',
      role: user.role,
      office_ids: (user as any).offices ? (user as any).offices.map((o: Office) => o.id) : (user as any).office ? [(user as any).office.id] : [],
      manager_ids: user.managers ? user.managers.map((m) => m.id) : (user.manager_id ? [user.manager_id] : []),
      campus: user.campus || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este usuario?')) return;

    try {
      // Borra el perfil y también la cuenta de Auth, para poder volver a usar el correo.
      const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'delete', userId: id } });
      if (error) {
        let message = error.message;
        try { message = (await (error as any).context?.json())?.error || message; } catch { /* sin cuerpo */ }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      loadData();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      alert('Error al eliminar el usuario: ' + friendlyError(error));
    }
  };

  const resetForm = () => {
    setFormData({
      identification: '',
      full_name: '',
      email: '',
      role: 'colaborador_vaf',
      office_ids: [],
      manager_ids: [],
      campus: '',
    });
    setEditingUser(null);
    setFormError(null);
    setShowForm(false);
  };

  const filteredUsers = users.filter(
    (user) => {
      const matchesSearch = user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.identification.includes(searchTerm);
      const matchesCampus = !campusFilter || campusFilter === '' || (user.campus || '').toLowerCase() === campusFilter.toLowerCase();
      return matchesSearch && matchesCampus;
    }
  );

  // Pagination Logic
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, campusFilter]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  const handleImport = async () => {
    if (!importFile) return;

    const rowErrors: string[] = [];
    const created: MailEntry[] = [];
    let updated = 0;

    try {
      const data = await importFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet) as any[];
      if (jsonData.length === 0) { alert('El archivo no tiene filas para importar.'); return; }

      // Build import role resolver using canonical roles loaded from DB
      const importResolveRole = (labelOrKey: string) => {
        if (!labelOrKey) return 'colaborador_vaf';
        const known = roles.find((r) => r.key === labelOrKey || (r.label && r.label.toLowerCase() === labelOrKey.toLowerCase()));
        if (known) return known.key;
        const lower = labelOrKey.toLowerCase();
        if (['colaborador', 'colaborador vaf', 'colaborador_vaf', 'employee', 'empleado'].includes(lower)) return 'colaborador_vaf';
        if (['jefe de oficina', 'jefe_de_oficina', 'jefe_oficina', 'office_manager', 'jefe vaf', 'jefe_vaf'].includes(lower)) return 'office_manager';
        if (['jefe campus vaf', 'jefe_campus_vaf'].includes(lower)) return 'jefe_campus_vaf';
        if (['admin', 'administrador'].includes(lower)) return 'admin';
        return 'colaborador_vaf';
      };

      const officeMap = offices.reduce((acc, office) => {
        acc[office.name.toLowerCase()] = office.id;
        return acc;
      }, {} as Record<string, string>);

      const managerMap = users.reduce((acc, user) => {
        acc[user.full_name.trim().toLowerCase()] = user.id;
        return acc;
      }, {} as Record<string, string>);

      const seenIdent = new Set<string>();
      setImportProgress({ done: 0, total: jsonData.length });

      // Cada fila es independiente: un error en una no detiene las demás y se reporta con su número de fila del Excel.
      for (let idx = 0; idx < jsonData.length; idx++) {
        const row = jsonData[idx];
        const identification = row['No. de Cedula']?.toString().trim();
        const full_name = row['Nombre Completo']?.toString().trim();
        const label = `Fila ${idx + 2} (${full_name || identification || 'sin nombre'})`;
        try {
          const email = row['Correo']?.toString().trim() || null;
          const roleStr = row['Rol']?.toString().trim();
          const officeName = row['Oficina']?.toString().trim();
          const managerName = row['Jefe Inmediato']?.toString().trim();
          const campus = row['Campus']?.toString().trim() || null;

          if (!identification || !full_name || !roleStr) throw new Error('Falta cédula, nombre o rol.');
          if (identification.length < 6) throw new Error('La cédula debe tener al menos 6 caracteres: se usa como clave inicial.');
          if (seenIdent.has(identification)) throw new Error('La cédula está repetida en el archivo.');
          seenIdent.add(identification);
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`El correo «${email}» no es válido.`);

          const role = importResolveRole(roleStr);

          // Support multiple offices in the 'Oficina' column separated by commas/semicolons
          const officeNames = officeName ? officeName.split(/[;,|]/).map((x: string) => x.trim()).filter(Boolean) : [];
          const office_ids = officeNames.map((n: string) => officeMap[n.toLowerCase()]).filter(Boolean);
          const office_id = office_ids.length > 0 ? office_ids[0] : null;
          // Support multiple managers separated by commas/semicolons
          const managerNames = managerName ? managerName.split(/[;,|]/).map((x: string) => x.trim()).filter(Boolean) : [];
          const manager_ids = managerNames.map((n: string) => managerMap[n.toLowerCase()]).filter(Boolean);
          const manager_id = manager_ids.length > 0 ? manager_ids[0] : null;

          const emailToUse = email || `${identification}@evaluation.local`;
          const passwordToUse = identification;

          let createdUserId: string | null = null;
          let isNew = true;
          const { data: signUpData, error: signUpError } = await signUpPreserveCreator({ email: emailToUse, password: passwordToUse });
          if (signUpError) {
            if (signUpError.status !== 409) throw new Error(signUpError.message);
            // Ya existe el usuario con ese correo: se actualiza su perfil y no se le envía correo (su clave actual se desconoce).
            const { data: existingUser } = await supabase.from('users').select('id').eq('email', emailToUse).maybeSingle();
            if (!existingUser?.id) throw new Error(signUpError.message);
            createdUserId = existingUser.id;
            isNew = false;
          } else {
            createdUserId = (signUpData as any)?.user?.id || null;
          }
          if (!createdUserId) throw new Error('No se pudo obtener el id de la cuenta creada.');

          const { error: userError } = await supabase.from('users').upsert([{
            id: createdUserId,
            identification,
            full_name,
            email: emailToUse,
            role,
            office_id,
            manager_id,
            campus,
            updated_at: new Date().toISOString()
          }]);
          if (userError) throw new Error(`La cuenta de acceso se creó pero el perfil falló: ${friendlyError(userError)}`);

          await upsertCollaboratorForUser(createdUserId, { identification, full_name, email: emailToUse, role, campus, manager_id, office_id });
          await ensureCollaboratorOffices(createdUserId, office_ids);
          await upsertUserManagers(createdUserId, manager_ids, office_ids);

          if (isNew) created.push(makeEntry(createdUserId, full_name, emailToUse, passwordToUse));
          else updated++;
        } catch (rowError: any) {
          console.error(`Error importando ${label}:`, rowError);
          rowErrors.push(`${label}: ${friendlyError(rowError)}`);
        }
        setImportProgress({ done: idx + 1, total: jsonData.length });
      }

      setImportProgress(null);
      setShowImport(false);
      setImportFile(null);
      loadData();
      setAlta({ title: 'Resultado de la carga masiva', working: created.some((m) => m.status === 'pending'), step: '', created: created.length, updated, rowErrors, mails: created, progress: null });
      void sendWelcome(created);
    } catch (error: any) {
      console.error('Error importing:', error);
      setImportProgress(null);
      alert(`No se pudo leer o procesar el archivo: ${friendlyError(error)}`);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Gestión de Personal
          </h2>
          <p className="text-slate-500 text-sm mt-1">Administra los colaboradores, roles y asignaciones.</p>
        </div>
        {!showForm && !showImport && (
          <div className="flex gap-3">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl transition-all font-medium shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Importar
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl transition-all font-medium shadow-lg shadow-blue-600/20"
            >
              <Plus className="w-4 h-4" />
              Nuevo Usuario
            </button>
          </div>
        )}
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar por nombre o cédula..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
            />
          </div>
          <div className="relative md:w-64">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <select
              value={campusFilter}
              onChange={(e) => setCampusFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm appearance-none cursor-pointer"
            >
              <option value="">Todos los campus</option>
              <option value="Valledupar">Valledupar</option>
              <option value="Bogota">Bogota</option>
              <option value="Cúcuta">Cúcuta</option>
              <option value="Bucaramanga">Bucaramanga</option>
              <option value="Arauca">Arauca</option>
              <option value="Todas">Todas</option>
            </select>
          </div>
        </div>

        <div className="text-sm text-slate-500 font-medium">
          Mostrando <span className="text-slate-900">{filteredUsers.length}</span> colaboradores
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre / Cédula</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Rol</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Ubicación</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Jefes Inmediatos</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-800">{user.full_name}</span>
                      <span className="text-xs text-slate-500 font-mono">{user.identification}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold capitalize border border-blue-100">
                      {user.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-slate-700 font-medium">{user.campus || 'Sin Campus'}</span>
                      <div className="flex flex-wrap gap-1">
                        {(user.offices && user.offices.length > 0) ? (
                          user.offices.slice(0, 2).map((o) => (
                            <span key={o.id} className="inline-flex text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              {o.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">{user.office?.name || '-'}</span>
                        )}
                        {user.offices && user.offices.length > 2 && (
                          <span className="text-[10px] text-slate-400">+{user.offices.length - 2} más</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-600 max-w-xs truncate">
                      {(user.managers && user.managers.length > 0) ? (
                        <div className="flex flex-wrap gap-1">
                          {user.managers.map(m => (
                            <span key={m.id} className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-100">
                              {m.full_name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Sin asignar</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEdit(user)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-8 h-8 opacity-20" />
                      <p>No se encontraron usuarios que coincidan con la búsqueda.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Mostrar</span>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>por página</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg hover:bg-white hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all text-slate-600"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {getPageNumbers().map((page, idx) => (
              <button
                key={idx}
                onClick={() => typeof page === 'number' && setCurrentPage(page)}
                disabled={page === '...'}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${page === currentPage
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : page === '...'
                    ? 'text-slate-400 cursor-default'
                    : 'text-slate-600 hover:bg-white hover:shadow-sm'
                  }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg hover:bg-white hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all text-slate-600"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Create/Edit User Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md px-8 py-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-800">
                  {editingUser ? 'Editar Colaborador' : 'Nuevo Colaborador'}
                </h3>
                <p className="text-sm text-slate-500">Complete la información del personal</p>
              </div>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              {formError && (
                <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 animate-in fade-in duration-200">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div><p className="font-bold">No se pudo guardar el usuario</p><p className="mt-0.5">{formError}</p></div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Cédula / Identificación</label>
                  <input
                    type="text"
                    value={formData.identification}
                    onChange={(e) => setFormData({ ...formData, identification: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                    required
                    disabled={!!editingUser}
                    placeholder="Ej. 123456789"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Nombre Completo</label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                    required
                    placeholder="Ej. Juan Pérez"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Correo Electrónico</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                    placeholder="juan.perez@udes.edu.co"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Rol del Sistema</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none cursor-pointer"
                    required
                  >
                    {roles && roles.length > 0 ? (
                      roles.map((r) => (
                        <option key={r.key} value={r.key}>{r.label}</option>
                      ))
                    ) : (
                      <>
                        <option value="employee">Colaborador</option>
                        <option value="office_manager">Jefe de Oficina</option>
                        <option value="admin">Administrador</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Campus</label>
                  <select
                    value={formData.campus}
                    onChange={(e) => setFormData({ ...formData, campus: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none cursor-pointer"
                  >
                    <option value="">Sin asignar</option>
                    <option value="Valledupar">Valledupar</option>
                    <option value="Bogota">Bogota</option>
                    <option value="Cúcuta">Cúcuta</option>
                    <option value="Bucaramanga">Bucaramanga</option>
                    <option value="Arauca">Arauca</option>
                    <option value="Todas">Todas</option>
                  </select>
                </div>

                {/* Offices Selection */}
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700">Oficinas Asignadas</label>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={officeQuery}
                          onChange={(e) => setOfficeQuery(e.target.value)}
                          placeholder="Buscar oficina para agregar..."
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm"
                        />
                        {officeQuery && (
                          <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-auto">
                            {offices
                              .filter((o) => o.name.toLowerCase().includes(officeQuery.toLowerCase()))
                              .slice(0, 20)
                              .map((o) => (
                                <button
                                  type="button"
                                  key={o.id}
                                  onClick={() => { setSelectedOfficeId(o.id); setOfficeQuery(o.name); }}
                                  className={`w-full text-left px-4 py-2 hover:bg-blue-50 text-sm ${selectedOfficeId === o.id ? 'bg-blue-50 text-blue-700' : 'text-slate-700'}`}
                                >
                                  {o.name}
                                </button>
                              ))}
                            {offices.filter((o) => o.name.toLowerCase().includes(officeQuery.toLowerCase())).length === 0 && (
                              <div className="px-4 py-2 text-sm text-slate-500">Sin resultados</div>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedOfficeId) return;
                          if (!formData.office_ids.includes(selectedOfficeId)) {
                            setFormData({ ...formData, office_ids: [...formData.office_ids, selectedOfficeId] });
                          }
                          setOfficeQuery('');
                          setSelectedOfficeId('');
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors"
                      >
                        Agregar
                      </button>
                    </div>

                    {formData.office_ids.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {formData.office_ids.map((id) => {
                          const o = offices.find((x) => x.id === id);
                          if (!o) return null;
                          return (
                            <span key={id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm shadow-sm">
                              {o.name}
                              <button
                                type="button"
                                onClick={() => setFormData({ ...formData, office_ids: formData.office_ids.filter((x) => x !== id) })}
                                className="text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No hay oficinas asignadas.</p>
                    )}
                  </div>
                </div>

                {/* Managers Selection */}
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700">Jefes Inmediatos</label>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={managerQuery}
                          onChange={(e) => setManagerQuery(e.target.value)}
                          placeholder="Buscar jefe para agregar..."
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm"
                        />
                        {managerQuery && (
                          <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-auto">
                            {(managerCandidates.length > 0 ? managerCandidates : getFallbackManagerCandidates())
                              .filter((m) => m.full_name.toLowerCase().includes(managerQuery.toLowerCase()))
                              .slice(0, 20)
                              .map((m) => (
                                <button
                                  type="button"
                                  key={m.id}
                                  onClick={() => { setSelectedManagerId(m.id); setManagerQuery(m.full_name); }}
                                  className={`w-full text-left px-4 py-2 hover:bg-blue-50 text-sm ${selectedManagerId === m.id ? 'bg-blue-50 text-blue-700' : 'text-slate-700'}`}
                                >
                                  {m.full_name}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedManagerId) return;
                          if (!formData.manager_ids.includes(selectedManagerId)) {
                            setFormData({ ...formData, manager_ids: [...formData.manager_ids, selectedManagerId] });
                          }
                          setSelectedManagerId('');
                          setManagerQuery('');
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors"
                      >
                        Agregar
                      </button>
                    </div>

                    {formData.manager_ids.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {formData.manager_ids.map((mid) => {
                          const m = (managerCandidates.length > 0 ? managerCandidates : getFallbackManagerCandidates()).find((x) => x.id === mid) || (users.find((u) => u.id === mid) as any);
                          if (!m) return null;
                          return (
                            <span key={mid} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 border border-green-100 text-green-700 text-sm shadow-sm">
                              {m.full_name}
                              <button
                                type="button"
                                onClick={() => setFormData({ ...formData, manager_ids: formData.manager_ids.filter((x) => x !== mid) })}
                                className="text-green-400 hover:text-red-500 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No hay jefes asignados.</p>
                    )}
                  </div>
                </div>

              </div>

              <div className="flex gap-3 pt-6 border-t border-slate-100">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {editingUser ? 'Actualizar Colaborador' : 'Guardar Colaborador'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-3 rounded-xl font-bold transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-200 border border-slate-100 p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Importar Usuarios</h3>
              <button
                onClick={() => { if (!importProgress) { setShowImport(false); setImportFile(null); } }}
                disabled={!!importProgress}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 text-center hover:border-blue-400 transition-colors">
                <Upload className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <label className="block text-sm font-medium text-slate-700 mb-2 cursor-pointer">
                  <span className="text-blue-600 hover:underline">Selecciona un archivo Excel</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-slate-400">
                  {importFile ? importFile.name : 'Formatos soportados: .xlsx, .xls'}
                </p>
              </div>

              <div className="bg-blue-50 rounded-xl p-4 flex items-start gap-3">
                <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-blue-900">Plantilla Requerida</h4>
                  <p className="text-xs text-blue-700 mt-1 mb-2">
                    El archivo debe tener las columnas: Nombre Completo, No. de Cedula, Correo, Rol, Oficina, Jefe Inmediato, Campus
                  </p>
                  <a href={`${import.meta.env.BASE_URL}plantilla_usuarios.xlsx`} download className="text-xs font-bold text-blue-600 hover:text-blue-800 underline">
                    Descargar plantilla de ejemplo
                  </a>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleImport}
                  disabled={!importFile || !!importProgress}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-green-600/20 transition-[background-color,transform] active:scale-[0.97] motion-reduce:transition-none"
                >
                  {importProgress ? `Creando usuarios… ${importProgress.done} de ${importProgress.total}` : 'Importar Datos'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Resultado del alta: usuarios creados, correos de bienvenida y errores por fila */}
      {alta && (() => {
        const sent = alta.mails.filter((m) => m.status === 'sent').length;
        const failed = alta.mails.filter((m) => m.status === 'failed');
        const skipped = alta.mails.filter((m) => m.status === 'skipped');
        const sending = alta.mails.filter((m) => m.status === 'sending' || m.status === 'pending').length;
        const total = alta.mails.length;
        const settled = total - sending;
        const pct = total ? settled / total : 1;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div role="dialog" aria-modal="true" aria-label={alta.title} className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 border border-slate-100 p-8">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{alta.title}</h3>
                  <p className="text-sm text-slate-500 mt-1" aria-live="polite">{alta.working ? `${alta.step || 'Procesando'}…` : 'Proceso terminado'}</p>
                </div>
                <button onClick={() => setAlta(null)} disabled={alta.working} aria-label="Cerrar" className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: 'Usuarios creados', value: alta.created, tone: 'text-slate-800' },
                  { label: 'Correos enviados', value: sent, tone: 'text-green-700' },
                  { label: 'Sin enviar', value: failed.length + skipped.length + alta.rowErrors.length, tone: failed.length + skipped.length + alta.rowErrors.length ? 'text-red-700' : 'text-slate-400' },
                ].map((c) => (
                  <div key={c.label} className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                    <p className={`text-2xl font-bold tabular-nums ${c.tone}`}>{c.value}</p>
                    <p className="text-xs text-slate-500 mt-1">{c.label}</p>
                  </div>
                ))}
              </div>

              {total > 0 && (
                <div className="mb-5">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={settled} aria-label="Correos procesados">
                    <div className="h-full w-full origin-left bg-blue-600 transition-transform duration-300 ease-out motion-reduce:transition-none" style={{ transform: `scaleX(${pct})` }} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 tabular-nums">{settled} de {total} correos procesados</p>
                </div>
              )}

              {alta.updated > 0 && (
                <p className="text-sm text-slate-600 mb-4 flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />{alta.updated} {alta.updated === 1 ? 'usuario ya existía y se actualizó' : 'usuarios ya existían y se actualizaron'} (no se les envió correo).</p>
              )}

              {failed.length > 0 && (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-900 flex items-center gap-2"><Mail className="w-4 h-4" />Usuario creado, correo no enviado ({failed.length})</p>
                  <ul className="mt-2 space-y-1 text-xs text-amber-900 max-h-40 overflow-y-auto">
                    {failed.map((m) => <li key={m.id}><b>{m.name}</b> ({m.email}): {m.error || 'error desconocido'}</li>)}
                  </ul>
                </div>
              )}
              {skipped.length > 0 && (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-700">Sin correo real ({skipped.length})</p>
                  <p className="text-xs text-slate-500 mt-1">Se crearon, pero no tienen un correo registrado, así que no se les pudo avisar: {skipped.slice(0, 5).map((m) => m.name).join(', ')}{skipped.length > 5 ? ` y ${skipped.length - 5} más` : ''}.</p>
                </div>
              )}
              {alta.rowErrors.length > 0 && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-bold text-red-800 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Filas con error ({alta.rowErrors.length})</p>
                  <ul className="mt-2 space-y-1 text-xs text-red-800 max-h-48 overflow-y-auto">
                    {alta.rowErrors.map((er, i) => <li key={i}>{er}</li>)}
                  </ul>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                {failed.length > 0 && (
                  <button onClick={retryFailedMails} disabled={alta.working} className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold transition-[background-color,transform] active:scale-[0.97] motion-reduce:transition-none">
                    <RotateCw className="w-4 h-4" />Reintentar {failed.length === 1 ? 'el correo fallido' : `los ${failed.length} correos fallidos`}
                  </button>
                )}
                <button onClick={() => setAlta(null)} disabled={alta.working} className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 px-6 py-3 rounded-xl font-bold transition-[background-color,transform] active:scale-[0.97] motion-reduce:transition-none">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
