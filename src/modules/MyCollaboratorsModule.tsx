import React, { useState, useEffect } from 'react';
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

    useEffect(() => {
        if (user) {
            fetchCollaborators();
        }
    }, [user]);

    const fetchCollaborators = async () => {
        try {
            setLoading(true);
            
            // Fetch evaluations where current user is evaluator
            const { data: evaluations, error } = await supabase
                .from('evaluations')
                .select(`
                    id,
                    created_at,
                    evaluated:users!evaluated_id(id, full_name, email, role),
                    responses:evaluation_responses(response_value)
                `)
                .eq('evaluator_id', user?.id)
                .eq('status', 'completed')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Process and deduplicate users
            const uniqueUsersMap = new Map<string, Collaborator>();
            
            evaluations?.forEach((ev: any) => {
                if (ev.evaluated && ev.evaluated.id !== user?.id) { // Filter out self
                    if (!uniqueUsersMap.has(ev.evaluated.id)) {
                        // Calculate score for the latest evaluation
                        let score = "0.0";
                        if (ev.responses && ev.responses.length > 0) {
                            const total = ev.responses.reduce((acc: number, curr: any) => {
                                const val = Number(curr.response_value);
                                return acc + (isNaN(val) ? 0 : val);
                            }, 0);
                            score = (total / ev.responses.length).toFixed(1);
                        }

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
