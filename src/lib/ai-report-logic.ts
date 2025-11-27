import { Shield, Users, Building, MessageSquare, Target, Award, Briefcase, Lightbulb } from 'lucide-react';

// --- 1. Definición de Tipos de Datos ---

export type RangoDesempeno = 'CRITICO' | 'VULNERABLE' | 'COMPETENTE' | 'DESTACADO' | 'MODELO';

export interface EvaluacionInput {
    evaluado: {
        nombre: string;
        rol: string;
        fecha: string;
    };
    tipoInforme?: 'autoevaluacion' | 'lider_a_colaborador' | 'otro';
    evaluadorNombre?: string;
    // Ahora soportamos claves dinámicas basadas en las secciones reales de la evaluación
    puntajes: Record<string, number>;
    comparativeScores?: Record<string, number>;
}

export interface FactorAnalisis {
    id: string;
    nombre: string;
    score: number;
    rango: RangoDesempeno;
    color: string;
    icono: any;
    fortaleza: string;
    vulnerabilidad: string;
    analisisAmpliado: string; // Nuevo campo para texto detallado
}

export interface Recomendacion {
    id: string;
    titulo: string;
    tipo: 'Estrategia' | 'Cultura' | 'Liderazgo' | 'Operativo';
    descripcion: string;
}

export interface InformeGenerado {
    meta: {
        puntajeGlobal: number;
        nivelGlobal: string;
        arquetipo: {
            nombre: string;
            descripcion: string;
            icono: string;
        };
    };
    resumenEjecutivo: string;
    factores: FactorAnalisis[];
    diagnosticoIA: string;
    recomendaciones: Recomendacion[];
}

// --- 2. Base de Conocimiento (Matriz de Variaciones) ---

