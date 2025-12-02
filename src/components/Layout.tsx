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
  User
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  activeModule: string;
  onModuleChange: (module: string) => void;
}

export function Layout({ children, activeModule, onModuleChange }: LayoutProps) {
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['*'] },
    { id: 'evaluations', label: 'Evaluaciones', icon: FileText, roles: ['admin'] },
    { id: 'results', label: 'Resultados', icon: BarChart3, roles: ['admin', 'office_manager'] },
    { id: 'reports', label: 'Informes', icon: FileText, roles: ['admin'] },
    { id: 'self-report', label: 'Mi Resultado Prisma', icon: BrainCircuit, roles: ['*'] },
    { id: 'admin', label: 'Administración', icon: Settings, roles: ['admin'] },
    { id: 'guide', label: 'Ayuda', icon: BookOpen, roles: ['*'] },
  ];

  const filteredMenuItems = menuItems.filter(item => {
    const ur = (user?.role || '').toString().toLowerCase();
    const matchesRole = (roleKey: string) => {
      const rk = (roleKey || '').toString().toLowerCase();
      if (!rk) return false;
      if (rk === '*') return true;
      if (rk === ur) return true;
      // allow broad matching: 'employee' matches any role containing 'colaborador' or 'employee'
      if (rk === 'employee' && (ur.includes('colaborador') || ur.includes('employee') || ur.includes('coordinador') || ur.includes('director') || ur.includes('lider') || ur.includes('jefe'))) return true;
      if (rk === 'office_manager' && (ur.includes('jefe') || ur.includes('manager') || ur.includes('oficina') || ur.includes('coordinador') || ur.includes('director') || ur.includes('lider'))) return true;
      if (rk === 'admin') {
        // Strict check for admin to avoid matching 'administrativo' etc.
        return ur === 'admin' || ur === 'administrador' || ur === 'superadmin';
      }


      // fallback: substring match (useful when roles stored as labels)
      if (ur.includes(rk) || rk.includes(ur)) return true;
      return false;
    };
    return item.roles.some(matchesRole);
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
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                  ${isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }
                `}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-700'}`} />
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
        <header className="md:hidden bg-white border-b border-gray-200 flex items-center justify-between px-4 h-16 sticky top-0 z-30">
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
