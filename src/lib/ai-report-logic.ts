import {
    Shield, Users, Building, MessageSquare, Target, Award,
    Briefcase, Lightbulb, FileCheck, TrendingUp, Archive, AlertTriangle,
    Brain, HeartHandshake, Scale
} from 'lucide-react';

// --- 1. Definición de Tipos de Datos ---

export type TipoExamenVaf = 'LIDER_ESTRATEGICO' | 'EQUIPO_OPERATIVO' | 'LIDERAZGO_TACTICO' | 'AUTOEVALUACION';
export type RangoDesempeno = 'CRITICO' | 'ALERTA' | 'SATISFACTORIO' | 'SOBRESALIENTE' | 'REFERENTE';

export interface EvaluacionInput {
    evaluado: {
        nombre: string;
        rol: string;
        fecha: string;
    };
    // Mapeamos tus 4 imágenes a estos tipos
    tipoInforme: TipoExamenVaf;
    puntajes: Record<string, number>;
    comparativeScores?: Record<string, number>;
    evaluadorNombre?: string;
}

export interface FactorAnalisis {
    id: string;
    nombre: string;
    score: number;
    rango: RangoDesempeno;
    color: string;
    icono: any;
    analisisPsicoTecnico: string; // Fusión de psicología y calidad
    accionSugerida: string;
}

export interface InformeGenerado {
    meta: {
        puntajeGlobal: number;
        nivelGlobal: string;
        perfilPsicometrico: string; // Nuevo: Resumen del perfil
    };
    resumenEjecutivo: string;
    factores: FactorAnalisis[];
    diagnosticoIA: string;
    // recomendaciones: any[]; // Removed as per new logic, but might need to handle UI compatibility
}

// --- 2. Motor de Juicio Experto (Knowledge Base Contextual) ---

/* Estructura:
   Tipo de Examen -> Keywords de Sección -> Rangos de Puntaje -> Interpretación
*/

interface CriterioEvaluacion {
    icono: any;
    pesoPsicologico: string; // Qué significa conductualmente
    pesoTecnico: string; // Qué significa para la norma VAF
    rangos: {
        min: number;
        max: number;
        juicio: string; // El texto "humano/experto"
        accion: string;
    }[];
}

