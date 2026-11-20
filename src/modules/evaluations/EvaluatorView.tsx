import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, FileText, Play, Printer, Users } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import type { Evaluation, EvaluationTemplate, User } from '../../lib/supabase';

type EvaluationRow = Evaluation & { template?: EvaluationTemplate; evaluator?: User; evaluated?: User };
type Tab = 'pending' | 'available' | 'completed' | 'all';

interface ActivePeriod {
  id: string;
  year: number;
  start_date: string;
  end_date: string;
}

export interface EvaluatorViewProps {
  userRole?: string;
  currentUserId: string | null;
  activePeriod: ActivePeriod | null;
  availableSoftTemplates: EvaluationTemplate[];
  takenTemplatesMap: Record<string, boolean>;
  canSelfEval: Record<string, boolean>;
  canEvaluateOthers: Record<string, boolean>;
  evaluateOther: Record<string, boolean>;
  selectedCandidate: Record<string, string>;
  evaluationCandidatesByTemplate: Record<string, User[]>;
  myEvaluations: EvaluationRow[];
  otherEvaluations: EvaluationRow[];
  totalEvaluations: number;
  setEvaluateOther: (value: Record<string, boolean>) => void;
  setSelectedCandidate: (value: Record<string, string>) => void;
  getStatusLabel: (status: string) => string;
  onAdminTakeTemplate: (template: EvaluationTemplate) => void;
  onStartEvaluation: (evaluation: Evaluation) => void;
  onTakeForEvaluated: (template: EvaluationTemplate, evaluatedId: string) => void;
  onTakeSoftSkill: (template: EvaluationTemplate) => void;
  onNavigate: (module: string) => void;
}

/** Las fechas sin hora (AAAA-MM-DD) se leen como día local: `new Date('2026-01-12')` es UTC y en Colombia mostraría el día anterior. */
const parseFecha = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
};

