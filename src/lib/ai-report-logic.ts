
export interface InputDatosEvaluacion {
    colaborador: {
        id: string;
        nombreCompleto: string;
        rol: string;
        fechaCorte: string; // ej. "Noviembre 2025"
    };
    // Puntajes crudos por dimensión (Escala 1.0 a 5.0)
    puntajesDimensiones: {
        integridad: number;
        trabajoEquipo: number;
        institucional: number;
        comunicacion?: number; // Optional as not all might be present
        orientacionResultados: number;
        calidadTrabajo?: number; // Optional
        liderazgo?: number; // Added based on logic usage
        [key: string]: number | undefined;
    };
    // Datos opcionales para benchmarking
    promedioMercado?: Record<string, number>;
}

export interface FactorCardData {
    factor: string;
    puntaje: number;
    escalaMaxima: number;
    colorBarra: 'azul' | 'naranja' | 'rojo'; // Determinado por el puntaje
    fortalezaTexto: string;
    vulnerabilidadTexto: string;
}

export interface RecomendacionCardData {
    id: string; // ej. "R.1"
    titulo: string;
    tag: string; // ej. "Mejorar Liderazgo"
    descripcion: string;
}

export interface OutputInformeIA {
    meta: {
        tituloInforme: string; // "Informe Analisis General de Autoevaluación del Personal"
        fechaGeneracion: string;
    };
    cabecera: {
        nombre: string;
        detalles: string;
        evaluadorSistema: string; // ej. "Sistema de Análisis IA - Módulo Psicológico"
    };
    kpisPrincipales: {
        puntajeGlobal: string; // ej. "4.7 / 5.0"
        perfilArquetipo: string; // ej. "Estabilizador Institucional"
        nivelDesempeno: string; // ej. "Sobresaliente"
        indiceConfiabilidad?: string; // Added from UI example
        descripcionArquetipo?: string; // Added from UI example
    };
    resumenEjecutivoIA: string; // Párrafo generado dinámicamente
    analisisDetalladoFactores: FactorCardData[]; // Array para las tarjetas de "Imagen 0"
    diagnosticoIADestacado: string; // Frase corta para el recuadro oscuro ("Imagen 1")
    recomendacionesEstrategicas: RecomendacionCardData[]; // Array para las tarjetas de "Imagen 2"
}