export const KNOWLEDGE_BASE = {
    arquetipos: [
        {
            trigger: (scores: Record<string, number>) => (scores['integridad'] || 0) >= 4.8 && (scores['trabajoEquipo'] || 0) >= 4.8,
            nombre: "Estabilizador Institucional",
            descripcion: "Columna vertebral moral y operativa. Garantiza la cohesión y el cumplimiento normativo.",
            icono: "🏛️"
        },
        {
            trigger: (scores: Record<string, number>) => (scores['orientacionResultados'] || 0) >= 4.8 && (scores['comunicacion'] || 0) >= 4.5,
            nombre: "Impulsor Estratégico",
            descripcion: "Agente de cambio enfocado en metas agresivas y movilización de equipos.",
            icono: "🚀"
        },
        {
            trigger: (scores: Record<string, number>) => (scores['calidadTrabajo'] || 0) >= 4.8 && (scores['trabajoEquipo'] || 0) < 4.0,
            nombre: "Especialista Técnico",
            descripcion: "Alto desempeño individual con oportunidades en la integración colaborativa.",
            icono: "⚙️"
        },
        {
            trigger: (scores: Record<string, number>) => true, // Fallback
            nombre: "Ejecutor Consistente",
            descripcion: "Perfil equilibrado que cumple con los estándares esperados de la organización.",
            icono: "📋"
        }
    ],
    textosPorDimension: {
        integridad: {
            icono: Shield,
            keywords: ['integridad', 'ética', 'etica', 'valores', 'honestidad', 'moral'],
            MODELO: { f: "Referente moral absoluto; transparencia incuestionable.", v: "Posible rigidez ante situaciones de 'zona gris' que requieran flexibilidad." },
            DESTACADO: { f: "Alineación sólida con valores corporativos.", v: "Ocasionalmente puede dudar en reportar faltas menores de compañeros." },
            COMPETENTE: { f: "Cumple las normas básicas sin incidentes.", v: "Requiere supervisión en manejo de información confidencial compleja." },
            CRITICO: { f: "Reconoce la normativa básica.", v: "Riesgos éticos detectados; requiere plan de intervención inmediato." },
            VULNERABLE: { f: "Conoce las normas.", v: "Riesgo de desviaciones normativas." }
        },
        trabajoEquipo: {
            icono: Users,
            keywords: ['equipo', 'colaboración', 'colaboracion', 'interpersonal', 'relaciones', 'compañerismo'],
            MODELO: { f: "Agente de cohesión; reduce la fricción grupal instintivamente.", v: "Tendencia a asumir carga ajena para evitar conflictos." },
            DESTACADO: { f: "Colaborador activo y empático.", v: "Puede mejorar en la delegación asertiva hacia pares." },
            COMPETENTE: { f: "Participa cuando se le solicita.", v: "Preferencia por el trabajo silo/individual sobre el colectivo." },
            CRITICO: { f: "Requiere integración urgente.", v: "Genera fricción o resistencia pasiva en dinámicas grupales." },
            VULNERABLE: { f: "Interacción limitada.", v: "Dificultad para integrarse y colaborar proactivamente." }
        },
        institucional: {
            icono: Building,
            keywords: ['institucional', 'compromiso', 'pertenencia', 'identidad', 'cultura'],
            MODELO: { f: "Embajador de la marca y cultura institucional.", v: "Puede sobre-identificarse y perder objetividad crítica." },
            DESTACADO: { f: "Alto sentido de pertenencia y lealtad.", v: "Podría participar más en iniciativas transversales." },
            COMPETENTE: { f: "Respeta la institución y sus símbolos.", v: "Participación pasiva en eventos institucionales." },
            CRITICO: { f: "Conoce la misión institucional.", v: "Desconexión con los valores y objetivos de la organización." },
            VULNERABLE: { f: "Cumplimiento básico de protocolos.", v: "Falta de alineación con la visión estratégica." }
        },
        comunicacion: {
            icono: MessageSquare,
            keywords: ['comunicación', 'comunicacion', 'asertividad', 'expresión', 'expresion', 'escucha'],
            MODELO: { f: "Comunicador persuasivo e inspirador.", v: "Debe cuidar no monopolizar la palabra en reuniones." },
            DESTACADO: { f: "Claro, asertivo y escucha activamente.", v: "En ocasiones puede ser demasiado directo." },
            COMPETENTE: { f: "Se expresa correctamente.", v: "Le cuesta adaptar su mensaje a diferentes audiencias." },
            CRITICO: { f: "Se comunica cuando es estrictamente necesario.", v: "Barreras comunicativas que generan malentendidos." },
            VULNERABLE: { f: "Transmite información básica.", v: "Dificultad para expresar ideas complejas o dar feedback." }
        },
        liderazgo: {
            icono: Lightbulb,
            keywords: ['liderazgo', 'dirección', 'direccion', 'gestión de personas', 'mando'],
            MODELO: { f: "Líder inspirador que desarrolla nuevos talentos.", v: "Puede ser percibido como demasiado exigente o idealista." },
            DESTACADO: { f: "Gestiona equipos con eficacia y equidad.", v: "Oportunidad de delegar decisiones más estratégicas." },
            COMPETENTE: { f: "Mantiene el orden y el cumplimiento de objetivos.", v: "Estilo de liderazgo transaccional, falta visión transformacional." },
            CRITICO: { f: "Asume el rol formalmente.", v: "Desconexión con el equipo; pérdida de autoridad moral." },
            VULNERABLE: { f: "Intenta guiar al equipo.", v: "Dificultad para motivar o resolver conflictos." }
        },
        orientacionResultados: {
            icono: Target,
            keywords: ['resultados', 'logro', 'objetivos', 'metas', 'desempeño', 'innovacion', 'innovación', 'proactividad'],
            MODELO: { f: "Visión láser en objetivos; supera expectativas consistentemente.", v: "Riesgo de 'burnout' o de atropellar procesos por llegar a la meta." },
            DESTACADO: { f: "Cumple metas con calidad superior.", v: "Enfoque en el 'cómo' (proceso) puede retrasar el 'qué' (resultado final)." },
            COMPETENTE: { f: "Ejecuta lo asignado correctamente.", v: "Reactivo; espera instrucciones en lugar de proponer mejoras." },
            CRITICO: { f: "Intenta cumplir con las tareas.", v: "Pierde el foco fácilmente; productividad por debajo del estándar." },
            VULNERABLE: { f: "Cumple parcialmente.", v: "Requiere seguimiento constante para asegurar entregables." }
        },
        calidadTrabajo: {
            icono: Award,
            keywords: ['calidad', 'excelencia', 'técnica', 'tecnica', 'rigor', 'detalle', 'profesionalismo', 'conocimiento'],
            MODELO: { f: "Excelencia técnica y atención al detalle impecable.", v: "Puede caer en perfeccionismo paralizante." },
            DESTACADO: { f: "Entregables de alta calidad y confiabilidad.", v: "Toma más tiempo del necesario en revisiones menores." },
            COMPETENTE: { f: "Trabajo funcional y sin errores graves.", v: "Falta de profundidad en análisis o acabados." },
            CRITICO: { f: "Entrega lo solicitado.", v: "Errores frecuentes que requieren reprocesos." },
            VULNERABLE: { f: "Cumple con los requisitos mínimos.", v: "Descuido en detalles y presentación final." }
        }
    }
};

