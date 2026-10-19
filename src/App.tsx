import { Suspense, lazy, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/LoginPage';
import { Layout } from './components/Layout';
import { DashboardModule } from './modules/DashboardModule';

// Módulos pesados cargados bajo demanda: reducen el bundle inicial (antes ~3.4 MB en un solo chunk).
const AdminModule = lazy(() => import('./modules/AdminModule').then((m) => ({ default: m.AdminModule })));
const EvaluationsModule = lazy(() => import('./modules/EvaluationsModule').then((m) => ({ default: m.EvaluationsModule })));
const EvaluationsManagement = lazy(() => import('./modules/admin/EvaluationsManagement'));
const ResultsModule = lazy(() => import('./modules/ResultsModule').then((m) => ({ default: m.ResultsModule })));
const VafAnalyticsModule = lazy(() => import('./modules/admin/VafAnalyticsModule'));
const ReportsManagement = lazy(() => import('./modules/admin/ReportsManagement').then((m) => ({ default: m.ReportsManagement })));
const UserGuideModule = lazy(() => import('./modules/UserGuideModule').then((m) => ({ default: m.UserGuideModule })));
const TechnicalReportViewer = lazy(() => import('./modules/TechnicalReportViewer').then((m) => ({ default: m.TechnicalReportViewer })));
const PrismaReport = lazy(() => import('./modules/PrismaReport'));
const MyCollaboratorsModule = lazy(() => import('./modules/MyCollaboratorsModule').then((m) => ({ default: m.MyCollaboratorsModule })));
const ExportModule = lazy(() => import('./modules/ExportModule'));
const PrintReportModule = lazy(() => import('./modules/evaluator/PrintReportModule'));

function ModuleFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );
}

function AppContent() {
  const { loading, user } = useAuth();

  // Initialize state from URL param if present
  const [activeModule, setActiveModule] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const moduleParam = params.get('module');
    return moduleParam || 'dashboard';
  });

  // Public view for VAF Analytics (no auth required) — must be checked BEFORE auth guard
  if (activeModule === 'vaf-analytics') {
    if (loading) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando...</p>
          </div>
        </div>
      );
    }
    return (
      <Suspense fallback={<ModuleFallback />}>
        <VafAnalyticsModule publicMode={true} />
      </Suspense>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Informes PDF del evaluador (individual y grupal), sin menú lateral
  if (activeModule === 'print-report') {
    return (
      <Suspense fallback={<ModuleFallback />}>
        <PrintReportModule />
      </Suspense>
    );
  }

  // Standalone view for Technical Report (no sidebar)
  if (activeModule === 'technical-report') {
    return (
      <Suspense fallback={<ModuleFallback />}>
        <TechnicalReportViewer />
      </Suspense>
    );
  }

  return (
    <Layout activeModule={activeModule} onModuleChange={setActiveModule}>
      <Suspense fallback={<ModuleFallback />}>
        {activeModule === 'dashboard' && <DashboardModule />}
        {activeModule === 'evaluations' && (
          // show admin/manager view when role is admin or manager-like
          (user && (() => {
            const lower = (user.role || '').toString().toLowerCase();
            const managerKeywords = ['director', 'programa', 'lider', 'vaf', 'proceso', 'rectoria', 'vicerectoria', 'jefe'];
            // "colaborador_vaf" contiene "vaf" pero es un evaluado/evaluador de base: no es jefe.
            const isManager = managerKeywords.some(k => lower.includes(k)) && !lower.includes('colaborador');
            return (user.role === 'admin' || isManager) ? <EvaluationsManagement onNavigate={setActiveModule} /> : <EvaluationsModule onNavigate={setActiveModule} />;
          })())
        )}
        {activeModule === 'results' && <ResultsModule />}
        {activeModule === 'reports' && user.role === 'admin' && <ReportsManagement />}
        {activeModule === 'export' && user.role === 'admin' && <ExportModule />}
        {activeModule === 'self-report' && <PrismaReport />}
        {activeModule === 'my-collaborators' && <MyCollaboratorsModule />}
        {activeModule === 'guide' && <UserGuideModule />}
        {activeModule === 'admin' && user.role === 'admin' && <AdminModule />}
        {activeModule === 'collaborators' && <MyCollaboratorsModule />}
      </Suspense>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
