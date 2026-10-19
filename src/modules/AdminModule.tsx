import { Suspense, lazy, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Building2, Users, FileEdit, Layers, Shield, Clock, FileText, AlertTriangle, BarChart3, Mail } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';

// Cada pestaña se carga al abrirla: el panel admin ya no arrastra todo su código en el primer render.
const OfficesManagement = lazy(() => import('./admin/OfficesManagement').then((m) => ({ default: m.OfficesManagement })));
const UsersManagement = lazy(() => import('./admin/UsersManagement').then((m) => ({ default: m.UsersManagement })));
const EvaluationsManagement = lazy(() => import('./admin/EvaluationsManagement').then((m) => ({ default: m.EvaluationsManagement })));
const PendingEvaluationsModule = lazy(() => import('./admin/PendingEvaluationsModule'));
const ReportsManagement = lazy(() => import('./admin/ReportsManagement').then((m) => ({ default: m.ReportsManagement })));
const TemplatesManagement = lazy(() => import('./admin/TemplatesManagement').then((m) => ({ default: m.TemplatesManagement })));
const FormTypesManagement = lazy(() => import('./admin/FormTypesManagement'));
const RolesManagement = lazy(() => import('./admin/RolesManagement'));
const EvaluationPeriodsManagement = lazy(() => import('./admin/EvaluationPeriodsManagement'));
const NotificationsModule = lazy(() => import('./admin/NotificationsModule'));
const VafAnalyticsModule = lazy(() => import('./admin/VafAnalyticsModule'));

type AdminTab = 'offices' | 'users' | 'roles' | 'evaluations' | 'pending' | 'templates' | 'form_types' | 'periods' | 'reports' | 'notifications' | 'vaf-analytics';

interface TabDef {
  id: AdminTab;
  label: string;
  icon: LucideIcon;
}

interface TabGroup {
  label: string;
  tabs: TabDef[];
}

// Agrupado por tarea del administrador, no por orden de creación de los módulos.
const GROUPS: TabGroup[] = [
  {
    label: 'Personas',
    tabs: [
      { id: 'offices', label: 'Oficinas', icon: Building2 },
      { id: 'users', label: 'Personal', icon: Users },
      { id: 'roles', label: 'Roles', icon: Shield },
    ],
  },
  {
    label: 'Evaluaciones',
    tabs: [
      { id: 'evaluations', label: 'Evaluaciones', icon: FileEdit },
      { id: 'pending', label: 'Pendientes', icon: AlertTriangle },
      { id: 'templates', label: 'Formularios', icon: FileEdit },
      { id: 'form_types', label: 'Tipos de formulario', icon: Layers },
      { id: 'periods', label: 'Periodos', icon: Clock },
    ],
  },
  {
    label: 'Informes',
    tabs: [
      { id: 'reports', label: 'Informes', icon: FileText },
      { id: 'vaf-analytics', label: 'Analítica VAF', icon: BarChart3 },
      { id: 'notifications', label: 'Notificaciones', icon: Mail },
    ],
  },
];

const ALL_TABS = GROUPS.flatMap((g) => g.tabs);

// La pestaña activa vive en la URL (?tab=) para que se pueda recargar o compartir.
function readInitialTab(): AdminTab {
  const param = new URLSearchParams(window.location.search).get('tab');
  return ALL_TABS.some((t) => t.id === param) ? (param as AdminTab) : 'offices';
}

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-700" />
    </div>
  );
}

export function AdminModule() {
  const [activeTab, setActiveTab] = useState<AdminTab>(readInitialTab);

  const selectTab = (id: AdminTab) => {
    setActiveTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', id);
    window.history.replaceState(null, '', url.toString());
  };

  const activeLabel = ALL_TABS.find((t) => t.id === activeTab)?.label ?? '';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuración"
        title="Administración"
        description={`Gestión de oficinas, personal y formularios de evaluación. Sección actual: ${activeLabel}.`}
      />

      <div className="md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
        {/* Navegación: vertical en escritorio, deslizable en móvil */}
        <nav aria-label="Secciones de administración" className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:mb-0 md:overflow-visible">
          <div className="flex gap-6 md:flex-col md:gap-6">
            {GROUPS.map((group) => (
              <div key={group.label} className="flex shrink-0 gap-1 md:flex-col md:gap-0.5">
                <p className="hidden px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:block">
                  {group.label}
                </p>
                {group.tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => selectTab(tab.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? 'bg-blue-50 font-medium text-blue-800'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      {isActive && (
                        <span aria-hidden className="absolute inset-y-1.5 left-0 hidden w-0.5 rounded-full bg-blue-700 md:block" />
                      )}
                      <Icon className={`h-4 w-4 ${isActive ? 'text-blue-700' : 'text-slate-400'}`} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        <section className="ui-card min-w-0 p-5 md:p-6">
          <Suspense fallback={<TabFallback />}>
            <div key={activeTab} className="animate-in">
              {activeTab === 'offices' && <OfficesManagement />}
              {activeTab === 'users' && <UsersManagement />}
              {activeTab === 'roles' && <RolesManagement />}
              {activeTab === 'evaluations' && <EvaluationsManagement />}
              {activeTab === 'pending' && <PendingEvaluationsModule />}
              {activeTab === 'templates' && <TemplatesManagement />}
              {activeTab === 'form_types' && <FormTypesManagement />}
              {activeTab === 'periods' && <EvaluationPeriodsManagement />}
              {activeTab === 'reports' && <ReportsManagement />}
              {activeTab === 'notifications' && <NotificationsModule />}
              {activeTab === 'vaf-analytics' && <VafAnalyticsModule />}
            </div>
          </Suspense>
        </section>
      </div>
    </div>
  );
}
