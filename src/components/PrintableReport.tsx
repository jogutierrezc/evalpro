import React from 'react';
import { Building2, Zap, TrendingUp, Brain, Eye, Briefcase, Award, AlertCircle } from 'lucide-react';

interface PrintableReportProps {
  userName: string;
  globalScore: string | number;
  results: any[]; // AnalysisResult[] or similar
}

export const PrintableReport: React.FC<PrintableReportProps> = ({ userName, globalScore, results }) => {
  // Sort results for strengths/weaknesses
  const sortedResults = [...results].sort((a, b) => (b.score || b.avg || 0) - (a.score || a.avg || 0));
  const strengths = sortedResults.slice(0, 3);
  const opportunities = sortedResults.slice().reverse().slice(0, 3);

  return (
    <div className="hidden print:block bg-white text-slate-800 w-full mx-auto">
        <style>{`
            @media print {
                @page {
                    size: letter;
                    margin: 10mm;
                }
                body {
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .print-break-inside-avoid {
                    break-inside: avoid;
                    page-break-inside: avoid;
                }
            }
        `}</style>

       {/* Header */}
       <header className="border-b border-blue-900 pb-4 mb-6 flex justify-between items-center">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Mi Resultado Prisma</h1>
                <p className="text-sm text-gray-500">Informe de Inteligencia Conductual</p>
                <div className="mt-2 text-xs text-gray-500">
                    Usuario: <strong className="text-gray-900 text-sm">{userName}</strong>
                </div>
            </div>
            <div className="text-right flex items-center gap-4">
                <div className="bg-blue-50 border border-blue-200 px-4 py-2 rounded-lg text-center min-w-[100px]">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Global</span>
                    <span className="block text-2xl font-bold text-blue-900">{globalScore}</span>
                </div>
                <img 
                    src="https://udes.edu.co/images/logo/logo-con-acreditada-color.png" 
                    alt="Logo UDES" 
                    className="h-12 object-contain"
                />
            </div>
        </header>

        {/* Executive Summary */}
        <section className="grid grid-cols-2 gap-6 mb-6 print-break-inside-avoid">
            {/* Strengths */}
            <div>
                <h2 className="text-sm font-bold text-green-700 mb-3 flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Fortalezas
                </h2>
                <div className="space-y-2">
                    {strengths.map((item, idx) => {
                        const score = item.score || item.avg || 0;
                        return (
                            <div key={idx}>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="font-medium text-xs truncate pr-2">{idx + 1}. {item.category}</span>
                                    <span className="font-bold text-gray-700 text-xs">{score.toFixed(1)}</span>
                                </div>
                                <div className="bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                    <div className="h-full bg-green-500" style={{ width: `${(score / 5) * 100}%` }}></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Opportunities */}
            <div>
                <h2 className="text-sm font-bold text-orange-600 mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Oportunidades
                </h2>
                <div className="space-y-2">
                    {opportunities.map((item, idx) => {
                        const score = item.score || item.avg || 0;
                        return (
                            <div key={idx}>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="font-medium text-xs truncate pr-2">{idx + 1}. {item.category}</span>
                                    <span className="font-bold text-gray-700 text-xs">{score.toFixed(1)}</span>
                                </div>
                                <div className="bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                    <div className="h-full bg-orange-400" style={{ width: `${(score / 5) * 100}%` }}></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>

        <hr className="border-gray-200 mb-6" />

        {/* Detailed Breakdown - 2 Column Grid for Compactness */}
        <div>
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-600" /> Desglose de Competencias
            </h2>

            <div className="grid grid-cols-2 gap-4">
                {results.map((res, idx) => {
                    const score = res.score || res.avg || 0;
                    return (
                        <div key={idx} className="border border-gray-200 rounded-lg p-3 print-break-inside-avoid shadow-sm flex flex-col h-full">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex-1 min-w-0 pr-2">
                                    <h3 className="text-sm font-bold text-gray-900" title={res.category}>{res.category}</h3>
                                    {res.arquetipo && (
                                        <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded border mt-0.5 font-medium uppercase tracking-wide ${
                                            score >= 4 ? 'bg-green-50 text-green-800 border-green-200' : 
                                            score >= 3 ? 'bg-yellow-50 text-yellow-800 border-yellow-200' : 
                                            'bg-orange-50 text-orange-800 border-orange-200'
                                        }`}>
                                            {res.arquetipo}
                                        </span>
                                    )}
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="text-lg font-bold text-gray-800 leading-none">{score.toFixed(1)}</span>
                                    </div>
                                    <div className="bg-gray-100 h-1 w-16 mt-1 ml-auto rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full ${score >= 4 ? 'bg-green-500' : score >= 3 ? 'bg-yellow-400' : 'bg-orange-400'} print:bg-current`} 
                                            style={{ width: `${(score / 5) * 100}%`, color: score >= 4 ? '#22c55e' : score >= 3 ? '#facc15' : '#fb923c' }}
                                        ></div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 flex-1">
                                <div>
                                    <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                        <Eye className="w-3 h-3" /> Diagnóstico
                                    </h4>
                                    <p className="text-[10px] text-gray-600 leading-snug text-justify">
                                        {res.analisis || "Sin análisis."}
                                    </p>
                                </div>
                                {res.accionSugerida && (
                                    <div className="bg-blue-50 border border-blue-100 rounded p-2 print:bg-slate-50 mt-auto">
                                        <h4 className="text-[9px] font-bold text-blue-800 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                            <Briefcase className="w-3 h-3" /> Plan de Acción
                                        </h4>
                                        <p className="text-[10px] text-blue-900 italic leading-snug">
                                            "{res.accionSugerida}"
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        <footer className="mt-12 text-center text-xs text-gray-400 border-t border-gray-200 pt-6">
            <p>Generado por Plataforma EvalPro • Universidad de Santander</p>
        </footer>
    </div>
  );
};
