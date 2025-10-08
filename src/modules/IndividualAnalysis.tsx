import React from 'react';
import { X, DownloadCloud, Printer } from 'lucide-react';

interface IndividualAnalysisProps {
  result: any; // result with evaluation, evaluated, template, overall_score, category_scores
  onClose: () => void;
}

const DOMAIN_KEYS = [
  { key: 'autoconciencia', label: 'Autoconciencia', synonyms: ['autoconciencia', 'self_awareness', 'selfawareness', 'self-awareness', 'autoconsciencia'] },
  { key: 'autogestion', label: 'Autogestión', synonyms: ['autogestion', 'autogestión', 'self_management', 'selfmanagement', 'autocontrol'] },
  { key: 'conciencia_social', label: 'Conciencia Social', synonyms: ['conciencia_social', 'concienciasocial', 'conciencia social', 'social_awareness', 'empatía', 'empathy'] },
  { key: 'gestion_relaciones', label: 'Gestión de Relaciones', synonyms: ['gestion_relaciones', 'gestión_relaciones', 'relationship_management', 'relationshipmanagement', 'gestion de relaciones', 'relationship'] },
];

const classifyLevel = (score: number) => {
  // Use the provided ranges:
  // 4.5 - 5.0: Liderazgo
  // 3.5 - 4.4: Sólido
  // 2.5 - 3.4: En Desarrollo
  // 1.0 - 2.4: Crítico
  if (score >= 4.5) return 'Liderazgo';
  if (score >= 3.5) return 'Sólido';
  if (score >= 2.5) return 'En Desarrollo';
  return 'Crítico';
};

const getInterpretation = (domainKey: string, score: number) => {
  // For each domain, map the score to the exact narrative provided by the user.
  // We'll use the same numeric boundaries as classifyLevel.
  const level = classifyLevel(score);

  switch (domainKey) {
    case 'autoconciencia':
      if (level === 'Crítico') return 'El colaborador tiene un punto ciego sobre su impacto emocional en el trabajo. A menudo, sus estados de ánimo (ej: frustración, estrés) afectan negativamente su desempeño o las interacciones. Necesita desarrollar la capacidad de auto-observación.';
      if (level === 'En Desarrollo') return 'Muestra una autoconciencia limitada. Reconoce sus emociones después de que han afectado su trabajo. Requiere apoyo para identificar sus límites y comunicar sus necesidades de manera oportuna.';
      if (level === 'Sólido') return 'El colaborador es consciente de sus fortalezas y debilidades, y generalmente reconoce cómo sus emociones influyen en su trabajo. Tiende a comunicar sus estados de ánimo y necesidades de forma profesional y clara.';
      return 'Muestra una alta transparencia y autoconocimiento. Reconoce inmediatamente el origen de sus emociones y cómo manejarlas para evitar un impacto negativo. Es un referente para la autorreflexión y la madurez emocional.';

    case 'autogestion':
      if (level === 'Crítico') return 'Muestra una baja disciplina y proactividad. Hay un riesgo constante de incumplimiento de plazos o abandono de tareas complejas. Le cuesta manejar la frustración, lo que se traduce en reacciones impulsivas o estrés.';
      if (level === 'En Desarrollo') return 'La autogestión es inconsistente. Cumple plazos bajo supervisión, pero su iniciativa es limitada. Necesita mejorar el control de impulsos y la perseverancia, especialmente ante tareas repetitivas o desafíos inesperados.';
      if (level === 'Sólido') return 'El colaborador es confiable y orientado a resultados. Muestra autocontrol bajo presión y es persistente. Organiza su tiempo de manera efectiva y toma la iniciativa para mejorar los procesos dentro de su ámbito.';
      return 'Exhibe alta disciplina y ética de trabajo. Es un modelo de proactividad, resiliencia y compromiso. Demuestra una alta capacidad de recuperación tras un revés (tolerancia a la frustración).';

    case 'conciencia_social':
      if (level === 'Crítico') return 'Muestra una clara falta de escucha y empatía. Puede ser percibido como indiferente a las necesidades del equipo, lo que genera malentendidos y errores operativos por falta de atención a detalles o instrucciones de otros.';
      if (level === 'En Desarrollo') return 'Su escucha es superficial o selectiva. Necesita mejorar la capacidad de identificar las señales no verbales y las necesidades de sus compañeros. A veces, las prioridades individuales priman sobre las del equipo.';
      if (level === 'Sólido') return 'Es un buen oyente y muestra empatía. Capta las necesidades de los compañeros y las dinámicas del equipo. Contribuye a un clima laboral positivo y entiende cómo su trabajo afecta a otros departamentos.';
      return 'Muestra una profunda sensibilidad y empatía. Es la referencia natural para mediar y comprender situaciones complejas dentro del equipo. Posee una conciencia organizacional que le permite anticipar conflictos o necesidades.';

    case 'gestion_relaciones':
      if (level === 'Crítico') return 'Muestra habilidades de colaboración muy deficientes. La comunicación es frecuentemente confusa o confrontacional. Suele ser un factor en la escalada de conflictos y tiene dificultades para trabajar bajo metodologías de equipo.';
      if (level === 'En Desarrollo') return 'Colabora cuando es necesario, pero no promueve activamente el trabajo en equipo. La claridad de su comunicación puede fallar en momentos de estrés. Necesita desarrollar habilidades de resolución de conflictos asertiva.';
      if (level === 'Sólido') return 'El colaborador es un activo en el equipo. Su comunicación es clara, oportuna y asertiva. Colabora de manera efectiva y es capaz de resolver pequeños desacuerdos de forma constructiva sin la intervención del supervisor.';
      return 'Es un catalizador de la colaboración y la armonía. Posee gran influencia positiva sobre sus compañeros. Es un excelente negociador y facilitador de acuerdos, garantizando que el flujo de trabajo grupal sea óptimo.';

    default:
      return '';
  }
};

