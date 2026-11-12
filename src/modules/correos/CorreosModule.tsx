import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { isAdminRole } from '../feedback/useFeedbackAccess';
import { Boot, useCorreosApi } from './api';
import { ErrorNote, Pill, Tabs } from './parts';
import { useCampaignRunner } from './useCampaignRunner';
import EnviosTab from './EnviosTab';
import PlantillasTab from './PlantillasTab';
import BitacoraTab from './BitacoraTab';
import FirmasTab from './FirmasTab';
import AjustesTab from './AjustesTab';

type Tab = 'envios' | 'plantillas' | 'bitacora' | 'firmas' | 'ajustes';

/** Módulo Correos: solo administración. La función del servidor vuelve a comprobar el rol en cada llamada. */
export function CorreosModule() {
  const { user } = useAuth();
  const api = useCorreosApi();
  const [tab, setTab] = useState<Tab>('envios');
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef(0);

  const loadBoot = useCallback(async (force = false) => {
    if (!force && Date.now() - last.current < 15000) return; // mientras envía, se refresca a lo sumo cada 15 s
    last.current = Date.now();
    try { setBoot(await api<Boot>('bootstrap')); setError(null); } catch (e: any) { setError(e.message); }
  }, [api]);

  useEffect(() => { if (user && isAdminRole(user.role)) loadBoot(true); }, [user, loadBoot]);

  const runner = useCampaignRunner(api, loadBoot);

  if (!user) return null;
  if (!isAdminRole(user.role)) {
    return (
      <div className="ui-card mx-auto max-w-xl p-8 text-center">
        <Lock className="mx-auto h-6 w-6 text-slate-400" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">Correos no disponible</h1>
        <p className="mt-1 text-sm text-slate-500">Este módulo es solo para administración.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Correos"
        description="Plantillas HTML, avisos y recordatorios masivos, bitácora de envíos con apertura y clics, y certificados de firma OTP en PDF."
        actions={boot && (boot.mail.configured
          ? <Pill tone="green">Correo conectado</Pill>
          : <Pill tone="red">Correo sin configurar</Pill>)}
      />
      <Tabs label="Secciones de Correos" value={tab} onChange={(t) => { setTab(t); if (t === 'envios') loadBoot(true); }}
        items={[['envios', 'Envíos'], ['plantillas', 'Plantillas'], ['bitacora', 'Bitácora'], ['firmas', 'Firmas OTP'], ['ajustes', 'Ajustes']]} />

      {error && <ErrorNote>{error}</ErrorNote>}
      {!boot && !error && <div className="h-64 animate-pulse rounded-lg bg-slate-100" />}
      {boot && (
        <>
          {/* Las pestañas con estado propio se montan al abrirlas; el envío en curso vive fuera de ellas. */}
          {tab === 'envios' && <EnviosTab api={api} boot={boot} runner={runner} />}
          {tab === 'plantillas' && <PlantillasTab api={api} boot={boot} />}
          {tab === 'bitacora' && <BitacoraTab api={api} />}
          {tab === 'firmas' && <FirmasTab api={api} />}
          {tab === 'ajustes' && <AjustesTab api={api} boot={boot} onSaved={() => loadBoot(true)} />}
        </>
      )}
    </div>
  );
}

export default CorreosModule;