const BASE_CONOCIMIENTO_EXPERTO: Record<TipoExamenVaf, Record<string, CriterioEvaluacion>> = {

    // IMAGEN 1: LIDER VAF (Enfoque: Visión, Integridad, Resultados Macro)
    'LIDER_ESTRATEGICO': {
        'integridad': {
            icono: Shield,
            pesoPsicologico: "Coherencia entre valores y acciones.",
            pesoTecnico: "Alineación con Política de Calidad y Ética Institucional.",
            rangos: [
                { min: 0, max: 3.5, juicio: "Se percibe una disonancia cognitiva entre el rol esperado y la conducta ética observada. Riesgo reputacional alto.", accion: "Intervención inmediata por Comité de Ética." },
                { min: 3.6, max: 4.5, juicio: "Conducta adecuada, aunque en situaciones de presión podría flexibilizar estándares.", accion: "Refuerzo de cultura de transparencia." },
                { min: 4.6, max: 5.0, juicio: "Ejerce un liderazgo moral incuestionable, actuando como el 'Superyó' de la organización.", accion: "Mentoring de valores a nuevos líderes." }
            ]
        },
        'liderazgo': {
            icono: Brain,
            pesoPsicologico: "Capacidad de influencia y contención emocional del equipo.",
            pesoTecnico: "Sección 5.1 ISO 9001 - Liderazgo y Compromiso.",
            rangos: [
                { min: 0, max: 3.5, juicio: "Estilo de liderazgo ausente o laissez-faire. El equipo percibe falta de dirección, generando ansiedad operativa.", accion: "Programa de desarrollo de habilidades directivas." },
                { min: 3.6, max: 4.2, juicio: "Liderazgo transaccional. Funciona por objetivos pero falta conexión inspiracional.", accion: "Talleres de liderazgo transformacional." },
                { min: 4.3, max: 5.0, juicio: "Liderazgo transformacional. Logra movilizar la voluntad del equipo hacia la visión VAF.", accion: "Delegación estratégica de proyectos." }
            ]
        },
        // Mapeo genérico para otras secciones de Imagen 1
        'default': {
            icono: Target,
            pesoPsicologico: "Eficacia personal.",
            pesoTecnico: "Cumplimiento de objetivos.",
            rangos: [
                { min: 0, max: 3.9, juicio: "Desempeño por debajo del umbral estratégico.", accion: "Plan de mejora." },
                { min: 4.0, max: 5.0, juicio: "Alineación estratégica sólida.", accion: "Mantener consistencia." }
            ]
        }
    },

    // IMAGEN 2: EQUIPO VAF (Enfoque: Operativo, Normativo, Ejecución)
    'EQUIPO_OPERATIVO': {
        'gestion documental': {
            icono: Archive,
            pesoPsicologico: "Orden mental, disciplina y atención al detalle.",
            pesoTecnico: "Sección 8.4.5 - Control de Información Documentada.",
            rangos: [
                { min: 0, max: 2.9, juicio: "Caos operativo. La desorganización refleja falta de estructura mental y riesgo crítico de pérdida de trazabilidad.", accion: "Auditoría documental y re-inducción obligatoria." },
                { min: 3.0, max: 3.9, juicio: "Cumplimiento parcial. Existe la intención pero falta rigor en el uso de versiones vigentes (Kawak).", accion: "Revisión mensual de carpetas." },
                { min: 4.0, max: 4.7, juicio: "Disciplina operativa notable. Mantiene el orden y facilita el acceso a la información.", accion: "Reconocimiento público." },
                { min: 4.8, max: 5.0, juicio: "Mentalidad sistemática. No solo organiza, sino que optimiza el flujo documental.", accion: "Nombrar gestor documental del área." }
            ]
        },
        'salidas no conformes': {
            icono: AlertTriangle,
            pesoPsicologico: "Honestidad, capacidad de reconocer errores y resiliencia.",
            pesoTecnico: "Sección 9.1.7 - Control de Salidas No Conformes.",
            rangos: [
                { min: 0, max: 3.0, juicio: "Negación del error. Posible ocultamiento de fallas por miedo o negligencia. Crítico para la calidad.", accion: "Sesión de feedback correctivo urgente." },
                { min: 3.1, max: 4.0, juicio: "Detección reactiva. Reconoce el error solo cuando es evidente, falta proactividad preventiva.", accion: "Capacitación en gestión de riesgos." },
                { min: 4.1, max: 5.0, juicio: "Madurez profesional. Ve el error como oportunidad de mejora y lo gestiona preventivamente.", accion: "Liderar análisis de causa raíz." }
            ]
        },
        'cumplimiento': { // Matches 'Cumplimiento de requisitos'
            icono: FileCheck,
            pesoPsicologico: "Responsabilidad y compromiso con el otro (Cliente).",
            pesoTecnico: "Sección 8.2 - Requisitos para productos y servicios.",
            rangos: [
                { min: 0, max: 3.5, juicio: "Incumplimiento de la promesa de valor. Genera insatisfacción y desconfianza en el usuario.", accion: "Supervisión directa de entregables." },
                { min: 3.6, max: 5.0, juicio: "Orientación al servicio sólida. El cliente percibe confiabilidad.", accion: "Continuar buenas prácticas." }
            ]
        },
        'default': {
            icono: Briefcase,
            pesoPsicologico: "Desempeño funcional.",
            pesoTecnico: "Ejecución de procesos.",
            rangos: [{ min: 0, max: 5, juicio: "Evaluación operativa estándar.", accion: "Seguimiento periódico." }]
        }
    },

    // IMAGEN 3: LIDER A EQUIPO (Enfoque: Supervisión, Mejora, Compromiso)
    'LIDERAZGO_TACTICO': {
        'mejora': { // Matches 'Orientación a la mejora' y 'Mejora'
            icono: TrendingUp,
            pesoPsicologico: "Mentalidad de crecimiento (Growth Mindset) vs Mentalidad fija.",
            pesoTecnico: "Sección 11.2 - Mejora Continua ISO 9001.",
            rangos: [
                { min: 0, max: 3.5, juicio: "Resistencia al cambio. Se aferra a métodos antiguos ('siempre se ha hecho así').", accion: "Desafiar status quo con pequeños proyectos." },
                { min: 3.6, max: 4.5, juicio: "Adaptabilidad funcional. Acepta cambios pero rara vez los propone.", accion: "Incentivar la propuesta de 1 mejora al mes." },
                { min: 4.6, max: 5.0, juicio: "Agente de cambio nato. Inquietud intelectual positiva que impulsa la eficiencia del área.", accion: "Liderar comité de innovación." }
            ]
        },
        'compromiso': { // Matches 'Compromiso del líder...'
            icono: HeartHandshake,
            pesoPsicologico: "Identificación con la causa (Engagement).",
            pesoTecnico: "Adherencia a políticas SGC.",
            rangos: [
                { min: 0, max: 3.8, juicio: "Desapego institucional. Cumple por obligación, no por convicción.", accion: "Entrevista de realineación." },
                { min: 3.9, max: 5.0, juicio: "Role model. Transmite los valores de calidad con su ejemplo diario.", accion: "Mentoring." }
            ]
        },
        'default': {
            icono: Users,
            pesoPsicologico: "Dinámica de equipo.",
            pesoTecnico: "Gestión de recursos.",
            rangos: [{ min: 0, max: 5, juicio: "Gestión táctica evaluada.", accion: "Revisar indicadores." }]
        }
    },

    // IMAGEN 4: AUTOEVALUACION (Enfoque: Introspección, Honestidad, Soft Skills)
    'AUTOEVALUACION': {
        'default': {
            icono: Scale,
            pesoPsicologico: "Autopercepción y autoestima profesional.",
            pesoTecnico: "Competencias blandas.",
            rangos: [
                { min: 0, max: 3.0, juicio: "Autocrítica severa o desempeño real bajo. Indica inseguridad o desmotivación.", accion: "Validar con evaluación del líder." },
                { min: 3.1, max: 4.5, juicio: "Autopercepción equilibrada. Reconoce fortalezas y áreas de mejora con realismo.", accion: "Plan de desarrollo personal (PDI)." },
                { min: 4.6, max: 5.0, juicio: "Posible efecto Dunning-Kruger (sobreestimación) o excelencia real. Requiere contraste con KPI objetivos.", accion: "Contrastar con métricas duras." }
            ]
        }
    }
};

