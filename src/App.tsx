import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/LoginPage';
import { Layout } from './components/Layout';
import { DashboardModule } from './modules/DashboardModule';
import { AdminModule } from './modules/AdminModule';
import { EvaluationsModule } from './modules/EvaluationsModule';
import EvaluationsManagement from './modules/admin/EvaluationsManagement';
import { ResultsModule } from './modules/ResultsModule';
import VafAnalyticsModule from './modules/admin/VafAnalyticsModule';

import { ReportsManagement } from './modules/admin/ReportsManagement';
import { UserGuideModule } from './modules/UserGuideModule';
import { TechnicalReportViewer } from './modules/TechnicalReportViewer';
import PrismaReport from './modules/PrismaReport';
import { MyCollaboratorsModule } from './modules/MyCollaboratorsModule';
import ExportModule from './modules/ExportModule';

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
    return <VafAnalyticsModule publicMode={true} />;
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

  // Standalone view for Technical Report (no sidebar)
  if (activeModule === 'technical-report') {
    return <TechnicalReportViewer />;
  }

  return (
    <Layout activeModule={activeModule} onModuleChange={setActiveModule}>
      {activeModule === 'dashboard' && <DashboardModule />}
      {activeModule === 'evaluations' && (
        // show admin/manager view when role is admin or manager-like
        (user && (() => {
          const lower = (user.role || '').toString().toLowerCase();
          const managerKeywords = ['director', 'programa', 'lider', 'vaf', 'proceso', 'rectoria', 'vicerectoria', 'jefe'];
          const isManager = managerKeywords.some(k => lower.includes(k));
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