// --- 3. Motor de Análisis (Funciones Helper) ---

export const determinarRango = (score: number): RangoDesempeno => {
    if (score >= 4.9) return 'MODELO';
    if (score >= 4.5) return 'DESTACADO';
    if (score >= 3.8) return 'COMPETENTE';
    if (score >= 3.0) return 'VULNERABLE';
    return 'CRITICO';
};

export const getColorPorRango = (rango: RangoDesempeno): string => {
    switch (rango) {
        case 'MODELO': return 'bg-blue-600'; // Azul fuerte
        case 'DESTACADO': return 'bg-blue-500'; // Azul estándar
        case 'COMPETENTE': return 'bg-yellow-500'; // Amarillo/Naranja
        case 'VULNERABLE': return 'bg-orange-500';
        case 'CRITICO': return 'bg-red-600';
        default: return 'bg-gray-400';
    }
};

// Helper para detectar la dimensión basada en el nombre de la sección
const detectarDimension = (nombreSeccion: string): keyof typeof KNOWLEDGE_BASE.textosPorDimension | null => {
    const nombreNormalizado = nombreSeccion.toLowerCase();
    for (const [key, config] of Object.entries(KNOWLEDGE_BASE.textosPorDimension)) {
        if (config.keywords.some(k => nombreNormalizado.includes(k))) {
            return key as keyof typeof KNOWLEDGE_BASE.textosPorDimension;
        }
    }
    return null;
};

