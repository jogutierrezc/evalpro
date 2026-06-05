// ─── Motor de Analítica SGC-VAF ───
// Arquitectura multidimensional con Índice de Desempeño Compuesto (IDC)
// Basado en 6 dimensiones y catálogo maestro de 155 recomendaciones

export type DimensionCode = 'DIM-SGC' | 'DIM-GDO' | 'DIM-PEE' | 'DIM-COM' | 'DIM-LID' | 'DIM-ETI';

export interface DimensionInfo {
  code: DimensionCode;
  name: string;
  weight: number;
  description: string;
}

export interface RecommendationCatalogItem {
  id: string;
  dimension: DimensionCode;
  triggerCondition: (value: number) => boolean;
  recommendation: string;
  action: string;
}

export interface DimensionScore {
  dimension: DimensionCode;
  score: number;
  count: number;
}

export interface AnalyticsResult {
  dimensionAverages: Record<DimensionCode, number>;
  dimensionCounts: Record<DimensionCode, number>;
  idc: number;
  gaps: {
    deltaAuto: number;
    status: string;
  };
  recommendations: (RecommendationCatalogItem & { currentScore: number })[];
  totalEvaluations: number;
}

// Interfaz para datos agregados de evaluación
export interface AggregatedEval {
  score: number;
  templateName: string;
  campus: string;
  office: string;
  evaluatedName: string;
  role: string;
  createdAt: string;
}

// 1. Pesos Algorítmicos de las 6 Dimensiones
export const DIMENSIONS: Record<DimensionCode, DimensionInfo> = {
  'DIM-SGC': {
    code: 'DIM-SGC',
    name: 'Cultura de Calidad y Procesos',
    weight: 0.25,
    description: 'Gestión de calidad, procesos, indicadores y mejora continua del SGC'
  },
  'DIM-PEE': {
    code: 'DIM-PEE',
    name: 'Planeación, Ejecución y Evidencia',
    weight: 0.20,
    description: 'Planeación estratégica, ejecución de actividades y gestión de evidencias'
  },
  'DIM-GDO': {
    code: 'DIM-GDO',
    name: 'Gestión Documental y Normativa',
    weight: 0.15,
    description: 'Gestión documental, cumplimiento normativo y archivo institucional'
  },
  'DIM-COM': {
    code: 'DIM-COM',
    name: 'Comunicación y Clima Laboral',
    weight: 0.15,
    description: 'Comunicación asertiva, clima organizacional y trabajo en equipo'
  },
  'DIM-LID': {
    code: 'DIM-LID',
    name: 'Liderazgo, Innovación y Valor',
    weight: 0.15,
    description: 'Liderazgo, innovación, gestión del cambio y valor agregado'
  },
  'DIM-ETI': {
    code: 'DIM-ETI',
    name: 'Ética, Integridad y Disciplina',
    weight: 0.10,
    description: 'Ética laboral, integridad, disciplina y responsabilidad'
  }
};

