import { useEffect, useMemo, useState } from 'react';
import { InformeEvaluacion } from './informe/InformeEvaluacion';
import { fetchInforme, type Informe } from './informe/informe';

interface TechnicalReportViewerProps {
    evaluationId?: string;
}

/** Informe de una evaluación o autoevaluación (ruta ?module=technical-report&id=...), sin menú lateral. */
export function TechnicalReportViewer({ evaluationId: propId }: TechnicalReportViewerProps) {
    const evaluationId = useMemo(() => {
        if (propId) return propId;
        return new URLSearchParams(window.location.search).get('id') || undefined;
    }, [propId]);

    const [informe, setInforme] = useState<Informe | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(Boolean(evaluationId));

    useEffect(() => {
        if (!evaluationId) { setLoading(false); return; }
        let vivo = true;
        setLoading(true);
        setError(null);
        fetchInforme(evaluationId)
            .then((r) => { if (vivo) setInforme(r); })
            .catch((e: Error) => { if (vivo) setError(e.message); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [evaluationId]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-100" role="status" aria-live="polite">
                <div className="flex flex-col items-center gap-3 text-sm text-slate-600">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
                    Preparando el informe…
                </div>
            </div>
        );
    }

    if (error || !informe) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
                <div role="alert" className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
                    <h1 className="text-lg font-semibold text-slate-900">
                        {evaluationId ? 'No pudimos abrir el informe' : 'Falta indicar la evaluación'}
                    </h1>
                    <p className="mt-2 text-sm text-slate-600">
                        {error ?? (evaluationId ? 'No hay datos para esta evaluación.' : 'El enlace no trae el identificador de la evaluación.')}
                    </p>
                </div>
            </div>
        );
    }

    return <InformeEvaluacion informe={informe} />;
}
