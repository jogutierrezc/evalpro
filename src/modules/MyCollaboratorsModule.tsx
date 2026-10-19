import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Users, Search, ChevronRight, UserCircle, Mail, Briefcase, Star, TrendingUp, Calendar } from 'lucide-react';
import PrismaReport from './PrismaReport';

interface Collaborator {
    id: string;
    full_name: string;
    email: string;
    role: string;
    campus?: string;
    latestScore?: string;
    lastEvaluationDate?: string;
    latestEvaluationId?: string;
}

export const MyCollaboratorsModule = () => {
    const { user } = useAuth();
    const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCollaborator, setSelectedCollaborator] = useState<Collaborator | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Robust normalization helper from ExportModule
    const normalizeValue = (val: any): number => {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            const parsed = parseFloat(val.replace(',', '.'));
            return isNaN(parsed) ? 0 : parsed;
        }
        if (typeof val === 'object') return Number(val.value || val.rating || val.score || val.response || 0);
        return 0;
    };

    useEffect(() => {
        if (user) {
            fetchCollaborators();
        }
    }, [user]);

    const fetchCollaborators = async () => {
        try {
            setLoading(true);
            
            // 1. Fetch evaluations based on role
            const { data: evaluations, error } = await supabase
                .from('evaluations')
                .select(`
                    id,
                    evaluator_id,
                    evaluated_id,
                    created_at,
                    evaluated:users!evaluated_id(id, full_name, email, role, office_id),
                    responses:evaluation_responses(response_value),
                    results:evaluation_results(overall_score, category_scores)
                `)
                .eq('status', 'completed')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Process and deduplicate users
            const uniqueUsersMap = new Map<string, Collaborator>();
            
            const roleLower = (user?.role || '').toLowerCase();
            const managerKeywords = ['director', 'programa', 'lider', 'vaf', 'proceso', 'rectoria', 'vicerectoria', 'jefe', 'office_manager'];
            const isAdmin = roleLower === 'admin' || roleLower.includes('administrador');
            const isManager = managerKeywords.some(k => roleLower.includes(k));

            evaluations?.forEach((ev: any) => {
                // Filter by role:
                // 1. Admin sees everything
                // 2. Manager sees their office
                // 3. Others see those they evaluated
                let shouldInclude = false;
                if (isAdmin) {
                    shouldInclude = true;
                } else if (isManager && user?.office_id && ev.evaluated?.office_id === user.office_id) {
                    shouldInclude = true;
                } else if (ev.evaluator_id === user?.id) {
                    shouldInclude = true;
                }

                if (shouldInclude && ev.evaluated && ev.evaluated.id !== user?.id) { 
                    if (!uniqueUsersMap.has(ev.evaluated.id)) {
                        const dbResult = Array.isArray(ev.results) ? ev.results[0] : ev.results;
                        let scoreNum = 0;

                        // 1. Prioridad: overall_score (si es > 0)
                        const storedScore = normalizeValue(dbResult?.overall_score);
                        if (storedScore > 0) {
                            scoreNum = storedScore;
                        }

                        // 2. Fallback: category_scores (promedio de categorías si overall_score es 0)
                        if (scoreNum === 0 && dbResult?.category_scores) {
                            const cats = dbResult.category_scores;
                            const values = Object.values(cats).map(v => normalizeValue(v)).filter(v => v > 0);
                            if (values.length > 0) {
                                scoreNum = values.reduce((a, b) => a + b, 0) / values.length;
                            }
                        }

                        // 3. Fallback: Calcular desde respuestas si sigue siendo 0
                        if (scoreNum === 0 && ev.responses && ev.responses.length > 0) {
                            const validResponses = ev.responses
                                .map((r: any) => normalizeValue(r.response_value))
                                .filter((v: number) => v > 0);

                            if (validResponses.length > 0) {
                                scoreNum = validResponses.reduce((acc: number, curr: number) => acc + curr, 0) / validResponses.length;
                            }
                        }

                        const score = scoreNum.toFixed(1);

                        uniqueUsersMap.set(ev.evaluated.id, {
                            ...ev.evaluated,
                            latestScore: score,
                            lastEvaluationDate: new Date(ev.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
                            latestEvaluationId: ev.id
                        });
                    }
                }
            });
            
            setCollaborators(Array.from(uniqueUsersMap.values()));
        } catch (error) {
            console.error('Error fetching collaborators:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredCollaborators = collaborators.filter(c => 
        c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (selectedCollaborator) {
        return (
            <div className="min-h-screen bg-slate-50">
                <div className="no-print bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-4 sticky top-0 z-30">
                    <button 
                        onClick={() => setSelectedCollaborator(null)}
                        className="text-slate-500 hover:text-indigo-600 font-medium flex items-center gap-1 text-sm"
                    >
                        <ChevronRight className="rotate-180 w-4 h-4" />
                        Volver a la lista
                    </button>
                    <div className="h-6 w-px bg-slate-200"></div>
                    <div className="flex items-center gap-2">
                        <UserCircle className="w-8 h-8 text-indigo-600" />
                        <div>
                            <h2 className="text-sm font-bold text-slate-800">{selectedCollaborator.full_name}</h2>
                            <p className="text-xs text-slate-500">Reporte de Desempeño (Vista de Líder)</p>
                        </div>
                    </div>
                </div>
                
                {/* Reuse PrismaReport with props */}
                <PrismaReport 
                    targetUserId={selectedCollaborator.id} 
                    evaluationId={selectedCollaborator.latestEvaluationId}
                    viewMode="manager" 
                    targetUserName={selectedCollaborator.full_name}
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-5xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <Users className="text-indigo-600" />
                            Mis Colaboradores
                        </h1>
                        <p className="text-slate-500 mt-1">
                            Gestiona y visualiza el desempeño de tu equipo.
                        </p>
                    </div>
                    
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input 
                            type="text" 
                            placeholder="Buscar colaborador..." 
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    </div>
                ) : filteredCollaborators.length > 0 ? (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredCollaborators.map(collab => (
                            <div 
                                key={collab.id}
                                onClick={() => setSelectedCollaborator(collab)}
                                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-indigo-200 transition-all cursor-pointer group overflow-hidden flex flex-col"
                            >
                                {/* Header with Avatar and Name */}
                                <div className="p-5 flex items-start gap-4 border-b border-slate-50 bg-slate-50/50">
                                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-xl shadow-md shrink-0">
                                        {collab.full_name.charAt(0)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="font-bold text-slate-800 group-hover:text-indigo-700 transition-colors truncate text-lg" title={collab.full_name}>
                                            {collab.full_name}
                                        </h3>
                                        <div className="flex items-center gap-1.5 text-slate-500 mt-1">
                                            <Briefcase size={14} className="shrink-0" />
                                            <p className="text-xs font-medium truncate" title={collab.role || 'Colaborador'}>
                                                {collab.role || 'Colaborador'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Body with Details */}
                                <div className="p-5 space-y-3 flex-1">
                                    <div className="flex items-center gap-2 text-slate-600 text-sm">
                                        <Mail size={16} className="text-slate-400 shrink-0" />
                                        <span className="truncate text-xs" title={collab.email}>{collab.email}</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 text-slate-600 text-sm">
                                        <UserCircle size={16} className="text-slate-400 shrink-0" />
                                        <span className="text-xs">Relación: <span className="font-medium text-indigo-600">Evaluado</span></span>
                                    </div>

                                    {collab.lastEvaluationDate && (
                                        <div className="flex items-center gap-2 text-slate-600 text-sm">
                                            <Calendar size={16} className="text-slate-400 shrink-0" />
                                            <span className="text-xs">Última evaluación: {collab.lastEvaluationDate}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Footer with Score */}
                                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-white p-1.5 rounded-lg shadow-sm border border-slate-100">
                                            <TrendingUp size={16} className="text-green-500" />
                                        </div>
                                        <span className="text-xs font-medium text-slate-500">Puntaje General</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-xl font-bold text-slate-800">{collab.latestScore || "0.0"}</span>
                                        <Star size={14} className="text-amber-400 fill-amber-400" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 border-dashed">
                        <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-slate-600">No se encontraron colaboradores</h3>
                        <p className="text-slate-400 text-sm mt-1">
                            No tienes evaluaciones asignadas o completadas por tu equipo aún.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
