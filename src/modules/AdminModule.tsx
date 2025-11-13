import { useState } from 'react';
import { Building2, Users, FileEdit } from 'lucide-react';
import { OfficesManagement } from './admin/OfficesManagement';
import { UsersManagement } from './admin/UsersManagement';
import { TemplatesManagement } from './admin/TemplatesManagement';

type AdminTab = 'offices' | 'users' | 'templates';

export function AdminModule() {
  const [activeTab, setActiveTab] = useState<AdminTab>('offices');

  const tabs = [
    { id: 'offices' as AdminTab, label: 'Oficinas', icon: Building2 },
    { id: 'users' as AdminTab, label: 'Personal', icon: Users },
    { id: 'templates' as AdminTab, label: 'Formularios', icon: FileEdit },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Administración</h1>
        <p className="text-gray-600">Gestión de oficinas, personal y formularios de evaluación</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 border-b-2 font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'offices' && <OfficesManagement />}
          {activeTab === 'users' && <UsersManagement />}
          {activeTab === 'templates' && <TemplatesManagement />}
        </div>
      </div>
    </div>
  );
}