const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

const extractScores = (category_scores: any): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!category_scores) return out;

  // build normalized map of provided scores
  const normalizedMap: Record<string, any> = {};
  if (typeof category_scores === 'object') {
    Object.keys(category_scores).forEach((k) => {
      const nk = normalizeKey(k);
      normalizedMap[nk] = category_scores[k];
    });
  }

  // also if category_scores has nested structures, stringify and try to parse numbers by key name
  const flatString = JSON.stringify(category_scores || {}).toLowerCase();

  DOMAIN_KEYS.forEach((d) => {
    let val = 0;
    for (const syn of d.synonyms) {
      const nk = normalizeKey(syn);
      if (normalizedMap[nk] !== undefined && normalizedMap[nk] !== null) {
        val = Number(normalizedMap[nk]) || 0;
        break;
      }
      // try direct presence in the JSON string like '"autoconciencia": 4.2'
      const regex = new RegExp(`\\"${syn.replace(/[-_ ]/g, '[\\"\\s:-]*')}\\"\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)`,'i');
      const m = flatString.match(regex);
      if (m && m[1]) {
        val = Number(m[1]);
        break;
      }
    }
    out[d.key] = Math.max(0, Math.min(5, Number(val) || 0));
  });

  return out;
};

// Compute closing analysis (Matriz de Análisis de Cierre)
// Assumption: "Alta Dispersión" is defined as max - min >= 1.5 (reasonable threshold).
const computeClosingAnalysis = (scores: Record<string, number>, overall: number) => {
  const a = Number(scores['autoconciencia'] || 0);
  const b = Number(scores['autogestion'] || 0);
  const c = Number(scores['conciencia_social'] || 0);
  const d = Number(scores['gestion_relaciones'] || 0);
  const vals = [a, b, c, d];
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const dispersion = max - min;

  // 1) IE Sólida y Equilibrada (Todos los dominios ≥3.5)
  if (vals.every((v) => v >= 3.5)) {
    return {
      title: 'Perfil de Alto Potencial Estructural',
      conclusion:
        'El colaborador muestra una Inteligencia Emocional sólida y bien equilibrada. Es un agente de cambio positivo y posee la estabilidad personal y social para gestionar proyectos o asumir una tutoría. Su crecimiento debe enfocarse en la ampliación de responsabilidades para maximizar su impacto.',
    };
  }

  // 2) Fortaleza Personal / Debilidad Social
  if (a >= 4.0 && b >= 4.0 && c <= 3.0 && d <= 3.0) {
    return {
      title: 'El Solitario Altamente Efectivo',
      conclusion:
        'El colaborador es disciplinado, proactivo y altamente confiable en sus tareas individuales (Fuerza Personal). Sin embargo, su baja competencia social puede limitar la colaboración y generar fricción en el equipo. El riesgo es el aislamiento o la ineficacia al trabajar con otros.',
    };
  }

  // 3) Fortaleza Social / Debilidad Personal
  if (c >= 4.0 && d >= 4.0 && a <= 3.0 && b <= 3.0) {
    return {
      title: 'El Colaborador Inconsistente',
      conclusion:
        'El colaborador es un excelente miembro de equipo; es empático, comunicativo y resuelve conflictos (Fuerza Social). No obstante, la falta de Autogestión y disciplina personal crea problemas de incumplimiento de plazos y manejo del estrés, lo que socava la confianza del equipo en su fiabilidad.',
    };
  }

  // 4) IE Crítica y Desequilibrada (Puntaje Global ≤2.5 y Alta Dispersión)
  if (overall <= 2.5 && dispersion >= 1.5) {
    return {
      title: 'Necesidad de Intervención Urgente',
      conclusion:
        'El perfil de IE indica múltiples brechas críticas en las habilidades personales y sociales. El colaborador representa un riesgo operacional por la alta probabilidad de conflictos o fallas en la autogestión. Se requiere un Plan de Desarrollo Individual (PDI) intensivo con seguimiento semanal.',
    };
  }

  // Fallback: generic closure using highest/lowest will be computed by caller if needed
  return {
    title: 'Análisis de Cierre',
    conclusion: '',
  };
};