const dateFmt = (iso?: string | null) => {
  if (!iso) return '—';
  const d = parseFecha(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
};

function Tag({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn'; children: ReactNode }) {
  const tones = {
    neutral: 'border-slate-200 bg-slate-50 text-slate-600',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Quién es el evaluado, dicho como lo diría una persona: «Autoevaluación» cuando coincide con quien evalúa. */
const evaluatedLabel = (e: EvaluationRow) =>
  e.evaluated_id === e.evaluator_id ? 'Autoevaluación' : e.evaluated?.full_name || '—';

const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-blue-800 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';
const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-[background-color,transform] duration-150 ease-out hover:bg-slate-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';

export function EvaluatorView(props: EvaluatorViewProps) {
  const {
    userRole, currentUserId, activePeriod, availableSoftTemplates, takenTemplatesMap, canSelfEval, canEvaluateOthers,
    evaluateOther, selectedCandidate, evaluationCandidatesByTemplate, myEvaluations, otherEvaluations,
    setEvaluateOther, setSelectedCandidate, getStatusLabel, onAdminTakeTemplate, onStartEvaluation, onTakeForEvaluated,
    onTakeSoftSkill, onNavigate,
  } = props;

  const pending = myEvaluations.filter((e) => e.status !== 'completed');
  const completed = myEvaluations.filter((e) => e.status === 'completed');
  const canSeeAll = userRole !== 'employee' && otherEvaluations.length > 0;
  const totalMine = pending.length + completed.length;
  const ratio = totalMine > 0 ? completed.length / totalMine : 0;

  const [tab, setTab] = useState<Tab>(() => (pending.length ? 'pending' : availableSoftTemplates.length ? 'available' : 'completed'));
  const scope = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  // Una sola entrada al abrir la pantalla (no al cambiar de pestaña, que se hace muchas veces). Solo transform y opacidad.
  // Con «reducir movimiento» no se anima nada y el contenido queda visible.
  useLayoutEffect(() => {
    const mm = gsap.matchMedia();
    mm.add(
      '(prefers-reduced-motion: no-preference)',
      () => {
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
        tl.from('[data-rise]', { autoAlpha: 0, y: 12, duration: 0.6, stagger: 0.07, clearProps: 'transform,opacity,visibility' }, 0);
        if (bar.current) tl.from(bar.current, { scaleX: 0, duration: 0.9, transformOrigin: 'left center', clearProps: 'transform' }, 0.25);
      },
      scope.current ?? undefined,
    );
    return () => mm.revert();
  }, []);

  const nextEvaluation = pending[0];

  const openPrint = (kind: 'individual' | 'group', ids: string[]) => {
    const params = new URLSearchParams({ module: 'print-report', kind });
    if (kind === 'individual') params.set('id', ids[0]);
    else params.set('ids', ids.join(','));
    window.open(`?${params.toString()}`, '_blank', 'noopener');
  };

  const renderTemplateAction = (template: EvaluationTemplate) => {
    if (userRole === 'admin') {
      return (
        <button onClick={() => onAdminTakeTemplate(template)} className={btnPrimary}>
          Crear prueba (admin)
        </button>
      );
    }
    const canSelf = canSelfEval[template.id];
    const canOther = canEvaluateOthers[template.id];
    const isEvaluatingOther = evaluateOther[template.id] || (!canSelf && canOther);

    if (!canSelf && !canOther) {
      return <span className="text-sm text-slate-500">No disponible para tu rol</span>;
    }

    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
        {canSelf && canOther && (
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={!!evaluateOther[template.id]}
              onChange={(e) => setEvaluateOther({ ...evaluateOther, [template.id]: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            Evaluar a otro colaborador
          </label>
        )}
        {!canSelf && canOther && <span className="text-sm font-medium text-slate-700">Evaluación de colaborador</span>}
        {isEvaluatingOther ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Colaborador a evaluar"
              className="ui-input max-w-[240px] py-2.5"
              value={selectedCandidate[template.id] || ''}
              onChange={(e) => setSelectedCandidate({ ...selectedCandidate, [template.id]: e.target.value })}
            >
              <option value="">Selecciona colaborador</option>
              {(evaluationCandidatesByTemplate[template.id] || [])
                .filter((c) => c.id !== currentUserId)
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name} ({c.role || c.identification})</option>
                ))}
            </select>
            <button
              onClick={() => onTakeForEvaluated(template, selectedCandidate[template.id])}
              disabled={!selectedCandidate[template.id]}
              className={btnPrimary}
            >
              Crear evaluación
            </button>
          </div>
        ) : takenTemplatesMap[template.id] ? (
          <button onClick={() => onNavigate('self-report')} className={btnSecondary}>
            <FileText className="h-4 w-4" aria-hidden />
            Leer mi informe
          </button>
        ) : (
          <button onClick={() => onTakeSoftSkill(template)} className={btnPrimary}>
            Tomar prueba
          </button>
        )}
      </div>
    );
  };

  const tabs: { id: Tab; label: string; count: number; show: boolean }[] = [
    { id: 'pending', label: 'Pendientes', count: pending.length, show: true },
    { id: 'available', label: 'Disponibles', count: availableSoftTemplates.length, show: true },
    { id: 'completed', label: 'Completadas', count: completed.length, show: true },
    { id: 'all', label: 'Todas', count: otherEvaluations.length, show: canSeeAll },
  ];
  const visibleTabs = tabs.filter((t) => t.show);

  // Flechas, Inicio y Fin mueven la selección entre pestañas.
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = visibleTabs.findIndex((t) => t.id === tab);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % visibleTabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + visibleTabs.length) % visibleTabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = visibleTabs.length - 1;
    else return;
    e.preventDefault();
    setTab(visibleTabs[next].id);
    requestAnimationFrame(() => document.getElementById(`eval-tab-${visibleTabs[next].id}`)?.focus());
  };

  const emptyState = (title: string, text: string, action?: ReactNode) => (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <ClipboardList className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );

  const description = activePeriod
    ? `Período ${activePeriod.year} · ${dateFmt(activePeriod.start_date)} al ${dateFmt(activePeriod.end_date)}`
    : 'Sin período de evaluación activo';

  const rowBase = 'flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5';

  return (
    <div ref={scope} className="mx-auto max-w-4xl space-y-6">
      <div data-rise>
        <PageHeader title="Mis evaluaciones" description={description} />
      </div>

      {!activePeriod && (
        <div data-rise role="status" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            No hay un período de evaluación activo, así que por ahora no puedes iniciar evaluaciones nuevas. Si ya tienes alguna en
            curso, puedes continuarla desde Pendientes.
          </p>
        </div>
      )}

      {/* Lo que sigue: una sola cosa destaca en la pantalla */}
      {nextEvaluation ? (
        <section data-rise aria-label="Siguiente evaluación" className="overflow-hidden rounded-2xl bg-blue-950 text-white">
          <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="min-w-0">
              <h2 className="text-balance text-xl font-semibold leading-snug sm:text-2xl">
                {nextEvaluation.template?.name || 'Evaluación'}
              </h2>
              <p className="mt-2 text-sm text-blue-100">
                {evaluatedLabel(nextEvaluation)} · creada el {dateFmt(nextEvaluation.created_at)}
                {nextEvaluation.status === 'in_progress' && ' · ya tienes avance guardado'}
              </p>
            </div>
            <button
              onClick={() => onStartEvaluation(nextEvaluation)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-blue-950 transition-[background-color,transform] duration-150 ease-out hover:bg-blue-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-950"
            >
              <Play className="h-4 w-4" aria-hidden />
              {nextEvaluation.status === 'pending' ? 'Comenzar' : 'Continuar'}
            </button>
          </div>
          {totalMine > 0 && (
            <div className="border-t border-white/10 bg-blue-900/40 px-6 py-4 sm:px-7">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-blue-100">Avance del período</span>
                <span className="tabular font-semibold">{completed.length} de {totalMine} completadas</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={totalMine} aria-valuenow={completed.length} aria-label="Evaluaciones completadas">
                <div ref={bar} className="h-full origin-left rounded-full bg-emerald-400" style={{ transform: `scaleX(${ratio})` }} />
              </div>
            </div>
          )}
        </section>
      ) : (
        <section data-rise aria-label="Estado" className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="flex items-start gap-4">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${completed.length > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {completed.length > 0 ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <ClipboardList className="h-5 w-5" aria-hidden />}
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {completed.length > 0 ? 'Estás al día' : 'Aún no tienes evaluaciones asignadas'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {completed.length > 0
                  ? `Completaste ${completed.length} ${completed.length === 1 ? 'evaluación' : 'evaluaciones'} y no te queda ninguna pendiente.`
                  : availableSoftTemplates.length > 0
                    ? 'Mira en Disponibles si hay alguna prueba que puedas iniciar.'
                    : 'Cuando se te asigne una evaluación aparecerá aquí.'}
              </p>
            </div>
          </div>
          {completed.length > 0 && (
            <button onClick={() => setTab('completed')} className={`${btnSecondary} shrink-0`}>
              Ver completadas <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          )}
        </section>
      )}

      {/* Pestañas */}
      <div data-rise>
        <div role="tablist" aria-label="Secciones de evaluaciones" className="flex gap-1 overflow-x-auto border-b border-slate-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              id={`eval-tab-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls="eval-panel"
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={onTabKey}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${
                tab === t.id ? 'border-blue-700 font-semibold text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
              <span className={`tabular rounded-full px-2 text-xs ${tab === t.id ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>{t.count}</span>
            </button>
          ))}
        </div>

        <div id="eval-panel" role="tabpanel" aria-labelledby={`eval-tab-${tab}`} className="pt-5">
          {tab === 'pending' && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {pending.length === 0 ? (
                emptyState('No tienes evaluaciones pendientes', 'Cuando se te asigne una nueva, la verás aquí.')
              ) : (
                <ul className="divide-y divide-slate-100">
                  {pending.map((evaluation) => (
                    <li key={evaluation.id} className={rowBase}>
                      <div className="min-w-0">
                        <h3 className="truncate font-medium text-slate-900">{evaluation.template?.name}</h3>
                        <p className="mt-0.5 text-sm text-slate-500">
                          <span className="text-slate-700">{evaluatedLabel(evaluation)}</span> · creada el {dateFmt(evaluation.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <Tag tone={evaluation.status === 'in_progress' ? 'warn' : 'neutral'}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                          {getStatusLabel(evaluation.status)}
                        </Tag>
                        <button onClick={() => onStartEvaluation(evaluation)} className={btnSecondary}>
                          {evaluation.status === 'pending' ? 'Comenzar' : 'Continuar'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'available' && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {availableSoftTemplates.length === 0 ? (
                emptyState('No hay pruebas disponibles para ti', 'Si esperabas alguna, confirma con el administrador que tu rol y el período estén configurados.')
              ) : (
                <ul className="divide-y divide-slate-100">
                  {availableSoftTemplates.map((template) => (
                    <li key={template.id} className={rowBase}>
                      <div className="min-w-0 sm:max-w-[55%]">
                        <h3 className="font-medium text-slate-900">{template.name}</h3>
                        {template.description && <p className="mt-0.5 text-sm text-slate-500">{template.description}</p>}
                      </div>
                      <div className="shrink-0">{renderTemplateAction(template)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'completed' && (
            <div className="space-y-3">
              {completed.length > 1 && (
                <div className="flex justify-end">
                  <button onClick={() => openPrint('group', completed.map((e) => e.id))} className={btnSecondary}>
                    <Users className="h-4 w-4" aria-hidden />
                    Informe grupal ({completed.length})
                  </button>
                </div>
              )}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {completed.length === 0 ? (
                  emptyState('Aún no completas ninguna evaluación', 'Las que termines quedarán aquí, con su informe y su PDF.')
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {completed.map((evaluation) => (
                      <li key={evaluation.id} className={rowBase}>
                        <div className="min-w-0">
                          <h3 className="truncate font-medium text-slate-900">{evaluation.template?.name}</h3>
                          <p className="mt-0.5 text-sm text-slate-500">
                            <span className="text-slate-700">{evaluatedLabel(evaluation)}</span> · completada el {dateFmt(evaluation.completed_at || evaluation.created_at)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button onClick={() => window.open(`?module=technical-report&id=${evaluation.id}`, '_blank')} className={btnSecondary}>
                            Ver informe
                          </button>
                          <button onClick={() => openPrint('individual', [evaluation.id])} className={btnPrimary}>
                            <Printer className="h-4 w-4" aria-hidden />
                            Descargar PDF
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {tab === 'all' && canSeeAll && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Formulario</th>
                    <th scope="col" className="px-4 py-3 font-medium">Evaluador</th>
                    <th scope="col" className="px-4 py-3 font-medium">Evaluado</th>
                    <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                    <th scope="col" className="px-4 py-3 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {otherEvaluations.map((evaluation) => (
                    <tr key={evaluation.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-900">{evaluation.template?.name}</td>
                      <td className="px-4 py-3 text-slate-600">{evaluation.evaluator?.full_name}</td>
                      <td className="px-4 py-3 text-slate-600">{evaluation.evaluated?.full_name}</td>
                      <td className="px-4 py-3">
                        <Tag tone={evaluation.status === 'completed' ? 'ok' : evaluation.status === 'in_progress' ? 'warn' : 'neutral'}>
                          {getStatusLabel(evaluation.status)}
                        </Tag>
                      </td>
                      <td className="tabular px-4 py-3 text-slate-600">{dateFmt(evaluation.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
