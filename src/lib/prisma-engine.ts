/**
 * 🧠 PRISMA ENGINE - Core Logic & Narrative System
 * Módulo independiente que contiene la lógica matemática y el generador de reportes.
 */

// --- 1. DEFINICIÓN DE TIPOS (TYPES) ---

export type QuestionConfig = {
    id: string;
    text: string;
    weight: number;
    isAnchor: boolean;
};

export type CategoryConfig = {
    id: string;
    name: string;
    questions: QuestionConfig[];
};

export type AnalysisResult = {
    category: string;
    score: number;
    rawScore: number;
    maxPossibleScore: number;
    percentage: number;

    // Metadatos Diagnósticos
    anchorFailed: boolean;
    anchorQuestionText?: string;

    // Salida Narrativa Inteligente
    arquetipo: string;
    analisis: string;
    accionSugerida: string;
    nivelRiesgo: 'Bajo' | 'Medio' | 'Alto' | 'Crítico';
};

// --- 2. BASE DE CONOCIMIENTO (CONFIGURACIÓN DE PREGUNTAS) ---

export const PRISMA_KNOWLEDGE_BASE: Record<string, CategoryConfig> = {
    calidad: {
        id: 'calidad',
        name: 'Compromiso con la Calidad',
        questions: [
            { id: 'c1', text: 'Programa las actividades previamente a su ejecución', weight: 0.3, isAnchor: true },
            { id: 'c2', text: 'Se asegura que su trabajo sea preciso y completo', weight: 0.3, isAnchor: false },
            { id: 'c3', text: 'Ofrece asistencia técnica, administrativa u operativa', weight: 0.2, isAnchor: false },
            { id: 'c4', text: 'cumplido eficientemente las funciones y responsabilidades', weight: 0.2, isAnchor: false },
        ]
    },
    resultados: {
        id: 'resultados',
        name: 'Orientación a los Resultados',
        questions: [
            { id: 'r1', text: 'Planea, ejecuta, verifica y actúa', weight: 0.4, isAnchor: true },
            { id: 'r2', text: 'Propone alternativas cuando los objetivos socializados', weight: 0.2, isAnchor: false },
            { id: 'r3', text: 'Evidencia oportunamente los riesgos', weight: 0.2, isAnchor: false },
            { id: 'r4', text: 'Presenta nuevas ideas o propuestas', weight: 0.2, isAnchor: false },
        ]
    },
    integridad: {
        id: 'integridad',
        name: 'Integridad',
        questions: [
            { id: 'i1', text: 'Analiza que acción es la más adecuada', weight: 0.2, isAnchor: false },
            { id: 'i2', text: 'Cumple a cabalidad las normas, reglamentos', weight: 0.3, isAnchor: true },
            { id: 'i3', text: 'Ejerce sus funciones con transparencia', weight: 0.3, isAnchor: false },
            { id: 'i4', text: 'Reconoce y corrige sus propios errores', weight: 0.2, isAnchor: true },
        ]
    },
    comunicacion: {
        id: 'comunicacion',
        name: 'Comunicación Asertiva',
        questions: [
            { id: 'cm1', text: 'Entrega información clara, veraz', weight: 0.3, isAnchor: false },
            { id: 'cm2', text: 'Actúa con diplomacia y prudencia', weight: 0.3, isAnchor: true },
            { id: 'cm3', text: 'Se comunica con los integrantes de la comunidad', weight: 0.2, isAnchor: false },
            { id: 'cm4', text: 'Cumple con las normas de etiqueta', weight: 0.2, isAnchor: false },
        ]
    },
    institucional: {
        id: 'institucional',
        name: 'Compromiso Institucional',
        questions: [
            { id: 'inst1', text: 'Cumple a cabalidad con su horario de trabajo', weight: 0.3, isAnchor: true },
            { id: 'inst2', text: 'Hace uso eficiente de los recursos suministrados', weight: 0.2, isAnchor: false },
            { id: 'inst3', text: 'Cumple con las normas de presentación personal', weight: 0.2, isAnchor: false },
            { id: 'inst4', text: 'Guarda reserva de la información institucional', weight: 0.3, isAnchor: false },
        ]
    },
    trabajo_equipo: {
        id: 'trabajo_equipo',
        name: 'Trabajo en Equipo',
        questions: [
            { id: 'te1', text: 'respeta las ideas de sus compañeros', weight: 0.3, isAnchor: true },
            { id: 'te2', text: 'Voluntariamente apoya a sus compañeros', weight: 0.3, isAnchor: false },
            { id: 'te3', text: 'Se adapta a los diferentes estilos de trabajo', weight: 0.2, isAnchor: false },
            { id: 'te4', text: 'Respeta las ideas y opiniones de sus compañeros', weight: 0.2, isAnchor: false },
        ]
    },
    // --- NUEVAS CATEGORÍAS VAF / EVALPROM ---
    liderazgo: {
        id: 'liderazgo',
        name: 'Liderazgo',
        questions: [{ id: 'lid_gen', text: 'Competencia General de Liderazgo', weight: 1.0, isAnchor: false }]
    },
    requisitos: {
        id: 'requisitos',
        name: 'Cumplimiento de los Requisitos',
        questions: [{ id: 'req_gen', text: 'Competencia General de Requisitos', weight: 1.0, isAnchor: false }]
    },
    sgc: {
        id: 'sgc',
        name: 'Compromiso con el Sistema de Gestión de Calidad (SGC)',
        questions: [{ id: 'sgc_gen', text: 'Competencia General SGC', weight: 1.0, isAnchor: false }]
    },
    documental: {
        id: 'documental',
        name: 'Gestión Documental',
        questions: [{ id: 'doc_gen', text: 'Competencia General Documental', weight: 1.0, isAnchor: false }]
    },
    planeacion: {
        id: 'planeacion',
        name: 'Planeación',
        questions: [{ id: 'plan_gen', text: 'Competencia General Planeación', weight: 1.0, isAnchor: false }]
    },
    mejora: {
        id: 'mejora',
        name: 'Mejora',
        questions: [{ id: 'mej_gen', text: 'Competencia General Mejora', weight: 1.0, isAnchor: false }]
    }
};