export const generarInformeIA = (input: EvaluacionInput): InformeGenerado => {
    const p = input.puntajes;
    const tipo = input.tipoInforme || 'otro';

    // 1. Calcular Globales
    const valores = Object.values(p);
    const promedio = valores.length > 0 ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
    const nivelGlobal = promedio >= 4.5 ? "Sobresaliente" : promedio >= 4.0 ? "Avanzado" : "Estándar";

    // 2. Preparar puntajes canónicos para arquetipos
    const canonicalScores: Record<string, number> = {};
    Object.entries(p).forEach(([nombre, score]) => {
        const dim = detectarDimension(nombre);
        if (dim) {
            canonicalScores[dim] = score;
        }
    });

    // 3. Determinar Arquetipo
    const arquetipo = KNOWLEDGE_BASE.arquetipos.find(a => a.trigger(canonicalScores)) || KNOWLEDGE_BASE.arquetipos[KNOWLEDGE_BASE.arquetipos.length - 1];

    // 4. Generar Análisis por Factor (Iterando sobre las secciones REALES)
    const factores: FactorAnalisis[] = Object.entries(p).map(([nombreSeccion, score]) => {
        const rango = determinarRango(score);
        const dimensionKey = detectarDimension(nombreSeccion);

        let textos = { f: "Desempeño sólido.", v: "Oportunidades de mejora continua." };
        let icono = Briefcase; // Icono default
        let color = getColorPorRango(rango);

        if (dimensionKey) {
            const config = KNOWLEDGE_BASE.textosPorDimension[dimensionKey];
            icono = config.icono;
            // @ts-ignore
            const textosDim = config[rango];
            if (textosDim) textos = textosDim;
        } else {
            if (rango === 'CRITICO' || rango === 'VULNERABLE') {
                textos = { f: "Muestra disposición al aprendizaje.", v: "Requiere plan de desarrollo urgente en esta área." };
            }
        }

        // Construcción del análisis ampliado
        const analisisAmpliado = `En la dimensión de ${nombreSeccion}, se obtuvo un puntaje de ${score.toFixed(1)}, ubicándose en el nivel ${rango}. Esto indica que ${textos.f.toLowerCase()} Sin embargo, ${textos.v.toLowerCase()} Se recomienda mantener el enfoque en las fortalezas mientras se abordan las áreas de oportunidad identificadas.`;

        // Adaptar nombre si es autoevaluación
        const nombreFinal = tipo === 'autoevaluacion' ? `${nombreSeccion} (Auto)` : nombreSeccion;

        return {
            id: nombreSeccion,
            nombre: nombreFinal,
            score: score,
            icono: icono,
            rango: rango,
            color: color,
            fortaleza: textos.f,
            vulnerabilidad: textos.v,
            analisisAmpliado // Asignar el nuevo campo
        };
    });

    // 5. Generar Recomendaciones Dinámicas
    const recomendaciones: Recomendacion[] = [];
    const orientacionScore = canonicalScores['orientacionResultados'] || 0;
    const calidadScore = canonicalScores['calidadTrabajo'] || 0;

    if (orientacionScore > 0 && orientacionScore < 4.5) {
        recomendaciones.push({
            id: "R.1", titulo: "Mentoring en Innovación", tipo: "Estrategia",
            descripcion: "Empoderar para tomar riesgos calculados. Transicionar del 'cumplimiento' a la 'propuesta'."
        });
    }
    if (calidadScore > 4.5 && orientacionScore > 0 && orientacionScore < 4.5) {
        recomendaciones.push({
            id: "R.2", titulo: "Validación Externa de Calidad", tipo: "Liderazgo",
            descripcion: "Calibración de autopercepción. El colaborador es más crítico consigo mismo que el mercado."
        });
    }

    // Generic recs if empty
    if (recomendaciones.length === 0) {
        recomendaciones.push({
            id: "R.1", titulo: "Potenciación de Liderazgo", tipo: "Liderazgo",
            descripcion: "Dado el alto desempeño, se sugiere iniciar rutas de mentoría para personal junior."
        });
    }

    // 6. Resumen Narrativo
    const integridadScore = canonicalScores['integridad'] || 0;
    const resumen = `El perfil de ${input.evaluado.nombre} se consolida como "${arquetipo.nombre}". Con un puntaje de ${promedio.toFixed(1)}, demuestra un desempeño ${nivelGlobal.toLowerCase()}. ${integridadScore > 0 ? `Destaca en Integridad (${integridadScore}).` : ''}`;

    return {
        meta: { puntajeGlobal: Number(promedio.toFixed(1)), nivelGlobal, arquetipo: { nombre: arquetipo.nombre, descripcion: arquetipo.descripcion, icono: arquetipo.icono } },
        resumenEjecutivo: resumen,
        factores,
        diagnosticoIA: "Análisis basado en las competencias evaluadas. Se recomienda revisar las vulnerabilidades específicas de cada sección.",
        recomendaciones
    };
};
