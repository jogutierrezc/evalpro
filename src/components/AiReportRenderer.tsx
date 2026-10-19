import { useState } from 'react';
import {
    FileText, Award, Brain, BarChart3, TrendingUp, Target,
    Printer, Lightbulb
} from 'lucide-react';
import {
    ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend
} from 'recharts';
import { FactorAnalisis, InformeGenerado, EvaluacionInput } from '../lib/ai-report-logic';

const ProgressBar = ({ value, color }: { value: number; color: string }) => (
    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden mt-2 print:hidden">
        <div
            className={`h-full ${color} transition-all duration-1000 ease-out`}
            style={{ width: `${(value / 5) * 100}%` }}
        />
    </div>
);

const CardFactor = ({ factor }: { factor: FactorAnalisis }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow mb-4 print:break-inside-avoid print:shadow-none print:border">
        <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${factor.color} bg-opacity-10 text-slate-700`}>
                    {factor.icono ? <factor.icono className="w-6 h-6" /> : <Target className="w-6 h-6" />}
                </div>
                <h3 className="font-bold text-slate-800 text-lg">{factor.nombre}</h3>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${factor.color.replace('bg-', 'text-')} bg-opacity-10`}>
                {factor.score.toFixed(1)} / 5.0
            </span>
        </div>

        <ProgressBar value={factor.score} color={factor.color} />

        {/* Análisis Psico-Técnico */}
        <div className="mt-4 mb-6 text-slate-700 text-sm leading-relaxed border-l-2 border-slate-200 pl-4 italic bg-slate-50 p-3 rounded-r-lg">
            <h4 className="font-bold text-slate-900 mb-1 not-italic">Análisis Integral</h4>
            {factor.analisisPsicoTecnico}
        </div>

        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <div className="flex items-center gap-2 mb-2 text-blue-700 font-bold text-sm uppercase tracking-wide">
                <Lightbulb className="w-4 h-4" /> Acción Sugerida
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">{factor.accionSugerida}</p>
        </div>
    </div>
);

interface AiReportRendererProps {
    inputData: EvaluacionInput;
    informe: InformeGenerado;
    onPrint?: () => void;
}