const CLOSING_RECOMMENDATIONS: Record<string, string> = {
  autoconciencia:
    'Foco en el Coaching: Asignar una sesión de coaching mensual enfocada en la autorreflexión y la vinculación de emociones con el desempeño observable.',
  autogestion:
    'Foco en el Desarrollo de Habilidades Duras: Implementar un programa de entrenamiento en gestión del tiempo, priorización (SMART) y técnicas de accountability (rendición de cuentas).',
  conciencia_social:
    'Foco en el Mentoring: Emparejar al colaborador con un "mentor de empatía" o un compañero con alta Conciencia Social para el desarrollo de la escucha activa y la perspectiva grupal.',
  gestion_relaciones:
    'Foco en la Práctica Social: Integrar al colaborador en equipos de proyectos multifuncionales para practicar la comunicación asertiva y la resolución formal de problemas.',
};

const getClosingRecommendation = (lowestKey: string) => {
  return CLOSING_RECOMMENDATIONS[lowestKey] || '';
};

const classifyGlobalIE = (score: number) => {
  // 4.5 – 5.0 Liderazgo Estratégico
  // 3.5 – 4.4 Competencia Sólida
  // 2.5 – 3.4 Nivel de Desarrollo Activo
  // 1.0 – 2.4 Riesgo Operacional Crítico
  if (score >= 4.5) {
    return {
      label: 'Liderazgo Estratégico',
      narrative:
        'Este colaborador posee una IE excepcional. Demuestra un equilibrio superior en sus habilidades personales y sociales. Está preparado para asumir roles de liderazgo, mentoría y gestión de proyectos complejos. Es un activo clave para la cultura organizacional y un referente de desempeño bajo presión.',
    };
  }
  if (score >= 3.5) {
    return {
      label: 'Competencia Sólida',
      narrative:
        'El colaborador muestra una IE robusta y confiable. Cumple consistentemente con las expectativas y maneja la mayoría de los desafíos interpersonales y de autogestión de manera efectiva. Requiere desarrollo específico y focalizado en sus áreas de menor puntaje para poder ascender a un rol de mayor responsabilidad.',
    };
  }
  if (score >= 2.5) {
    return {
      label: 'Nivel de Desarrollo Activo',
      narrative:
        'La IE del colaborador se considera satisfactoria, pero inestable. Muestra competencias básicas, pero las áreas de menor puntaje representan un riesgo de rendimiento o conflicto bajo estrés. Es necesaria una inversión activa en capacitación y seguimiento para evitar que las debilidades arrastren el rendimiento global.',
    };
  }
  return {
    label: 'Riesgo Operacional Crítico',
    narrative:
      'El colaborador tiene desafíos significativos en múltiples dominios de IE. Esto se traduce en un alto riesgo de bajo rendimiento, conflictos constantes o dificultad para adaptarse. Se requiere una intervención inmediata (Plan de Desarrollo Individual intensivo) para mejorar las habilidades básicas de interacción y autogestión.',
  };
};

