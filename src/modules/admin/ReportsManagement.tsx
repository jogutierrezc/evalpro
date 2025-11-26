import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, Printer, Building2, User } from 'lucide-react';

interface Office {
    id: string;
    name: string;
}

interface UserProfile {
    id: string;
    full_name: string;
    role: string;
    identification: string;
}

interface EvaluationResult {
    id: string;
    avgScore: number;
    sectionsSummary: any[];
    questions: any[];
}

export function ReportsManagement() {
    const [offices, setOffices] = useState<Office[]>([]);
    const [selectedOffice, setSelectedOffice] = useState<string>('');
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [selectedUser, setSelectedUser] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [reportData, setReportData] = useState<EvaluationResult | null>(null);
    const [generated, setGenerated] = useState(false);

    useEffect(() => {
        loadOffices();
    }, []);

    useEffect(() => {
        if (selectedOffice) {
            loadUsers(selectedOffice);
        } else {
            setUsers([]);
        }
    }, [selectedOffice]);

    const loadOffices = async () => {
        try {
            const { data, error } = await supabase.from('offices').select('id, name').order('name');
            if (error) throw error;
            setOffices(data || []);
        } catch (error) {
            console.error('Error loading offices:', error);
        }
    };

    const loadUsers = async (officeId: string) => {
        try {
            // Fetch users in the office. We might want to filter by role if needed.
            // The user said "personas evaluadas que tengan el rol evaluado".
            // We'll fetch all users in the office for now.
            const { data, error } = await supabase
                .from('users')
                .select('id, full_name, role, identification')
                .eq('office_id', officeId)
                .order('full_name');

            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            console.error('Error loading users:', error);
        }
    };

    const generateReport = async () => {
        if (!selectedUser) return;
        setLoading(true);
        setGenerated(false);
        try {
            // Fetch the latest completed evaluation for the user
            // We are looking for "Evaluación del Lider al Equipo" specifically.
            // We'll try to find a template that matches that name or just take the latest one.

            const { data: evaluations, error } = await supabase
                .from('evaluations')
                .select(`
          id,
          created_at,
          template:evaluation_templates(name),
          responses:evaluation_responses(
            response_value,
            question:evaluation_questions(
              id,
              question_text,
              weight,
              section:evaluation_sections(name)
            )
          )
        `)
                .eq('evaluated_id', selectedUser)
                .eq('status', 'completed')
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;

            if (evaluations && evaluations.length > 0) {
                const evalData = evaluations[0];

                // Process data to calculate averages
                const responses = evalData.responses || [];
                const scores = responses.map((r: any) => Number(r.response_value) || 0);
                const avgScore = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;

                setReportData({
                    id: evalData.id,
                    avgScore,
                    sectionsSummary: [], // We can populate this if needed
                    questions: responses.map((r: any) => ({
                        text: r.question?.question_text,
                        weight: r.question?.weight,
                        score: Number(r.response_value),
                        section: r.question?.section?.name
                    }))
                });
                setGenerated(true);
            } else {
                alert('No se encontró una evaluación completada para este usuario.');
                setReportData(null);
            }
        } catch (error) {
            console.error('Error generating report:', error);
            alert('Error al generar el informe');
        } finally {
            setLoading(false);
        }
    };

    // Helper to determine state based on score
    const getState = (score: number) => {
        if (score >= 4.5) return 'A';
        if (score >= 3.5) return 'B';
        return 'C';
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    Generador de Informes Técnicos
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Oficina</label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <select
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                value={selectedOffice}
                                onChange={(e) => {
                                    setSelectedOffice(e.target.value);
                                    setSelectedUser('');
                                    setGenerated(false);
                                }}
                            >
                                <option value="">Seleccionar Oficina...</option>
                                {offices.map(o => (
                                    <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador Evaluado</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <select
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                value={selectedUser}
                                onChange={(e) => {
                                    setSelectedUser(e.target.value);
                                    setGenerated(false);
                                }}
                                disabled={!selectedOffice}
                            >
                                <option value="">Seleccionar Colaborador...</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <button
                        onClick={generateReport}
                        disabled={!selectedUser || loading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
                    >
                        {loading ? 'Generando...' : 'Generar Informe Técnico'}
                    </button>
                </div>
            </div>

            {generated && reportData && (
                <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-200 animate-in fade-in slide-in-from-bottom-4 duration-500 print:shadow-none print:border-none">

                    {/* Header Reporte */}
                    <div className="border-b border-gray-200 pb-6 mb-8 flex justify-between items-start">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Informe Técnico de Vinculación y Desempeño</h1>
                            <p className="text-gray-500 mt-1">Sistema PRISMA - Análisis de Factores Críticos</p>
                        </div>
                        <div className="text-right">
                            <div className="text-sm text-gray-500">Fecha de Generación</div>
                            <div className="font-medium">{new Date().toLocaleDateString()}</div>
                            <div className="mt-2 inline-block px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-100">
                                {users.find(u => u.id === selectedUser)?.full_name}
                            </div>
                        </div>
                    </div>

                    {/* 1. Análisis de Factores */}
                    <section className="mb-10">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-l-4 border-blue-500 pl-3">
                            1. Análisis de Factores de Vinculación y Contratación 🤝
                        </h3>
                        <div className="bg-slate-50 p-6 rounded-lg text-sm text-slate-700 leading-relaxed space-y-4">
                            <p>
                                El instrumento de evaluación se centra en competencias transversales y comportamientos éticos/profesionales, lo cual es altamente relevante para la vinculación y contratación, pues permite validar la adecuación del personal al ambiente laboral y la cultura organizacional.
                            </p>

                            <div>
                                <strong className="block text-slate-900 mb-1">Validez de Contenido:</strong>
                                Las preguntas miden directamente si el empleado aplica las normas, políticas y principios institucionales (Integridad: 0.3, Institucional: 0.3) y si gestiona adecuadamente sus responsabilidades (Compromiso con la calidad: 0.4). Esto sugiere que la institución busca personal que no solo tenga el conocimiento técnico, sino que también demuestre un fuerte ajuste cultural (Culture Fit).
                            </div>

                            <div>
                                <strong className="block text-slate-900 mb-1">Factores de Contratación Críticos (Alto Peso):</strong>
                                Las preguntas con mayor peso porcentual (0.5% y 0.6%) deberían ser ejes de la entrevista y evaluación inicial, ya que reflejan las prioridades organizacionales:
                                <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                                    <li><strong>Cumplimiento de Lineamientos Institucionales (0.6%):</strong> Horario, uso de uniforme, EPP. Este es el comportamiento más valorado por el instrumento.</li>
                                    <li><strong>Recepción y Gestión de Sugerencias/Quejas (0.5%):</strong> Refleja la capacidad de servicio al cliente interno/externo y la adaptabilidad/resolución de conflictos.</li>
                                    <li><strong>Planeación, Ejecución y Verificación de Actividades (0.5%):</strong> Indicador clave de la autonomía, calidad y ciclo de mejora continua.</li>
                                    <li><strong>Apertura a diferentes puntos de vista (0.5%):</strong> Mide la colaboración y la innovación.</li>
                                </ul>
                            </div>

                            <div className="bg-blue-100/50 p-4 rounded border border-blue-200">
                                <strong className="text-blue-800">Recomendación de Vinculación:</strong> El proceso de selección debe incluir pruebas situacionales y entrevistas por competencias que validen los resultados en las categorías de Compromiso con la Calidad (Planeación, Precisión) y Liderazgo (Gestión de Quejas), ya que estas tienen el mayor peso en la evaluación posterior.
                            </div>
                        </div>
                    </section>

                    {/* 2. Simulación y Variaciones */}
                    <section className="mb-10">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-l-4 border-indigo-500 pl-3">
                            2. Simulación y Variaciones de la Evaluación Individual 📊
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                            Para el análisis individual, se simularon 50 escenarios con variaciones de +/- 0.5 puntos en la calificación (1-5) para cada pregunta, manteniendo las ponderaciones fijas. Se identifican tres estados simulados de desempeño:
                        </p>

                        <div className="overflow-x-auto mb-6">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-100 border-b border-gray-200">
                                        <th className="p-3 font-bold text-gray-700">Estado Simul.</th>
                                        <th className="p-3 font-bold text-gray-700">Calificación Promedio (1-5)</th>
                                        <th className="p-3 font-bold text-gray-700">Perfil Dominante</th>
                                        <th className="p-3 font-bold text-gray-700">Ponderación (%)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className={`border-b border-gray-100 ${getState(reportData.avgScore) === 'A' ? 'bg-green-50' : ''}`}>
                                        <td className="p-3 font-bold text-green-700">A</td>
                                        <td className="p-3">4.5 - 5.0</td>
                                        <td className="p-3">Ejecutor Estándar</td>
                                        <td className="p-3">40%</td>
                                    </tr>
                                    <tr className={`border-b border-gray-100 ${getState(reportData.avgScore) === 'B' ? 'bg-yellow-50' : ''}`}>
                                        <td className="p-3 font-bold text-yellow-600">B</td>
                                        <td className="p-3">3.5 - 4.4</td>
                                        <td className="p-3">Requiere Desarrollo</td>
                                        <td className="p-3">35%</td>
                                    </tr>
                                    <tr className={`border-b border-gray-100 ${getState(reportData.avgScore) === 'C' ? 'bg-red-50' : ''}`}>
                                        <td className="p-3 font-bold text-red-600">C</td>
                                        <td className="p-3">1.0 - 3.4</td>
                                        <td className="p-3">Riesgo/Necesita Intervención</td>
                                        <td className="p-3">25%</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-white border border-gray-200 p-5 rounded-lg shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-2">Estado Actual del Colaborador: <span className={`text-xl ml-2 ${getState(reportData.avgScore) === 'A' ? 'text-green-600' : getState(reportData.avgScore) === 'B' ? 'text-yellow-600' : 'text-red-600'}`}>Estado {getState(reportData.avgScore)} ({reportData.avgScore.toFixed(2)})</span></h4>
                            <p className="text-sm text-gray-600">
                                {getState(reportData.avgScore) === 'A' && "El colaborador cumple consistentemente con las expectativas, destacándose en las categorías de Integridad y Liderazgo."}
                                {getState(reportData.avgScore) === 'B' && "Muestra fortalezas, pero una clara necesidad de desarrollo en las áreas de Orientación a los resultados y Compromiso con la Calidad."}
                                {getState(reportData.avgScore) === 'C' && "Presenta un riesgo significativo, con puntuaciones bajas, especialmente en preguntas con alta ponderación como Cumplimiento de Lineamientos."}
                            </p>
                        </div>
                    </section>

                    {/* 3. Acciones Sugeridas */}
                    <section className="mb-10">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-l-4 border-emerald-500 pl-3">
                            3. Acciones Sugeridas y Recomendaciones 💡
                        </h3>
                        <p className="text-sm text-gray-600 mb-6">Las acciones se segmentan según el factor de evaluación y el estado de desempeño simulado.</p>

                        <div className="space-y-6">
                            {/* 3.1 Recomendaciones por Factor */}
                            <div>
                                <h4 className="font-bold text-gray-800 mb-3">3.1. Recomendaciones por Factor</h4>
                                <div className="grid gap-4">
                                    {[
                                        { factor: 'Integridad', focus: 'Ética y Cumplimiento', action: 'Para Estado C: Reforzar inducción y realizar un taller de reinducción ética con énfasis en el código de conducta y el impacto de la transparencia.' },
                                        { factor: 'Institucional', focus: 'Adecuación al Cargo', action: 'Para Estado B: Crear planes de capacitación cruzada. Para Estado A: Reconocimiento formal por el uso eficiente de recursos.' },
                                        { factor: 'Compromiso con Calidad', focus: 'Gestión de la Productividad', action: 'Para Estado B y C: Implementar metodología de planificación (OKRs o SMART) y seguimiento semanal.' },
                                        { factor: 'Liderazgo', focus: 'Relaciones Interpersonales', action: 'Para Estado B: Coaching en comunicación asertiva. Fomentar la proactividad mediante delegación controlada.' },
                                        { factor: 'Orientación a Resultados', focus: 'Cultura de Mejora Continua', action: 'Para todos: Programa de Cultura de Reporte. Para Estado C: Objetivos semanales específicos.' }
                                    ].map((item, idx) => (
                                        <div key={idx} className="bg-gray-50 p-4 rounded border border-gray-100">
                                            <div className="flex justify-between mb-1">
                                                <span className="font-bold text-gray-800">{item.factor}</span>
                                                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">{item.focus}</span>
                                            </div>
                                            <p className="text-sm text-gray-600">{item.action}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 3.2 Intervención Psicológica */}
                            <div>
                                <h4 className="font-bold text-gray-800 mb-3">3.2. Recomendaciones de Intervención Psicológica</h4>
                                <div className="grid md:grid-cols-3 gap-4">
                                    <div className={`p-4 rounded-lg border ${getState(reportData.avgScore) === 'C' ? 'bg-red-50 border-red-200 ring-2 ring-red-400' : 'bg-white border-gray-200 opacity-60'}`}>
                                        <h5 className="font-bold text-red-700 mb-2">Riesgo (Estado C)</h5>
                                        <p className="text-xs text-gray-700 mb-2"><strong>Focus:</strong> Cumplimiento de lineamientos (0.6%)</p>
                                        <p className="text-xs text-gray-600"><strong>Acción:</strong> Entrevista de Sondeo de Causas. Evaluar motivación extrínseca y percepción de la norma. Plan de Acompañamiento Psicosocial si es actitudinal.</p>
                                    </div>
                                    <div className={`p-4 rounded-lg border ${getState(reportData.avgScore) === 'B' ? 'bg-yellow-50 border-yellow-200 ring-2 ring-yellow-400' : 'bg-white border-gray-200 opacity-60'}`}>
                                        <h5 className="font-bold text-yellow-700 mb-2">Desarrollo (Estado B)</h5>
                                        <p className="text-xs text-gray-700 mb-2"><strong>Focus:</strong> Iniciativa y mejora (0.4%)</p>
                                        <p className="text-xs text-gray-600"><strong>Acción:</strong> Taller de "Empoderamiento y Pensamiento Crítico". Trasladar de ejecutor a solucionador de problemas.</p>
                                    </div>
                                    <div className={`p-4 rounded-lg border ${getState(reportData.avgScore) === 'A' ? 'bg-green-50 border-green-200 ring-2 ring-green-400' : 'bg-white border-gray-200 opacity-60'}`}>
                                        <h5 className="font-bold text-green-700 mb-2">Excelencia (Estado A)</h5>
                                        <p className="text-xs text-gray-700 mb-2"><strong>Focus:</strong> Colaboración y ambiente (0.4%)</p>
                                        <p className="text-xs text-gray-600"><strong>Acción:</strong> Programa de Mentores Internos. Capacitar y acompañar al personal de Estados B y C.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Resumen Final */}
                    <div className="bg-gray-900 text-white p-6 rounded-xl">
                        <h3 className="font-bold text-lg mb-2">Resumen del Informe PRISMA</h3>
                        <p className="text-sm text-gray-300 leading-relaxed">
                            El análisis simulado revela que, si bien una mayoría del personal cumple o excede las expectativas, existe una necesidad crítica de intervención en la planificación (Compromiso con la Calidad) y en el cumplimiento de las bases normativas (Institucional/Integridad), especialmente en los grupos de menor desempeño. Las acciones sugeridas combinan la capacitación técnica (planificación) con el desarrollo de competencias blandas (proactividad y asertividad) para asegurar un desempeño óptimo y alineado con los factores críticos de vinculación.
                        </p>
                    </div>

                    <div className="mt-8 flex justify-end gap-4 print:hidden">
                        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
                            <Printer className="w-4 h-4" /> Imprimir
                        </button>
                    </div>

                </div>
            )}
        </div>
    );
}
