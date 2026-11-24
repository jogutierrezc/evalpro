/**
 * Tipos de evaluación (form_types.key = evaluation_templates.type) y su color distintivo.
 *
 * Única fuente de verdad: las listas, tarjetas, insignias y el certificado PDF toman el color de aquí.
 * El mapeo es fijo (no depende del orden de carga ni del render). Los tipos creados después desde Administración
 * no tienen color asignado: reciben uno de la misma paleta de forma estable (hash de su clave), así que siempre
 * es el mismo para ese tipo.
 */

/** Paleta institucional de tipos, en el orden en que la entregó el cliente. */
export const EVAL_TYPE_PALETTE = ['#43BFEB', '#D6C105', '#EB5A6C', '#43AC38', '#9071B0', '#DD3E9D', '#F28A30'] as const;

/** Color de los tipos conocidos. Asignación fija (se sorteó una vez y quedó escrita aquí). */
export const EVAL_TYPE_COLORS: Readonly<Record<string, string>> = {
  self_evaluation: '#43BFEB',            // 1. azul cielo
  manager_to_employee: '#F28A30',        // 7. naranja
  employee_to_manager: '#43AC38',        // 4. verde
  soft_skills: '#9071B0',                // 5. morado
  leader_self_evaluation_vaf: '#DD3E9D', // 6. magenta
  // Reservados sin tipo asignado todavía: #D6C105 (amarillo) y #EB5A6C (coral). Los usan primero los tipos nuevos.
};

/** Nombre en español de los tipos conocidos (la etiqueta de form_types, si existe, tiene prioridad). */
export const EVAL_TYPE_LABELS: Readonly<Record<string, string>> = {
  self_evaluation: 'Autoevaluación',
  manager_to_employee: 'Jefe a colaborador',
  employee_to_manager: 'Colaborador a jefe',
  soft_skills: 'Habilidades blandas',
  leader_self_evaluation_vaf: 'Autoevaluación de líderes',
};

const FALLBACK_POOL = ['#D6C105', '#EB5A6C', ...EVAL_TYPE_PALETTE] as const;
const UNKNOWN = '#64748b';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Color de un tipo de evaluación. Siempre devuelve el mismo para la misma clave. */
export function evalTypeColor(key?: string | null): string {
  const k = String(key ?? '').trim().toLowerCase();
  if (!k) return UNKNOWN;
  return EVAL_TYPE_COLORS[k] ?? FALLBACK_POOL[hash(k) % FALLBACK_POOL.length];
}

/** Etiqueta legible: la de form_types si se conoce, si no la del catálogo, si no la clave sin guiones bajos. */
export function evalTypeLabel(key?: string | null, labels?: Record<string, string>): string {
  const k = String(key ?? '').trim();
  if (!k) return 'Sin tipo';
  const raw = labels?.[k] ?? EVAL_TYPE_LABELS[k.toLowerCase()] ?? k.replace(/_/g, ' ');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Una autoevaluación es la del tipo self_evaluation o cualquier tipo cuya clave la declare (…self_eval…). */
export const isSelfType = (key?: string | null) => /self_eval|autoeval/i.test(String(key ?? ''));

/** Texto legible sobre el color del tipo (negro o blanco, el que dé más contraste). */
export function onTypeColor(hex: string): '#0f172a' | '#ffffff' {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#0f172a' : '#ffffff';
}

/** Versión suave del color para fondos de insignia (mezcla con blanco). */
export function tintOf(hex: string, amount = 0.86): string {
  const h = hex.replace('#', '');
  const mix = (i: number) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - amount) + 255 * amount);
  return `rgb(${mix(0)}, ${mix(2)}, ${mix(4)})`;
}
