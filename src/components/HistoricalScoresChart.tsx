import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';
import { TrendingUp, Award, Calendar } from 'lucide-react';

interface HistoricalScoresChartProps {
    userId: string;
    userName: string;
}

export const HistoricalScoresChart: React.FC<HistoricalScoresChartProps> = ({ userId, userName }) => {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                setLoading(true);
                // Fetch completed evaluations for the user
                const { data: evaluations, error } = await supabase
                    .from('evaluations')
                    .select(`
                        id,
                        completed_at,
                        period:evaluation_periods(year, start_date),
                        results:evaluation_results(overall_score)
                    `)
                    .eq('evaluated_id', userId)
                    .eq('status', 'completed')
                    .order('completed_at', { ascending: true });

                if (error) throw error;

                const chartData = (evaluations || [])
                    .filter(ev => ev.results && ev.results.length > 0)
                    .map(ev => ({
                        date: new Date(ev.completed_at).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
                        score: parseFloat(ev.results[0].overall_score || 0),
                        period: ev.period ? `Periodo ${(ev.period as unknown as { year: number }).year}` : 'General',
                        fullDate: ev.completed_at
                    }));

                setData(chartData);
            } catch (err) {
                console.error('Error fetching historical scores:', err);
            } finally {
                setLoading(false);
            }
        };

        if (userId) fetchHistory();
    }, [userId]);

    if (loading) return <div className="h-64 flex items-center justify-center text-slate-400">Cargando histórico...</div>;
    if (data.length === 0) return (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <Calendar className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-sm">No hay evaluaciones completadas aún.</p>
        </div>
    );

    const latestScore = data[data.length - 1].score;
    const averageScore = (data.reduce((acc, curr) => acc + curr.score, 0) / data.length).toFixed(1);

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-indigo-600" />
                        Puntuación Histórica
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Evolución del desempeño de {userName}</p>
                </div>
                <div className="flex gap-4">
                    <div className="text-center px-3 py-1 bg-indigo-50 rounded-lg">
                        <span className="block text-xs text-indigo-600 font-bold uppercase tracking-wider">Promedio</span>
                        <span className="text-lg font-bold text-indigo-900">{averageScore}</span>
                    </div>
                    <div className="text-center px-3 py-1 bg-emerald-50 rounded-lg">
                        <span className="block text-xs text-emerald-600 font-bold uppercase tracking-wider">Último</span>
                        <span className="text-lg font-bold text-emerald-900">{latestScore}</span>
                    </div>
                </div>
            </div>

            <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                            dataKey="date" 
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#94a3b8', fontSize: 12 }}
                            dy={10}
                        />
                        <YAxis 
                            domain={[0, 5]} 
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#94a3b8', fontSize: 12 }}
                        />
                        <Tooltip 
                            contentStyle={{ 
                                borderRadius: '12px', 
                                border: 'none', 
                                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                padding: '12px'
                            }}
                            formatter={(value) => [value as number, 'Puntaje']}
                            labelFormatter={(label) => `Fecha: ${label}`}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="score" 
                            stroke="#4f46e5" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorScore)" 
                            dot={{ fill: '#4f46e5', strokeWidth: 2, r: 4, stroke: '#fff' }}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-50 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-1">
                    <Award className="w-3 h-3 text-amber-500" />
                    <span>Basado en {data.length} evaluaciones</span>
                </div>
                <span>Escala 1.0 - 5.0</span>
            </div>
        </div>
    );
};
