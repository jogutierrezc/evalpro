import { useState } from 'react';
import { AlertTriangle, CheckCircle, Copy, FileUp, Loader2, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  RESET_SEQUENCES_SQL,
  SELF_REF,
  TABLES,
  parseSqlExport,
  sortParentsFirst,
  type Row,
  type TableDef,
} from '../../lib/dbTransfer';

const CHUNK = 200;
const MAX_ERRORS_SHOWN = 3;

interface ImportResult {
  name: string;
  total: number;
  inserted: number;
  failed: number;
  droppedColumns: string[];
  errors: string[];
}

/** Inserta un bloque; si PostgREST rechaza una columna que no existe en el esquema nuevo, la descarta. */
async function insertChunk(
  table: TableDef,
  rows: Row[],
  overwrite: boolean,
  dropped: Set<string>,
): Promise<string | null> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const payload = dropped.size
      ? rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !dropped.has(k))))
      : rows;
    const { error } = await supabase
      .from(table.name)
      .upsert(payload, { onConflict: table.pk, ignoreDuplicates: !overwrite });
    if (!error) return null;
    const missing = /Could not find the '([^']+)' column/.exec(error.message)?.[1];
    if (missing && !dropped.has(missing)) {
      dropped.add(missing);
      continue;
    }
    return error.message;
  }
  return 'Demasiados reintentos por columnas inexistentes';
}

async function importTable(table: TableDef, rowsIn: Row[], overwrite: boolean): Promise<ImportResult> {
  const selfCol = SELF_REF[table.name];
  const rows = selfCol ? sortParentsFirst(rowsIn, table.pk, selfCol) : rowsIn;
  const result: ImportResult = { name: table.name, total: rows.length, inserted: 0, failed: 0, droppedColumns: [], errors: [] };
  const dropped = new Set<string>();

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const err = await insertChunk(table, chunk, overwrite, dropped);
    if (!err) {
      result.inserted += chunk.length;
      continue;
    }
    // El bloque falló: se reintenta fila por fila para aislar las que no se pueden cargar.
    for (const row of chunk) {
      const rowErr = await insertChunk(table, [row], overwrite, dropped);
      if (rowErr) {
        result.failed += 1;
        if (result.errors.length < MAX_ERRORS_SHOWN && !result.errors.includes(rowErr)) result.errors.push(rowErr);
      } else {
        result.inserted += 1;
      }
    }
  }
  result.droppedColumns = [...dropped];
  return result;
}

export default function DatabaseImportModule() {
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState<Record<string, Row[]> | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [overwrite, setOverwrite] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<ImportResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const present = data ? TABLES.filter((t) => (data[t.name]?.length ?? 0) > 0) : [];
  const unknown = data ? Object.keys(data).filter((n) => !TABLES.some((t) => t.name === n)) : [];

  const onFile = async (file: File | undefined) => {
    setError(null);
    setResults([]);
    setData(null);
    if (!file) return;
    try {
      const parsed = parseSqlExport(await file.text());
      if (Object.keys(parsed).length === 0) {
        setError('No se encontraron datos. Usa un archivo generado por "Exportar base de datos".');
        return;
      }
      setFileName(file.name);
      setData(parsed);
      setSelected(Object.fromEntries(TABLES.map((t) => [t.name, !t.sensitive])));
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const run = async () => {
    if (!data) return;
    setRunning(true);
    setError(null);
    const report: ImportResult[] = [];
    setResults([]);
    try {
      for (const table of present.filter((t) => selected[t.name])) {
        setProgress(`Importando ${table.name}…`);
        report.push(await importTable(table, data[table.name], overwrite));
        setResults([...report]);
      }
      setProgress('Importación terminada.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProgress('');
    } finally {
      setRunning(false);
    }
  };

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(RESET_SEQUENCES_SQL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* el usuario puede copiar el texto a mano */
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Upload className="h-5 w-5 text-blue-700" /> Importar base de datos desde SQL
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Carga en <strong>este</strong> proyecto el archivo <code>.sql</code> generado por el exportador. Úsalo en la
          aplicación conectada al proyecto nuevo, con el esquema ya creado.
        </p>
      </div>

      <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <code>public.users</code> referencia a <code>auth.users</code>: crea antes las cuentas de acceso con los
            mismos UUID, o la tabla <code>users</code> fallará.
          </li>
          <li>Necesitas haber iniciado sesión como administrador en este proyecto (RLS aplica a la importación).</li>
          <li>Por defecto no se tocan las filas que ya existen (mismo id).</li>
        </ul>
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-slate-300 p-4 text-sm hover:bg-slate-50">
        <FileUp className="h-5 w-5 text-slate-500" />
        <span>{fileName || 'Elegir archivo .sql'}</span>
        <input
          type="file"
          accept=".sql,text/plain"
          className="hidden"
          disabled={running}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {data && (
        <>
          <fieldset disabled={running} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {present.map((t) => (
              <label key={t.name} className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 p-2.5 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!!selected[t.name]}
                  onChange={() => setSelected((s) => ({ ...s, [t.name]: !s[t.name] }))}
                />
                <span>
                  <span className="font-mono text-slate-800">{t.name}</span>
                  <span className="ml-2 text-xs text-slate-500">{data[t.name].length} filas</span>
                  {t.note && <span className="block text-xs text-amber-700">{t.note}</span>}
                </span>
              </label>
            ))}
          </fieldset>

          {unknown.length > 0 && (
            <p className="text-xs text-slate-500">Tablas del archivo que se omiten (no reconocidas): {unknown.join(', ')}</p>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={overwrite} disabled={running} onChange={(e) => setOverwrite(e.target.checked)} />
            Sobrescribir filas que ya existen
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={run}
              disabled={running || present.every((t) => !selected[t.name])}
              className="ui-btn-primary inline-flex items-center gap-2"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {running ? 'Importando…' : 'Importar'}
            </button>
            {progress && <span className="text-sm text-slate-600">{progress}</span>}
          </div>
        </>
      )}

      {results.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Tabla</th>
                <th className="px-3 py-2 text-right">Cargadas</th>
                <th className="px-3 py-2 text-right">Con error</th>
                <th className="px-3 py-2">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.name} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 font-mono">{r.name}</td>
                  <td className="px-3 py-2 text-right">
                    {r.inserted}/{r.total}
                  </td>
                  <td className="px-3 py-2 text-right">{r.failed}</td>
                  <td className="space-y-1 px-3 py-2">
                    {r.failed === 0 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle className="h-4 w-4" /> OK
                      </span>
                    ) : (
                      r.errors.map((m) => (
                        <p key={m} className="text-red-700">
                          {m}
                        </p>
                      ))
                    )}
                    {r.droppedColumns.length > 0 && (
                      <p className="text-xs text-slate-500">
                        Columnas que no existen en este esquema (omitidas): {r.droppedColumns.join(', ')}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results.length > 0 && !running && (
        <div className="space-y-2 rounded-md border border-slate-200 p-3">
          <p className="text-sm text-slate-700">
            Último paso: ejecuta este SQL una vez en el SQL Editor de Supabase para ajustar los contadores de id
            (evita conflictos al crear registros nuevos).
          </p>
          <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{RESET_SEQUENCES_SQL}</pre>
          <button type="button" onClick={copySql} className="ui-btn-secondary inline-flex items-center gap-2">
            <Copy className="h-4 w-4" /> {copied ? 'Copiado' : 'Copiar SQL'}
          </button>
        </div>
      )}
    </div>
  );
}
