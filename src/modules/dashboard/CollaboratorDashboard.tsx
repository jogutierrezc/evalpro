import { useLayoutEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { gsap } from 'gsap';
import { ChevronDown, Check, Search, Play } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Evaluation, EvaluationTemplate, User } from '../../lib/supabase';
import { HistoricalScoresChart } from '../../components/HistoricalScoresChart';
import { PageHeader } from '../../components/ui/PageHeader';

interface Stats {
  pendingEvaluations: number;
  completedEvaluations: number;
}

export interface CollaboratorDashboardProps {
  user: User | null;
  stats: Stats;
  availableTemplatesCount: number;
  availableTemplates: EvaluationTemplate[];
  managerCandidatesMap: Record<string, User[]>;
  selfEvalAllowedMap: Record<string, boolean>;
  userEvaluationsMap: Record<string, Evaluation>;
  inProgressEvaluations: any[];
  selectedCandidate: Record<string, string>;
  setSelectedCandidate: Dispatch<SetStateAction<Record<string, string>>>;
  dropdownOpenMap: Record<string, boolean>;
  setDropdownOpenMap: Dispatch<SetStateAction<Record<string, boolean>>>;
  searchTermMap: Record<string, string>;
  setSearchTermMap: Dispatch<SetStateAction<Record<string, string>>>;
  dropdownRefs: RefObject<Record<string, HTMLDivElement | null>>;
  allUsers: User[];
  historyTargetUser: { id: string; name: string } | null;
  setHistoryTargetUser: (value: { id: string; name: string } | null) => void;
  activePeriod: { id: string; year: number; start_date: string; end_date: string } | null;
  onOpenEvaluation: (evaluation: Evaluation) => void;
  onReload: () => void;
}

const firstName = (full?: string | null) => (full || '').trim().split(' ')[0] || 'colaborador';
const roleLabel = (role?: string | null) => (role || '').replace(/_/g, ' ');

function daysLeftText(end: string) {
  const days = Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000);
  if (days > 0) return `Quedan ${days} día${days !== 1 ? 's' : ''}`;
  if (days === 0) return 'Último día';
  return 'Periodo finalizado';
}