function downloadCSV(result: any) {
  // compute scores and closing analysis for inclusion in CSV
  const computedScores = extractScores(result.category_scores || {});
  const closing = computeClosingAnalysis(computedScores, Number(result.overall_score || 0));
  // determine lowest domain key
  const domainValsForCsv = Object.keys(computedScores).map((k) => ({ key: k, v: Number(computedScores[k] || 0) }));
  const lowestForCsv = domainValsForCsv.sort((a, b) => a.v - b.v)[0]?.key || '';
  const recommendationForCsv = getClosingRecommendation(lowestForCsv);
  const rows: string[][] = [];
  rows.push(['Colaborador', (result.evaluated?.full_name || '')]);
  rows.push(['Fecha de Evaluación', new Date(result.created_at).toLocaleString()]);
  rows.push(['Puntaje Global de IE', result.overall_score || '']);
  rows.push(['Perfil Automatizado', closing.title || '']);
  rows.push(['Conclusión de Cierre', closing.conclusion || '']);
  rows.push(['Recomendación de Cierre', recommendationForCsv || '']);
  rows.push([]);
  rows.push(['Dominio', 'Puntaje Promedio', 'Nivel', 'Interpretación']);

  const scores = result.category_scores || {};
  DOMAIN_KEYS.forEach((d) => {
    const s = Number(scores[d.key]) || 0;
    rows.push([d.label, s.toFixed(2), classifyLevel(s), getInterpretation(d.key, s)]);
  });

  const csvContent = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${result.evaluated?.full_name || 'resultado'}_analisis.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportToPDF(result: any) {
  try {
    const scores = extractScores(result.category_scores || {});
    const overall = Number(result.overall_score || 0);
    const closing = computeClosingAnalysis(scores, overall);
    // find lowest domain key
    const domainVals = Object.keys(scores).map((k) => ({ key: k, v: Number(scores[k] || 0) }));
    const lowest = domainVals.sort((a, b) => a.v - b.v)[0]?.key || '';
    const recommendation = getClosingRecommendation(lowest);

    const rowsHtml = DOMAIN_KEYS.map((d) => {
      const s = Number(scores[d.key] || 0);
      const level = classifyLevel(s);
      const interp = getInterpretation(d.key, s).replace(/\n/g, '<br/>');
      return `
        <tr>
          <td class="px-3 py-2 font-semibold">${d.label}</td>
          <td class="px-3 py-2 text-center font-bold">${s.toFixed(2)}</td>
          <td class="px-3 py-2 font-semibold">${level}</td>
          <td class="px-6 py-2 text-gray-700">${interp}</td>
        </tr>
      `;
    }).join('\n');

    const html = `<!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>Informe de Evaluación - ${result.evaluated?.full_name || ''}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @media print { body { background-color: #fff !important; color: #000 !important } .print-area { margin:0; padding:0; box-shadow:none; border:none }}
      </style>
    </head>
    <body class="bg-gray-50 p-6 font-sans">
      <div class="print-area max-w-4xl mx-auto bg-white shadow rounded-lg overflow-hidden my-4 p-6 border border-gray-200">
        <header class="flex items-center justify-between border-b pb-4 mb-6">
          <div class="flex items-center">
            <img src="https://udes.edu.co/images/logo/udes-logo-principal.svg" alt="Logo" class="h-10 w-auto mr-4"/>
            <div>
              <h1 class="text-2xl font-bold text-gray-800">Informe de Evaluación</h1>
              <div class="text-sm text-gray-600">Modelo Goleman</div>
            </div>
          </div>
          <div class="text-right text-sm">
            <div>Fecha: ${new Date(result.created_at).toLocaleDateString()}</div>
            <div>Colaborador: ${result.evaluated?.full_name || ''}</div>
          </div>
        </header>

        <section class="mb-6 grid grid-cols-2 gap-4 bg-gray-100 p-4 rounded">
          <div>
            <div class="text-xs text-gray-500">Puesto</div>
            <div class="font-bold text-gray-800">Operativo</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-gray-500">Puntaje Global</div>
            <div class="text-2xl font-extrabold text-blue-700">${overall.toFixed(2)} / 5.0</div>
          </div>
        </section>

        <section class="mb-6">
          <h3 class="text-lg font-bold mb-2">Análisis Global</h3>
          <div class="bg-blue-50 p-4 rounded border-l-4 border-blue-600">
            <div class="font-semibold">${classifyGlobalIE(overall).label}</div>
            <div class="text-sm text-gray-700 mt-2">${classifyGlobalIE(overall).narrative}</div>
          </div>
        </section>

        <section class="mb-6">
          <h3 class="text-lg font-bold mb-2">Detalle por Dominio</h3>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-100"><tr>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-600">Dominio</th>
                <th class="px-3 py-2 text-center text-xs font-medium text-gray-600">Puntaje</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-600">Nivel</th>
                <th class="px-6 py-2 text-left text-xs font-medium text-gray-600">Interpretación</th>
              </tr></thead>
              <tbody class="bg-white divide-y divide-gray-200 text-sm">
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </section>

        <section class="mb-6">
          <h3 class="text-lg font-bold mb-2">Conclusión y Recomendación</h3>
          <div class="grid md:grid-cols-2 gap-4">
            <div class="bg-yellow-50 p-4 rounded border-l-4 border-yellow-600">
              <div class="text-sm text-yellow-800">Perfil Automatizado</div>
              <div class="font-extrabold text-yellow-900 mt-1">${closing.title}</div>
            </div>
            <div class="bg-gray-100 p-4 rounded border-l-4 border-gray-400">
              <div class="text-sm text-gray-700">Conclusión</div>
              <div class="text-sm text-gray-800 mt-1">${closing.conclusion}</div>
            </div>
          </div>
          <div class="mt-4 bg-gray-50 p-4 rounded">
            <div class="font-semibold">Recomendación de Acción (Dominio Crítico)</div>
            <div class="text-sm text-gray-700 mt-2">${recommendation}</div>
          </div>
        </section>

        <footer class="text-xs text-gray-500 mt-6 border-t pt-3">Informe generado por el sistema de Gestión de Talento.</footer>
      </div>
    </body>
    </html>`;

    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) throw new Error('No se pudo abrir nueva ventana para exportar PDF');
    w.document.write(html);
    w.document.close();
    // wait a moment for styles to load then print
    setTimeout(() => {
      w.focus();
      w.print();
      // do not auto-close because some browsers block it; leave to user
    }, 700);
  } catch (err) {
    console.error('Error exporting PDF', err);
    alert('No se pudo generar el PDF. Por favor permita abrir ventanas emergentes y vuelva a intentarlo.');
  }
}

