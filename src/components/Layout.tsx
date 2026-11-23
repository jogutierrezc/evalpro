import { ReactNode, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  BookOpen,
  BrainCircuit,
  User,
  Users,
  FileSpreadsheet,
  MessageSquareText,
  ClipboardCheck,
  ClipboardList,
  ShieldCheck,
  Mail
} from 'lucide-react';
import { useFeedbackAccess } from '../modules/feedback/useFeedbackAccess';
import { MODULES, isAdminKey, useModuleAccess } from '../lib/permissions';
import { useSelfOnlyAccess } from '../modules/selfeval/useMySelfEvaluations';

interface LayoutProps {
  children: ReactNode;
  activeModule: string;
  onModuleChange: (module: string) => void;
}

export function Layout({ children, activeModule, onModuleChange }: LayoutProps) {
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Retroalimentación: administración y quienes evalúan a otras personas. No aparece para quien solo es evaluado.
  const feedbackAccess = useFeedbackAccess(user);

  const { can, configured } = useModuleAccess(user?.role);
  // «Mis Autoevaluaciones» aparece por defecto solo para quien únicamente se autoevalúa (si su rol no está configurado).
  const selfOnly = useSelfOnlyAccess(user?.id, !isAdminKey(user?.role) && !configured);

  const ICONS: Record<string, typeof LayoutDashboard> = {
    dashboard: LayoutDashboard, evaluations: FileText, feedback: MessageSquareText, 'plan-mejora': ClipboardCheck,
    'supervision-planes': ShieldCheck, correos: Mail, results: BarChart3, reports: FileText, export: FileSpreadsheet,
    'self-report': BrainCircuit, 'my-self-evaluations': ClipboardList, 'my-collaborators': Users, admin: Settings, guide: BookOpen,
  };
  // Orden del menú: el de la lista de módulos, salvo que Retroalimentación y Plan de Mejora siguen a Evaluaciones.
  const menuItems = MODULES.map((m) => ({ id: m.id, label: m.label, icon: ICONS[m.id] }));

  const isAdmin = isAdminKey(user?.role);

  // Items ocultos para admin
  const hiddenForAdmin = new Set(['my-collaborators', 'evaluations', 'guide', 'self-report']);

  const filteredMenuItems = menuItems.filter(item => {
    if (isAdmin && hiddenForAdmin.has(item.id)) return false;
    if (item.id === 'my-self-evaluations') return !isAdmin && (configured ? can(item.id) : selfOnly);
    // Rol sin configurar: reglas anteriores (quien evalúa a otras personas ve Retroalimentación y Plan de Mejora).
    if (!configured && !isAdmin) {
      if (item.id === 'feedback') return feedbackAccess.allowed;
      if (item.id === 'plan-mejora') return feedbackAccess.allowed;
    }
    if (isAdmin && item.id === 'feedback') return feedbackAccess.allowed;
    if (isAdmin && item.id === 'plan-mejora') return false;
    return can(item.id);
  });

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          no-print
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:inset-auto md:flex md:flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo Area */}
        <div className="h-16 flex items-center justify-between md:justify-center border-b border-gray-200 px-4 bg-white">
          <img
            src="https://udes.edu.co/images/logo/udes-logo-principal.svg"
            alt="Logo UDES"
            className="h-8 md:h-10 w-auto object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {filteredMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onModuleChange(item.id);
                  setSidebarOpen(false);
                }}
                className={`
                  relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors
                  ${isActive
                    ? 'bg-blue-50 font-medium text-blue-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }
                `}
              >
                {isActive && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-blue-700" />}
                <Icon className={`w-5 h-5 ${isActive ? 'text-blue-700' : 'text-slate-400'}`} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* User Profile & Logout (Sidebar Footer) */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
              {user?.full_name?.charAt(0) || <User className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name}</p>
              <p className="text-xs text-gray-500 truncate capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="no-print md:hidden bg-white border-b border-gray-200 flex items-center justify-between px-4 h-16 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <Menu className="w-6 h-6" />
            </button>
            <span className="font-semibold text-gray-800">EvalPro</span>
          </div>
          <img
            src="https://udes.edu.co/images/logo/udes-logo-principal.svg"
            alt="Logo UDES"
            className="h-8 w-auto"
          />
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
