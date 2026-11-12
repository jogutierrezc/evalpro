import { useAuth } from '../contexts/AuthContext';
import PerformanceDashboard from './performance/PerformanceDashboard';

interface PrismaReportProps {
    targetUserId?: string;
    evaluationId?: string;
    viewMode?: 'self' | 'manager';
    targetUserName?: string;
}

/**
 * Reporte de desempeño. "Mi Resultado Prisma" (viewMode self) y la vista del líder en Mis Colaboradores (manager)
 * comparten el mismo reporte: evaluación del líder, autoevaluación, mapa de competencias, criterios y promedio de oficina.
 * La versión anterior (análisis Prisma con IA, desactivada por AI_ENABLED) quedó reemplazada.
 */
const PrismaReport: React.FC<PrismaReportProps> = ({ targetUserId, evaluationId, viewMode = 'self', targetUserName }) => {
    const { user } = useAuth();
    return (
        <div className={viewMode === 'manager' ? 'px-4 py-6 sm:px-6' : ''}>
            <PerformanceDashboard
                targetUserId={targetUserId}
                currentUserId={user?.id}
                evaluationId={evaluationId}
                viewMode={viewMode}
                targetUserName={targetUserName}
            />
        </div>
    );
};

export default PrismaReport;
