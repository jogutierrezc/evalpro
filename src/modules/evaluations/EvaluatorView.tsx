import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { FileText, Play, Printer, Users, CheckCircle2, Clock3, ListChecks } from 'lucide-react';
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

const dateFmt = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

function Tag({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn'; children: ReactNode }) {
  const tones = {
    neutral: 'border-slate-200 text-slate-600',
    ok: 'border-emerald-200 text-emerald-700 bg-emerald-50/60',
    warn: 'border-amber-200 text-amber-800 bg-amber-50/60',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function EvaluatorView(props: EvaluatorViewProps) {
  const {
    userRole, currentUserId, activePeriod, availableSoftTemplates, takenTemplatesMap, canSelfEval, canEvaluateOthers,
    evaluateOther, selectedCandidate, evaluationCandidatesByTemplate, myEvaluations, otherEvaluations, totalEvaluations,
    setEvaluateOther, setSelectedCandidate, getStatusLabel, onAdminTakeTemplate, onStartEvaluation, onTakeForEvaluated,
    onTakeSoftSkill, onNavigate,
  } = props;

  const pending = myEvaluations.filter((e) => e.status !== 'completed');
  const completed = myEvaluations.filter((e) => e.status === 'completed');
  const canSeeAll = userRole !== 'employee' && otherEvaluations.length > 0;

  const [tab, setTab] = useState<Tab>(() => (pending.length ? 'pending' : availableSoftTemplates.length ? 'available' : 'completed'));
  const scope = useRef<HTMLDivElement>(null);

  // Entrada escalonada: solo transform y opacidad, 280 ms, y sin animación con movimiento reducido.
  useLayoutEffect(() => {
    if (!scope.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-reveal]', { y: 8, opacity: 0, duration: 0.28, ease: 'power2.out', stagger: 0.04, clearProps: 'transform,opacity' });
    }, scope);
    // Salida de seguridad: si la animación no avanza, el contenido nunca queda invisible.
    const safety = window.setTimeout(() => ctx.revert(), 1500);
    return () => {
      window.clearTimeout(safety);
      ctx.revert();
    };
  }, [tab]);

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
        <button onClick={() => onAdminTakeTemplate(template)} className="ui-btn-primary">
          Crear prueba (admin)
        </button>
      );
    }
    const canSelf = canSelfEval[template.id];
    const canOther = canEvaluateOthers[template.id];
    const isEvaluatingOther = evaluateOther[template.id] || (!canSelf && canOther);

    if (!canSelf && !canOther) {
      return <span className="text-sm italic text-slate-500">No disponible para tu rol</span>;
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        {canSelf && canOther && (
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={!!evaluateOther[template.id]}
              onChange={(e) => setEvaluateOther({ ...evaluateOther, [template.id]: e.target.checked })}
              className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            Evaluar a otro colaborador
          </label>
        )}
        {!canSelf && canOther && <span className="text-sm font-medium text-slate-700">Evaluación de colaborador:</span>}
        {isEvaluatingOther ? (
          <>
            <select
              className="ui-input max-w-[220px] py-2"
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
              className="ui-btn-primary"
            >
              Crear evaluación
            </button>
          </>
        ) : takenTemplatesMap[template.id] ? (
          <button onClick={() => onNavigate('self-report')} className="ui-btn-secondary">
            <FileText className="h-4 w-4" />
            Leer mi informe
          </button>
        ) : (
          <button onClick={() => onTakeSoftSkill(template)} className="ui-btn-primary">
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

  const emptyState = (text: string) => (
    <div data-reveal className="rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-500">
      {text}
    </div>
  );

  return (
    <div ref={scope} className="space-y-6 animate-in">
      <PageHeader
        eyebrow="Mi espacio"
        title="Mis evaluaciones"
        description={activePeriod ? `Periodo ${activePeriod.year} en curso` : 'Sin periodo de evaluación activo'}
      />

      {/* Siguiente acción: lo único que destaca */}
      <section data-reveal className="ui-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        {nextEvaluation ? (
          <>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Siguiente evaluación</p>
              <h2 className="mt-1 truncate text-lg font-semibold text-slate-900">{nextEvaluation.template?.name || 'Evaluación'}</h2>
              <p className="mt-1 text-sm text-slate-500">
                Evaluado: <span className="text-slate-700">{nextEvaluation.evaluated?.full_name || '—'}</span> · Creada el {dateFmt(nextEvaluation.created_at)}
              </p>
            </div>
            <button onClick={() => onStartEvaluation(nextEvaluation)} className="ui-btn-primary shrink-0">
              <Play className="h-4 w-4" />
              {nextEvaluation.status === 'pending' ? 'Comenzar' : 'Continuar'}
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-600">No tienes evaluaciones pendientes en este momento.</p>
        )}
      </section>

      {/* Resumen en una sola franja, no tres tarjetas iguales */}
      <div data-reveal className="grid grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {[
          { label: 'Pendientes', value: pending.length, icon: Clock3 },
          { label: 'Disponibles', value: availableSoftTemplates.length, icon: ListChecks },
          { label: 'Completadas', value: completed.length, icon: CheckCircle2 },
        ].map((s) => (
          <div key={s.label} className="px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <s.icon className="h-3.5 w-3.5" aria-hidden />
              {s.label}
            </p>
            <p className="tabular mt-0.5 text-2xl font-semibold text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {activePeriod && (
        <p data-reveal className="text-sm text-slate-500">
          Periodo {activePeriod.year}: {dateFmt(activePeriod.start_date)} al {dateFmt(activePeriod.end_date)}
        </p>
      )}

      {/* Pestañas */}
      <div role="tablist" aria-label="Secciones" className="flex gap-1 overflow-x-auto border-b border-slate-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors ${
              tab === t.id ? 'border-blue-700 font-medium text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
            <span className="tabular rounded bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" className="space-y-3">
        {tab === 'pending' &&
          (pending.length === 0
            ? emptyState('No tienes evaluaciones pendientes.')
            : pending.map((evaluation) => (
                <div key={evaluation.id} data-reveal className="ui-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium text-slate-900">{evaluation.template?.name}</h3>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Evaluado: <span className="text-slate-700">{evaluation.evaluated?.full_name}</span> · {dateFmt(evaluation.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Tag tone="warn"><span className="h-1.5 w-1.5 rounded-full bg-current" />{getStatusLabel(evaluation.status)}</Tag>
                    <button onClick={() => onStartEvaluation(evaluation)} className="ui-btn-secondary">
                      {evaluation.status === 'pending' ? 'Comenzar' : 'Continuar'}
                    </button>
                  </div>
                </div>
              )))}

        {tab === 'available' &&
          (availableSoftTemplates.length === 0
            ? emptyState('No hay pruebas disponibles para ti.')
            : availableSoftTemplates.map((template) => (
                <div key={template.id} data-reveal className="ui-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-medium text-slate-900">{template.name}</h3>
                    <p className="mt-0.5 text-sm text-slate-500">{template.description}</p>
                  </div>
                  <div className="shrink-0">{renderTemplateAction(template)}</div>
                </div>
              )))}

        {tab === 'completed' && (
          <>
            {completed.length > 1 && (
              <div data-reveal className="flex justify-end">
                <button onClick={() => openPrint('group', completed.map((e) => e.id))} className="ui-btn-secondary">
                  <Users className="h-4 w-4" />
                  Informe grupal ({completed.length})
                </button>
              </div>
            )}
            {completed.length === 0
              ? emptyState('Aún no tienes evaluaciones completadas.')
              : completed.map((evaluation) => (
                  <div key={evaluation.id} data-reveal className="ui-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate font-medium text-slate-900">{evaluation.template?.name}</h3>
                      <p className="mt-0.5 text-sm text-slate-500">
                        Evaluado: <span className="text-slate-700">{evaluation.evaluated?.full_name}</span> · Completada el {dateFmt(evaluation.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => window.open(`?module=technical-report&id=${evaluation.id}`, '_blank')} className="ui-btn-secondary">
                        Ver informe
                      </button>
                      <button onClick={() => openPrint('individual', [evaluation.id])} className="ui-btn-primary">
                        <Printer className="h-4 w-4" />
                        Descargar PDF
                      </button>
                    </div>
                  </div>
                ))}
          </>
        )}

        {tab === 'all' && canSeeAll && (
          <div data-reveal className="ui-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Formulario</th>
                  <th className="px-4 py-3 font-medium">Evaluador</th>
                  <th className="px-4 py-3 font-medium">Evaluado</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
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

      {totalEvaluations === 0 && availableSoftTemplates.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500">No hay evaluaciones disponibles en este momento.</p>
      )}
    </div>
  );
}
