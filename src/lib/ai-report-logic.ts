import { Shield, Users, Building, MessageSquare, Target, Award } from 'lucide-react';

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
    puntajes: {
        integridad: number;
        trabajoEquipo: number;
        institucional: number;
        comunicacion: number;
        orientacionResultados: number;
        calidadTrabajo: number;
    };
    comparativeScores?: {
        integridad: number;
        trabajoEquipo: number;
        institucional: number;
        comunicacion: number;
        orientacionResultados: number;
        calidadTrabajo: number;
    };
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
            trigger: (p: any) => p.integridad >= 4.8 && p.trabajoEquipo >= 4.8,
            nombre: "Estabilizador Institucional",
            descripcion: "Columna vertebral moral y operativa. Garantiza la cohesión y el cumplimiento normativo.",
            icono: "🏛️"
        },
        {
            trigger: (p: any) => p.orientacionResultados >= 4.8 && p.comunicacion >= 4.5,
            nombre: "Impulsor Estratégico",
            descripcion: "Agente de cambio enfocado en metas agresivas y movilización de equipos.",
            icono: "🚀"
        },
        {
            trigger: (p: any) => p.calidadTrabajo >= 4.8 && p.trabajoEquipo < 4.0,
            nombre: "Especialista Técnico",
            descripcion: "Alto desempeño individual con oportunidades en la integración colaborativa.",
            icono: "⚙️"
        },
        {
            trigger: (p: any) => true, // Fallback
            nombre: "Ejecutor Consistente",
            descripcion: "Perfil equilibrado que cumple con los estándares esperados de la organización.",
            icono: "📋"
        }
    ],
    textosPorDimension: {
        integridad: {
            MODELO: { f: "Referente moral absoluto; transparencia incuestionable.", v: "Posible rigidez ante situaciones de 'zona gris' que requieran flexibilidad." },
            DESTACADO: { f: "Alineación sólida con valores corporativos.", v: "Ocasionalmente puede dudar en reportar faltas menores de compañeros." },
            COMPETENTE: { f: "Cumple las normas básicas sin incidentes.", v: "Requiere supervisión en manejo de información confidencial compleja." },
            CRITICO: { f: "Reconoce la normativa básica.", v: "Riesgos éticos detectados; requiere plan de intervención inmediato." },
            VULNERABLE: { f: "Conoce las normas.", v: "Riesgo de desviaciones normativas." }
        },
        trabajoEquipo: {
            MODELO: { f: "Agente de cohesión; reduce la fricción grupal instintivamente.", v: "Tendencia a asumir carga ajena para evitar conflictos." },
            DESTACADO: { f: "Colaborador activo y empático.", v: "Puede mejorar en la delegación asertiva hacia pares." },
            COMPETENTE: { f: "Participa cuando se le solicita.", v: "Preferencia por el trabajo silo/individual sobre el colectivo." },
            CRITICO: { f: "Requiere integración urgente.", v: "Genera fricción o resistencia pasiva en dinámicas grupales." },
            VULNERABLE: { f: "Interacción limitada.", v: "Dificultad para integrarse y colaborar proactivamente." }
        },
        institucional: {
            MODELO: { f: "Embajador de la marca y cultura institucional.", v: "Puede sobre-identificarse y perder objetividad crítica." },
            DESTACADO: { f: "Alto sentido de pertenencia y lealtad.", v: "Podría participar más en iniciativas transversales." },
            COMPETENTE: { f: "Respeta la institución y sus símbolos.", v: "Participación pasiva en eventos institucionales." },
            CRITICO: { f: "Conoce la misión institucional.", v: "Desconexión con los valores y objetivos de la organización." },
            VULNERABLE: { f: "Cumplimiento básico de protocolos.", v: "Falta de alineación con la visión estratégica." }
        },
        comunicacion: {
            MODELO: { f: "Comunicador persuasivo e inspirador.", v: "Debe cuidar no monopolizar la palabra en reuniones." },
            DESTACADO: { f: "Claro, asertivo y escucha activamente.", v: "En ocasiones puede ser demasiado directo." },
            COMPETENTE: { f: "Se expresa correctamente.", v: "Le cuesta adaptar su mensaje a diferentes audiencias." },
            CRITICO: { f: "Se comunica cuando es estrictamente necesario.", v: "Barreras comunicativas que generan malentendidos." },
            VULNERABLE: { f: "Transmite información básica.", v: "Dificultad para expresar ideas complejas o dar feedback." }
        },
        orientacionResultados: {
            MODELO: { f: "Visión láser en objetivos; supera expectativas consistentemente.", v: "Riesgo de 'burnout' o de atropellar procesos por llegar a la meta." },
            DESTACADO: { f: "Cumple metas con calidad superior.", v: "Enfoque en el 'cómo' (proceso) puede retrasar el 'qué' (resultado final)." },
            COMPETENTE: { f: "Ejecuta lo asignado correctamente.", v: "Reactivo; espera instrucciones en lugar de proponer mejoras." },
            CRITICO: { f: "Intenta cumplir con las tareas.", v: "Pierde el foco fácilmente; productividad por debajo del estándar." },
            VULNERABLE: { f: "Cumple parcialmente.", v: "Requiere seguimiento constante para asegurar entregables." }
        },
        calidadTrabajo: {
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

export const generarInformeIA = (input: EvaluacionInput): InformeGenerado => {
    const p = input.puntajes;
    const tipo = input.tipoInforme || 'otro';

    // 1. Calcular Globales
    const valores = Object.values(p);
    const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
    const nivelGlobal = promedio >= 4.5 ? "Sobresaliente" : promedio >= 4.0 ? "Avanzado" : "Estándar";

    // 2. Determinar Arquetipo
    const arquetipo = KNOWLEDGE_BASE.arquetipos.find(a => a.trigger(p)) || KNOWLEDGE_BASE.arquetipos[KNOWLEDGE_BASE.arquetipos.length - 1];

    // Helper to get text safely
    const getText = (dim: keyof typeof KNOWLEDGE_BASE.textosPorDimension, score: number) => {
        const rango = determinarRango(score);
        const texts = KNOWLEDGE_BASE.textosPorDimension[dim];
        if (texts && texts[rango]) return texts[rango];
        // Fallback generic
        if (score >= 4.0) return { f: "Desempeño sólido.", v: "Oportunidades de mejora continua." };
        return { f: "Muestra disposición.", v: "Requiere plan de desarrollo." };
    };

    // 3. Generar Análisis por Factor
    // Definimos la estructura base de los factores para iterar y generar
    const factoresDef = [
        { key: 'integridad', nombre: 'Integridad y Ética', icono: Shield },
        { key: 'trabajoEquipo', nombre: 'Trabajo en Equipo', icono: Users },
        { key: 'institucional', nombre: 'Compromiso Institucional', icono: Building },
        { key: 'comunicacion', nombre: 'Comunicación', icono: MessageSquare },
        { key: 'orientacionResultados', nombre: 'Orientación a Resultados', icono: Target },
        { key: 'calidadTrabajo', nombre: 'Calidad del Trabajo', icono: Award }
    ] as const;

    const factores: FactorAnalisis[] = factoresDef.map(def => {
        const score = p[def.key];
        const rango = determinarRango(score);
        const textos = getText(def.key, score);

        // Adaptar nombre si es autoevaluación
        const nombreFinal = tipo === 'autoevaluacion' ? `${def.nombre} (Auto)` : def.nombre;

        return {
            id: def.key,
            nombre: nombreFinal,
            score: score,
            icono: def.icono,
            rango: rango,
            color: getColorPorRango(rango),
            fortaleza: textos.f,
            vulnerabilidad: textos.v
        };
    });

    // 4. Generar Recomendaciones Dinámicas
    const recomendaciones: Recomendacion[] = [];

    if (p.orientacionResultados < 4.5) {
        recomendaciones.push({
            id: "R.1", titulo: "Mentoring en Innovación", tipo: "Estrategia",
            descripcion: "Empoderar para tomar riesgos calculados. Transicionar del 'cumplimiento' a la 'propuesta'."
        });
    }
    if (p.calidadTrabajo > 4.5 && p.orientacionResultados < 4.5) {
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

    // 5. Resumen Narrativo
    const resumen = `El perfil de ${input.evaluado.nombre} se consolida como "${arquetipo.nombre}". Con un puntaje de ${promedio.toFixed(1)}, demuestra una confiabilidad excepcional (Integridad ${p.integridad}). Su principal desafío radica en equilibrar su perfeccionismo operativo con una visión más estratégica y arriesgada.`;

    return {
        meta: { puntajeGlobal: Number(promedio.toFixed(1)), nivelGlobal, arquetipo: { nombre: arquetipo.nombre, descripcion: arquetipo.descripcion, icono: arquetipo.icono } },
        resumenEjecutivo: resumen,
        factores,
        diagnosticoIA: "Alto alineamiento cultural y operativo. Riesgo latente de estancamiento por aversión al riesgo innovador.",
        recomendaciones
    };
};