// --- 3. SISTEMA DE NARRATIVA AVANZADA (NARRATIVE DB) ---

export type NarrativeTemplate = {
    arquetipo: string;
    analisis: (anchorText?: string) => string;
    accion: string;
};

export type CategoryNarrative = {
    anchorFailure: NarrativeTemplate;
    excellence: NarrativeTemplate;
    good: NarrativeTemplate;
    development: NarrativeTemplate;
};

export const NARRATIVE_DB: Record<string, CategoryNarrative> = {
    calidad: {
        anchorFailure: {
            arquetipo: 'Ejecutor Reactivo (Riesgo de Fatiga Estructural)',
            analisis: (anchor) =>
                `El análisis detecta una disonancia crítica en el perfil. Aunque el evaluado demuestra una alta capacidad de resolución inmediata y entrega, la calificación deficiente en el factor estructural "${anchor}" revela un patrón de gestión por urgencia. \n\nEsto sugiere que el profesional logra los resultados a través de un sobreesfuerzo compensatorio, "apagando fuegos" en lugar de prevenirlos. A nivel organizacional, este comportamiento es insostenible a largo plazo y genera "Deuda Técnica" en los procesos, donde la falta de planificación hoy se convierte en errores complejos mañana.`,
            accion: 'Adopción inmediata de la "Matriz de Eisenhower" para filtrar urgencias vs. importancias. Bloqueo de agenda de 30 min los lunes exclusivamente para planificación semanal (sin operación).'
        },
        excellence: {
            arquetipo: 'Arquitecto de Procesos y Estándares',
            analisis: () =>
                `El perfil evidencia un nivel de madurez superior en la gestión de la calidad. No se limita al cumplimiento de la tarea asignada, sino que demuestra una visión sistémica donde cada entregable es verificado contra los estándares institucionales antes de su liberación. \n\nSu conducta actúa como un "Cortafuegos Operativo": su sola presencia reduce la tasa de errores del equipo. La consistencia en sus respuestas sugiere una autodisciplina rigurosa y una capacidad para auditar su propio trabajo con objetividad clínica.`,
            accion: 'Elevar a rol de "Auditor Interno de Calidad" para pares. Liderar la creación de un "Playbook" o manual de buenas prácticas del área para estandarizar este nivel de excelencia.'
        },
        good: {
            arquetipo: 'Profesional Metódico y Confiable',
            analisis: () =>
                `El evaluado presenta un desempeño sólido sustentado en hábitos de revisión constantes. Existe una clara conciencia de la importancia de la precisión y se evidencia responsabilidad sobre el producto final. \n\nSin embargo, el análisis sugiere que este nivel de calidad podría estar dependiendo excesivamente de la revisión manual y el esfuerzo individual. El siguiente nivel evolutivo requiere transicionar del "Hacerlo bien" al "Hacerlo eficientemente", integrando herramientas que aseguren la calidad sin aumentar la carga operativa.`,
            accion: 'Implementar listas de chequeo (Checklists) automatizadas para tareas repetitivas. Explorar herramientas digitales que reduzcan la dependencia de la memoria operativa.'
        },
        development: {
            arquetipo: 'Operativo Disperso (Foco Variable)',
            analisis: () =>
                `Se identifican fluctuaciones significativas en los estándares de entrega. Los resultados indican que la calidad del trabajo es vulnerable a factores externos como la presión de tiempo o el volumen de tareas. \n\nEste perfil tiende a priorizar la velocidad de entrega sobre la precisión, lo que genera retrabajos (reproceso) aguas abajo. Existe una brecha en la fase de "Preparación", iniciando la ejecución sin tener todos los requerimientos o recursos validados, lo que impacta la eficiencia global del área.`,
            accion: 'Instituir la regla del "Doble Check" con un par antes de cada entrega final. Capacitación en gestión del tiempo enfocada en la técnica Pomodoro para mantener focos de atención sostenida.'
        }
    },
    // ... (Keep existing Standard Categories: resultados, integridad, comunicacion, institucional, trabajo_equipo)
    resultados: {
        anchorFailure: {
            arquetipo: 'Esforzado sin Estrategia (Ineficacia Cíclica)',
            analisis: (anchor) =>
                `Se observa un despliegue de energía significativo pero con bajo retorno de inversión (ROI) operativo. La falla crítica en el indicador "${anchor}" señala una ruptura en el ciclo de mejora continua (PHVA). \n\nEl profesional tiende a ejecutar tareas de manera aislada sin cerrar el ciclo de aprendizaje. Esto significa que los errores se repiten y las oportunidades de optimización se pierden. Es un perfil de "Mucho hacer, poco analizar", lo que limita su crecimiento estratégico dentro de la institución.`,
            accion: 'Aplicación estricta del ciclo PHVA (Planear, Hacer, Verificar, Actuar) en un micro-proyecto piloto. Documentar lecciones aprendidas semanalmente (Retrospectiva personal).'
        },
        excellence: {
            arquetipo: 'Estratega de Alto Impacto',
            analisis: () =>
                `Resultados excepcionales que denotan una mentalidad orientada no solo al logro, sino a la superación del estándar. El perfil muestra una capacidad proactiva para anticipar obstáculos y reformular estrategias en tiempo real. \n\nDestaca su resiliencia operativa: ante la desviación de un objetivo, no busca culpables, sino alternativas de solución. Es un agente de cambio natural que transforma problemas complejos en planes de acción estructurados, maximizando el uso de los recursos institucionales.`,
            accion: 'Asignación de "Proyectos Transversales" de alto riesgo/alta recompensa. Participación en comités de innovación para aportar soluciones a problemas estructurales del área.'
        },
        good: {
            arquetipo: 'Orientado al Logro y la Eficacia',
            analisis: () =>
                `Perfil pragmático que cumple consistentemente con los KPIs asignados. Muestra autonomía en la resolución de problemas cotidianos y requiere mínima supervisión para mantener el rumbo operativo. \n\nSu enfoque es funcional: asegura que las cosas sucedan. Para alcanzar la excelencia, se recomienda desarrollar una visión más analítica sobre el "cómo" se logran los resultados, buscando no solo la eficacia (lograr la meta) sino la eficiencia (lograrla con menos recursos).`,
            accion: 'Entrenamiento en metodologías de resolución de problemas (Design Thinking o 5 Porqués) para abordar desafíos no rutinarios con mayor profundidad.'
        },
        development: {
            arquetipo: 'Ejecutor de Tareas (Dependiente)',
            analisis: () =>
                `El desempeño se limita estrictamente a la descripción del cargo, mostrando reactividad ante imprevistos. Cuando el plan original falla, el evaluado tiende a detenerse a esperar nuevas instrucciones en lugar de proponer alternativas. \n\nEsta pasividad estratégica sobrecarga a la jefatura inmediata, quien debe actuar como el "motor" de la resolución de problemas. Se requiere desarrollar el sentido de "Ownership" (apropiación) sobre los resultados finales, no solo sobre las tareas intermedias.`,
            accion: 'Delegación progresiva de pequeñas decisiones: "No me traigas el problema, tráeme el problema y dos posibles soluciones para que yo elija una".'
        }
    },
    integridad: {
        anchorFailure: {
            arquetipo: 'Perfil con Riesgo de Cumplimiento Normativo',
            analisis: (anchor) =>
                `ALERTA DE SISTEMA: El análisis de respuestas revela una vulnerabilidad en los cimientos éticos del perfil, específicamente en "${anchor}". Esto no necesariamente implica deshonestidad, pero sí un desconocimiento o subvaloración de los marcos normativos institucionales. \n\nEn situaciones de alta presión, este perfil podría racionalizar atajos que comprometan la seguridad jurídica o reputacional de la UDES. La integridad no es negociable; esta brecha debe ser tratada como prioridad cero en el plan de desarrollo.`,
            accion: 'Plan de Re-inducción Intensiva en Código de Ética y Buen Gobierno. Firma de compromiso ético renovado y supervisión directa en decisiones que involucren recursos sensibles.'
        },
        excellence: {
            arquetipo: 'Guardián Cultural y Referente Ético',
            analisis: () =>
                `El evaluado personifica los valores corporativos de la UDES. Su consistencia perfecta en este módulo indica una alineación profunda entre sus valores personales y la misión institucional. \n\nEste perfil actúa como un "Ancla Moral" para el equipo: genera confianza instantánea y eleva el estándar de comportamiento de quienes lo rodean. Su transparencia en la gestión de errores (reconocimiento propio) es una cualidad de liderazgo avanzada que fomenta la seguridad psicológica en el equipo.`,
            accion: 'Incorporar como mentor en procesos de Onboarding para nuevos colaboradores. Facilitador en talleres de dilemas éticos y cultura organizacional.'
        },
        good: {
            arquetipo: 'Profesional Transparente y Alineado',
            analisis: () =>
                `Muestra una conducta adecuada y respetuosa de las normas. Entiende los límites de su actuación y respeta la jerarquía y los procedimientos establecidos. \n\nEs un perfil confiable para el manejo de información. Sin embargo, se invita a pasar de un cumplimiento pasivo ("No rompo las reglas") a una promoción activa de la integridad ("Ayudo a otros a cumplir"), especialmente en situaciones donde observe desviaciones menores en su entorno.`,
            accion: 'Lectura dirigida sobre "Ética en la toma de decisiones cotidianas". Fomentar su participación activa cuando se discutan mejoras a reglamentos internos.'
        },
        development: {
            arquetipo: 'Necesita Alineación Normativa',
            analisis: () =>
                `Se percibe una relación transaccional con las normas: se cumplen por obligación, no por convicción. Las respuestas sugieren que el evaluado ve los procedimientos de control como "burocracia" que entorpece su trabajo, más que como salvaguardas institucionales. \n\nEsta actitud puede llevar a la omisión involuntaria de protocolos importantes. Es crucial reforzar el "Por qué" detrás de las normas, no solo el "Qué".`,
            accion: 'Taller de sensibilización: "El impacto de mis acciones en la reputación UDES". Revisión conjunta de casos de estudio sobre consecuencias de faltas normativas.'
        }
    },
    comunicacion: {
        anchorFailure: {
            arquetipo: 'Comunicador de Riesgo (Imprudencia Táctica)',
            analisis: (anchor) =>
                `Se detecta una falencia crítica en la inteligencia social del perfil, puntualmente en "${anchor}". El análisis sugiere que el profesional prioriza la franqueza sobre la prudencia, lo que puede resultar en comunicaciones abrasivas o inoportunas. \n\nEste estilo comunicativo genera fricciones innecesarias ("ruido") que desgastan las relaciones interpersonales y pueden bloquear la colaboración. Aunque el mensaje técnico sea correcto, la forma de entrega está saboteando la recepción del mismo.`,
            accion: 'Entrenamiento obligatorio en "Comunicación No Violenta" (Marshall Rosenberg). Ejercicios de role-playing enfocados en dar feedback negativo sin generar defensividad.'
        },
        excellence: {
            arquetipo: 'Diplomático Institucional',
            analisis: () =>
                `Maestría en la gestión de la información y las relaciones. El perfil demuestra una capacidad superior para adaptar su registro comunicativo según la audiencia (pares, jefes, externos). \n\nSabe navegar conversaciones difíciles con elegancia, manteniendo la firmeza en el fondo pero la suavidad en la forma. Es un "Hub de Comunicación": la información fluye a través de él/ella de manera clara, veraz y oportuna, eliminando rumores y alineando al equipo.`,
            accion: 'Designar como vocero oficial del equipo en proyectos interdepartamentales. Liderar presentaciones ejecutivas ante directivos.'
        },
        good: {
            arquetipo: 'Comunicador Efectivo y Claro',
            analisis: () =>
                `Logra transmitir sus ideas con claridad y mantiene canales abiertos de retroalimentación. Es un comunicador funcional que asegura que las instrucciones se entiendan y los reportes lleguen a tiempo. \n\nSu oportunidad de mejora radica en la "Escucha Activa" y la comunicación persuasiva. Pasar de informar (transmitir datos) a influir (movilizar voluntades), especialmente en situaciones donde no tiene autoridad jerárquica directa.`,
            accion: 'Práctica de técnicas de Storytelling para la presentación de informes. Fomentar el hábito de parafrasear lo escuchado para validar comprensión total.'
        },
        development: {
            arquetipo: 'Emisor Pasivo (Silo Comunicacional)',
            analisis: () =>
                `Tendencia al aislamiento comunicativo. El evaluado asume que "hacer el trabajo" es suficiente, descuidando la visibilidad y el reporte de sus avances. \n\nA menudo retiene información por no considerarla relevante o espera a que se le pregunte para informar problemas. Esta pasividad genera puntos ciegos para la jefatura y descoordinación con los pares, quienes no saben en qué estado están los procesos compartidos.`,
            accion: 'Establecer rutinas de reporte breves (Daily Stand-up o informe semanal de 5 puntos). Curso de redacción ejecutiva y oratoria básica.'
        }
    },
    institucional: {
        anchorFailure: {
            arquetipo: 'Desalineado Institucionalmente',
            analisis: (anchor) =>
                `El bajo desempeño en el indicador "${anchor}" es una señal de alerta sobre el compromiso organizacional. Revela una desconexión entre el individuo y el ecosistema de la Universidad. \n\nYa sea por incumplimiento de horarios o mal uso de recursos, esta conducta erosiona la autoridad moral y afecta el clima laboral (sensación de inequidad en el equipo). Es necesario re-establecer el "Contrato Psicológico" básico antes de pensar en desarrollo profesional.`,
            accion: 'Reunión de feedback correctivo centrada en expectativas básicas del rol. Monitoreo formal de cumplimiento durante 30 días.'
        },
        excellence: {
            arquetipo: 'Embajador de Marca UDES',
            analisis: () =>
                `El evaluado ha internalizado la identidad UDES como propia. Su respeto por los recursos, los tiempos y la imagen institucional es ejemplar, actuando con "Mentalidad de Dueño". \n\nEste perfil comprende que la imagen personal y el cuidado de los activos son extensiones de la excelencia académica. Su comportamiento refuerza la cultura de respeto y profesionalismo en su entorno inmediato.`,
            accion: 'Participación como representante del área en eventos institucionales de alto perfil o comités de bienestar universitario.'
        },
        good: {
            arquetipo: 'Ciudadano Corporativo Responsable',
            analisis: () =>
                `Cumple adecuadamente con las normativas de convivencia y uso de recursos. Es un miembro funcional de la comunidad que no genera conflictos normativos. \n\nSe observa un respeto por la institución, aunque quizás desde una perspectiva de cumplimiento normativo más que de orgullo de pertenencia. El reto es elevar su sentido de pertenencia para que se convierta en un promotor activo de la marca institucional.`,
            accion: 'Involucramiento en voluntariados o iniciativas de sostenibilidad del campus para fortalecer el vínculo emocional con la institución.'
        },
        development: {
            arquetipo: 'Presencia Irregular',
            analisis: () =>
                `Se observan brechas en la autodisciplina básica (puntualidad, presentación, cuidado de equipos). Estas conductas, aunque puedan parecer menores, proyectan una imagen de desprolijidad que puede opacar sus competencias técnicas. \n\nEl evaluado necesita comprender que la forma es tan importante como el fondo en un entorno académico de excelencia.`,
            accion: 'Establecimiento de rutinas de control personal. Feedback directo sobre el impacto de la imagen personal en la percepción de profesionalismo.'
        }
    },
    trabajo_equipo: {
        anchorFailure: {
            arquetipo: 'Lobo Solitario (Potencial Disruptivo)',
            analisis: (anchor) =>
                `La dificultad crítica en "${anchor}" indica una barrera significativa para la colaboración. El perfil tiende a priorizar su agenda personal o su comodidad individual sobre las necesidades colectivas del equipo. \n\nEste comportamiento genera "Silos Operativos": el conocimiento se queda estancado en una persona y la ayuda no fluye. En momentos de crisis, este aislamiento se convierte en un punto de falla único para el departamento.`,
            accion: 'Asignación de objetivos grupales vinculantes (donde su éxito dependa 100% del éxito de un par). Dinámicas de integración obligatorias.'
        },
        excellence: {
            arquetipo: 'Catalizador de Sinergias',
            analisis: () =>
                `Inteligencia colaborativa superior. El evaluado no solo es un buen compañero, es un multiplicador de talento. Tiene la capacidad de detectar necesidades en otros antes de que sean expresadas y ofrece soporte sin descuidar sus propias funciones. \n\nSu actitud ante el disenso es constructiva: busca la "Tercera Alternativa" que beneficie al equipo, no tener la razón. Es el pegamento social que mantiene unido al departamento en momentos de alta presión.`,
            accion: 'Facilitador de sesiones de Team Building. Rol de "Buddy" o acompañante para la integración cultural de nuevos ingresos.'
        },
        good: {
            arquetipo: 'Colaborador Activo y Respetuoso',
            analisis: () =>
                `Se integra fluidamente a la dinámica del equipo. Aporta su cuota de trabajo y mantiene relaciones cordiales basadas en el respeto mutuo. \n\nEs un buen jugador de equipo, aunque su colaboración puede ser reactiva (ayuda cuando se le pide). El siguiente paso es desarrollar una empatía táctica más proactiva: anticiparse a los cuellos de botella del equipo y ofrecer soluciones antes de que el problema escale.`,
            accion: 'Fomentar el intercambio de conocimientos (Cross-training) con otros compañeros para aumentar la polivalencia del equipo.'
        },
        development: {
            arquetipo: 'Colaborador Selectivo',
            analisis: () =>
                `Su colaboración está condicionada a la afinidad personal o a la conveniencia. Le cuesta adaptarse a estilos de trabajo diversos o a personalidades que chocan con la suya. \n\nTiende a juzgar las ideas de otros prematuramente, lo que puede inhibir la participación de compañeros más introvertidos. Necesita trabajar en la tolerancia y en la valoración de la diversidad cognitiva como un activo, no como un obstáculo.`,
            accion: 'Rotación temporal en proyectos con personas con las que usualmente tiene menos interacción. Taller de "Estilos de Pensamiento" o DISC.'
        }
    },
    // --- NARRATIVAS NUEVAS CATEGORÍAS VAF ---
    liderazgo: {
        anchorFailure: { arquetipo: 'Liderazgo en Desarrollo', analisis: () => 'Fortalecer competencias de dirección.', accion: 'Capacitación en liderazgo.' },
        excellence: { arquetipo: 'Líder Transformacional', analisis: () => 'Capacidad superior de influir y guiar.', accion: 'Mentoring estratégico.' },
        good: { arquetipo: 'Líder Efectivo', analisis: () => 'Dirige equipos con claridad.', accion: 'Desarrollar visión a largo plazo.' },
        development: { arquetipo: 'Líder en Formación', analisis: () => 'Gestión de equipos en etapa temprana.', accion: 'Coaching de liderazgo.' }
    },
    requisitos: {
        anchorFailure: { arquetipo: 'Riesgo de Cumplimiento', analisis: () => 'Brechas en el cumplimiento de requisitos.', accion: 'Plan de acción correctiva.' },
        excellence: { arquetipo: 'Auditor de Requisitos', analisis: () => 'Cumplimiento impecable y sistemático.', accion: 'Liderar auditorías internas.' },
        good: { arquetipo: 'Cumplimiento Sólido', analisis: () => 'Adherencia adecuada a los requisitos.', accion: 'Optimización de procesos.' },
        development: { arquetipo: 'En Alineación', analisis: () => 'Requiere supervisión en requisitos.', accion: 'Refuerzo de normativas.' }
    },
    sgc: {
        anchorFailure: { arquetipo: 'Desalineado con Calidad', analisis: () => 'Brechas en el sistema de gestión.', accion: 'Capacitación SGC.' },
        excellence: { arquetipo: 'Campeón de Calidad', analisis: () => 'Promotor activo del SGC.', accion: 'Liderar mejoras del SGC.' },
        good: { arquetipo: 'Comprometido con Calidad', analisis: () => 'Aplica correctamente el SGC.', accion: 'Participar en auditorías.' },
        development: { arquetipo: 'Conociendo el SGC', analisis: () => 'Adopción temprana del sistema.', accion: 'Inducción SGC.' }
    },
    documental: {
        anchorFailure: { arquetipo: 'Desorden Documental', analisis: () => 'Riesgo en gestión de información.', accion: 'Organización inmediata.' },
        excellence: { arquetipo: 'Archivista Experto', analisis: () => 'Gestión documental impecable.', accion: 'Digitalización avanzada.' },
        good: { arquetipo: 'Organizado', analisis: () => 'Mantiene control documental.', accion: 'Mejorar indexación.' },
        development: { arquetipo: 'Organización Básica', analisis: () => 'Mejorar trazabilidad.', accion: 'Capacitación en archivo.' }
    },
    planeacion: {
        anchorFailure: { arquetipo: 'Reactivo', analisis: () => 'Falta de planificación estructurada.', accion: 'Taller de planeación.' },
        excellence: { arquetipo: 'Estratega', analisis: () => 'Visión y ejecución planificada.', accion: 'Planeación estratégica.' },
        good: { arquetipo: 'Planificador', analisis: () => 'Organiza sus tareas adecuadamente.', accion: 'Uso de herramientas de gestión.' },
        development: { arquetipo: 'Improvisador', analisis: () => 'Dependencia del día a día.', accion: 'Agenda estructurada.' }
    },
    mejora: {
        anchorFailure: { arquetipo: 'Estático', analisis: () => 'Resistencia al cambio.', accion: 'Sensibilización de mejora.' },
        excellence: { arquetipo: 'Innovador', analisis: () => 'Impulsor de mejora continua.', accion: 'Liderar proyectos de innovación.' },
        good: { arquetipo: 'Proactivo', analisis: () => 'Propone mejoras regularmente.', accion: 'Metodologías ágiles.' },
        development: { arquetipo: 'Adaptable', analisis: () => 'Se adapta a cambios propuestos.', accion: 'Participar en ideación.' }
    },
    // Default fallback
    default: {
        anchorFailure: {
            arquetipo: 'Perfil Tácticamente Vulnerable',
            analisis: (anchor) => `Desempeño comprometido por falencias en el pilar fundamental: "${anchor}". Se requiere estabilizar esta competencia base antes de avanzar.`,
            accion: 'Plan de recuperación de fundamentos.'
        },
        excellence: {
            arquetipo: 'Referente de Excelencia',
            analisis: () => 'Dominio total de la competencia con visión sistémica.',
            accion: 'Mentoring de pares.'
        },
        good: {
            arquetipo: 'Desempeño Sólido',
            analisis: () => 'Cumplimiento adecuado de expectativas con consistencia operativa.',
            accion: 'Retos de mayor complejidad.'
        },
        development: {
            arquetipo: 'En Formación',
            analisis: () => 'Competencias en etapa temprana de maduración.',
            accion: 'Supervisión cercana y capacitación.'
        }
    }
};

