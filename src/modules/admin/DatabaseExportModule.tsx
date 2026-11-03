import { useState } from 'react';
import { AlertTriangle, CheckCircle, Database, Download, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// Tablas de public en orden de dependencias (FK): cada una va después de las que referencia.
// pk = columna para paginar de forma estable.
interface TableDef {
  name: string;
  pk: string;
  sensitive?: boolean;
  note?: string;
}

const TABLES: TableDef[] = [
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

const FETCH_PAGE = 1000; // límite por petición de PostgREST
const SQL_CHUNK = 250; // filas por INSERT generado

// Función auxiliar que se instala en la base nueva, usa solo las columnas que existen en
// ambos lados (el esquema nuevo puede no tener alguna columna vieja) y ajusta las secuencias.
const IMPORT_FN = `CREATE OR REPLACE FUNCTION public.__evalpro_import_rows(_tbl regclass, _data jsonb)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  cols text;
  seq record;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO cols
  FROM pg_attribute a
  WHERE a.attrelid = _tbl AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
    AND (_data -> 0) ? a.attname::text;
  IF cols IS NULL THEN
    RAISE NOTICE 'Sin columnas coincidentes en %', _tbl;
    RETURN;
  END IF;
  EXECUTE format(
    'INSERT INTO %s (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM jsonb_populate_recordset(NULL::%s, $1) ON CONFLICT DO NOTHING',
    _tbl, cols, cols, _tbl
  ) USING _data;
  FOR seq IN
    SELECT a.attname, pg_get_serial_sequence(_tbl::text, a.attname) AS s
    FROM pg_attribute a
    WHERE a.attrelid = _tbl AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    IF seq.s IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %s), 1))', seq.s, seq.attname, _tbl);
    END IF;
  END LOOP;
END
$fn$;
`;

type Row = Record<string, unknown>;

interface TableResult {
  name: string;
  rows: number;
  expected: number | null;
  error?: string;
}

function sqlLiteral(json: string): string {
  // jsonb no admite \u0000; las comillas simples se duplican para el literal SQL.
  return `'${json.replace(/\\u0000/g, '').replace(/'/g, "''")}'`;
}

async function fetchAllRows(table: TableDef): Promise<Row[]> {
  const all: Row[] = [];
  for (let from = 0; ; from += FETCH_PAGE) {
    const { data, error } = await supabase
      .from(table.name)
      .select('*')
      .order(table.pk, { ascending: true })
      .range(from, from + FETCH_PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as Row[]));
    if (data.length < FETCH_PAGE) break;
  }
  return all;
}

export default function DatabaseExportModule() {
  const [selected, setSelected] = useState<Record<string, boolean>>(
    () => Object.fromEntries(TABLES.map((t) => [t.name, !t.sensitive])),
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<TableResult[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);

  const toggle = (name: string) => setSelected((s) => ({ ...s, [name]: !s[name] }));
  const chosen = TABLES.filter((t) => selected[t.name]);

  const run = async () => {
    setRunning(true);
    setFatal(null);
    setResults([]);
    const out: string[] = [];
    const report: TableResult[] = [];

    try {
      out.push(
        `-- Exportación de datos EvalPro - ${new Date().toISOString()}\n` +
          '-- Aplicar en el proyecto NUEVO, después de crear el esquema (migraciones).\n' +
          'SET client_encoding = \'UTF8\';\n' +
          '-- Tolera autorreferencias (users.manager_id, offices.parent_id) y ciclos durante la carga.\n' +
          'SET session_replication_role = replica;\n\n' +
          IMPORT_FN +
          '\n',
      );

      for (const table of chosen) {
        setProgress(`Leyendo ${table.name}…`);
        const result: TableResult = { name: table.name, rows: 0, expected: null };
        try {
          const { count } = await supabase.from(table.name).select('*', { count: 'exact', head: true });
          result.expected = count ?? null;
          const rows = await fetchAllRows(table);
          result.rows = rows.length;
          if (rows.length > 0) {
            out.push(`-- ${table.name} (${rows.length} filas)\n`);
            for (let i = 0; i < rows.length; i += SQL_CHUNK) {
              const chunk = rows.slice(i, i + SQL_CHUNK);
              out.push(
                `SELECT public.__evalpro_import_rows('public.${table.name}', ${sqlLiteral(JSON.stringify(chunk))}::jsonb);\n`,
              );
            }
            out.push('\n');
          }
        } catch (e) {
          result.error = e instanceof Error ? e.message : String(e);
        }
        report.push(result);
        setResults([...report]);
      }

      out.push('DROP FUNCTION public.__evalpro_import_rows(regclass, jsonb);\nSET session_replication_role = DEFAULT;\n');

      setProgress('Generando archivo…');
      const blob = new Blob(out, { type: 'application/sql;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evalpro_datos_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.sql`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setProgress('Listo. El archivo se descargó.');
    } catch (e) {
      setFatal(e instanceof Error ? e.message : String(e));
      setProgress('');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Database className="h-5 w-5 text-blue-700" /> Exportar base de datos a SQL
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Genera un archivo <code>.sql</code> con los datos de las tablas para cargarlos en un proyecto nuevo de Supabase
          cuyo esquema ya está creado. Se ejecuta con tu sesión de administrador.
        </p>
      </div>

      <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <ul className="list-disc space-y-1 pl-4">
          <li>
            Las cuentas de acceso (<code>auth.users</code>) no se pueden exportar desde el navegador: hay que
            recrearlas en el proyecto nuevo con los mismos UUID, o los usuarios no podrán iniciar sesión.
          </li>
          <li>El archivo contiene datos personales. Guárdalo en un lugar seguro y no lo subas a git.</li>
          <li>Se leen solo las filas que tu sesión puede ver: compara los totales con los esperados.</li>
        </ul>
      </div>

      <fieldset disabled={running} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TABLES.map((t) => (
          <label key={t.name} className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 p-2.5 text-sm hover:bg-slate-50">
            <input type="checkbox" className="mt-0.5" checked={!!selected[t.name]} onChange={() => toggle(t.name)} />
            <span>
              <span className="font-mono text-slate-800">{t.name}</span>
              {t.note && <span className="block text-xs text-amber-700">{t.note}</span>}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} disabled={running || chosen.length === 0} className="ui-btn-primary inline-flex items-center gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {running ? 'Exportando…' : `Exportar ${chosen.length} tablas`}
        </button>
        {progress && <span className="text-sm text-slate-600">{progress}</span>}
      </div>

      {fatal && <p className="text-sm text-red-700">Error: {fatal}</p>}

      {results.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Tabla</th>
                <th className="px-3 py-2 text-right">Filas exportadas</th>
                <th className="px-3 py-2 text-right">Esperadas</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const mismatch = r.expected !== null && r.expected !== r.rows;
                return (
                  <tr key={r.name} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono">{r.name}</td>
                    <td className="px-3 py-2 text-right">{r.rows}</td>
                    <td className="px-3 py-2 text-right">{r.expected ?? '—'}</td>
                    <td className="px-3 py-2">
                      {r.error ? (
                        <span className="text-red-700">{r.error}</span>
                      ) : mismatch ? (
                        <span className="text-amber-700">No coincide</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle className="h-4 w-4" /> OK
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
