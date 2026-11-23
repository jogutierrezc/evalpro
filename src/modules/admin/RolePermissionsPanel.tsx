import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Lock, Save } from 'lucide-react';
import { supabase, Role } from '../../lib/supabase';
import { CONFIGURED, MODULES, clearPermissionsCache, legacyAllows } from '../../lib/permissions';

interface FormTypeRow { key: string; label: string; roles: string[] | null }
interface Relation { form_type_key: string; evaluator_role_key: string; evaluated_role_key: string }

type Tab = 'modulos' | 'autoevaluacion' | 'evalua';

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'modulos', label: 'Módulos', hint: 'Opciones del menú que ve este rol.' },
  { id: 'autoevaluacion', label: 'Se autoevalúa en', hint: 'Formularios que este rol responde sobre sí mismo.' },
  { id: 'evalua', label: 'Evalúa a', hint: 'Roles a los que este rol puede evaluar, formulario por formulario.' },
];

const same = (a: string, b: string) => a === b;

export default function RolePermissionsPanel({ role, allRoles, onBack }: { role: Role; allRoles: Role[]; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('modulos');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const [configured, setConfigured] = useState(false);
  const [granted, setGranted] = useState<Set<string>>(new Set());

  const [formTypes, setFormTypes] = useState<FormTypeRow[]>([]);
  const [selfForms, setSelfForms] = useState<Set<string>>(new Set()); // form_type keys donde el rol se autoevalúa
  const [relations, setRelations] = useState<Relation[]>([]);
  const [evaluates, setEvaluates] = useState<Set<string>>(new Set()); // `${form}||${rol evaluado}`
  const [openForm, setOpenForm] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [permRes, ftRes, relRes] = await Promise.all([
        supabase.from('role_permissions').select('module_id').eq('role_key', role.key),
        supabase.from('form_types').select('key,label,roles').order('label'),
        supabase.from('form_type_relations').select('form_type_key,evaluator_role_key,evaluated_role_key'),
      ]);

      const perms = permRes.error ? [] : ((permRes.data as any[]) || []).map((r) => r.module_id as string);
      const isConfigured = perms.includes(CONFIGURED);
      setConfigured(isConfigured);
      // Sin configurar: se parte de lo que el rol ve hoy, para que guardar no cambie nada por sorpresa.
      setGranted(new Set(isConfigured ? perms : MODULES.filter((m) => !m.adminOnly && legacyAllows(role.key, m.legacyRoles)).map((m) => m.id)));

      const fts = ((ftRes.data as FormTypeRow[]) || []);
      setFormTypes(fts);
      setSelfForms(new Set(fts.filter((f) => (f.roles || []).some((r) => same(r, role.key))).map((f) => f.key)));

      const rels = ((relRes.data as Relation[]) || []).filter((r) => same(r.evaluator_role_key, role.key) && !same(r.evaluator_role_key, r.evaluated_role_key));
      setRelations(rels);
      setEvaluates(new Set(rels.map((r) => `${r.form_type_key}||${r.evaluated_role_key}`)));
      setLoading(false);
    })();
  }, [role.key]);

  const toggle = <T,>(set: Set<T>, setter: (s: Set<T>) => void, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
    setMessage(null);
  };

  const originalEvaluates = useMemo(() => new Set(relations.map((r) => `${r.form_type_key}||${r.evaluated_role_key}`)), [relations]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      // 1) Módulos: se reemplazan las filas del rol y se marca como configurado.
      const del = await supabase.from('role_permissions').delete().eq('role_key', role.key);
      if (del.error) throw del.error;
      const rows = [CONFIGURED, ...MODULES.filter((m) => !m.adminOnly && !m.locked && granted.has(m.id)).map((m) => m.id)]
        .map((module_id) => ({ role_key: role.key, module_id }));
      const ins = await supabase.from('role_permissions').insert(rows);
      if (ins.error) throw ins.error;

      // 2) Autoevaluación: solo se tocan los formularios que cambiaron.
      for (const ft of formTypes) {
        const had = (ft.roles || []).some((r) => same(r, role.key));
        const wants = selfForms.has(ft.key);
        if (had === wants) continue;
        const nextRoles = wants ? [...(ft.roles || []), role.key] : (ft.roles || []).filter((r) => !same(r, role.key));
        const up = await supabase.from('form_types').update({ roles: nextRoles }).eq('key', ft.key);
        if (up.error) throw up.error;
      }
      setFormTypes((prev) => prev.map((ft) => {
        const had = (ft.roles || []).some((r) => same(r, role.key));
        const wants = selfForms.has(ft.key);
        if (had === wants) return ft;
        return { ...ft, roles: wants ? [...(ft.roles || []), role.key] : (ft.roles || []).filter((r) => !same(r, role.key)) };
      }));

      // 3) Evalúa a: por formulario, se borran solo las relaciones de este rol hacia otros roles y se vuelven a insertar.
      const touched = new Set<string>();
      evaluates.forEach((k) => { if (!originalEvaluates.has(k)) touched.add(k.split('||')[0]); });
      originalEvaluates.forEach((k) => { if (!evaluates.has(k)) touched.add(k.split('||')[0]); });
      for (const formKey of touched) {
        const d = await supabase.from('form_type_relations').delete()
          .eq('form_type_key', formKey).eq('evaluator_role_key', role.key).neq('evaluated_role_key', role.key);
        if (d.error) throw d.error;
        const inserts = Array.from(evaluates).filter((k) => k.startsWith(`${formKey}||`)).map((k) => {
          const evaluated = k.slice(formKey.length + 2);
          return {
            form_type_key: formKey,
            evaluator_role_key: role.key,
            evaluated_role_key: evaluated,
            evaluator_role_id: role.id,
            evaluated_role_id: allRoles.find((r) => same(r.key, evaluated))?.id || null,
          };
        });
        if (inserts.length) {
          const i = await supabase.from('form_type_relations').insert(inserts);
          if (i.error) throw i.error;
        }
      }
      setRelations(Array.from(evaluates).map((k) => {
        const [form_type_key, evaluated_role_key] = k.split('||');
        return { form_type_key, evaluator_role_key: role.key, evaluated_role_key };
      }));

      clearPermissionsCache();
      setConfigured(true);
      setMessage({ kind: 'ok', text: 'Cambios guardados. Las personas con este rol los verán al volver a cargar la página.' });
    } catch (err: any) {
      console.error('Error guardando permisos del rol', err);
      setMessage({ kind: 'error', text: `No se pudo guardar: ${err?.message || 'error desconocido'}. Si dice que role_permissions no existe, ejecute la migración 20261123000000_role_permissions.sql.` });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-10 text-center text-sm text-slate-500">Cargando permisos…</div>;

  const otherRoles = allRoles.filter((r) => !same(r.key, role.key));

  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-slate-600 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
        <ArrowLeft className="h-4 w-4" /> Volver a roles
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{role.label.trim()}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {configured
              ? 'Este rol tiene permisos configurados aquí.'
              : 'Este rol aún usa el comportamiento predeterminado. Al guardar, quedará configurado con lo que ve marcado abajo.'}
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      {message && (
        <div role="status" className={`animate-in mb-4 rounded border px-3 py-2 text-sm ${message.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div role="tablist" className="mb-1 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mb-4 mt-3 text-sm text-slate-500">{TABS.find((t) => t.id === tab)?.hint}</p>

      <div key={tab} className="animate-in">
      {tab === 'modulos' && (
        <ul className="divide-y divide-slate-100 rounded border border-slate-200 bg-white">
          {MODULES.map((m) => {
            const fixed = m.locked || m.adminOnly;
            const checked = m.locked ? true : m.adminOnly ? false : granted.has(m.id);
            return (
              <li key={m.id}>
                <label className={`flex items-start gap-3 px-4 py-3 ${fixed ? 'cursor-default' : 'cursor-pointer hover:bg-slate-50'}`}>
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-blue-600"
                    checked={checked}
                    disabled={fixed}
                    onChange={() => toggle(granted, setGranted, m.id)}
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-slate-900">{m.label}</span>
                    <span className="block text-xs text-slate-500">{m.description}</span>
                  </span>
                  {m.locked && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Check className="h-3.5 w-3.5" /> Siempre visible</span>}
                  {m.adminOnly && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Lock className="h-3.5 w-3.5" /> Solo administración</span>}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {tab === 'autoevaluacion' && (
        <ul className="divide-y divide-slate-100 rounded border border-slate-200 bg-white">
          {formTypes.map((ft) => (
            <li key={ft.key}>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={selfForms.has(ft.key)} onChange={() => toggle(selfForms, setSelfForms, ft.key)} />
                <span className="text-sm text-slate-900">{ft.label}</span>
              </label>
            </li>
          ))}
          {formTypes.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No hay formularios creados.</li>}
        </ul>
      )}

      {tab === 'evalua' && (
        <ul className="divide-y divide-slate-100 rounded border border-slate-200 bg-white">
          {formTypes.map((ft) => {
            const count = otherRoles.filter((r) => evaluates.has(`${ft.key}||${r.key}`)).length;
            const open = openForm === ft.key;
            return (
              <li key={ft.key}>
                <button
                  onClick={() => setOpenForm(open ? null : ft.key)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  <span className="text-sm text-slate-900">{ft.label}</span>
                  <span className="flex items-center gap-3">
                    <span className={`text-xs ${count ? 'font-medium text-blue-700' : 'text-slate-400'}`}>{count ? `${count} rol${count !== 1 ? 'es' : ''}` : 'Ninguno'}</span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${open ? 'rotate-180' : ''}`} aria-hidden />
                  </span>
                </button>
                {open && (
                  <div className="grid gap-x-6 gap-y-1 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:grid-cols-2">
                    {otherRoles.map((r) => {
                      const k = `${ft.key}||${r.key}`;
                      return (
                        <label key={r.id} className="flex cursor-pointer items-start gap-2 py-1">
                          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={evaluates.has(k)} onChange={() => toggle(evaluates, setEvaluates, k)} />
                          <span className="text-sm text-slate-800">{r.label.trim()}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
          {formTypes.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No hay formularios creados.</li>}
        </ul>
      )}
      </div>
    </div>
  );
}
