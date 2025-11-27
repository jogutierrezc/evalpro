
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { MatrizGeneradoraIA, OutputInformeIA } from '../lib/ai-report-logic';
import { Printer, Shield, Users, Building2, TrendingUp, AlertTriangle, CheckCircle, BrainCircuit } from 'lucide-react';

export function SelfEvaluationReport() {
    const { user } = useAuth();
    const [reportData, setReportData] = useState<OutputInformeIA | null>(null);
    const [loading, setLoading] = useState(true);
    const componentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (user) {
            loadEvaluationData();
        }
    }, [user]);

    const loadEvaluationData = async () => {
        try {
            setLoading(true);
            // Fetch the latest completed evaluation for the current user
            const { data: evaluations, error } = await supabase
                .from('evaluations')
                .select(`
                    id,
                    created_at,
                    responses:evaluation_responses(
                        response_value,
                        question:evaluation_questions(
                            id,
                            question_text,
                            section:evaluation_sections(id, title)
                        )
                    )
                `)
                .eq('evaluated_id', user?.id)
                .eq('status', 'completed')
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;

            if (evaluations && evaluations.length > 0) {
                const evalData = evaluations[0];
                const responses = evalData.responses || [];

                // Aggregate scores by section
                const sectionScores: Record<string, { total: number; count: number }> = {};

                responses.forEach((r: any) => {
                    const sectionTitle = r.question?.section?.title || 'General';
                    // Normalize key
                    let key = 'general';
                    const lowerTitle = sectionTitle.toLowerCase();
                    if (lowerTitle.includes('integridad') || lowerTitle.includes('ética')) key = 'integridad';
                    else if (lowerTitle.includes('equipo') || lowerTitle.includes('colaboración')) key = 'trabajoEquipo';
                    else if (lowerTitle.includes('institucional')) key = 'institucional';
                    else if (lowerTitle.includes('resultados') || lowerTitle.includes('innovación')) key = 'orientacionResultados';
                    else if (lowerTitle.includes('liderazgo')) key = 'liderazgo';
                    else if (lowerTitle.includes('calidad')) key = 'calidadTrabajo';
                    else key = sectionTitle; // Fallback

                    if (!sectionScores[key]) sectionScores[key] = { total: 0, count: 0 };
                    sectionScores[key].total += Number(r.response_value) || 0;
                    sectionScores[key].count += 1;
                });

                const puntajesDimensiones: any = {};
                Object.entries(sectionScores).forEach(([key, val]) => {
                    puntajesDimensiones[key] = Number((val.total / val.count).toFixed(1));
                });

                // Generate Report
                const input = {
                    colaborador: {
                        id: user!.id,
                        nombreCompleto: user!.full_name || 'Usuario',
                        rol: user!.role || 'Colaborador',
                        fechaCorte: new Date(evalData.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
                    },
                    puntajesDimensiones
                };

                const generatedReport = MatrizGeneradoraIA.generarInforme(input);
                setReportData(generatedReport);
            } else {
                // No evaluation found
                setReportData(null);
            }
        } catch (error) {
            console.error('Error loading evaluation:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) return <div className="p-8 text-center">Generando análisis de IA...</div>;

    if (!reportData) return (
        <div className="p-8 text-center bg-white rounded-lg shadow">
            <h2 className="text-xl font-bold text-gray-800">No hay informe disponible</h2>
            <p className="text-gray-600 mt-2">Debes completar una autoevaluación para ver tu informe de desempeño.</p>
        </div>
    );

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-12">

            {/* Print Button */}
            <div className="flex justify-end print:hidden">
                <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
                >
                    <Printer size={18} />
                    Imprimir Informe
                </button>
            </div>

            <div ref={componentRef} className="bg-slate-50 min-h-screen print:bg-white">

                {/* HEADER */}
                <div className="bg-[#1a202c] text-white p-8 rounded-lg shadow-lg relative overflow-hidden mb-8 print:break-inside-avoid">
                    <div className="relative z-10">
                        <div className="text-[#fbbf24] font-bold mb-2 uppercase tracking-wider text-sm flex items-center gap-2">
                            <BrainCircuit size={18} />
                            {reportData.meta.tituloInforme}
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold mb-2">{reportData.cabecera.nombre}</h1>
                        <div className="opacity-80 mt-2 text-lg">{reportData.cabecera.detalles}</div>
                        <div className="text-right mt-4 md:-mt-10 opacity-70 text-sm">
                            Evaluador del Sistema:<br />
                            <strong className="text-[#fbbf24]">{reportData.cabecera.evaluadorSistema}</strong>
                        </div>
                    </div>
                </div>

                {/* KPIs */}
                <div className="flex flex-col md:flex-row gap-6 mb-8 print:break-inside-avoid">
                    {/* Global Score */}
                    <div className="flex-1 bg-white p-6 rounded-xl shadow-sm border-t-4 border-[#48bb78]">
                        <div className="text-slate-500 font-bold text-sm uppercase mb-2">Puntaje Global IA</div>
                        <div className="text-5xl font-extrabold text-[#1a202c]">
                            {reportData.kpisPrincipales.puntajeGlobal.split(' / ')[0]}
                            <span className="text-lg text-slate-400 font-normal"> / 5.0</span>
                        </div>
                        <div className="text-[#48bb78] font-bold mt-2">{reportData.kpisPrincipales.nivelDesempeno}</div>
                    </div>

                    {/* Archetype */}
                    <div className="flex-1 bg-white p-6 rounded-xl shadow-sm border-t-4 border-[#3182ce]">
                        <div className="text-slate-500 font-bold text-sm uppercase mb-2">Perfil Arquetipo Detectado</div>
                        <div className="flex items-center gap-3 mt-2">
                            <span className="text-3xl">🏛️</span>
                            <div className="text-xl font-extrabold text-[#1a202c] leading-tight">
                                {reportData.kpisPrincipales.perfilArquetipo}
                            </div>
                        </div>
                        <div className="text-slate-500 text-sm mt-2">
                            {reportData.kpisPrincipales.descripcionArquetipo}
                        </div>
                    </div>

                    {/* Reliability */}
                    <div className="flex-1 bg-white p-6 rounded-xl shadow-sm border-t-4 border-[#805ad5]">
                        <div className="text-slate-500 font-bold text-sm uppercase mb-2">Índice de Confiabilidad</div>
                        <div className="text-5xl font-extrabold text-[#1a202c]">
                            {reportData.kpisPrincipales.indiceConfiabilidad || 'A+'}
                        </div>
                        <div className="text-slate-500 text-sm mt-2">Basado en Integridad y Consistencia.</div>
                    </div>
                </div>

                {/* Executive Summary */}
                <div className="bg-white p-8 rounded-xl shadow-sm mb-8 border-l-4 border-[#2d3748] print:break-inside-avoid">
                    <h3 className="flex items-center gap-3 text-[#2d3748] text-xl font-bold mb-4">
                        <Users className="text-[#2d3748]" />
                        Resumen Ejecutivo del Análisis
                    </h3>
                    <p className="text-[#4a5568] leading-relaxed text-lg text-justify">
                        {reportData.resumenEjecutivoIA}
                    </p>
                </div>

                {/* Detailed Analysis */}
                <h2 className="text-[#2d3748] text-2xl font-bold mb-6">Análisis Detallado por Factores Competenciales</h2>
                <div className="space-y-6 mb-10">
                    {reportData.analisisDetalladoFactores.map((factor, idx) => (
                        <div key={idx} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 print:break-inside-avoid">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="margin-0 flex items-center gap-3 text-lg font-bold text-[#2d3748]">
                                    <span className={`p-2 rounded-full ${factor.colorBarra === 'azul' ? 'bg-[#ebf4ff] text-[#3182ce]' :
                                        factor.colorBarra === 'naranja' ? 'bg-[#fefcbf] text-[#b7791f]' :
                                            'bg-[#fed7d7] text-[#c53030]'
                                        }`}>
                                        {factor.factor.includes('Integridad') ? <Shield size={20} /> :
                                            factor.factor.includes('Equipo') ? <Users size={20} /> :
                                                factor.factor.includes('Institucional') ? <Building2 size={20} /> :
                                                    <TrendingUp size={20} />}
                                    </span>
                                    {factor.factor}
                                </h3>
                                <span className={`font-bold px-4 py-1 rounded-full text-sm ${factor.colorBarra === 'azul' ? 'bg-[#ebf4ff] text-[#3182ce]' :
                                    factor.colorBarra === 'naranja' ? 'bg-[#fefcbf] text-[#b7791f]' :
                                        'bg-[#fed7d7] text-[#c53030]'
                                    }`}>
                                    {factor.puntaje} / 5.0
                                </span>
                            </div>

                            {/* Progress Bar */}
                            <div className="h-2 bg-slate-100 rounded-full mb-6 overflow-hidden">
                                <div
                                    className={`h-full rounded-full ${factor.colorBarra === 'azul' ? 'bg-[#3182ce]' :
                                        factor.colorBarra === 'naranja' ? 'bg-[#ed8936]' :
                                            'bg-[#e53e3e]'
                                        }`}
                                    style={{ width: `${(factor.puntaje / 5) * 100}%` }}
                                ></div>
                            </div>

                            <div className="flex flex-col md:flex-row gap-8">
                                <div className="flex-1">
                                    <strong className="text-[#48bb78] flex items-center gap-2 mb-1 text-sm uppercase tracking-wide">
                                        <CheckCircle size={16} /> Fortalezas
                                    </strong>
                                    <p className="text-slate-600 text-sm">{factor.fortalezaTexto}</p>
                                </div>
                                <div className="flex-1">
                                    <strong className="text-[#ed8936] flex items-center gap-2 mb-1 text-sm uppercase tracking-wide">
                                        <AlertTriangle size={16} /> Vulnerabilidad Latente (IA)
                                    </strong>
                                    <p className="text-slate-600 text-sm">{factor.vulnerabilidadTexto}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Diagnosis & Recommendations */}
                <div className="flex flex-col lg:flex-row gap-8 items-start print:break-before-page">
                    {/* Dark Diagnosis Box */}
                    <div className="flex-1 bg-[#1a202c] text-white p-8 rounded-xl shadow-lg">
                        <h3 className="text-[#fbbf24] text-lg font-bold mb-4 uppercase tracking-wider">Diagnóstico IA Destacado</h3>
                        <p className="italic text-lg leading-relaxed opacity-90">
                            {reportData.diagnosticoIADestacado}
                        </p>
                        <div className="mt-6 pt-6 border-t border-slate-700 text-sm opacity-60">
                            Análisis basado en patrones de respuesta y consistencia.
                        </div>
                    </div>

                    {/* Recommendations */}
                    <div className="flex-[2] w-full">
                        <h3 className="text-[#2d3748] text-2xl font-bold mb-6">Recomendaciones Estratégicas (IA)</h3>

                        {reportData.recomendacionesEstrategicas.map((rec, idx) => (
                            <div key={idx} className="bg-white p-6 rounded-lg border-l-4 border-[#fbbf24] shadow-sm mb-4 print:break-inside-avoid">
                                <div className="flex justify-between items-start mb-2">
                                    <strong className="text-[#2d3748] text-lg">{rec.id} | {rec.titulo}</strong>
                                    <span className="bg-[#feebc8] text-[#9c4221] text-xs font-bold px-3 py-1 rounded-full">
                                        {rec.tag}
                                    </span>
                                </div>
                                <p className="text-[#4a5568] mt-2">
                                    {rec.descripcion}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-[#1a202c] text-white p-6 rounded-lg text-center mt-12 print:break-inside-avoid">
                    <strong>Conclusión del Sistema:</strong> {reportData.cabecera.nombre} es un activo de alta confiabilidad para la institución.
                </div>

            </div>
        </div>
    );
}