const RadarChart: React.FC<{ scores: Record<string, number> }> = ({ scores }) => {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 90;
  const angleStep = (Math.PI * 2) / DOMAIN_KEYS.length;

  const points = DOMAIN_KEYS.map((d, i) => {
    const v = Math.max(0, Math.min(5, Number(scores[d.key] || 0)));
    const r = (v / 5) * radius;
    const angle = -Math.PI / 2 + i * angleStep;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return `${x},${y}`;
  }).join(' ');

  // draw grid levels
  const gridLevels = [0.25, 0.5, 0.75, 1].map((t) => {
    const pts = DOMAIN_KEYS.map((_, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      const x = cx + radius * t * Math.cos(angle);
      const y = cy + radius * t * Math.sin(angle);
      return `${x},${y}`;
    }).join(' ');
    return pts;
  });

  return (
    <svg width={size} height={size}>
      {gridLevels.map((g, idx) => (
        <polygon key={idx} points={g} fill={idx % 2 === 0 ? '#f3f4f6' : '#ffffff'} stroke="#e5e7eb" />
      ))}
      <polygon points={points} fill="#60a5fa55" stroke="#3b82f6" strokeWidth={2} />
      {DOMAIN_KEYS.map((d, i) => {
        const angle = -Math.PI / 2 + i * angleStep;
        const x = cx + (radius + 12) * Math.cos(angle);
        const y = cy + (radius + 12) * Math.sin(angle);
        return (
          <g key={d.key}>
            <line x1={cx} y1={cy} x2={cx + radius * Math.cos(angle)} y2={cy + radius * Math.sin(angle)} stroke="#e5e7eb" />
            <text x={x} y={y} fontSize={12} textAnchor="middle" fill="#374151">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
};

export default function IndividualAnalysis({ result, onClose }: IndividualAnalysisProps) {
  const scores: Record<string, number> = extractScores(result.category_scores || {});

  // compute highest and lowest domain
  const domainVals = DOMAIN_KEYS.map((d) => ({ key: d.key, label: d.label, value: Number(scores[d.key] || 0) }));
  const sorted = [...domainVals].sort((a, b) => b.value - a.value);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];

  const conclusion = `El perfil de ${result.evaluated?.full_name || 'el colaborador'} destaca por una Fortaleza Central en ${highest.label} (Puntaje ${highest.value.toFixed(2)}), lo que le permite ser un activo valioso en tareas relacionadas con ${highest.label.toLowerCase()}. Sin embargo, su Área Crítica se encuentra en ${lowest.label} (Puntaje ${lowest.value.toFixed(2)}). Esta debilidad sugiere que el colaborador podría estar experimentando desafíos en ${lowest.label.toLowerCase()}. Es crucial enfocar el Plan de Desarrollo en esta área para minimizar el riesgo y optimizar el rendimiento individual.`;

  const classifyGlobalIE = (score: number) => {
    // 4.5 – 5.0 Liderazgo Estratégico
    // 3.5 – 4.4 Competencia Sólida
    // 2.5 – 3.4 Nivel de Desarrollo Activo
    // 1.0 – 2.4 Riesgo Operacional Crítico
    if (score >= 4.5) {
      return {
        label: 'Liderazgo Estratégico',
        narrative:
          'Este colaborador posee una IE excepcional. Demuestra un equilibrio superior en sus habilidades personales y sociales. Está preparado para asumir roles de liderazgo, mentoría y gestión de proyectos complejos. Es un activo clave para la cultura organizacional y un referente de desempeño bajo presión.',
      };
    }
    if (score >= 3.5) {
      return {
        label: 'Competencia Sólida',
        narrative:
          'El colaborador muestra una IE robusta y confiable. Cumple consistentemente con las expectativas y maneja la mayoría de los desafíos interpersonales y de autogestión de manera efectiva. Requiere desarrollo específico y focalizado en sus áreas de menor puntaje para poder ascender a un rol de mayor responsabilidad.',
      };
    }
    if (score >= 2.5) {
      return {
        label: 'Nivel de Desarrollo Activo',
        narrative:
          'La IE del colaborador se considera satisfactoria, pero inestable. Muestra competencias básicas, pero las áreas de menor puntaje representan un riesgo de rendimiento o conflicto bajo estrés. Es necesaria una inversión activa en capacitación y seguimiento para evitar que las debilidades arrastren el rendimiento global.',
      };
    }
    return {
      label: 'Riesgo Operacional Crítico',
      narrative:
        'El colaborador tiene desafíos significativos en múltiples dominios de IE. Esto se traduce en un alto riesgo de bajo rendimiento, conflictos constantes o dificultad para adaptarse. Se requiere una intervención inmediata (Plan de Desarrollo Individual intensivo) para mejorar las habilidades básicas de interacción y autogestión.',
    };
  };

  const globalInfo = classifyGlobalIE(Number(result.overall_score || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
      <div className="bg-white w-full max-w-4xl rounded-lg shadow-lg overflow-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold">Análisis Individual (Modelo Goleman)</h2>
            <p className="text-sm text-gray-600">{result.template?.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => downloadCSV(result)} className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-md">
              <DownloadCloud className="w-4 h-4" />
              Exportar
            </button>
            <button onClick={() => exportToPDF(result)} className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-md">
              <Printer className="w-4 h-4" />
              PDF
            </button>
            <button onClick={onClose} className="p-2 rounded-md hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Global IE maturity summary */}
          <div className="bg-gray-50 p-4 rounded-md border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Nivel de Madurez de IE</div>
                <div className="text-lg font-semibold">{globalInfo.label}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">Puntaje Global</div>
                <div className="text-2xl font-bold text-blue-600">{Number(result.overall_score || 0).toFixed(2)} / 5.0</div>
              </div>
            </div>
            <div className="mt-3 text-sm text-gray-700">{globalInfo.narrative}</div>
          </div>

          {/* Header summary */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Colaborador:</p>
              <h3 className="text-lg font-semibold">{result.evaluated?.full_name}</h3>
              <p className="text-sm text-gray-500">Fecha de Evaluación: {new Date(result.created_at).toLocaleDateString()}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Puntaje Global de IE</p>
              <p className="text-3xl font-bold text-blue-600">{Number(result.overall_score || 0).toFixed(2)} / 5.0</p>
            </div>
          </div>

          {/* Radar and profile */}
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-1/2 flex items-center justify-center">
              <RadarChart scores={scores} />
            </div>
            <div className="w-full md:w-1/2">
              <h4 className="font-semibold text-lg mb-3">Perfil por Dominio</h4>
              <div className="space-y-3">
                {DOMAIN_KEYS.map((d) => {
                  const s = Number(scores[d.key] || 0);
                  return (
                    <div key={d.key} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">{d.label}</div>
                          <div className="text-xs text-gray-500">{classifyLevel(s)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold">{s.toFixed(2)}</div>
                          <div className="text-xs text-gray-500">/ 5.0</div>
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-gray-700">{getInterpretation(d.key, s)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Table with details */}
          <div>
            <h4 className="font-semibold text-lg mb-3">Tabla de Resultados e Interpretación por Dominio</h4>
            <div className="overflow-x-auto bg-white border rounded-lg">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-sm font-medium">Dominio de IE (Goleman)</th>
                    <th className="px-4 py-3 text-sm font-medium">Puntaje Promedio</th>
                    <th className="px-4 py-3 text-sm font-medium">Nivel de Competencia</th>
                    <th className="px-4 py-3 text-sm font-medium">Interpretación Detallada</th>
                  </tr>
                </thead>
                <tbody>
                  {DOMAIN_KEYS.map((d) => {
                    const s = Number(scores[d.key] || 0);
                    return (
                      <tr key={d.key} className="border-b">
                        <td className="px-4 py-3 text-sm">{d.label}</td>
                        <td className="px-4 py-3 text-sm">{s.toFixed(2)} / 5.0</td>
                        <td className="px-4 py-3 text-sm">{classifyLevel(s)}</td>
                        <td className="px-4 py-3 text-sm">{getInterpretation(d.key, s)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Conclusion and recommendations */}
          <div>
            <h4 className="font-semibold text-lg mb-2">Conclusión del Perfil de IE</h4>
            <p className="text-sm text-gray-700 mb-4">{conclusion}</p>

            <h5 className="font-semibold mb-2">Recomendaciones y Plan de Acción</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 border rounded-lg">
                <div className="font-medium">Área de Fortalezca (Apalancamiento)</div>
                <div className="text-sm text-gray-700 mt-2">Mentoría en {highest.label} para potenciar el uso de esta fortaleza en roles donde se gestionan relaciones.</div>
              </div>
              <div className="p-3 border rounded-lg">
                <div className="font-medium">Dominio Crítico (Desarrollo)</div>
                <div className="text-sm text-gray-700 mt-2">Curso de {lowest.label} y acompañamiento de coaching para mejorar {lowest.label.toLowerCase()}.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