// --- 3. Funciones Helper de Análisis ---

const normalizarTexto = (texto: string) => texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const DEFAULT_CRITERIO: CriterioEvaluacion = {
    icono: Briefcase,
    pesoPsicologico: "Desempeño general.",
    pesoTecnico: "Cumplimiento de tareas.",
    rangos: [{ min: 0, max: 5, juicio: "Evaluación estándar.", accion: "Seguimiento." }]
};

const encontrarCriterio = (tipo: TipoExamenVaf, seccion: string): CriterioEvaluacion => {
    const kb = BASE_CONOCIMIENTO_EXPERTO[tipo] || BASE_CONOCIMIENTO_EXPERTO['EQUIPO_OPERATIVO'];
    if (!kb) return DEFAULT_CRITERIO;

    const seccionNorm = normalizarTexto(seccion);

    // Búsqueda por palabras clave en las claves del objeto
    const keyEncontrada = Object.keys(kb).find(key => seccionNorm.includes(key));

    const criterio = keyEncontrada ? kb[keyEncontrada] : kb['default'];
    return criterio || DEFAULT_CRITERIO;
};

const interpretarPuntaje = (criterio: CriterioEvaluacion, score: number) => {
    // Encuentra el rango que corresponde al score
    const interpretacion = criterio.rangos.find(r => score >= r.min && score <= r.max)
        || criterio.rangos[criterio.rangos.length - 1]; // Fallback al último
    return interpretacion;
};