// --- 4. CLASE GENERADORA DE NARRATIVA ---

class NarrativeGenerator {
    static generate(categoryId: string, score: number, anchorFailed: boolean, anchorText: string = '') {
        // 1. Seleccionar la base de datos correcta (o default si no existe)
        const db = NARRATIVE_DB[categoryId] || NARRATIVE_DB['default'];

        let template: NarrativeTemplate;
        let nivelRiesgo: AnalysisResult['nivelRiesgo'];

        // 2. Lógica de Selección de Template
        if (anchorFailed) {
            template = db.anchorFailure;
            nivelRiesgo = 'Alto';
        } else if (score >= 4.7) {
            template = db.excellence;
            nivelRiesgo = 'Bajo';
        } else if (score >= 3.8) {
            template = db.good;
            nivelRiesgo = 'Bajo';
        } else if (score >= 3.0) {
            template = db.development;
            nivelRiesgo = 'Medio';
        } else {
            // Caso crítico genérico si baja de 3.0
            template = db.development;
            template.arquetipo = "Alerta de Desempeño Crítico";
            nivelRiesgo = 'Crítico';
        }

        // 3. Construcción del Objeto Final
        return {
            arquetipo: template.arquetipo,
            analisis: template.analisis(anchorText), // Inyección dinámica del texto de la pregunta
            accionSugerida: template.accion,
            nivelRiesgo
        };
    }
}

