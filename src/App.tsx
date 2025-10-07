import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/LoginPage';
import { Layout } from './components/Layout';
import { DashboardModule } from './modules/DashboardModule';
import { AdminModule } from './modules/AdminModule';
import { EvaluationsModule } from './modules/EvaluationsModule';
import { ResultsModule } from './modules/ResultsModule';

function AppContent() {
  const { loading, user } = useAuth();
  const [activeModule, setActiveModule] = useState('dashboard');

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

  return (
    <Layout activeModule={activeModule} onModuleChange={setActiveModule}>
      {activeModule === 'dashboard' && <DashboardModule />}
      {activeModule === 'evaluations' && <EvaluationsModule />}
      {activeModule === 'results' && <ResultsModule />}
      {activeModule === 'admin' && user.role === 'admin' && <AdminModule />}
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
