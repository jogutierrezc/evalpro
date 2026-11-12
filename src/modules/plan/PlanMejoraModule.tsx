import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePeriods } from '../../hooks/usePeriods';
import { PageHeader } from '../../components/ui/PageHeader';
import { useFeedbackAccess } from '../feedback/useFeedbackAccess';
import { PlanBoard } from './PlanBoard';
import { usePlanData } from './usePlanData';

/** Seguimiento de los compromisos de las actas firmadas por quien evalúa. */
export function PlanMejoraModule() {
  const { user } = useAuth();
  const access = useFeedbackAccess(user);
  const { periods, activePeriod, loading: periodsLoading } = usePeriods();
  const [periodId, setPeriodId] = useState('');

  useEffect(() => {
    if (periodId || periodsLoading) return;
    const p = activePeriod || periods[0];
    if (p) setPeriodId(p.id);
  }, [periods, activePeriod, periodsLoading, periodId]);

  const { items, loading, error, reload } = usePlanData({ admin: false, userId: user?.id, periodId });

  if (!user) return null;
  if (!access.loading && !access.allowed) {
    return (
      <div className="ui-card mx-auto max-w-xl p-8 text-center">
        <Lock className="mx-auto h-6 w-6 text-slate-400" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">Plan de mejora no disponible</h1>
        <p className="mt-1 text-sm text-slate-500">Este módulo es para quienes evalúan a otras personas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan de mejora"
        description="Seguimiento a los compromisos firmados con cada persona de tu equipo en la retroalimentación. Registra el avance, el estado y la evidencia."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="plan-period" className="text-sm text-slate-500">Periodo</label>
            <select id="plan-period" className="ui-input !w-auto" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              {periods.map((p: any) => <option key={p.id} value={p.id}>{p.name || `Periodo ${p.year}`}</option>)}
            </select>
          </div>
        }
      />

      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <PlanBoard
        items={items}
        loading={loading || periodsLoading}
        readOnly={false}
        userId={user.id}
        onChanged={reload}
        animateKey={periodId}
        emptyText="Los compromisos aparecen aquí cuando el acta de retroalimentación está firmada por ti y por la persona evaluada."
      />
    </div>
  );
}

export default PlanMejoraModule;