export const MatrizGeneradoraIA = {
    // --- LÓGICA DE ARQUETIPOS ---
    determinarArquetipo: (scores: InputDatosEvaluacion['puntajesDimensiones']) => {
        const integridad = scores.integridad || 0;
        const trabajoEquipo = scores.trabajoEquipo || 0;
        const orientacionResultados = scores.orientacionResultados || 0;
        const liderazgo = scores.liderazgo || 0;
        const calidadTrabajo = scores.calidadTrabajo || 0;

        if (integridad > 4.8 && trabajoEquipo > 4.8) {
            return { name: "Estabilizador Institucional", desc: "Columna vertebral ética y operativa." };
        } else if (orientacionResultados > 4.7 && liderazgo > 4.5) {
            return { name: "Impulsor Estratégico", desc: "Motor de cambio y logro de objetivos." };
        } else if (calidadTrabajo > 4.8 && trabajoEquipo < 3.5) {
            return { name: "Especialista Técnico Aislado", desc: "Alta competencia técnica con retos de integración." };
        }
        // Default
        return { name: "Perfil en Desarrollo", desc: "En proceso de consolidación de competencias clave." };
    },

    // --- LÓGICA DE FACTORES ---
    getAnalisisResultados: (factorName: string, score: number): { fortaleza: string; vulnerabilidad: string; color: 'azul' | 'naranja' | 'rojo' } => {
        const name = factorName.toLowerCase();

        if (name.includes('resultados') || name.includes('innovación')) {
            if (score >= 4.8) {
                return {
                    fortaleza: "Visión estratégica excepcional y capacidad disruptiva probada.",
                    vulnerabilidad: "Riesgo de descuidar procesos operativos por foco excesivo en la meta final.",
                    color: 'azul'
                };
            } else if (score >= 4.0) {
                return {
                    fortaleza: "Ejecución impecable de procesos establecidos y metas claras.",
                    vulnerabilidad: "Enfoque predominante en el 'cómo' (mantenimiento) sobre el 'qué' (innovación/disrupción).",
                    color: 'naranja'
                };
            } else {
                return {
                    fortaleza: "Cumple con tareas básicas bajo supervisión directa.",
                    vulnerabilidad: "Dificultad significativa para establecer metas propias o visualizar el impacto estratégico.",
                    color: 'rojo'
                };
            }
        }

        if (name.includes('integridad') || name.includes('ética')) {
            if (score >= 4.8) {
                return {
                    fortaleza: "Reconoce y corrige errores propios con madurez. Ejerce funciones con transparencia absoluta.",
                    vulnerabilidad: "Riesgo bajo de rigidez al aplicar normas en situaciones que requieran flexibilidad inusual.",
                    color: 'azul'
                };
            } else if (score >= 4.0) {
                return {
                    fortaleza: "Alineación consistente con los valores corporativos.",
                    vulnerabilidad: "Puede dudar ante dilemas éticos complejos sin guía clara.",
                    color: 'naranja'
                };
            } else {
                return {
                    fortaleza: "Conoce las normas básicas de la institución.",
                    vulnerabilidad: "Riesgo de desviaciones normativas si no hay supervisión.",
                    color: 'rojo'
                };
            }
        }

        if (name.includes('equipo') || name.includes('colaboración')) {
            if (score >= 4.8) {
                return {
                    fortaleza: "Agente de cohesión grupal. Adaptabilidad excepcional a diferentes estilos.",
                    vulnerabilidad: "Tendencia potencial a asumir carga de trabajo ajena para evitar fricciones.",
                    color: 'azul'
                };
            } else if (score >= 4.0) {
                return {
                    fortaleza: "Buen compañero, colabora activamente cuando se le requiere.",
                    vulnerabilidad: "Puede evitar conflictos necesarios para mantener la armonía.",
                    color: 'naranja'
                };
            } else {
                return {
                    fortaleza: "Trabaja funcionalmente en tareas individuales.",
                    vulnerabilidad: "Dificultad para integrarse o compartir información clave.",
                    color: 'rojo'
                };
            }
        }

        if (name.includes('institucional') || name.includes('compromiso')) {
            if (score >= 4.8) {
                return {
                    fortaleza: "Alineación cultural casi total. Cumplimiento perfecto de horarios y recursos.",
                    vulnerabilidad: "Oportunidades menores en la asistencia a capacitaciones no esenciales.",
                    color: 'azul'
                };
            } else if (score >= 4.0) {
                return {
                    fortaleza: "Respeta la institución y sus símbolos.",
                    vulnerabilidad: "Compromiso variable según la motivación del momento.",
                    color: 'naranja'
                };
            } else {
                return {
                    fortaleza: "Asiste a su puesto de trabajo.",
                    vulnerabilidad: "Desconexión con la misión y visión institucional.",
                    color: 'rojo'
                };
            }
        }

        // Default generic
        if (score >= 4.5) {
            return {
                fortaleza: "Desempeño destacado y consistente.",
                vulnerabilidad: "Puede mejorar en la mentoría a otros.",
                color: 'azul'
            };
        } else if (score >= 3.5) {
            return {
                fortaleza: "Cumple con los estándares esperados.",
                vulnerabilidad: "Requiere supervisión para tareas complejas.",
                color: 'naranja'
            };
        } else {
            return {
                fortaleza: "Muestra disposición básica.",
                vulnerabilidad: "Brechas significativas que afectan el resultado.",
                color: 'rojo'
            };
        }
    },

    // --- LÓGICA DE RECOMENDACIONES ---
    generarRecomendaciones: (scores: InputDatosEvaluacion['puntajesDimensiones'], arquetipo: string): RecomendacionCardData[] => {
        const recs: RecomendacionCardData[] = [];

        // Example rule
        if ((scores.orientacionResultados || 0) < 4.5 && arquetipo === "Estabilizador Institucional") {
            recs.push({
                id: "R.1",
                titulo: "Mentoring en Innovación (Toma de Riesgos)",
                tag: "Desarrollo Estratégico",
                descripcion: "Empoderar al colaborador para transicionar de un rol de mantenimiento a uno de disrupción controlada."
            });
        }

        // Rule for high self-criticism (inferred from high integrity but lower quality/results perception if applicable, or generic)
        // Adding generic recommendation based on lowest score
        const entries = Object.entries(scores).filter(([k]) => k !== 'promedioMercado');
        const lowest = entries.sort((a, b) => (a[1] || 0) - (b[1] || 0))[0];

        if (lowest && (lowest[1] || 0) < 4.0) {
            recs.push({
                id: "R.2",
                titulo: `Refuerzo en ${lowest[0]}`,
                tag: "Plan de Mejora",
                descripcion: `Se sugiere un plan de capacitación específico para elevar el nivel en ${lowest[0]}, enfocándose en prácticas diarias.`
            });
        } else {
            // High performer recommendation
            recs.push({
                id: "R.2",
                titulo: "Validación Externa de Calidad",
                tag: "Calibración de Percepción",
                descripcion: "Dado el alto desempeño, se sugiere buscar feedback externo para validar la excelencia y preparar para nuevos retos."
            });
        }

        return recs;
    },

    // --- GENERADOR PRINCIPAL ---
    generarInforme: (input: InputDatosEvaluacion): OutputInformeIA => {
        const scores = input.puntajesDimensiones;
        const arquetipoData = MatrizGeneradoraIA.determinarArquetipo(scores);

        // Calculate global score
        const values = Object.values(scores).filter(v => v !== undefined) as number[];
        const avg = values.reduce((a, b) => a + b, 0) / values.length;

        const factores: FactorCardData[] = Object.entries(scores).map(([key, value]) => {
            const val = value || 0;
            const analysis = MatrizGeneradoraIA.getAnalisisResultados(key, val);
            // Map key to readable name
            const readableName = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim();

            return {
                factor: readableName,
                puntaje: val,
                escalaMaxima: 5.0,
                colorBarra: analysis.color,
                fortalezaTexto: analysis.fortaleza,
                vulnerabilidadTexto: analysis.vulnerabilidad
            };
        });

        const recomendaciones = MatrizGeneradoraIA.generarRecomendaciones(scores, arquetipoData.name);

        return {
            meta: {
                tituloInforme: "INFORME ANALISIS GENERAL DE AUTOEVALUACIÓN DEL PERSONAL",
                fechaGeneracion: new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })
            },
            cabecera: {
                nombre: input.colaborador.nombreCompleto,
                detalles: `Rol: ${input.colaborador.rol} | Fecha de Corte: ${input.colaborador.fechaCorte}`,
                evaluadorSistema: "Motor de Análisis Psicológico IA v2.5"
            },
            kpisPrincipales: {
                puntajeGlobal: `${avg.toFixed(1)} / 5.0`,
                perfilArquetipo: arquetipoData.name,
                descripcionArquetipo: arquetipoData.desc,
                nivelDesempeno: avg >= 4.5 ? "Sobresaliente" : avg >= 4.0 ? "Alto" : "Medio",
                indiceConfiabilidad: "A+" // Hardcoded for now or logic based
            },
            resumenEjecutivoIA: `El/La colaborador(a) ${input.colaborador.nombreCompleto} obtiene un perfil de "${arquetipoData.name}" con un desempeño general de ${avg.toFixed(1)}. Este perfil se caracteriza por ${arquetipoData.desc.toLowerCase()} El análisis de IA destaca fortalezas en las áreas evaluadas.`,
            analisisDetalladoFactores: factores,
            diagnosticoIADestacado: `"${input.colaborador.nombreCompleto.split(' ')[0]} muestra un perfil sólido. Su autoevaluación revela una personalidad concienzuda vital para la empresa."`,
            recomendacionesEstrategicas: recomendaciones
        };
    }
};
