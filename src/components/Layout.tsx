import { ReactNode } from 'react';
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
  BrainCircuit
} from 'lucide-react';
import { useState } from 'react';

interface LayoutProps {
  children: ReactNode;
  activeModule: string;
  onModuleChange: (module: string) => void;
}

export function Layout({ children, activeModule, onModuleChange }: LayoutProps) {
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'office_manager', 'employee'] },
    { id: 'evaluations', label: 'Evaluaciones', icon: FileText, roles: ['admin', 'office_manager', 'employee'] },
    { id: 'results', label: 'Resultados', icon: BarChart3, roles: ['admin', 'office_manager', 'employee'] },
    { id: 'reports', label: 'Informes', icon: FileText, roles: ['admin', 'office_manager', 'employee'] },
    { id: 'self-report', label: 'Mi Resultado Prisma', icon: BrainCircuit, roles: ['*'] },
    { id: 'admin', label: 'Administración', icon: Settings, roles: ['admin'] },
    { id: 'guide', label: 'Ayuda', icon: BookOpen, roles: ['admin', 'office_manager', 'employee'] },
  ];

  const filteredMenuItems = menuItems.filter(item => {
    const ur = (user?.role || '').toString().toLowerCase();
    const matchesRole = (roleKey: string) => {
      const rk = (roleKey || '').toString().toLowerCase();
      if (!rk) return false;
      if (rk === '*') return true;
      if (rk === ur) return true;
      // allow broad matching: 'employee' matches any role containing 'colaborador' or 'employee'
      if (rk === 'employee' && (ur.includes('colaborador') || ur.includes('employee'))) return true;
      if (rk === 'office_manager' && (ur.includes('jefe') || ur.includes('manager') || ur.includes('oficina'))) return true;
      if (rk === 'admin' && (ur.includes('admin') || ur.includes('administrador'))) return true;
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
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img
                src="https://udes.edu.co/images/logo/udes-logo-principal.svg"
                alt="Logo UDES"
                className="h-10"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              {/* Application title removed */}
            </div>

            <div className="hidden md:flex items-center space-x-1">
              {filteredMenuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => onModuleChange(item.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeModule === item.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
              </div>

              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="w-5 h-5" />
                <span className="hidden sm:inline">Salir</span>
              </button>

              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-gray-100"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {filteredMenuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onModuleChange(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${activeModule === item.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
