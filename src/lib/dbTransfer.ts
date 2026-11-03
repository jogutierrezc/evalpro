// Definiciones compartidas por el exportador y el importador de base de datos.

export interface TableDef {
  name: string;
  /** Columna para paginar de forma estable y para resolver duplicados al importar. */
  pk: string;
  sensitive?: boolean;
  note?: string;
}

// Tablas de public en orden de dependencias (FK): cada una va después de las que referencia.
export const TABLES: TableDef[] = [
  { name: 'offices', pk: 'id' },
  { name: 'roles', pk: 'id' },
  { name: 'form_types', pk: 'id' },
  { name: 'users', pk: 'id' },
  { name: 'colaboradores', pk: 'id' },
  { name: 'form_type_relations', pk: 'id' },
  { name: 'evaluation_templates', pk: 'id' },
  { name: 'evaluation_sections', pk: 'id' },
  { name: 'evaluation_questions', pk: 'id' },
  { name: 'evaluation_periods', pk: 'id' },
  { name: 'evaluation_period_form_types', pk: 'id' },
  { name: 'collaborator_offices', pk: 'id' },
  { name: 'user_managers', pk: 'id' },
  { name: 'period_collaborators', pk: 'id' },
  { name: 'office_template_access', pk: 'id' },
  { name: 'evaluations', pk: 'id' },
  { name: 'evaluation_responses', pk: 'id' },
  { name: 'evaluation_results', pk: 'id' },
  { name: 'campus_ai_reports', pk: 'campus_name' },
  { name: 'university_ai_reports', pk: 'report_type' },
  { name: 'notification_log', pk: 'id' },
  { name: 'admin_settings', pk: 'id', sensitive: true, note: 'Contiene la API key de Resend' },
];

/** Tablas con clave foránea hacia sí mismas: el padre debe insertarse antes que el hijo. */
export const SELF_REF: Record<string, string> = {
  offices: 'parent_id',
  users: 'manager_id',
  colaboradores: 'manager_id',
};

export type Row = Record<string, unknown>;

const LINE_PREFIX = "SELECT public.__evalpro_import_rows('public.";
const LINE_SUFFIX = "'::jsonb);";

/** Lee un archivo generado por el exportador y devuelve las filas agrupadas por tabla. */
export function parseSqlExport(text: string): Record<string, Row[]> {
  const byTable: Record<string, Row[]> = {};
  for (const line of text.split('\n')) {
    if (!line.startsWith(LINE_PREFIX)) continue;
    const nameEnd = line.indexOf("', '", LINE_PREFIX.length);
    const end = line.lastIndexOf(LINE_SUFFIX);
    if (nameEnd < 0 || end < 0) continue;
    const name = line.slice(LINE_PREFIX.length, nameEnd);
    const json = line.slice(nameEnd + 4, end).replace(/''/g, "'");
    const rows = JSON.parse(json) as Row[];
    (byTable[name] ??= []).push(...rows);
  }
  return byTable;
}

/** Ordena las filas para que cada padre aparezca antes que sus hijos (autorreferencias). */
export function sortParentsFirst(rows: Row[], pk: string, parentCol: string): Row[] {
  const ids = new Set(rows.map((r) => r[pk]));
  const placed = new Set<unknown>();
  const result: Row[] = [];
  let remaining = rows;
  while (remaining.length > 0) {
    const next: Row[] = [];
    for (const r of remaining) {
      const parent = r[parentCol];
      if (parent == null || !ids.has(parent) || placed.has(parent)) {
        result.push(r);
        placed.add(r[pk]);
      } else {
        next.push(r);
      }
    }
    if (next.length === remaining.length) {
      result.push(...next); // ciclo: se insertan tal cual
      break;
    }
    remaining = next;
  }
  return result;
}

/** Las secuencias no avanzan al insertar ids explícitos; esto las ajusta (ejecutar una vez en el SQL Editor). */
export const RESET_SEQUENCES_SQL = `DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name, pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) AS seq
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
  LOOP
    IF r.seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM public.%I), 1))', r.seq, r.column_name, r.table_name);
    END IF;
  END LOOP;
END $$;`;
