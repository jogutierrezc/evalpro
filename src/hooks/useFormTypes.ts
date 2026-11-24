import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

let cache: Record<string, string> | null = null;
let pending: Promise<Record<string, string>> | null = null;

/** key -> etiqueta de form_types. Una sola consulta por sesión; si falla, devuelve vacío y se usan las etiquetas del catálogo. */
export function loadFormTypeLabels(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache);
  pending ??= (async () => {
    const { data } = await supabase.from('form_types').select('key, label');
    cache = Object.fromEntries(((data as { key: string; label: string }[]) || []).map((t) => [t.key, t.label]));
    return cache;
  })().catch(() => ({} as Record<string, string>)).finally(() => { pending = null; });
  return pending;
}

export function useFormTypeLabels() {
  const [labels, setLabels] = useState<Record<string, string>>(cache ?? {});
  useEffect(() => {
    let alive = true;
    loadFormTypeLabels().then((l) => { if (alive) setLabels(l); });
    return () => { alive = false; };
  }, []);
  return labels;
}