// --- 5. MOTOR PRINCIPAL (PRISMA BRAIN) ---

export class PrismaBrain {

    static analyze(categoryId: string, userAnswers: Record<string, number>): AnalysisResult {
        const config = PRISMA_KNOWLEDGE_BASE[categoryId];

        if (!config) {
            // Fallback seguro si la categoría no existe en la config
            return {
                category: categoryId,
                score: 0, rawScore: 0, maxPossibleScore: 5, percentage: 0,
                anchorFailed: false, arquetipo: 'Error', analisis: 'Categoría no configurada',
                accionSugerida: '-', nivelRiesgo: 'Bajo'
            };
        }

        let weightedSum = 0;
        let totalWeight = 0;
        let anchorFailed = false;
        let anchorQuestionText = '';

        // Helper for normalization
        const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // A. Cálculo Numérico
        config.questions.forEach((q) => {
            const qTextNorm = normalize(q.text);

            // Robust fuzzy match logic:
            // 1. Normalize both keys and query
            // 2. Check if key includes query OR query includes key (for partial matches)
            const matchedKey = Object.keys(userAnswers).find(k => {
                const kNorm = normalize(k);
                return kNorm.includes(qTextNorm) || qTextNorm.includes(kNorm);
            });

            const score = matchedKey ? userAnswers[matchedKey] : 0;

            weightedSum += score * q.weight;
            totalWeight += q.weight;

            // Detectar Ancla Rota (Umbral estricto: <= 3.0 en pregunta crítica)
            if (q.isAnchor && score <= 3.0) {
                anchorFailed = true;
                anchorQuestionText = q.text;
            }
        });

        const finalScore = totalWeight > 0 ? (weightedSum / totalWeight) : 0;
        const roundedScore = parseFloat(finalScore.toFixed(2));

        // B. Generación Narrativa (Delegada al Generador)
        const narrativa = NarrativeGenerator.generate(
            categoryId,
            roundedScore,
            anchorFailed,
            anchorQuestionText
        );

        return {
            category: config.name,
            score: roundedScore,
            rawScore: weightedSum,
            maxPossibleScore: 5.0,
            percentage: Math.round((roundedScore / 5) * 100),
            anchorFailed,
            anchorQuestionText: anchorFailed ? anchorQuestionText : undefined,
            ...narrativa
        };
    }

    static getCategories(): string[] {
        return Object.keys(PRISMA_KNOWLEDGE_BASE);
    }
}
