import { useMemo } from 'react';
import { generarInformeIA } from '../lib/ai-report-logic';
import { AiReportRenderer } from '../components/AiReportRenderer';
import { useEvaluationReport } from '../hooks/useEvaluationReport';

interface TechnicalReportViewerProps {
    evaluationId?: string;
}

export function TechnicalReportViewer({ evaluationId: propId }: TechnicalReportViewerProps) {
    // Get ID from props or URL params
    const evaluationId = useMemo(() => {
        if (propId) return propId;
        const params = new URLSearchParams(window.location.search);
        return params.get('id') || undefined;
    }, [propId]);

    // Solo espera los datos reales: sin temporizadores ni mensajes simulados.
    const { inputData, loading: dataLoading, error: errorMsg } = useEvaluationReport({ evaluationId });

    // Informe generado con reglas a partir de los puntajes (no llama a ningún modelo).
    const informe = useMemo(() => {
        if (!inputData) return null;
        return generarInformeIA(inputData);
    }, [inputData]);

    if (dataLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-3 text-sm text-slate-600">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-700" />
                    Cargando informe...
                </div>
            </div>
        );
    }

    if (errorMsg) return (
        <div className="p-8 text-center bg-white rounded-lg shadow min-h-screen flex items-center justify-center">
            <div>
                <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
                <p className="text-gray-600">{errorMsg}</p>
            </div>
        </div>
    );

    if (!inputData || !informe) return (
        <div className="p-8 text-center bg-white rounded-lg shadow min-h-screen flex items-center justify-center">
            <h2 className="text-xl font-bold text-gray-800">No hay datos disponibles</h2>
        </div>
    );

    return <AiReportRenderer inputData={inputData} informe={informe} />;
}