// --- 4. Función Principal ---

export const generarInformeIA = (input: EvaluacionInput): InformeGenerado => {
    const { puntajes, tipoInforme, evaluado } = input;

    // Aseguramos que tenemos un tipo válido, si no, inferimos o usamos default
    const tipoFinal: TipoExamenVaf = tipoInforme || 'EQUIPO_OPERATIVO';

    const valores = Object.values(puntajes);
    const promedio = valores.length > 0 ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;

    // Generar Factores Analizados
    const factores: FactorAnalisis[] = Object.entries(puntajes).map(([nombreSeccion, score]) => {
        const criterio = encontrarCriterio(tipoFinal, nombreSeccion);
        const interpretacion = interpretarPuntaje(criterio, score);

        // Determinamos el color/rango visual basado en score
        let rangoVisual: RangoDesempeno = 'CRITICO';
        let color = 'bg-red-600';
        if (score >= 4.6) { rangoVisual = 'REFERENTE'; color = 'bg-indigo-600'; }
        else if (score >= 4.0) { rangoVisual = 'SOBRESALIENTE'; color = 'bg-green-500'; }
        else if (score >= 3.0) { rangoVisual = 'SATISFACTORIO'; color = 'bg-yellow-500'; }
        else { rangoVisual = 'ALERTA'; color = 'bg-orange-500'; }

        // Construcción del Análisis "Psicólogo + Auditor"
        // Estructura: [Juicio de Valor] + [Contexto Psicológico] + [Contexto Normativo]
        const analisisPsicoTecnico = `
            ${interpretacion.juicio}
            Desde la perspectiva conductual, esto impacta en la ${criterio.pesoPsicologico.toLowerCase()}
            Normativamente, afecta el cumplimiento de: ${criterio.pesoTecnico}.
        `.trim();

        return {
            id: nombreSeccion,
            nombre: nombreSeccion,
            score,
            rango: rangoVisual,
            color,
            icono: criterio.icono,
            analisisPsicoTecnico,
            accionSugerida: interpretacion.accion
        };
    });

    // Diagnóstico Global (Estilo Informe Ejecutivo)
    let perfilPsicometrico = "";
    if (promedio >= 4.6) perfilPsicometrico = "Perfil de Alto Potencial (High Potential). Alineación cultural y técnica modelo.";
    else if (promedio >= 4.0) perfilPsicometrico = "Perfil Sólido. Funcional y confiable, con brechas menores gestionables.";
    else if (promedio >= 3.0) perfilPsicometrico = "Perfil en Desarrollo. Requiere acompañamiento cercano y estructura.";
    else perfilPsicometrico = "Perfil en Riesgo. Desalineación crítica con la cultura y requisitos VAF.";

    const resumenEjecutivo = `
        Informe de evaluación para ${evaluado.nombre} (${evaluado.rol}). 
        Bajo el protocolo de análisis ${tipoFinal.replace('_', ' ')}, se obtiene un índice global de ${promedio.toFixed(1)}/5.0.
        ${perfilPsicometrico}
        Se destacan fortalezas en ${factores.length > 0 ? factores.reduce((a, b) => a.score > b.score ? a : b).nombre : 'General'} y oportunidades latentes en ${factores.length > 0 ? factores.reduce((a, b) => a.score < b.score ? a : b).nombre : 'General'}.
    `.trim();

    return {
        meta: {
            puntajeGlobal: Number(promedio.toFixed(1)),
            nivelGlobal: promedio >= 4.0 ? "Conforme" : "No Conforme",
            perfilPsicometrico
        },
        resumenEjecutivo,
        factores,
        diagnosticoIA: `Análisis procesado mediante motor de inferencia VAF-ISO9001. Contexto: ${tipoFinal}.`
    };
};
