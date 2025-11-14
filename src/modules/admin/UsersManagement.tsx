import { useState, useEffect } from 'react';
import { supabase, User, Office, UserRole, Role } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Search, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

export function UsersManagement() {
  const [users, setUsers] = useState<(User & { office?: Office; offices?: Office[]; manager?: User })[]>([]);
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
    manager_id: '',
    campus: '',
  });

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

  // Helper that creates an auth user but preserves the current authenticated session
  // so the creator does not get switched to the newly created account.
  const signUpPreserveCreator = async (opts: { email: string; password: string }) => {
    const { data: currentSessionData } = await supabase.auth.getSession();
    const previousSession = (currentSessionData as any)?.session || null;
    try {
      return await supabase.auth.signUp({ email: opts.email, password: opts.password });
    } finally {
      if (previousSession) {
        try {
          await supabase.auth.setSession({
            access_token: previousSession.access_token,
            refresh_token: previousSession.refresh_token,
          } as any);
        } catch (restoreErr) {
          console.warn('Could not restore previous session after signUp:', restoreErr);
        }
      }
    }
  };

  // Ensure collaborator_offices entries exist for given user and list of office ids
  const ensureCollaboratorOffices = async (userId: string | null | undefined, officeIds: string[] | undefined) => {
    if (!userId || !officeIds || officeIds.length === 0) return;
    try {
      for (const officeId of officeIds) {
        try {
          const { data: existingRel } = await supabase.from('collaborator_offices').select('office_id').eq('collaborator_id', userId).eq('office_id', officeId).maybeSingle();
          if (!existingRel) {
            await supabase.from('collaborator_offices').insert([{ collaborator_id: userId, office_id: officeId }]);
          }
        } catch (e) {
          console.warn('Could not ensure collaborator_offices mapping for user->office', e);
        }
      }
    } catch (e) {
      console.error('Error ensuring collaborator_offices for user:', e);
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
      const [usersRes, officesRes, collabOfficesRes] = await Promise.all([
        supabase.from('users').select('*').order('full_name'),
        supabase.from('offices').select('*').order('name'),
        supabase.from('collaborator_offices').select('*'),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (officesRes.error) throw officesRes.error;

      const usersWithRelations = (usersRes.data || []).map((user) => {
        const officeIds = (collabOfficesRes.data || [])
          .filter((co: any) => co.collaborator_id === user.id)
          .map((co: any) => co.office_id);
        const userOffices = (officesRes.data || []).filter((o: any) => officeIds.includes(o.id));
        const office = userOffices[0] || officesRes.data?.find((o: any) => o.id === user.office_id) || null;
        const manager = usersRes.data?.find((u) => u.id === user.manager_id);
        return { ...user, office, offices: userOffices, manager };
      });

      setUsers(usersWithRelations);
      setOffices(officesRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
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

    let managerRoleKeys: string[] = [];

    const selRoleLabel = (roles || []).find((r) => r.key === selectedRoleKey)?.label || '';
    const selLabelLower = selRoleLabel.toLowerCase();

    if (selLabelLower.includes('coordinador acad') || selectedRoleKey.toLowerCase().includes('coordinador')) {
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
    if (formData.office_ids && formData.office_ids.length > 0) {
      const sameOffice = candidates.filter((c) => ((c as any).office_id && formData.office_ids.includes((c as any).office_id)) || ((c as any).offices && (c as any).offices.some((o: any) => formData.office_ids.includes(o.id))));
      if (sameOffice.length > 0) candidates = sameOffice;
    }

    return candidates;
  };

  const managerCandidates = getManagerCandidatesForRole(formData.role as string);

  const roleRequiresManager = (selectedRoleKey: string | undefined) => {
    if (!selectedRoleKey) return false;
    const selLabel = (roles || []).find((r) => r.key === selectedRoleKey)?.label || '';
    const lower = selLabel.toLowerCase();
    const needManagerLabels = ['colaborador', 'colaborador vaf', 'coordinador acad', 'director de programa', 'jefe campus vaf', 'lider de proceso', 'subproceso', 'personal operativo', 'directores de programa'];
    if (needManagerLabels.some((lbl) => lower.includes(lbl))) return true;
    // also consider legacy key names
    const keyLower = selectedRoleKey.toLowerCase();
    if (['colaborador_vaf', 'colaborador', 'coordinador_academico', 'director_programa', 'jefe_campus_vaf', 'lider_proceso', 'subproceso_vaf', 'personal_operativo'].some((k) => keyLower.includes(k))) return true;
    return false;
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

      const userData = {
        identification: formData.identification,
        full_name: formData.full_name,
        email: formData.email || null,
        role: roleToSave,
        office_id: formData.office_ids && formData.office_ids.length > 0 ? formData.office_ids[0] : null,
        manager_id: formData.manager_id || null,
        campus: formData.campus || null,
        updated_at: new Date().toISOString(),
      };

      if (editingUser) {
        const { error } = await supabase.from('users').update(userData).eq('id', editingUser.id);
        if (error) throw error;
      } else {
        if (formData.role === 'admin') {
          // Create auth user for admin
          const identification = formData.identification.trim();
          const emailToUse = (formData.email || '').trim() || `${identification}@evaluation.local`;
          const passwordToUse = identification; // requirement: cedula as password

          console.debug('Creating auth user with email:', emailToUse);

          const { data: signUpData, error: signUpError } = await signUpPreserveCreator({
            email: emailToUse,
            password: passwordToUse,
          });

          let createdUserId = null as string | null;
          if (signUpError) {
            console.warn('Auth signUp returned error, attempting fallback by email lookup:', signUpError);
            // Try to find existing user id from users table by email
            try {
              const { data: existingUser } = await supabase.from('users').select('id').eq('email', emailToUse).maybeSingle();
              if (existingUser && existingUser.id) {
                createdUserId = existingUser.id;
              } else {
                throw signUpError;
              }
            } catch (e) {
              console.error('Fallback lookup failed after signUp error:', e);
              throw signUpError;
            }
          } else {
            createdUserId = (signUpData as any)?.user?.id || (signUpData as any)?.id || (signUpData as any)?.userId || null;
          }
          if (!createdUserId) {
            console.warn('Could not determine created user id from signUp response:', signUpData);
          }

          const { error: userError } = await supabase.from('users').insert([{ ...userData, id: createdUserId || undefined, email: emailToUse, role: roleToSave }]);
          if (userError) {
            console.error('Error inserting into users table:', userError);
            throw userError;
          }
          // If this user is a manager, ensure a corresponding colaboradores row exists
          await upsertCollaboratorForUser(createdUserId, {
            identification: formData.identification,
            full_name: formData.full_name,
            email: emailToUse,
            role: roleToSave,
            campus: formData.campus || null,
            manager_id: formData.manager_id || null,
          });
          await ensureCollaboratorOffices(createdUserId, formData.office_ids);
        } else {
          // For non-admin users, create an auth user first so users.id FK is valid
          const identification = formData.identification.trim();
          const emailToUse = (formData.email || '').trim() || `${identification}@evaluation.local`;
          const passwordToUse = identification;

          try {
            const { data: signUpData, error: signUpError } = await signUpPreserveCreator({
              email: emailToUse,
              password: passwordToUse,
            });

            let createdUserId: string | null = null;

            if (signUpError) {
              console.error('Auth signUp error (non-admin):', signUpError);
              // fallback: try to get existing users.id by email
              try {
                const { data: existingUser } = await supabase.from('users').select('id').eq('email', emailToUse).maybeSingle();
                if (existingUser && existingUser.id) {
                  createdUserId = existingUser.id;
                } else {
                  throw signUpError;
                }
              } catch (e) {
                console.error('Fallback lookup failed after signUp error:', e);
                throw signUpError;
              }
            } else {
              createdUserId = (signUpData as any)?.user?.id || (signUpData as any)?.id || (signUpData as any)?.userId || null;
            }

            if (!createdUserId) {
              console.warn('Could not determine created user id from signUp response:', signUpData);
            }

            const { error: userError } = await supabase.from('users').insert([{ ...userData, id: createdUserId || undefined, email: emailToUse, role: roleToSave }]);
            if (userError) {
              console.error('Error inserting into users table:', userError);
              throw userError;
            }
            // Ensure colaboradores entry for managers
            await upsertCollaboratorForUser(createdUserId, {
              identification: formData.identification,
              full_name: formData.full_name,
              email: emailToUse,
              role: roleToSave,
              campus: formData.campus || null,
              manager_id: formData.manager_id || null,
            });
            await ensureCollaboratorOffices(createdUserId, formData.office_ids);
          } catch (e) {
            throw e;
          }
        }
      }

      resetForm();
      loadData();
    } catch (error: any) {
      console.error('Error saving user:', error);
      const msg = error && (error.message || error.error || JSON.stringify(error));
      alert('Error al guardar el usuario: ' + (msg || 'ver detalles en la consola'));
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      identification: user.identification,
      full_name: user.full_name,
      email: user.email || '',
      role: user.role,
      office_ids: (user as any).offices ? (user as any).offices.map((o: Office) => o.id) : (user as any).office ? [(user as any).office.id] : [],
      manager_id: user.manager_id || '',
      campus: user.campus || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este usuario?')) return;

    try {
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Error al eliminar el usuario');
    }
  };

  const resetForm = () => {
    setFormData({
      identification: '',
      full_name: '',
      email: '',
      role: 'colaborador_vaf',
      office_ids: [],
      manager_id: '',
      campus: '',
    });
    setEditingUser(null);
    setShowForm(false);
  };

  const filteredUsers = users.filter(
    (user) =>
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.identification.includes(searchTerm)
  );

  const handleImport = async () => {
    if (!importFile) return;

    try {
      const data = await importFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

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
        acc[office.name] = office.id;
        return acc;
      }, {} as Record<string, string>);

      const managerMap = users.reduce((acc, user) => {
        acc[user.full_name] = user.id;
        return acc;
      }, {} as Record<string, string>);

      for (const row of jsonData as any[]) {
        const identification = row['No. de Cedula']?.toString().trim();
        const full_name = row['Nombre Completo']?.toString().trim();
        const email = row['Correo']?.toString().trim() || null;
        const roleStr = row['Rol']?.toString().trim();
        const officeName = row['Oficina']?.toString().trim();
        const managerName = row['Jefe Inmediato']?.toString().trim();
        const campus = row['Campus']?.toString().trim() || null;

        if (!identification || !full_name || !roleStr) continue;

        const role = importResolveRole(roleStr);
        if (!role) continue;

        // Support multiple offices in the 'Oficina' column separated by commas/semicolons
        const officeNames = officeName ? officeName.split(/[;,|]/).map((s: string) => s.trim()).filter(Boolean) : [];
        const office_ids = officeNames.map((n: string) => officeMap[n]).filter(Boolean);
        const office_id = office_ids.length > 0 ? office_ids[0] : null;
        const manager_id = managerName ? managerMap[managerName] : null;

        if (role === 'admin') {
          // Create auth user for admin
          const emailToUse = email || `${identification}@evaluation.local`;
          const passwordToUse = identification;

          const { data: signUpData, error: signUpError } = await signUpPreserveCreator({
            email: emailToUse,
            password: passwordToUse,
          });

          if (signUpError) {
            console.error('Auth signUp error for', full_name, signUpError);
            continue;
          }

          const createdUserId = (signUpData as any)?.user?.id || (signUpData as any)?.id;

          // If signUp failed because the user already exists in Auth, try to use existing users.id
          let finalUserId = createdUserId;
          if (!finalUserId) {
            try {
              const { data: existingUser } = await supabase.from('users').select('id').eq('email', emailToUse).maybeSingle();
              if (existingUser && existingUser.id) finalUserId = existingUser.id;
            } catch (e) {
              console.error('Error looking up existing users row by email after signUp:', e);
            }
          }

          const { error: userError } = await supabase.from('users').insert([{
              id: finalUserId,
              identification,
              full_name,
              email: emailToUse,
              role,
              office_id,
              manager_id,
              campus,
            }]);

          if (userError) {
            console.error('Error inserting user', full_name, userError);
          }
          // If the imported user is a manager role, create colaboradores counterpart
          try {
            await upsertCollaboratorForUser(finalUserId, {
              identification,
              full_name,
              email: emailToUse,
              role,
              campus,
              manager_id,
            });
            await ensureCollaboratorOffices(finalUserId, office_ids);
          } catch (e) {
            console.warn('Could not upsert collaborator for imported admin user', full_name, e);
          }
        } else {
          // For non-admin, create auth user first then insert into users
          const emailToUse = email || `${identification}@evaluation.local`;
          const passwordToUse = identification;

          try {
            const { data: signUpData, error: signUpError } = await signUpPreserveCreator({
              email: emailToUse,
              password: passwordToUse,
            });

            if (signUpError) {
              console.error('Auth signUp error for', full_name, signUpError);
              continue;
            }

            const createdUserId = (signUpData as any)?.user?.id || (signUpData as any)?.id;

            const { error: userError } = await supabase.from('users').insert([{
              id: createdUserId,
              identification,
              full_name,
              email: emailToUse,
              role,
              office_id,
              manager_id,
              campus,
            }]);

            if (userError) {
              console.error('Error inserting user', full_name, userError);
            }
            // If the imported user is a manager role, create colaboradores counterpart
            try {
              await upsertCollaboratorForUser(createdUserId, {
                identification,
                full_name,
                email: emailToUse,
                role,
                campus,
                manager_id,
                office_id,
              });
            } catch (e) {
              console.warn('Could not upsert collaborator for imported user', full_name, e);
            }
          } catch (e) {
            console.error('Auth/create user error for', full_name, e);
          }
        }
      }

      alert('Importación completada');
      setShowImport(false);
      setImportFile(null);
      loadData();
    } catch (error) {
      console.error('Error importing:', error);
      alert('Error al importar');
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Gestión de Personal</h2>
        {!showForm && !showImport && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Nuevo Usuario
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Upload className="w-5 h-5" />
              Importar Excel
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Cédula</label>
              <input
                type="text"
                value={formData.identification}
                onChange={(e) => setFormData({ ...formData, identification: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                disabled={!!editingUser}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nombre Completo</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Rol</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Oficinas</label>
              <select
                multiple
                value={formData.office_ids}
                onChange={(e) => {
                  const vals = Array.from((e.target as HTMLSelectElement).selectedOptions).map((o) => o.value);
                  setFormData({ ...formData, office_ids: vals });
                }}
                className="w-full h-36 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Campus</label>
              <select
                value={formData.campus}
                onChange={(e) => setFormData({ ...formData, campus: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            {roleRequiresManager(formData.role as string) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Jefe Inmediato</label>
                <select
                  value={formData.manager_id}
                  onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Sin asignar</option>
                  {managerCandidates && managerCandidates.length > 0 ? (
                    managerCandidates.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.full_name}
                      </option>
                    ))
                  ) : (
                    <>
                      <option disabled value="">No hay jefes disponibles</option>
                      <optgroup label="Otros jefes">
                        {getFallbackManagerCandidates().map((m) => (
                          <option key={`fb-${m.id}`} value={m.id}>{m.full_name} ({m.role})</option>
                        ))}
                      </optgroup>
                    </>
                  )}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {editingUser ? 'Actualizar' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {showImport && (
        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Importar Usuarios desde Excel</h3>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Archivo Excel</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleImport}
              disabled={!importFile}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Importar
            </button>
            <button
              onClick={() => { setShowImport(false); setImportFile(null); }}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            El archivo debe tener las columnas: Nombre Completo, No. de Cedula, Correo, Rol, Oficina, Jefe Inmediato, Campus
            <br />
            <a href="/plantilla_usuarios.xlsx" download className="text-blue-600 underline">Descargar plantilla</a>
          </p>
        </div>
      )}

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por nombre o cédula..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Nombre</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Cédula</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Rol</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Oficina</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Campus</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Jefe</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{user.full_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.identification}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium capitalize">
                      {user.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.office?.name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.campus || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.manager?.full_name || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleEdit(user)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {searchTerm ? 'No se encontraron usuarios' : 'No hay usuarios registrados'}
        </div>
      )}
    </div>
  );
}