export function AiReportRenderer({ inputData, informe, onPrint }: AiReportRendererProps) {
    const [showRadar, setShowRadar] = useState(false);
    const handlePrint = onPrint || (() => window.print());

    const radarData = Object.entries(inputData.puntajes).map(([key, value]) => ({
        subject: key.length > 15 ? key.substring(0, 12) + '...' : key,
        A: value,
        B: inputData.comparativeScores?.[key] || 0,
        fullMark: 5
    }));

    // Fallback for recommendations if they don't exist in the new structure
    const recomendaciones = (informe as any).recomendaciones || informe.factores.map(f => ({
        id: f.id,
        titulo: `Mejora en ${f.nombre}`,
        tipo: 'Estrategia',
        descripcion: f.accionSugerida
    }));

    return (
        <div className="bg-slate-50 font-sans text-slate-900 pb-20 print:bg-white">

            {/* --- HEADER DEL INFORME --- */}
            <header className="bg-slate-900 text-white pt-16 pb-24 px-6 md:px-12 relative overflow-hidden print:pt-8 print:pb-12">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600 rounded-full blur-3xl opacity-20 -mr-20 -mt-20 print:hidden"></div>
                <div className="max-w-5xl mx-auto relative z-10">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div>
                            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm tracking-wider uppercase mb-4">
                                <FileText className="w-4 h-4" />
                                {inputData.tipoInforme === 'LIDERAZGO_TACTICO'
                                    ? 'Informe de Análisis de Desempeño de Evaluación de Lider a Colaborador'
                                    : 'Informe de Análisis de Autoevaluación del Personal UDES'}
                            </div>
                            <h1 className="text-4xl md:text-5xl font-extrabold mb-2">{inputData.evaluado.nombre}</h1>
                            <p className="text-slate-400 text-lg flex items-center gap-4">
                                <span>{inputData.evaluado.rol}</span>
                                <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                                <span>{inputData.evaluado.fecha}</span>
                            </p>
                        </div>

                        <div className="flex flex-col items-end gap-4">
                            <div className="text-left md:text-right print:block bg-slate-800/50 p-4 rounded-lg md:bg-transparent md:p-0">
                                <div className="text-slate-500 text-xs uppercase tracking-widest mb-1">
                                    {inputData.tipoInforme === 'LIDERAZGO_TACTICO' ? 'Evaluadora' : 'Evaluado por'}
                                </div>
                                <div className="font-semibold text-slate-300 uppercase">
                                    {inputData.evaluadorNombre || 'Evaluador no identificado'}
                                </div>
                                {inputData.tipoInforme === 'LIDERAZGO_TACTICO' && (
                                    <div className="text-amber-500 text-xs mt-1">Dra. I.A. Psicológica Gemini</div>
                                )}
                            </div>

                            <button
                                onClick={handlePrint}
                                className="hidden md:flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium print:hidden"
                            >
                                <Printer className="w-4 h-4" /> Descargar PDF
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 md:px-8 -mt-16 relative z-20 print:mt-0">

                {/* --- TARJETAS KPI --- */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 print:break-inside-avoid">

                    {/* KPI 1: Puntaje Global */}
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-100 flex flex-col justify-between print:shadow-none print:border">
                        <div>
                            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Puntaje Ponderado</div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-5xl font-extrabold text-slate-900">{informe.meta.puntajeGlobal}</span>
                                <span className="text-slate-400 font-medium">/ 5.0</span>
                            </div>
                        </div>
                        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-bold w-fit">
                            <Award className="w-4 h-4" /> {informe.meta.nivelGlobal}
                        </div>
                    </div>

                    {/* KPI 2: Perfil Psicometrico (Antes Arquetipo) */}
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-100 md:col-span-2 flex items-center gap-6 print:shadow-none print:border">
                        <div className="text-6xl bg-slate-50 w-24 h-24 flex items-center justify-center rounded-2xl shadow-inner text-blue-600">
                            <Brain className="w-12 h-12" />
                        </div>
                        <div>
                            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Perfil Psicolaboral Obtenido</div>
                            <h2 className="text-xl font-bold text-slate-900 mb-2">Análisis de Perfil</h2>
                            <p className="text-slate-600 text-sm leading-relaxed">{informe.meta.perfilPsicometrico}</p>
                        </div>
                    </div>

                </div>

                {/* --- RESUMEN EJECUTIVO --- */}
                <section className="bg-white p-8 rounded-xl shadow-sm border border-slate-100 mb-10 print:break-inside-avoid print:shadow-none print:border">
                    <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Brain className="w-5 h-5 text-blue-600" />
                        Resumen Ejecutivo IA
                    </h3>
                    <p className="text-slate-700 text-lg leading-relaxed border-l-4 border-blue-500 pl-6 italic">
                        "{informe.resumenEjecutivo}"
                    </p>
                </section>

                {/* --- DETALLE DE FACTORES --- */}
                <section className="mb-12">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-slate-900">Análisis Detallado por Factores</h2>
                        {/* Hidden on print */}
                        <button
                            onClick={() => setShowRadar(!showRadar)}
                            className="text-slate-500 hover:text-blue-600 text-sm font-medium flex items-center gap-1 transition-colors print:hidden"
                        >
                            <BarChart3 className="w-4 h-4" /> {showRadar ? 'Ocultar Gráfica' : 'Ver Gráfica Radar'}
                        </button>
                    </div>

                    {showRadar && (
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
                            <h3 className="text-lg font-bold text-slate-800 mb-4 text-center">Comparativa: Autoevaluación vs. Promedio Institucional</h3>
                            <div className="h-[400px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                        <PolarGrid />
                                        <PolarAngleAxis dataKey="subject" />
                                        <PolarRadiusAxis angle={30} domain={[0, 5]} />
                                        <Radar
                                            name={inputData.evaluado.nombre}
                                            dataKey="A"
                                            stroke="#2563eb"
                                            fill="#3b82f6"
                                            fillOpacity={0.6}
                                        />
                                        <Radar
                                            name="Promedio Institucional"
                                            dataKey="B"
                                            stroke="#94a3b8"
                                            fill="#cbd5e1"
                                            fillOpacity={0.4}
                                        />
                                        <Legend />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        {informe.factores.map((factor) => (
                            <CardFactor key={factor.id} factor={factor} />
                        ))}
                    </div>
                </section>

                {/* --- DIAGNÓSTICO Y RECOMENDACIONES --- */}
                {/* Visible ONLY for Admin */}
                <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:break-before-page">

                    {/* Columna Izquierda: Diagnóstico Oscuro */}
                    <div className="bg-slate-900 text-white p-8 rounded-xl shadow-xl flex flex-col justify-center print:bg-slate-800 print:text-white">
                        <div className="text-amber-400 font-bold text-sm tracking-wider uppercase mb-6 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" /> Diagnóstico Sintético
                        </div>
                        <p className="text-2xl font-serif italic leading-normal text-slate-200">
                            "{informe.diagnosticoIA}"
                        </p>
                        <div className="mt-8 pt-6 border-t border-slate-700">
                            <p className="text-sm text-slate-500 uppercase tracking-widest">Acción Prioritaria</p>
                            <p className="text-white font-semibold mt-1">Plan de Desarrollo en Innovación</p>
                        </div>
                    </div>

                    {/* Columna Derecha: Recomendaciones */}
                    <div className="lg:col-span-2">
                        <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                            <Target className="w-6 h-6 text-amber-500" />
                            Recomendaciones Estratégicas
                        </h2>

                        <div className="grid gap-4">
                            {recomendaciones.map((rec: any, idx: number) => (
                                <div key={rec.id || idx} className="bg-white p-6 rounded-xl border-l-4 border-amber-400 shadow-sm hover:shadow-md transition-shadow print:shadow-none print:border">
                                    <div className="flex justify-between items-start mb-3">
                                        <h4 className="font-bold text-slate-800 text-lg">{rec.id} | {rec.titulo}</h4>
                                        <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wide">
                                            {rec.tipo}
                                        </span>
                                    </div>
                                    <p className="text-slate-600">{rec.descripcion}</p>
                                </div>
                            ))}

                            {/* Fallback si no hay recomendaciones críticas */}
                            {recomendaciones.length === 0 && (
                                <div className="bg-green-50 p-6 rounded-xl border border-green-200 text-center">
                                    <p className="text-green-800 font-medium">No se detectaron brechas críticas que requieran intervención inmediata. Se sugiere mantener el plan de carrera actual.</p>
                                </div>
                            )}
                        </div>
                    </div>

                </section>

                {/* --- FOOTER --- */}
                <div className="mt-20 pt-10 border-t border-slate-200 text-center text-slate-500 text-sm print:break-inside-avoid">
                    <p>© 2025 Sistema de Evaluación de Desempeño PRISMA. Documento Confidencial.</p>
                    <button
                        onClick={handlePrint}
                        className="mt-4 inline-flex items-center gap-2 text-slate-400 hover:text-slate-800 transition-colors print:hidden"
                    >
                        <Printer className="w-4 h-4" /> Imprimir Informe PDF
                    </button>
                </div>

            </main>
        </div>
    );
}