export function CollaboratorDashboard(props: CollaboratorDashboardProps) {
  const {
    user, stats, availableTemplatesCount, availableTemplates, managerCandidatesMap, selfEvalAllowedMap, userEvaluationsMap,
    inProgressEvaluations, selectedCandidate, setSelectedCandidate, dropdownOpenMap, setDropdownOpenMap, searchTermMap,
    setSearchTermMap, dropdownRefs, allUsers, historyTargetUser, setHistoryTargetUser, activePeriod, onOpenEvaluation, onReload,
  } = props;

  const [error, setError] = useState<string | null>(null);
  const [busyTemplate, setBusyTemplate] = useState<string | null>(null);
  const scope = useRef<HTMLDivElement>(null);
  const isManager = user?.role === 'office_manager';

  // Entrada escalonada con GSAP: solo transform y opacidad, 280 ms. Con movimiento reducido no anima.
  useLayoutEffect(() => {
    if (!scope.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-reveal]', { y: 8, opacity: 0, duration: 0.28, ease: 'power2.out', stagger: 0.05, clearProps: 'transform,opacity' });
    }, scope);
    // Salida de seguridad: si la animación no avanza, el contenido nunca queda invisible.
    const safety = window.setTimeout(() => ctx.revert(), 1500);
    return () => {
      window.clearTimeout(safety);
      ctx.revert();
    };
  }, []);

  const startSelfEvaluation = async (tpl: EvaluationTemplate) => {
    if (!user?.id) return;
    setError(null);
    setBusyTemplate(tpl.id);
    try {
      const { data, error: insertError } = await supabase
        .from('evaluations')
        .insert([{ template_id: tpl.id, evaluator_id: user.id, evaluated_id: user.id, status: 'pending' }])
        .select('*')
        .single();
      if (insertError) throw insertError;
      onOpenEvaluation(data as Evaluation);
      onReload();
    } catch (err) {
      console.error('Error creating self evaluation from dashboard', err);
      setError('No se pudo iniciar la evaluación. Intenta de nuevo.');
    } finally {
      setBusyTemplate(null);
    }
  };

  const startEvaluationOf = async (tpl: EvaluationTemplate, evaluatedId: string) => {
    if (!user?.id || !evaluatedId) return;
    setError(null);
    setBusyTemplate(tpl.id);
    try {
      const { data, error: insertError } = await supabase
        .from('evaluations')
        .insert([{ template_id: tpl.id, evaluator_id: user.id, evaluated_id: evaluatedId, status: 'pending' }])
        .select('*')
        .single();
      if (insertError) throw insertError;
      onOpenEvaluation(data as Evaluation);
      onReload();
      setSelectedCandidate((prev) => ({ ...prev, [tpl.id]: '' }));
    } catch (err) {
      console.error('Error creating evaluation from dashboard', err);
      setError('No se pudo iniciar la evaluación. Intenta de nuevo.');
    } finally {
      setBusyTemplate(null);
    }
  };

  // Ver qué exámenes ya tienen candidato o autoevaluación pendiente.
  const cards = availableTemplates
    .map((tpl) => {
      const candidates = managerCandidatesMap[tpl.id] || [];
      const showCandidateSelect = candidates.length > 0;
      const canSelfEval = !!selfEvalAllowedMap[tpl.id];
      if (!canSelfEval && !showCandidateSelect) return null;
      const evaluatedUsersMap = (window as any).__evaluatedUsersMap || {};
      const evaluatedUsers: Set<string> = evaluatedUsersMap[tpl.id] || new Set();
      const availableCandidates = candidates.filter((c) => !evaluatedUsers.has(c.id));
      const existing = userEvaluationsMap[tpl.id];
      return {
        tpl,
        candidates,
        availableCandidates,
        showCandidateSelect,
        canSelfEval,
        isCompleted: !!existing && existing.status === 'completed',
        isInProgress: !!existing && existing.status !== 'completed',
        existing,
      };
    })
    .filter(Boolean) as {
    tpl: EvaluationTemplate;
    candidates: User[];
    availableCandidates: User[];
    showCandidateSelect: boolean;
    canSelfEval: boolean;
    isCompleted: boolean;
    isInProgress: boolean;
    existing: Evaluation | undefined;
  }[];

  const nextPending = inProgressEvaluations[0];
  const nextSelf = cards.find((c) => c.canSelfEval && !c.isCompleted && !c.isInProgress);

  return (
    <div ref={scope} className="animate-in space-y-6">
      <PageHeader
        eyebrow={roleLabel(user?.role) || 'Mi espacio'}
        title={`Hola, ${firstName(user?.full_name)}`}
        description={activePeriod ? `Periodo ${activePeriod.year} · ${daysLeftText(activePeriod.end_date)}` : 'No hay un periodo de evaluación activo.'}
      />

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {/* Siguiente paso: lo único que destaca */}
      <section data-reveal className="ui-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        {nextPending ? (
          <>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Continúa donde quedaste</p>
              <h2 className="mt-1 truncate text-lg font-semibold text-slate-900">{nextPending.template_name}</h2>
              <p className="mt-1 text-sm text-slate-500">
                Iniciada el {new Date(nextPending.created_at).toLocaleDateString('es-CO')}
                {nextPending.evaluator_id === nextPending.evaluated_id ? ' · Autoevaluación' : ` · Evaluado: ${nextPending.evaluated_name}`}
              </p>
            </div>
            <button onClick={() => onOpenEvaluation(nextPending)} className="ui-btn-primary shrink-0">
              <Play className="h-4 w-4" />
              Continuar
            </button>
          </>
        ) : nextSelf ? (
          <>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Siguiente examen</p>
              <h2 className="mt-1 truncate text-lg font-semibold text-slate-900">Autoevaluación: {nextSelf.tpl.name}</h2>
              <p className="mt-1 text-sm text-slate-500">Responde según tu percepción sobre tu desempeño.</p>
            </div>
            <button onClick={() => startSelfEvaluation(nextSelf.tpl)} disabled={busyTemplate === nextSelf.tpl.id} className="ui-btn-primary shrink-0">
              <Play className="h-4 w-4" />
              Iniciar examen
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-600">Estás al día. No tienes evaluaciones pendientes.</p>
        )}
      </section>

      {/* Cifras en una franja */}
      <div data-reveal className="grid grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {[
          { label: 'Pendientes', value: stats.pendingEvaluations },
          { label: 'Exámenes disponibles', value: availableTemplatesCount },
          { label: 'Completadas', value: stats.completedEvaluations },
        ].map((s) => (
          <div key={s.label} className="px-4 py-3 sm:px-5 sm:py-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="tabular mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-8">
          {inProgressEvaluations.length > 0 && (
            <section data-reveal>
              <h2 className="text-sm font-semibold text-slate-900">Pendientes por terminar</h2>
              <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                {inProgressEvaluations.map((p) => (
                  <li key={p.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{p.template_name}</p>
                      <p className="text-sm text-slate-500">
                        {p.evaluator_id === p.evaluated_id ? 'Autoevaluación' : `Evaluado: ${p.evaluated_name}`} · {new Date(p.created_at).toLocaleDateString('es-CO')}
                      </p>
                    </div>
                    <button onClick={() => onOpenEvaluation(p)} className="ui-btn-secondary shrink-0">Continuar</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section data-reveal>
            <h2 className="text-sm font-semibold text-slate-900">Exámenes disponibles</h2>
            {cards.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                No hay exámenes disponibles para tu rol en este momento.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {cards.map((c) => {
                  const candidateId = selectedCandidate[c.tpl.id];
                  const selectedObj = c.candidates.find((x) => x.id === candidateId);
                  const searchTerm = searchTermMap[c.tpl.id] || '';
                  const filtered = c.availableCandidates.filter((x) =>
                    x.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (x.role || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    x.identification.includes(searchTerm)
                  );
                  return (
                    <article key={c.tpl.id} className="ui-card p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-slate-500">{c.showCandidateSelect ? 'Institucional' : 'Personal'}</span>
                          <h3 className="mt-1 font-semibold text-slate-900">{c.tpl.name}</h3>
                          <p className="mt-1 text-sm leading-relaxed text-slate-500">
                            {c.canSelfEval
                              ? 'Responde según tu percepción personal sobre tu desempeño.'
                              : c.tpl.description || 'Valoración del desempeño de su equipo.'}
                          </p>
                        </div>
                        {c.canSelfEval && (
                          <div className="shrink-0">
                            {c.isCompleted ? (
                              <span className="text-sm text-slate-500">Realizado</span>
                            ) : c.isInProgress ? (
                              <button onClick={() => c.existing && onOpenEvaluation(c.existing)} className="ui-btn-secondary">Continuar</button>
                            ) : (
                              <button onClick={() => startSelfEvaluation(c.tpl)} disabled={busyTemplate === c.tpl.id} className="ui-btn-primary">
                                Iniciar examen
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {c.showCandidateSelect && (
                        <div className="mt-4 border-t border-slate-200 pt-4">
                          {c.availableCandidates.length === 0 ? (
                            <p className="text-sm text-slate-500">Todos los colaboradores disponibles ya han sido evaluados.</p>
                          ) : (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                              <div
                                className="relative min-w-0 flex-1"
                                ref={(el) => {
                                  if (dropdownRefs.current) dropdownRefs.current[c.tpl.id] = el;
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => setDropdownOpenMap((prev) => ({ ...prev, [c.tpl.id]: !prev[c.tpl.id] }))}
                                  aria-haspopup="listbox"
                                  aria-expanded={!!dropdownOpenMap[c.tpl.id]}
                                  className="ui-input flex items-center justify-between text-left"
                                >
                                  <span className={selectedObj ? 'truncate text-slate-900' : 'text-slate-400'}>
                                    {selectedObj ? `${selectedObj.full_name}${selectedObj.campus ? ` · ${selectedObj.campus}` : ''}` : 'Buscar colaborador'}
                                  </span>
                                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                                </button>

                                {dropdownOpenMap[c.tpl.id] && (
                                  <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                                    <div className="relative border-b border-slate-200 p-2">
                                      <Search className="absolute left-5 top-4 h-4 w-4 text-slate-400" />
                                      <input
                                        type="text"
                                        className="ui-input py-2 pl-9"
                                        placeholder="Filtrar por nombre, cargo o cédula"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTermMap((prev) => ({ ...prev, [c.tpl.id]: e.target.value }))}
                                        autoFocus
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                    <ul role="listbox" className="max-h-60 overflow-y-auto">
                                      {filtered.length === 0 && <li className="p-4 text-center text-sm text-slate-400">Sin resultados</li>}
                                      {filtered.map((col) => (
                                        <li
                                          key={col.id}
                                          role="option"
                                          aria-selected={candidateId === col.id}
                                          onClick={() => {
                                            setSelectedCandidate((prev) => ({ ...prev, [c.tpl.id]: col.id }));
                                            setDropdownOpenMap((prev) => ({ ...prev, [c.tpl.id]: false }));
                                            setSearchTermMap((prev) => ({ ...prev, [c.tpl.id]: '' }));
                                          }}
                                          className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-slate-50 ${candidateId === col.id ? 'bg-blue-50' : ''}`}
                                        >
                                          <div className="min-w-0 flex-1">
                                            <p className={`truncate text-sm ${candidateId === col.id ? 'font-semibold text-blue-800' : 'text-slate-800'}`}>{col.full_name}</p>
                                            <p className="truncate text-xs text-slate-500">{col.role}{col.campus ? ` · ${col.campus}` : ''}</p>
                                          </div>
                                          {candidateId === col.id && <Check className="h-4 w-4 text-blue-700" />}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                              <button
                                disabled={!candidateId || busyTemplate === c.tpl.id}
                                onClick={() => startEvaluationOf(c.tpl, candidateId)}
                                className="ui-btn-primary w-full justify-center sm:w-auto"
                              >
                                Crear evaluación
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {(isManager || (historyTargetUser && stats.completedEvaluations > 0)) && (
            <section data-reveal className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900">Historial de desempeño</h2>
                {isManager && (
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    Persona
                    <select
                      className="ui-input w-auto py-1.5"
                      value={historyTargetUser?.id || ''}
                      onChange={(e) => {
                        const selected = allUsers.find((u) => u.id === e.target.value);
                        if (selected) setHistoryTargetUser({ id: selected.id, name: selected.full_name });
                      }}
                    >
                      <option value={user?.id}>Mí mismo</option>
                      {allUsers.filter((u) => u.id !== user?.id).map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {historyTargetUser && <HistoricalScoresChart userId={historyTargetUser.id} userName={historyTargetUser.name} />}
            </section>
          )}
        </div>

        {/* Perfil compacto, sin avatar decorativo */}
        <aside data-reveal className="lg:sticky lg:top-6 lg:self-start">
          <div className="ui-card p-5">
            <p className="text-base font-semibold text-slate-900">{user?.full_name}</p>
            <p className="mt-0.5 text-sm capitalize text-slate-500">{roleLabel(user?.role)}</p>
            <dl className="mt-5 space-y-3 border-t border-slate-200 pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Cédula</dt>
                <dd className="tabular text-slate-900">{user?.identification}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Estado</dt>
                <dd className="flex items-center gap-1.5 text-slate-900">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  Activo
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
