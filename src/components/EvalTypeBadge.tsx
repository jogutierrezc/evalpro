import { evalTypeColor, evalTypeLabel, tintOf } from '../lib/evaluationTypes';
import { useFormTypeLabels } from '../hooks/useFormTypes';

/** Insignia del tipo de evaluación: punto del color distintivo + nombre. */
export function EvalTypeBadge({ typeKey, className = '' }: { typeKey?: string | null; className?: string }) {
  const labels = useFormTypeLabels();
  const color = evalTypeColor(typeKey);
  const label = evalTypeLabel(typeKey, labels);
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-slate-800 ${className}`}
      style={{ backgroundColor: tintOf(color), boxShadow: `inset 0 0 0 1px ${color}55` }}
      title={`Tipo de evaluación: ${label}`}
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{label}</span>
    </span>
  );
}
