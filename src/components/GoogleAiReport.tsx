import React from 'react';
import { AnalysisResult } from '../lib/prisma-engine';
import { Sparkles, Target, Zap, Brain, Briefcase, TrendingUp, CheckCircle2 } from 'lucide-react';

interface GoogleAiReportProps {
    results: AnalysisResult[];
    globalScore: string;
    userName?: string;
}

export const GoogleAiReport: React.FC<GoogleAiReportProps> = ({ results, globalScore, userName }) => {
    const sortedResults = [...results].sort((a, b) => b.score - a.score);
    const topStrengths = sortedResults.slice(0, 3);
    const areasToImprove = sortedResults.slice(-3).reverse();

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* AI Header Badge */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6 flex items-center gap-4">
                <div className="bg-white p-3 rounded-full shadow-sm">
                    <Sparkles className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                    <h3 className="font-bold text-indigo-900 text-lg">Análisis Potenciado por Google Gemini</h3>
                    <p className="text-indigo-700/80 text-sm">
                        Este reporte ha sido generado analizando tus patrones de respuesta con inteligencia artificial avanzada para ofrecerte una perspectiva profunda y personalizada.
                    </p>
                </div>
            </div>

            {/* Executive Summary Cards */}
            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-green-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 relative z-10">
                        <Zap className="w-5 h-5 text-green-500" />
                        Tus Superpoderes
                    </h3>
                    <div className="space-y-3 relative z-10">
                        {topStrengths.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">
                                    {idx + 1}
                                </div>
                                <span className="text-slate-700 font-medium">{item.category}</span>
                                <span className="ml-auto text-sm font-bold text-green-600">{item.score}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 relative z-10">
                        <TrendingUp className="w-5 h-5 text-amber-500" />
                        Oportunidades de Crecimiento
                    </h3>
                    <div className="space-y-3 relative z-10">
                        {areasToImprove.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">
                                    {idx + 1}
                                </div>
                                <span className="text-slate-700 font-medium">{item.category}</span>
                                <span className="ml-auto text-sm font-bold text-amber-600">{item.score}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Detailed AI Analysis Cards */}
            <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Brain className="w-6 h-6 text-indigo-600" />
                    Desglose de Competencias (AI)
                </h3>
                
                {results.map((result, idx) => (
                    <div key={idx} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg transition-all duration-300">
                        <div className="p-6">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                                <div>
                                    <h4 className="text-xl font-bold text-slate-900">{result.category}</h4>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                            {result.arquetipo}
                                        </span>
                                        <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full rounded-full ${
                                                    result.score >= 4 ? 'bg-green-500' : 
                                                    result.score >= 3 ? 'bg-amber-500' : 'bg-red-500'
                                                }`}
                                                style={{ width: `${(result.score / 5) * 100}%` }}
                                            ></div>
                                        </div>
                                        <span className="text-sm font-bold text-slate-700">{result.score}/5.0</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <h5 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                        <Target className="w-4 h-4" /> Diagnóstico
                                    </h5>
                                    <p className="text-slate-700 leading-relaxed text-sm bg-slate-50 p-4 rounded-xl border border-slate-100">
                                        {result.analisis}
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <h5 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                                        <Briefcase className="w-4 h-4" /> Plan de Acción
                                    </h5>
                                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 relative">
                                        <div className="absolute top-4 right-4">
                                            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                                        </div>
                                        <p className="text-indigo-900 leading-relaxed text-sm font-medium">
                                            {result.accionSugerida}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
