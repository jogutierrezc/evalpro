import { useEffect, useState, useMemo } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { useAuth } from '../contexts/AuthContext';
import { generarInformeIA } from '../lib/ai-report-logic';
import { AiReportRenderer } from '../components/AiReportRenderer';
import { useEvaluationReport } from '../hooks/useEvaluationReport';

export function SelfEvaluationReport() {
    const { user } = useAuth();
    const [minTimeElapsed, setMinTimeElapsed] = useState(false);
    const [currentMessage, setCurrentMessage] = useState(0);

    const { inputData, loading: dataLoading, error: errorMsg } = useEvaluationReport({ userId: user?.id });

    const messages = [
        "Iniciando análisis neural...",
        "Conectando con base de datos Prisma...",
        "Cargando perfiles de evaluación...",
        "Procesando métricas de integridad...",
        "Analizando patrones de liderazgo...",
        "Evaluando competencias institucionales...",
        "Calculando indicadores de rendimiento...",
        "Comparando con benchmarks globales...",
        "Generando insights estratégicos...",
        "Sintetizando recomendaciones...",
        "Validando coherencia de datos...",
        "Estructurando informe ejecutivo...",
        "Optimizando visualización de resultados...",
        "Finalizando procesamiento neural...",
        "Preparando interfaz de usuario..."
    ];

    useEffect(() => {
        const totalDuration = 5000;
        const messageInterval = totalDuration / messages.length;

        const timer = setInterval(() => {
            setCurrentMessage(prev => {
                if (prev < messages.length - 1) return prev + 1;
                return prev;
            });
        }, messageInterval);

        const totalTimer = setTimeout(() => {
            setMinTimeElapsed(true);
        }, totalDuration);

        return () => {
            clearInterval(timer);
            clearTimeout(totalTimer);
        };
    }, []);

    const informe = useMemo(() => {
        if (!inputData) return null;
        return generarInformeIA(inputData);
    }, [inputData]);

    const isLoading = dataLoading || !minTimeElapsed;

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] bg-slate-50">
                <div className="w-64 h-64 mb-4">
                    <DotLottieReact
                        src="https://lottie.host/17ecbaa8-0f9f-46c0-81d3-3a02d04b506e/wVxA7W8L22.lottie"
                        loop
                        autoplay
                    />
                </div>
                <div className="text-slate-600 font-medium text-lg animate-pulse">
                    {messages[currentMessage]}
                </div>
                <div className="mt-4 w-64 h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-indigo-600 transition-all duration-300 ease-out"
                        style={{ width: `${((currentMessage + 1) / messages.length) * 100}%` }}
                    />
                </div>
            </div>
        );
    }

    if (errorMsg) return (
        <div className="p-8 text-center bg-white rounded-lg shadow">
            <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
            <p className="text-gray-600">{errorMsg}</p>
        </div>
    );

    if (!inputData || !informe) return (
        <div className="p-8 text-center bg-white rounded-lg shadow">
            <h2 className="text-xl font-bold text-gray-800">No hay informe disponible</h2>
            <p className="text-gray-600 mt-2">Debes completar una autoevaluación para ver tu informe de desempeño.</p>
        </div>
    );

    return <AiReportRenderer inputData={inputData} informe={informe} />;
}
