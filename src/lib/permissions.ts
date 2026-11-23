import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

// Módulos del menú y quién los ve por defecto. Es la única lista: Layout, App y la pantalla de roles la usan.
// - locked: lo ve todo el mundo (no se puede quitar).
// - adminOnly: solo administración (sus datos están protegidos por RLS para el administrador).
export interface ModuleDef {
  id: string;
  label: string;
  description: string;
  legacyRoles: string[];
  locked?: boolean;
  adminOnly?: boolean;
}

export const MODULES: ModuleDef[] = [
  { id: 'dashboard', label: 'Dashboard', description: 'Panel de inicio con sus exámenes disponibles.', legacyRoles: ['*'], locked: true },
  { id: 'evaluations', label: 'Evaluaciones', description: 'Lista y resolución de evaluaciones.', legacyRoles: ['*'], locked: true },
  { id: 'guide', label: 'Ayuda', description: 'Guía de usuario.', legacyRoles: ['*'], locked: true },
  { id: 'feedback', label: 'Retroalimentación', description: 'Actas de retroalimentación con el equipo evaluado.', legacyRoles: ['*'] },
  { id: 'plan-mejora', label: 'Plan de Mejora', description: 'Planes de mejora derivados de la evaluación.', legacyRoles: ['*'] },
  { id: 'self-report', label: 'Mi Resultado Prisma', description: 'Informe personal de resultados.', legacyRoles: ['*'] },
  { id: 'my-collaborators', label: 'Mis Colaboradores', description: 'Seguimiento de las personas a su cargo.', legacyRoles: ['office_manager', 'admin'] },
  { id: 'results', label: 'Resultados', description: 'Análisis de resultados.', legacyRoles: ['admin'] },
  { id: 'supervision-planes', label: 'Supervisión planes', description: 'Supervisión de planes de mejora.', legacyRoles: ['admin'], adminOnly: true },
  { id: 'correos', label: 'Correos', description: 'Envíos, plantillas y bitácora de correo.', legacyRoles: ['admin'], adminOnly: true },
  { id: 'reports', label: 'Informes', description: 'Informes institucionales.', legacyRoles: ['admin'], adminOnly: true },
  { id: 'export', label: 'Exportar', description: 'Exportación de datos.', legacyRoles: ['admin'], adminOnly: true },
  { id: 'admin', label: 'Administración', description: 'Usuarios, roles, formularios y períodos.', legacyRoles: ['admin'], adminOnly: true },
];

export const CONFIGURED = '__configured__';

export const isAdminKey = (role?: string | null) =>
  ['admin', 'administrador', 'superadmin'].includes((role || '').toString().toLowerCase());

// Reglas anteriores del menú (coincidencia por texto). Se conservan tal cual para los roles sin configurar.
export function legacyAllows(role: string | null | undefined, legacyRoles: string[]): boolean {
  const ur = (role || '').toString().toLowerCase();
  return legacyRoles.some((roleKey) => {
    const rk = (roleKey || '').toString().toLowerCase();
    if (!rk) return false;
    if (rk === '*') return true;
    if (rk === ur) return true;
    if (rk === 'employee' && (ur.includes('colaborador') || ur.includes('employee') || ur.includes('coordinador') || ur.includes('director') || ur.includes('lider') || ur.includes('jefe'))) return true;
    if (rk === 'office_manager' && (ur.includes('jefe') || ur.includes('manager') || ur.includes('oficina') || ur.includes('coordinador') || ur.includes('director') || ur.includes('lider'))) return true;
    if (rk === 'admin') return isAdminKey(ur);
    return ur.includes(rk) || rk.includes(ur);
  });
}

// null = el rol no está configurado (usa las reglas anteriores).
const cache = new Map<string, string[] | null>();
export const clearPermissionsCache = () => cache.clear();

async function loadGrants(role: string): Promise<string[] | null> {
  if (cache.has(role)) return cache.get(role)!;
  const { data, error } = await supabase.from('role_permissions').select('module_id').eq('role_key', role);
  // Tabla aún sin crear o error de red: se usa el comportamiento anterior en vez de dejar a la gente sin menú.
  const grants = error || !data || !data.some((r: any) => r.module_id === CONFIGURED) ? null : data.map((r: any) => r.module_id as string);
  cache.set(role, grants);
  return grants;
}

export function useModuleAccess(role?: string | null) {
  const [grants, setGrants] = useState<string[] | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    setReady(false);
    if (!role || isAdminKey(role)) { setGrants(null); setReady(true); return; }
    loadGrants(role).then((g) => { if (alive) { setGrants(g); setReady(true); } });
    return () => { alive = false; };
  }, [role]);

  const configured = grants !== null;

  const can = useCallback((moduleId: string): boolean => {
    const def = MODULES.find((m) => m.id === moduleId);
    if (!def || !role) return false;
    if (isAdminKey(role)) return true;
    if (def.adminOnly) return false;
    if (def.locked) return true;
    if (grants) return grants.includes(moduleId);
    return legacyAllows(role, def.legacyRoles);
  }, [role, grants]);

  return { can, configured, ready };
}
