import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, Building2, FileCheck, AlertCircle } from 'lucide-react';

export function DashboardModule() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalEmployees: 0,
    totalOffices: 0,
    pendingEvaluations: 0,
    completedEvaluations: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [user]);

  const loadStats = async () => {
    try {
      if (user?.role === 'admin') {
        const [employeesRes, officesRes, pendingRes, completedRes] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact', head: true }),
          supabase.from('offices').select('id', { count: 'exact', head: true }),
          supabase.from('evaluations').select('id', { count: 'exact', head: true }).neq('status', 'completed'),
          supabase.from('evaluations').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        ]);

        setStats({
          totalEmployees: employeesRes.count || 0,
          totalOffices: officesRes.count || 0,
          pendingEvaluations: pendingRes.count || 0,
          completedEvaluations: completedRes.count || 0,
        });
      } else if (user?.role === 'office_manager') {
        const [employeesRes, pendingRes, completedRes] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact', head: true }).eq('office_id', user.office_id),
          supabase
            .from('evaluations')
            .select('id, evaluated_id', { count: 'exact', head: true })
            .neq('status', 'completed'),
          supabase
            .from('evaluations')
            .select('id, evaluated_id', { count: 'exact', head: true })
            .eq('status', 'completed'),
        ]);

        setStats({
          totalEmployees: employeesRes.count || 0,
          totalOffices: 1,
          pendingEvaluations: pendingRes.count || 0,
          completedEvaluations: completedRes.count || 0,
        });
      } else {
        const [pendingRes, completedRes] = await Promise.all([
          supabase
            .from('evaluations')
            .select('id', { count: 'exact', head: true })
            .or(`evaluator_id.eq.${user?.id},evaluated_id.eq.${user?.id}`)
            .neq('status', 'completed'),
          supabase
            .from('evaluations')
            .select('id', { count: 'exact', head: true })
            .or(`evaluator_id.eq.${user?.id},evaluated_id.eq.${user?.id}`)
            .eq('status', 'completed'),
        ]);

        setStats({
          totalEmployees: 0,
          totalOffices: 0,
          pendingEvaluations: pendingRes.count || 0,
          completedEvaluations: completedRes.count || 0,
        });
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    ...(user?.role === 'admin' || user?.role === 'office_manager'
      ? [
          {
            title: 'Total Empleados',
            value: stats.totalEmployees,
            icon: Users,
            color: 'bg-blue-500',
          },
          {
            title: user?.role === 'admin' ? 'Total Oficinas' : 'Mi Oficina',
            value: stats.totalOffices,
            icon: Building2,
            color: 'bg-green-500',
          },
        ]
      : []),
    {
      title: 'Evaluaciones Pendientes',
      value: stats.pendingEvaluations,
      icon: AlertCircle,
      color: 'bg-orange-500',
    },
    {
      title: 'Evaluaciones Completadas',
      value: stats.completedEvaluations,
      icon: FileCheck,
      color: 'bg-teal-500',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-600">Bienvenido, {user?.full_name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
              <h3 className="text-gray-600 text-sm font-medium mb-1">{stat.title}</h3>
              <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Información del Usuario</h2>
        <div className="space-y-3">
          <div>
            <span className="text-gray-600">Nombre:</span>
            <span className="ml-2 font-medium text-gray-900">{user?.full_name}</span>
          </div>
          <div>
            <span className="text-gray-600">Cédula:</span>
            <span className="ml-2 font-medium text-gray-900">{user?.identification}</span>
          </div>
          <div>
            <span className="text-gray-600">Rol:</span>
            <span className="ml-2 font-medium text-gray-900 capitalize">
              {user?.role?.replace('_', ' ')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