// 2. Catálogo Maestro de 155 Recomendaciones
export const RECOMMENDATION_CATALOG: Record<string, RecommendationCatalogItem> = {
  // ─── DIM-SGC: Cultura de Calidad y Procesos (1-26) ───
  'EVAF-1': { id: '1', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar infografías visuales del mapa de procesos del subproceso en el escritorio del colaborador.', action: 'Ejecutar taller técnico de socialización de fichas de indicadores con evaluación obligatoria de apropiación.' },
  'EVAF-2': { id: '2', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Estructurar una matriz resumida de necesidades y expectativas del cliente por cada puesto de trabajo.', action: 'Levantar acta de revisión conjunta de la caracterización del proceso con enfoque en el usuario final.' },
  'EVAF-3': { id: '3', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Vincular las metas individuales diarias con la matriz de objetivos de calidad del macroproceso.', action: 'Implementar reuniones quincenales operativas para revisar el avance ponderado de las metas de calidad.' },
  'EVAF-4': { id: '4', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Desarrollar un mapa interactivo que conecte las funciones del cargo con el Plan de Desarrollo Institucional.', action: 'Realizar una sesión grupal de inducción sobre el impacto del rol específico en la acreditación institucional.' },
  'EVAF-5': { id: '5', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Habilitar un buzón digital ágil de ideas de cambio y optimización de servicios en la intranet.', action: 'Establecer un canal formal de reporte mensual de necesidades de ajuste procedimental al líder de área.' },
  'EVAF-6': { id: '6', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Crear capacitaciones rápidas en microlearning para asimilar los cambios aprobados en los subprocesos.', action: 'Desplegar un plan piloto de adopción inmediata de las nuevas directrices procedimentales validadas.' },
  'EVAF-8': { id: '7', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar listas de chequeo digitales previas a la entrega formal del servicio educativo o administrativo.', action: 'Institucionalizar el control de "Cero Errores" mediante firmas de conformidad cruzadas entre pares técnicos.' },
  'EVAF-13': { id: '8', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Sintetizar el protocolo de atención al usuario centrado en la resolución efectiva en el primer contacto.', action: 'Aplicar auditorías fantasma (mystery shopper) para verificar el cumplimiento real de expectativas del usuario.' },
  'EVAF-14': { id: '9', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Flexibilizar los horarios de formación del SGC mediante cápsulas autogestionables en plataforma Moodle.', action: 'Generar alertas automáticas desde Talento Humano cuando un colaborador registre inasistencia a dos cursos.' },
  'EVAF-16': { id: '10', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Disponer resúmenes analíticos de los flujogramas de operación en los paneles de corcho de cada oficina.', action: 'Efectuar una evaluación técnica bimensual sobre el nivel de dominio operacional de los procedimientos vigentes.' },
  'EVAF-17': { id: '11', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Integrar al colaborador en los círculos de análisis de causas raíz (diagramas de Ishikawa) del área.', action: 'Asignar responsabilidades específicas con cronograma y entregables para el cierre de planes de mejora abiertos.' },
  'EVAF-18': { id: '12', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Desarrollar una guía gráfica interactiva para identificar cuándo un servicio se desvía.', action: 'Implementar el registro inmediato en el software de toda alerta temprana de falla potencial.' },
  'EVAF-19': { id: '13', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Promover una cultura de seguridad psicológica donde el error reportado a tiempo sea insumo de mejora continua.', action: 'Firmar compromisos individuales de subsanación de errores operacionales con planes de contingencia claros.' },
  'EVAF-20': { id: '14', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Rediseñar los manuales de calidad institucionales haciéndolos dinámicos, lúdicos y enfocados al valor práctico.', action: 'Desarrollar mesas redondas breves donde los técnicos expongan los beneficios operacionales del cumplimiento del SGC.' },
  'EVAF-32': { id: '15', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Insertar compuertas de validación digital automáticas en los flujos de trabajo antes de la salida del servicio.', action: 'Establecer la verificación por un tercero para procesos críticos de emisión de actas o certificados.' },
  'EVAF-33': { id: '16', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Automatizar alertas semafóricas que recuerden al personal los eventos tipificados como salidas no conformes.', action: 'Realizar un taller práctico de parametrización y lectura correcta de la Matriz de Salidas No Conformes del área.' },
  'EVAF-34': { id: '17', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Simplificar la interfaz de reporte y proveer manuales rápidos de uso del módulo de producto no conforme.', action: 'Cargar en KAWAK un mínimo de dos reportes reales o simulados para entrenar la agilidad de registro del personal.' },
  'EVAF-35': { id: '18', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Brindar herramientas estadísticas básicas para que el colaborador aprenda a medir la eficacia de sus acciones.', action: 'Auditar los cierres de planes de acción verificando el comportamiento del indicador de impacto en el tiempo.' },
  'EVAF-36': { id: '19', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Fomentar el pensamiento basado en riesgos en las labores del día a día mediante talleres de micro-análisis.', action: 'Actualizar de forma participativa la matriz de riesgos institucionales AMFE con el aporte directo del equipo.' },
  'EVAF-37': { id: '20', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Establecer incentivos no pecuniarios a las mejores propuestas de optimización de procesos del SGC presentadas.', action: 'Formalizar la apertura de proyectos específicos de mejora derivados de las sugerencias del personal operativo.' },
  'LVAF-9': { id: '21', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Capacitar al líder en metodologías avanzadas de gestión de riesgos organizacionales (ISO 31000).', action: 'Llevar a cabo la revisión trimestral obligatoria de la efectividad de los controles de riesgos del proceso.' },
  'LVAF-10': { id: '22', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Proveer un tablero integral de control que consolide el avance de todas las metas del SGC del líder.', action: 'Sustentar ante la alta dirección los resultados cuantitativos de la eficacia de los planes preventivos del área.' },
  'LVAF-12': { id: '23', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Configurar notificaciones push para recordar los periodos de cargue y análisis de datos de los indicadores.', action: 'Efectuar comités de calidad mensuales para analizar las desviaciones críticas de los indicadores rezagados.' },
  'LVAF-13': { id: '24', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Suministrar plantillas metodológicas estructuradas para el análisis de causas mediante los "5 Porqués".', action: 'Subsanar los hallazgos normativos pendientes de auditorías previas antes del vencimiento de los plazos legales.' },
  'LVAF-19': { id: '25', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar planes preventivos de pre-auditoría interna para blindar los procesos antes de la evaluación real.', action: 'Implementar un plan de choque correctivo inmediato si la calificación de la auditoría interna desciende del 90%.' },
  'LVAF-43': { id: '26', dimension: 'DIM-SGC', triggerCondition: (v) => v <= 3.0, recommendation: 'Asignar mentores especializados en calidad para guiar a los líderes en el diseño de planes de acción robustos.', action: 'Reestructurar la planeación operativa de los planes que muestren rezagos o ineficacia en las auditorías de seguimiento.' },

  // ─── DIM-GDO: Gestión Documental y Normativa (27-52) ───
  'EVAF-9': { id: '27', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.5, recommendation: 'Crear un formulario ágil para proponer cambios documentales sin necesidad de trámites complejos.', action: 'Actualizar el manual de funciones y los procedimientos asociados apenas se valide una mejora en el servicio.' },
  'EVAF-10': { id: '28', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.5, recommendation: 'Estructurar carpetas digitales estandarizadas con nomenclatura homogénea para el almacenamiento seguro.', action: 'Realizar un inventario digital exhaustivo de los registros físicos del mes y asegurar su correcto archivo.' },
  'EVAF-22': { id: '29', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.5, recommendation: 'Diseñar infografías explicativas sobre las Tablas de Retención Documental aplicables a cada puesto.', action: 'Ejecutar una jornada intensiva de depuración y archivo de documentos inactivos siguiendo las TRD vigentes.' },
  'EVAF-23': { id: '30', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.5, recommendation: 'Establecer como marcador por defecto en los navegadores el acceso directo al módulo de documentos de KAWAK.', action: 'Eliminar de los discos locales todos los formatos descargados con anterioridad.' },
  'EVAF-24': { id: '31', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.5, recommendation: 'Implementar un boletín interactivo que resuma los cambios legales y normativos que afectan a la universidad.', action: 'Publicar un compendio normativo actualizado y accesible en el micrositio oficial del proceso institucional.' },
  'EVAF-25': { id: '32', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.5, recommendation: 'Establecer un canal directo para debatir los informes de auditoría documental emitidos por los jefes directos.', action: 'Diseñar un plan de acción específico con el equipo para subsanar los errores recurrentes detectados en el archivo.' },
  'EVAF-26': { id: '33', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.5, recommendation: 'Proveer asistencia técnica personalizada en el puesto de trabajo para el correcto rotulado físico de carpetas.', action: 'Verificar mediante inspecciones flash semanales que el 100% del equipo aplique las normas de gestión documental.' },
  'EVAF-27': { id: '34', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.5, recommendation: 'Habilitar canales alternativos como resúmenes semanales en video sobre cambios en el SGC.', action: 'Socializar en las reuniones de inicio de semana los cambios documentales reportados por el sistema de calidad.' },
  'LVAF-25': { id: '35', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Asignar un rol de facilitador documental dentro del equipo para canalizar dudas normativas de primer nivel.', action: 'Evaluar formalmente la adherencia del equipo a las directrices de comunicaciones oficiales emitidas por rectoría.' },
  'LVAF-26': { id: '36', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Automatizar alertas tempranas que recuerden al líder el vencimiento próximo de sus documentos.', action: 'Tramitar ante la oficina de calidad la revisión de los procedimientos del área con más de dos años sin cambios.' },
  'LVAF-27': { id: '37', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Configurar un script automático que alerte al líder cuando se detecte un formato desactualizado en uso.', action: 'Retirar de circulación inmediata cualquier plantilla física u operativa obsoleta.' },
  'LVAF-28': { id: '38', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Incentivar espacios de co-creación procedimental entre líderes para optimizar los flujos transversales.', action: 'Presentar formalmente al comité de gestión documental dos propuestas de simplificación de trámites burocráticos.' },
  'LVAF-29': { id: '39', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Implementar software de indexación automática para agilizar las búsquedas en los repositorios digitales del área.', action: 'Efectuar pruebas semestrales de recuperación de archivos históricos para validar la efectividad de la conservación.' },
  'LVAF-30': { id: '40', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Migrar los archivos críticos compartidos a nubes institucionales con accesos restringidos por roles de seguridad.', action: 'Establecer un cronograma obligatorio de copias de seguridad de los servidores locales y bases de datos del proceso.' },
  'LVAF-38': { id: '41', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Integrar la revisión documental como un hito fijo dentro del plan operativo anual de la oficina.', action: 'Garantizar que todos los manuales de procedimientos del proceso estén listados para actualización en la planeación.' },
  'LGEN-11': { id: '42', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Desarrollar un glosario dinámico con los objetivos estratégicos institucionales explicados de forma sencilla.', action: 'Dictar una cátedra interna obligatoria sobre los lineamientos del Proyecto Educativo Institucional (PEI) al equipo.' },
  'LGEN-21': { id: '43', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar manuales de uso correcto de la infraestructura y activos tecnológicos asignados a la dependencia.', action: 'Registrar formalmente los inventarios físicos anuales y reportar de inmediato los equipos en estado de obsolescencia.' },
  'AUTO-11': { id: '44', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Proveer plantillas preconfiguradas que vinculen cada tarea con las metas de calidad institucionales.', action: 'Ajustar los planes individuales de trabajo asegurando el alineamiento con el Plan de Desarrollo Institucional.' },
  'AUTO-24': { id: '45', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Desarrollar una autoevaluación interactiva mensual tipo quiz sobre el conocimiento de procesos internos.', action: 'Realizar clínicas operativas de corrección de procesos donde los colaboradores verifiquen su apego a la norma escrita.' },
  'OPER-2': { id: '46', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Suministrar cartillas ilustradas que traduzcan los reglamentos de trabajo a conductas operativas sencillas.', action: 'Sancionar pedagógicamente el incumplimiento de protocolos operativos definidos en los manuales de funciones.' },
  'OPER-4': { id: '47', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Dictar pautas estrictas sobre la Ley de Protección de Datos Personales en el entorno universitario.', action: 'Firmar acuerdos de confidencialidad de datos antes de otorgar credenciales de acceso a los sistemas.' },
  'OPER-12': { id: '48', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar dinámicas lúdicas grupales para repasar las políticas éticas y operacionales de la institución.', action: 'Incluir el nivel de conocimiento normativo básico como criterio en la evaluación de desempeño.' },
  'OPER-13': { id: '49', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Asignar un kit de mantenimiento preventivo básico para los equipos tecnológicos del puesto.', action: 'Inspeccionar trimestralmente el estado físico de los activos y herramientas de trabajo asignadas a los colaboradores.' },
  'LEQ-11': { id: '50', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Implementar tutoriales en video sobre la ruta correcta de consulta documental.', action: 'Supervisar que los entregables presentados sigan la codificación oficial del manual de identidad de calidad.' },
  'LEQ-21': { id: '51', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Promover el reporte proactivo de fallas técnicas antes de que afecten la continuidad operacional.', action: 'Programar mantenimientos de hardware preventivos anuales gestionados por la oficina de sistemas.' },
  'LGEN-11B': { id: '52', dimension: 'DIM-GDO', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar guías ágiles que muestren la relación del quehacer diario con los principios rectores de la universidad.', action: 'Ejecutar un conversatorio anual para evaluar cómo las decisiones del proceso impactan los pilares de docencia e investigación.' },

  // ─── DIM-PEE: Planeación, Ejecución y Evidencia (53-78) ───
  'EVAF-29': { id: '53', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Suministrar plantillas digitales de diagramas de Gantt interactivas para el control diario de hitos operativos.', action: 'Establecer revisiones de avance de la planeación anual los viernes en la tarde para ajustar desviaciones.' },
  'EVAF-30': { id: '54', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Establecer un banco de modelos tipo con el estándar de calidad requerido para cada entregable.', action: 'Auditar aleatoriamente las evidencias cargadas en los repositorios para verificar vigencia.' },
  'EVAF-31': { id: '55', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Capacitar al personal en metodologías de productividad personal como Matriz de Eisenhower o Pomodoro.', action: 'Implementar un tablero Kanban físico o digital para visibilizar la carga laboral interna del equipo.' },
  'LVAF-1': { id: '56', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Entrenar al líder en la técnica de delegación efectiva basada en niveles de madurez del colaborador.', action: 'Definir por escrito las metas individuales del trimestre alineadas con la planeación anual de la oficina.' },
  'LVAF-31': { id: '57', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Proveer flujos de procesos claros donde se detallen los requisitos legales para habilitar cada servicio.', action: 'Diseñar la planeación detallada del semestre con asignación de recursos presupuestales y logísticos.' },
  'LVAF-32': { id: '58', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar alertas tempranas automáticas ante retrasos detectados en el cronograma consolidado de actividades.', action: 'Desplegar un plan de contingencia operativo con asignación de personal de refuerzo.' },
  'LVAF-33': { id: '59', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Facilitar plantillas conceptuales para la medición del impacto real de los proyectos ejecutados.', action: 'Establecer indicadores de resultado finales que midan la satisfacción del usuario tras la atención.' },
  'LVAF-34': { id: '60', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Configurar tableros gerenciales automatizados en PowerBI que consoliden el avance real de metas.', action: 'Institucionalizar comités técnicos mensuales de revisión y rendición de cuentas operativas de cada líder.' },
  'LVAF-35': { id: '61', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Establecer una fecha límite inamovible en el calendario para el cargue de la planeación anual en KAWAK.', action: 'Bloquear agendas del equipo para dedicación exclusiva al cargue de la planeación bajo supervisión del jefe.' },
  'LVAF-36': { id: '62', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar plantillas ágiles para minutas de reuniones semanales de seguimiento.', action: 'Implementar reuniones individuales breves quincenales para revisar el estatus del plan asignado a cada colaborador.' },
  'LVAF-39': { id: '63', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Suministrar metodologías de resolución rápida de problemas complejos para equipos técnicos.', action: 'Ajustar los cronogramas oficiales del proceso mediante actas formales de re-planeación aprobadas por calidad.' },
  'LGEN-6': { id: '64', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar un banco de plantillas de planes de trabajo estándar por cada tipología de proyecto del área.', action: 'Exigir la radicación del plan detallado de actividades antes de otorgar el aval presupuestal.' },
  'LGEN-7': { id: '65', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Establecer un manual de estándares mínimos de calidad técnica para los informes de gestión.', action: 'Devolver los reportes entregados que no cumplan con el estándar técnico exigido.' },
  'LGEN-8': { id: '66', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Capacitar a los mandos medios en técnicas avanzadas de gerencia de proyectos basada en OKR.', action: 'Auditar el uso eficiente del tiempo y recursos asignados para corregir desviaciones operacionales.' },
  'LGEN-22': { id: '67', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Proveer algoritmos interactivos que asistan al líder en la redacción técnica de objetivos SMART.', action: 'Reformular las metas del área que sean ambiguas o difíciles de medir cuantitativamente.' },
  'LGEN-23': { id: '68', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar tableros visuales que muestren las cuatro fases del ciclo PHVA en cada tarea.', action: 'Ejecutar auditorías operacionales semestrales enfocadas en evaluar el cierre real del ciclo de mejora.' },
  'AUTO-5': { id: '69', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Insertar recordatorios diarios automáticos para la planeación del día siguiente.', action: 'Revisar de forma obligatoria la agenda de trabajo diaria del analista para garantizar un orden lógico.' },
  'AUTO-6': { id: '70', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar un checklist de autocontrol de calidad para revisar el trabajo antes de radicarlo.', action: 'Aplicar un modelo de revisión por pares internos antes de la entrega final del producto administrativo.' },
  'AUTO-26': { id: '71', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Brindar herramientas metodológicas para el autoanálisis del rendimiento de las funciones individuales.', action: 'Monitorear el cumplimiento individual del plan de trabajo mensual mediante indicadores de efectividad personal.' },
  'LEQ-6': { id: '72', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Sugerir el uso de herramientas integradas en el ecosistema institucional para el control de tareas.', action: 'Supervisar los lunes el plan de acción estructurado por el colaborador para el mes.' },
  'LEQ-7': { id: '73', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Establecer rúbricas de evaluación explícitas para calificar los productos técnicos construidos.', action: 'Retroalimentar por escrito cuando un informe carezca del nivel analítico y rigor metodológico exigido.' },
  'LEQ-8': { id: '74', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Ofrecer consultoría interna en optimización de procesos para aliviar cuellos de botella.', action: 'Monitorear el presupuesto ejecutado frente al programado, exigiendo explicaciones ante desvíos >10%.' },
  'LEQ-22': { id: '75', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Fomentar que el colaborador diseñe sus propios indicadores de efectividad.', action: 'Aprobar mediante firma conjunta las metas individuales que regirán el desempeño del analista durante el año.' },
  'LEQ-23': { id: '76', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Proveer talleres interactivos sobre la aplicación práctica de la mejora continua.', action: 'Evaluar la capacidad del colaborador para reformular actividades fallidas basándose en experiencia previa.' },
  'OPER-10': { id: '77', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar cronogramas detallados de rutinas diarias obligatorias para ordenar las tareas operativas.', action: 'Supervisar los tiempos de inicio y cierre de labores para mitigar la pérdida deliberada de tiempo.' },
  'OPER-16': { id: '78', dimension: 'DIM-PEE', triggerCondition: (v) => v <= 3.0, recommendation: 'Definir alarmas visuales sencillas para alertar sobre plazos de vencimiento de tareas básicas.', action: 'Medir semanalmente la tasa de oportunidad y efectividad en la entrega de asignaciones operativas.' },

  // ─── DIM-COM: Comunicación y Clima Laboral (79-104) ───
  'EVAF-7': { id: '79', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Brindar talleres prácticos de regulación emocional, comunicación no violenta y empatía.', action: 'Intervenir de forma inmediata mediante mediación interna cuando se reporten conductas hostiles.' },
  'EVAF-11': { id: '80', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar guías rápidas con los guiones telefónicos y de atención virtual oficiales.', action: 'Evaluar la satisfacción del usuario mediante encuestas rápidas inmediatamente después del servicio.' },
  'EVAF-12': { id: '81', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Capacitar al personal en técnicas de redacción corporativa asertiva.', action: 'Auditar los tiempos de respuesta de correos, penalizando retrasos injustificados de más de 48 horas.' },
  'LVAF-2': { id: '82', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Implementar canales formales de comunicación bidireccional entre líderes y base operativa.', action: 'Institucionalizar una reunión mensual de puertas abiertas para escuchar inquietudes del equipo.' },
  'LVAF-7': { id: '83', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar metodologías ágiles para pausas activas grupales enfocadas en integración interpersonal.', action: 'Agendar trimestralmente una jornada de integración laboral cofinanciada por bienestar.' },
  'LGEN-1': { id: '84', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Entrenar a los líderes en metodologías de feedback constructivo.', action: 'Revisar el tono y la asertividad de los comunicados oficiales emitidos por las jefaturas.' },
  'LGEN-5': { id: '85', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Desplegar campañas institucionales sobre acoso laboral, respeto mutuo y equidad de género.', action: 'Activar los protocolos del Comité de Convivencia Laboral ante quejas de tratos irrespetuosos.' },
  'LGEN-15': { id: '86', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Capacitar en seguridad de la información corporativa y manejo ético de expedientes.', action: 'Aplicar sanciones disciplinarias ante la fuga comprobada de datos confidenciales.' },
  'LGEN-16': { id: '87', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar dinámicas de Team Building guiadas por psicólogos organizacionales.', action: 'Establecer proyectos transversales que fuercen la colaboración entre diferentes subprocesos.' },
  'LGEN-17': { id: '88', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar un indicador de clima laboral por oficina visible en tableros gerenciales.', action: 'Diseñar un plan de intervención psicosocial en áreas con bajos índices de satisfacción laboral.' },
  'LGEN-20': { id: '89', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Implementar metodologías participativas de diseño de procesos (Design Thinking).', action: 'Demostrar la inclusión de ideas del equipo mediante actas con aportes validados de los analistas.' },
  'LGEN-24': { id: '90', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar resúmenes ejecutivos visuales de los objetivos estratégicos para cada colaborador.', action: 'Realizar una sesión de validación grupal para verificar que el equipo entendió sus metas anuales.' },
  'AUTO-1': { id: '91', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Suministrar herramientas cognitivas para la reflexión antes de responder a conflictos.', action: 'Monitorear mediante feedback de 360° la evolución de habilidades relacionales.' },
  'AUTO-15': { id: '92', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Dictar talleres de negociación avanzada y manejo de objeciones interpersonales.', action: 'Implementar círculos de diálogo restaurativo para solucionar controversias internas.' },
  'AUTO-16': { id: '93', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar un protocolo de cooperación mutua para contingencias operativas.', action: 'Reconocer públicamente al personal que apoye proactivamente a otras dependencias.' },
  'AUTO-17': { id: '94', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Implementar evaluaciones de estilo de personalidad para fomentar tolerancia a la diversidad.', action: 'Rotar temporalmente de funciones a colaboradores para ampliar su empatía y flexibilidad.' },
  'AUTO-18': { id: '95', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Establecer reglas de moderación respetuosa para debates técnicos internos.', action: 'Llamar al orden a todo colaborador que descalifique destructivamente los aportes de un par.' },
  'AUTO-19': { id: '96', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Establecer estándares de validación de datos antes de emitir informes al exterior.', action: 'Corregir las comunicaciones con imprecisiones o datos no confirmados.' },
  'AUTO-20': { id: '97', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Desarrollar píldoras formativas sobre prudencia verbal en entornos corporativos.', action: 'Establecer planes de coaching relacional para perfiles impulsivos.' },
  'AUTO-21': { id: '98', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Suministrar plantillas estructurales para agilizar el diseño de informes ejecutivos.', action: 'Evaluar la claridad comunicativa mediante encuestas de clientes internos del área.' },
  'AUTO-23': { id: '99', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Publicar el Manual de Netiqueta, Protocolo y Comunicación Virtual de la Universidad.', action: 'Exigir el uso del correo corporativo y firma oficial en todas las comunicaciones digitales.' },
  'LEQ-1': { id: '100', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Entrenar al personal técnico en competencias blandas avanzadas y escucha activa.', action: 'Evaluar el tacto y asertividad mediante encuestas de clima interno entre compañeros.' },
  'LEQ-5': { id: '101', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Fomentar ambientes de cordialidad con recordatorios sobre el valor del respeto.', action: 'Separar de atención directa a colaboradores con quejas reiteradas por mal trato.' },
  'LEQ-15': { id: '102', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Restringir accesos digitales a documentos sensibles mediante contraseñas dinámicas.', action: 'Iniciar procesos disciplinarios ante violaciones al deber de reserva institucional.' },
  'OPER-5': { id: '103', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Proveer entrenamiento en servicio al cliente y comunicación telefónica asertiva.', action: 'Monitorear el trato verbal del personal de apoyo mediante supervisiones aleatorias in situ.' },
  'OPER-7': { id: '104', dimension: 'DIM-COM', triggerCondition: (v) => v <= 3.0, recommendation: 'Suministrar canales seguros y anónimos para sugerencias de mejora laboral.', action: 'Atender personalmente al trabajador para resolver discrepancias antes de que generen roces.' },

  // ─── DIM-LID: Liderazgo, Innovación y Valor Agregado (105-130) ───
  'EVAF-15': { id: '105', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Suministrar marcos de innovación ágil para el rediseño de servicios educativos.', action: 'Implementar un proyecto piloto anual de mejora con valor agregado medible.' },
  'EVAF-28': { id: '106', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Promover el uso de herramientas de automatización de tareas sencillas.', action: 'Presentar una propuesta para la reducción de tiempos de ciclo de trámites.' },
  'EVAF-38': { id: '107', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Brindar talleres de resiliencia ante el cambio y gestión de la incertidumbre laboral.', action: 'Desarrollar sesiones de análisis de lecciones aprendidas tras adopción de nuevas plataformas.' },
  'EVAF-39': { id: '108', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar planes de gestión del cambio estructurados para nuevas directrices del SGC.', action: 'Ejecutar los planes de transición operativa fijados por la oficina de planeación.' },
  'LVAF-3': { id: '109', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Facilitar procesos de coaching ejecutivo centrados en liderar con el ejemplo.', action: 'Sustentar trimestralmente el avance de las metas estratégicas asignadas a su dependencia.' },
  'LVAF-4': { id: '110', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar campañas que resalten historias de éxito de atención excepcional.', action: 'Evaluar el alineamiento del proceso con estándares nacionales de servicio al cliente universitario.' },
  'LVAF-5': { id: '111', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Centralizar el acceso a herramientas de comunicación del SGC en un solo portal.', action: 'Exigir la lectura y discusión de los boletines del SGC en los comités internos de área.' },
  'LVAF-6': { id: '112', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Financiar laboratorios internos de innovación para proponer disrupciones procedimentales.', action: 'Programar un comité creativo mensual para idear mejoras a cuellos de botella del subproceso.' },
  'LVAF-8': { id: '113', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Capacitar a los jefes en formulación de planes de desarrollo concertados individuales.', action: 'Firmar Acta de Compromiso de Mejora con colaboradores de desempeño inferior al mínimo.' },
  'LVAF-11': { id: '114', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Suministrar consultoría en transformación digital de servicios educativos.', action: 'Reemplazar un trámite físico por una solución automatizada que reduzca la presencialidad.' },
  'LVAF-14': { id: '115', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Automatizar el procesamiento estadístico de encuestas de percepción externa.', action: 'Diseñar un plan de contingencia ante caídas drásticas en índices de satisfacción externa.' },
  'LVAF-15': { id: '116', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Entrenar a directivos en metodologías de gestión del cambio organizacional.', action: 'Redactar la matriz de impacto del cambio ante reestructuraciones institucionales.' },
  'LVAF-16': { id: '117', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Implementar metodologías de análisis causa-raíz ante eventos adversos.', action: 'Modificar los controles operativos fallidos que permitieron la queja ciudadana.' },
  'LVAF-24': { id: '118', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Brindar incentivos de formación directiva a líderes que destaquen por innovación.', action: 'Presentar un proyecto de modernización del área ante el Consejo Superior Universitario.' },
  'LGEN-4': { id: '119', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Fomentar liderazgo basado en humildad ontológica y responsabilidad compartida.', action: 'Asumir públicamente las fallas del proceso ante los usuarios afectados.' },
  'LGEN-12': { id: '120', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Financiar la actualización de líderes en tendencias globales de educación superior.', action: 'Evaluar la idoneidad técnica del directivo frente a requisitos del manual de cargos.' },
  'LGEN-18': { id: '121', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Estructurar una mesa de ayuda para recepción y trámite de sugerencias del entorno.', action: 'Evidenciar mediante respuestas formales la atención al 100% de recomendaciones recibidas.' },
  'LGEN-19': { id: '122', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Diseñar un programa de incentivos emocionales y reconocimiento al desempeño excelente.', action: 'Institucionalizar la mención de honor al colaborador del año de la Dirección de Calidad.' },
  'LGEN-25': { id: '123', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Promover auditorías externas periódicas de métodos y tiempos del proceso gerencial.', action: 'Reestructurar flujos de decisión que ralenticen la prestación del servicio universitario.' },
  'LGEN-27': { id: '124', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Suministrar software de evaluación de desempeño basado en evidencias cuantitativas.', action: 'Fijar mesas de revisión con personal rezagado para corregir brechas antes de la evaluación final.' },
  'AUTO-25': { id: '125', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Entrenar al colaborador en pensamiento creativo lateral para soluciones innovadoras.', action: 'Sustituir estrategias fallidas por nuevos canales que garanticen el impacto institucional.' },
  'AUTO-27': { id: '126', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Proveer plantillas de matrices de alertas tempranas operativas para uso diario.', action: 'Cargar en el sistema el mapa de riesgos operacionales avistados en el quehacer cotidiano.' },
  'AUTO-28': { id: '127', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Incentivar ponencias internas de mejora basadas en mejores prácticas de otras universidades.', action: 'Formular un proyecto de optimización del tiempo de radicación documental.' },
  'LEQ-17': { id: '128', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Establecer tiempo laboral libre dedicado a investigación y desarrollo de mejoras.', action: 'Asignar al colaborador la responsabilidad de liderar la solución de una problemática del área.' },
  'OPER-8': { id: '129', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Brindar charlas motivacionales sobre el valor del crecimiento personal.', action: 'Mantener reuniones individuales de seguimiento conductual.' },
  'OPER-14': { id: '130', dimension: 'DIM-LID', triggerCondition: (v) => v <= 3.0, recommendation: 'Habilitar canales de mensajería institucional para reporte de daños o novedades.', action: 'Establecer la obligación de informar imprevistos técnicos dentro de las primeras 2 horas.' },

  // ─── DIM-ETI: Ética, Integridad y Disciplina (131-155) ───
  'LVAF-17': { id: '131', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Diseñar planes de bienestar articulados con Talento Humano.', action: 'Garantizar la asistencia del 100% del personal a capacitaciones del plan de desarrollo.' },
  'LVAF-21': { id: '132', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Disponer listas de verificación legales para blindar procesos contra demandas.', action: 'Sustentar ante la oficina jurídica el cumplimiento de normativas en contratos del área.' },
  'LVAF-22': { id: '133', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Desarrollar un código ético de comportamiento directivo obligatorio.', action: 'Asumir formalmente las consecuencias de errores u omisiones en la dependencia.' },
  'LVAF-23': { id: '134', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Facilitar diplomados en alta gerencia de la calidad y acreditación universitaria.', action: 'Registrar la asistencia y certificación del líder en el curso anual del SGC.' },
  'LGEN-2': { id: '135', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Publicar cartillas sobre dilemas éticos en la gestión universitaria.', action: 'Evaluar la coherencia ética del directivo mediante auditorías de gestión contractual.' },
  'LGEN-3': { id: '136', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Implementar portales de datos abiertos institucionales.', action: 'Rendir cuentas semestralmente ante la comunidad sobre uso de recursos.' },
  'LGEN-10': { id: '137', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Automatizar sistemas de apagado para reducir la huella de carbono.', action: 'Fijar metas de reducción del 15% en uso de papel mediante flujos digitales en KAWAK.' },
  'LGEN-13': { id: '138', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Diseñar sistemas de control de asistencia a eventos institucionales.', action: 'Ajustar turnos para garantizar participación masiva en actividades de acreditación.' },
  'LGEN-14': { id: '139', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Establecer control biométrico digital de accesos.', action: 'Amonestar al personal que incumpla con códigos de vestimenta institucionales.' },
  'LGEN-26': { id: '140', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Diseñar planes de contingencia para semanas de matrículas sin traumatismo.', action: 'Reasignar cargas laborales durante épocas de alta demanda.' },
  'AUTO-2': { id: '141', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Suministrar módulos sobre ética pública y derecho administrativo básico.', action: 'Monitorear el apego al reglamento interno mediante evaluaciones de seguimiento.' },
  'AUTO-3': { id: '142', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Desarrollar sesiones de retroalimentación para modelar la madurez ante la crítica.', action: 'Firmar acuerdos de mejora conductual ante actitudes desafiantes.' },
  'AUTO-4': { id: '143', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Fomentar la cultura de honestidad eliminando castigos desproporcionados.', action: 'Subsanar el error procedimental en coordinación con el jefe directo.' },
  'AUTO-8': { id: '144', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Definir mesas quincenales de alineación de expectativas operativas.', action: 'Establecer indicadores mensuales de cumplimiento de tareas individuales.' },
  'AUTO-9': { id: '145', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Configurar alarmas para iniciar y cerrar labores puntualmente.', action: 'Descontar del salario periodos no laborados sin justificación.' },
  'AUTO-10': { id: '146', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Configurar firmas con recordatorios ecológicos y limitar impresión.', action: 'Monitorear el consumo mensual de suministros por puesto de trabajo.' },
  'AUTO-12': { id: '147', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Divulgar el código de vestuario mediante manuales fotográficos.', action: 'Restringir acceso a instalaciones sin dotación oficial reglamentaria.' },
  'AUTO-13': { id: '148', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Brindar capacitación en seguridad informática y custodia de contraseñas.', action: 'Revocar accesos digitales si se evidencia negligencia en su uso.' },
  'AUTO-14': { id: '149', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Insertar convocatorias automáticas para jornadas de capacitación.', action: 'Reportar a talento humano las inasistencias injustificadas a formación.' },
  'LEQ-2': { id: '150', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Suministrar asesoría sobre interpretación de estatutos universitarios.', action: 'Evaluar la legalidad técnica de conceptos emitidos por los analistas.' },
  'LEQ-3': { id: '151', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Promover bitácoras de gestión públicas para registrar avance de trámites.', action: 'Iniciar investigaciones ante indicios de actuaciones administrativas dudosas.' },
  'LEQ-14': { id: '152', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Implementar sistemas de reporte de ausentismos integrados con Talento Humano.', action: 'Exigir justificación escrita de retardos o salidas tempranas.' },
  'OPER-1': { id: '153', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Establecer control de vales firmados para retiro de materiales.', action: 'Realizar arqueos sorpresivos de inventarios físicos custodiados.' },
  'OPER-3': { id: '154', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Dictar pautas sobre comportamiento ético dentro y fuera de la universidad.', action: 'Sancionar conductas que empañen la reputación de la comunidad universitaria.' },
  'OPER-11': { id: '155', dimension: 'DIM-ETI', triggerCondition: (v) => v <= 3.5, recommendation: 'Garantizar la entrega oportuna de uniformes y elementos de dotación.', action: 'Prohibir labores de riesgo si el trabajador se rehúsa a usar uniforme oficial.' }
};

// 3. Catálogo de Recomendaciones Positivas (para puntajes 4.0-4.5 y >4.5)
export const POSITIVE_RECOMMENDATIONS: Record<string, RecommendationCatalogItem> = {
  // Consolidación para 4.0-4.5
  'POS-SGC-1': { id: 'P1', dimension: 'DIM-SGC', triggerCondition: (v) => v >= 4.0 && v <= 4.5, recommendation: 'Consolidar las buenas prácticas de calidad documentando los procedimientos exitosos como modelos replicables.', action: 'Publicar en la intranet el caso de éxito del área como referencia para otros procesos del SGC.' },
  'POS-GDO-1': { id: 'P2', dimension: 'DIM-GDO', triggerCondition: (v) => v >= 4.0 && v <= 4.5, recommendation: 'Mantener la disciplina documental y fortalecer los repositorios digitales con estándares actualizados.', action: 'Realizar una auditoría interna cruzada entre pares para identificar oportunidades de mejora documental.' },
  'POS-PEE-1': { id: 'P3', dimension: 'DIM-PEE', triggerCondition: (v) => v >= 4.0 && v <= 4.5, recommendation: 'Refinar los mecanismos de planeación incorporando indicadores de alerta temprana más precisos.', action: 'Automatizar la generación de reportes de avance semanales con desviaciones por debajo del 5%.' },
  'POS-COM-1': { id: 'P4', dimension: 'DIM-COM', triggerCondition: (v) => v >= 4.0 && v <= 4.5, recommendation: 'Fortalecer los canales de comunicación interna reconociendo los logros del equipo de forma periódica.', action: 'Implementar un boletín mensual de reconocimiento público a los colaboradores destacados en clima laboral.' },
  'POS-LID-1': { id: 'P5', dimension: 'DIM-LID', triggerCondition: (v) => v >= 4.0 && v <= 4.5, recommendation: 'Potenciar el liderazgo participativo delegando mayores niveles de autonomía al equipo.', action: 'Diseñar un plan de desarrollo de liderazgo intermedio para preparar sucesores en la dependencia.' },
  'POS-ETI-1': { id: 'P6', dimension: 'DIM-ETI', triggerCondition: (v) => v >= 4.0 && v <= 4.5, recommendation: 'Mantener la coherencia ética como sello distintivo del equipo y ejemplo institucional.', action: 'Participar como área piloto en el programa de transparencia y datos abiertos de la universidad.' },

  // Excelencia para >4.5
  'EXC-SGC-1': { id: 'E1', dimension: 'DIM-SGC', triggerCondition: (v) => v > 4.5, recommendation: 'Compartir la metodología de calidad del área como caso de éxito en eventos académicos nacionales.', action: 'Postular al área como modelo de gestión de calidad para las auditorías externas de renovación de acreditación.' },
  'EXC-GDO-1': { id: 'E2', dimension: 'DIM-GDO', triggerCondition: (v) => v > 4.5, recommendation: 'Liderar la estandarización documental de la universidad siendo referente para otras dependencias.', action: 'Ofrecer mentoría a otras oficinas en la implementación del sistema de gestión documental digital.' },
  'EXC-PEE-1': { id: 'E3', dimension: 'DIM-PEE', triggerCondition: (v) => v > 4.5, recommendation: 'Documentar la metodología de planeación como buenas prácticas para socializar institucionalmente.', action: 'Presentar los indicadores de gestión del área en el comité de calidad como referente de cumplimiento.' },
  'EXC-COM-1': { id: 'E4', dimension: 'DIM-COM', triggerCondition: (v) => v > 4.5, recommendation: 'Ser embajador de la cultura organizacional positiva replicando las dinámicas exitosas en otras áreas.', action: 'Grabar un video testimonial sobre las prácticas de comunicación y clima laboral para inducción de nuevos colaboradores.' },
  'EXC-LID-1': { id: 'E5', dimension: 'DIM-LID', triggerCondition: (v) => v > 4.5, recommendation: 'Publicar un artículo institucional sobre la gestión innovadora del área como referente universitario.', action: 'Aplicar a la convocatoria interna de innovación administrativa con un proyecto de mejora continua.' },
  'EXC-ETI-1': { id: 'E6', dimension: 'DIM-ETI', triggerCondition: (v) => v > 4.5, recommendation: 'Formalizar el código de conducta del área como plantilla para su adopción en toda la institución.', action: 'Obtener la certificación en normas de integridad institucional y ser reconocidos como área ejemplar.' },
};

// 3B. Catálogo de Recomendaciones de Mejora (para puntajes 3.0-4.0)
export const MODERATE_RECOMMENDATIONS: Record<string, RecommendationCatalogItem> = {
  'MOD-SGC-1': { id: 'M1', dimension: 'DIM-SGC', triggerCondition: (v) => v > 3.0 && v <= 4.0, recommendation: 'Reforzar la apropiación del mapa de procesos mediante talleres prácticos de aplicación directa en el puesto de trabajo.', action: 'Realizar un taller de alineación de procesos con casos reales del área cada trimestre.' },
  'MOD-SGC-2': { id: 'M2', dimension: 'DIM-SGC', triggerCondition: (v) => v > 3.0 && v <= 4.0, recommendation: 'Fortalecer la cultura de calidad institucional vinculando los indicadores del SGC con las metas del equipo de trabajo.', action: 'Implementar reuniones operativas mensuales para revisar indicadores de calidad y proponer ajustes.' },
  'MOD-SGC-3': { id: 'M3', dimension: 'DIM-SGC', triggerCondition: (v) => v > 3.0 && v <= 4.0, recommendation: 'Mejorar el conocimiento y aplicación de los procedimientosdocumentados del SGC en las actividades diarias del colaborador.', action: 'Aplicar evaluaciones rápidas de conocimiento de procedimientos y retroalimentación inmediata.' },
  'MOD-GDO-1': { id: 'M4', dimension: 'DIM-GDO', triggerCondition: (v) => v > 3.5 && v <= 4.0, recommendation: 'Optimizar el flujo documental del área automatizando los registros de mayor consulta y actualización.', action: 'Digitalizar los formatos físicos de mayor uso y centralizarlos en el repositorio institucional.' },
  'MOD-GDO-2': { id: 'M5', dimension: 'DIM-GDO', triggerCondition: (v) => v > 3.5 && v <= 4.0, recommendation: 'Fortalecer el cumplimiento normativo mediante listas de verificación documental actualizadas.', action: 'Realizar una revisión semestral de las Tablas de Retención Documental del área.' },
  'MOD-PEE-1': { id: 'M6', dimension: 'DIM-PEE', triggerCondition: (v) => v > 3.0 && v <= 4.0, recommendation: 'Mejorar la planificación diaria integrando herramientas de gestión de tiempo y priorización de tareas.', action: 'Capacitar al equipo en metodologías ágiles de planificación semanal con revisiones quincenales.' },
  'MOD-PEE-2': { id: 'M7', dimension: 'DIM-PEE', triggerCondition: (v) => v > 3.0 && v <= 4.0, recommendation: 'Optimizar la calidad de las evidencias y entregables mediante estándares claros de presentación.', action: 'Establecer rúbricas de calidad para informes y entregables con revisión por pares.' },
  'MOD-PEE-3': { id: 'M8', dimension: 'DIM-PEE', triggerCondition: (v) => v > 3.0 && v <= 4.0, recommendation: 'Reforzar la medición del impacto de las actividades ejecutadas mediante indicadores de resultado.', action: 'Implementar fichas técnicas de indicadores por cada proyecto o actividad del área.' },
  'MOD-COM-1': { id: 'M9', dimension: 'DIM-COM', triggerCondition: (v) => v > 3.0 && v <= 4.0, recommendation: 'Potenciar la comunicación asertiva en el equipo mediante técnicas de escucha activa y retroalimentación constructiva.', action: 'Realizar talleres trimestrales de habilidades comunicativas con casos prácticos del entorno laboral.' },
  'MOD-COM-2': { id: 'M10', dimension: 'DIM-COM', triggerCondition: (v) => v > 3.0 && v <= 4.0, recommendation: 'Mejorar el clima laboral fortaleciendo el trabajo colaborativo y el reconocimiento entre pares.', action: 'Implementar un programa de reconocimiento semanal entre compañeros y reuniones de integración mensuales.' },
  'MOD-LID-1': { id: 'M11', dimension: 'DIM-LID', triggerCondition: (v) => v > 3.0 && v <= 4.0, recommendation: 'Fortalecer las habilidades de liderazgo y delegación efectiva para potenciar la autonomía del equipo.', action: 'Capacitar al líder en técnicas de coaching y delegación progresiva con metas trimestrales.' },
  'MOD-LID-2': { id: 'M12', dimension: 'DIM-LID', triggerCondition: (v) => v > 3.0 && v <= 4.0, recommendation: 'Promover la innovación en los procesos del área incentivando propuestas de mejora del equipo.', action: 'Establecer un buzón de ideas de innovación con evaluación mensual y reconocimiento a las mejores propuestas.' },
  'MOD-ETI-1': { id: 'M13', dimension: 'DIM-ETI', triggerCondition: (v) => v > 3.5 && v <= 4.0, recommendation: 'Fortalecer la cultura ética y de integridad mediante la divulgación activa del código de ética institucional.', action: 'Realizar sesiones trimestrales de reflexión ética aplicada a casos del quehacer institucional.' },
  'MOD-ETI-2': { id: 'M14', dimension: 'DIM-ETI', triggerCondition: (v) => v > 3.5 && v <= 4.0, recommendation: 'Reforzar la disciplina y responsabilidad individual en el cumplimiento de horarios y normas institucionales.', action: 'Implementar un sistema de autoregistro de cumplimiento con retroalimentación semanal.' },
};

// 4. Motor de Analítica
export const AnalyticsEngine = {
  // Normaliza puntajes invertidos
  normalizeValue: (value: number): number => {
    return Math.max(1, Math.min(5, value));
  },

  // Determina el tipo de evaluación por nombre de plantilla
  getEvalType: (templateName: string): 'auto' | 'leader' | 'equipo_vaf' | 'operativos' | 'other' => {
    const tn = templateName.toLowerCase();
    if (tn.includes('auto') || tn.includes('autoevaluacion')) return 'auto';
    if (tn.includes('jefe') || tn.includes('líder') || tn.includes('lider') || tn.includes('manager') || tn.includes('leader') || tn.includes('lideres') || tn.includes('lideresgen')) return 'leader';
    if (tn.includes('equipo vaf') || tn.includes('equipovaf') || (tn.includes('equipo') && tn.includes('vaf'))) return 'equipo_vaf';
    if (tn.includes('operativo')) return 'operativos';
    return 'other';
  },

  // Calcula promedios por dimensión desde datos agregados
  calculateFromAggregated: (evaluations: AggregatedEval[]): AnalyticsResult => {
    const dimensionScores: Record<DimensionCode, { sum: number; count: number }> = {
      'DIM-SGC': { sum: 0, count: 0 },
      'DIM-GDO': { sum: 0, count: 0 },
      'DIM-PEE': { sum: 0, count: 0 },
      'DIM-COM': { sum: 0, count: 0 },
      'DIM-LID': { sum: 0, count: 0 },
      'DIM-ETI': { sum: 0, count: 0 },
    };

    // Distribuir cada evaluación entre las 6 dimensiones
    evaluations.forEach(ev => {
      const normalizedScore = AnalyticsEngine.normalizeValue(ev.score);
      (Object.keys(dimensionScores) as DimensionCode[]).forEach(dim => {
        dimensionScores[dim].sum += normalizedScore;
        dimensionScores[dim].count += 1;
      });
    });

    const dimensionAverages = {} as Record<DimensionCode, number>;
    const dimensionCounts = {} as Record<DimensionCode, number>;
    (Object.keys(dimensionScores) as DimensionCode[]).forEach(dim => {
      dimensionAverages[dim] = dimensionScores[dim].count > 0
        ? Number((dimensionScores[dim].sum / dimensionScores[dim].count).toFixed(2))
        : 0;
      dimensionCounts[dim] = dimensionScores[dim].count;
    });

    // IDC = Σ (Wd × Xd)
    const idc = Number(
      (Object.keys(DIMENSIONS) as DimensionCode[])
        .reduce((sum, dim) => sum + dimensionAverages[dim] * DIMENSIONS[dim].weight, 0)
        .toFixed(2)
    );

    // Brecha de autopercepción (incluye todos los tipos de evaluación de líder)
    const autoEvals = evaluations.filter(e => AnalyticsEngine.getEvalType(e.templateName) === 'auto');
    const leaderEvals = evaluations.filter(e => AnalyticsEngine.getEvalType(e.templateName) === 'leader');

    let deltaAuto = 0;
    if (autoEvals.length > 0 && leaderEvals.length > 0) {
      const autoAvg = autoEvals.reduce((s, e) => s + e.score, 0) / autoEvals.length;
      const leaderAvg = leaderEvals.reduce((s, e) => s + e.score, 0) / leaderEvals.length;
      deltaAuto = Number((autoAvg - leaderAvg).toFixed(2));
    }

    const gapStatus = Math.abs(deltaAuto) > 1.0
      ? deltaAuto > 0
        ? 'Sobrevaloración — Punto Ciego'
        : 'Baja Autoeficacia Percibida'
      : 'Alineación Conductual Óptima';

    // Recomendaciones: combinar catálogo crítico + positivo
    const recommendations: (RecommendationCatalogItem & { currentScore: number })[] = [];
    const DIM_KEYS = Object.keys(DIMENSIONS) as DimensionCode[];

    DIM_KEYS.forEach(dim => {
      const dimAvg = dimensionAverages[dim];
      if (dimAvg <= 0) return;

      // Recomendaciones del catálogo principal (críticas: ≤3.0 y ≤3.5)
      const catalogEntries = Object.values(RECOMMENDATION_CATALOG).filter(item => item.dimension === dim);
      catalogEntries.slice(0, 4).forEach(item => {
        if (item.triggerCondition(dimAvg)) {
          recommendations.push({ ...item, currentScore: dimAvg });
        }
      });

      // Recomendaciones de mejora (moderadas: 3.0-4.0)
      const moderateEntries = Object.values(MODERATE_RECOMMENDATIONS).filter(item => item.dimension === dim);
      moderateEntries.forEach(item => {
        if (item.triggerCondition(dimAvg)) {
          recommendations.push({ ...item, currentScore: dimAvg });
        }
      });

      // Recomendaciones positivas (consolidación 4.0-4.5 y excelencia >4.5)
      const positiveEntries = Object.values(POSITIVE_RECOMMENDATIONS).filter(item => item.dimension === dim);
      positiveEntries.forEach(item => {
        if (item.triggerCondition(dimAvg)) {
          recommendations.push({ ...item, currentScore: dimAvg });
        }
      });
    });

    // Si el promedio es bajo, agregar más recomendaciones de dimensiones críticas
    const criticalCount = recommendations.filter(r => r.currentScore <= 3.0).length;
    if (criticalCount < 3) {
      const lowestDims = DIM_KEYS
        .map(dim => ({ dim, avg: dimensionAverages[dim] }))
        .sort((a, b) => a.avg - b.avg);

      lowestDims.forEach(({ dim, avg }) => {
        if (avg > 3.5) return;
        const existingIds = recommendations.map(r => r.id);
        const moreFromDim = Object.values(RECOMMENDATION_CATALOG)
          .filter(item => item.dimension === dim && !existingIds.includes(item.id));
        moreFromDim.slice(0, 3).forEach(item => {
          recommendations.push({ ...item, currentScore: avg });
        });
      });
    }

    // Ordenar: críticas primero (menor score), luego positivas
    recommendations.sort((a, b) => {
      // Primero ordenar por score (más bajo = más crítico)
      if (a.currentScore !== b.currentScore) return a.currentScore - b.currentScore;
      // Luego: críticas antes que positivas
      const aIsPositive = a.id.startsWith('POS-') || a.id.startsWith('EXC-');
      const bIsPositive = b.id.startsWith('POS-') || b.id.startsWith('EXC-');
      return aIsPositive === bIsPositive ? 0 : aIsPositive ? 1 : -1;
    });

    return {
      dimensionAverages,
      dimensionCounts,
      idc,
      gaps: { deltaAuto, status: gapStatus },
      recommendations,
      totalEvaluations: evaluations.length,
    };
  },

  // Agrupa recomendaciones por dimensión
  groupByDimension: (recs: (RecommendationCatalogItem & { currentScore: number })[]) => {
    const groups: Record<DimensionCode, (RecommendationCatalogItem & { currentScore: number })[]> = {
      'DIM-SGC': [], 'DIM-GDO': [], 'DIM-PEE': [],
      'DIM-COM': [], 'DIM-LID': [], 'DIM-ETI': [],
    };
    recs.forEach(rec => {
      if (groups[rec.dimension]) groups[rec.dimension].push(rec);
    });
    return groups;
  }
};
