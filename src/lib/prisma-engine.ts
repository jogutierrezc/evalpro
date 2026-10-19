import { GoogleGenerativeAI } from "@google/generative-ai";
import { AI_ENABLED } from "./features";

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
                `El análisis detecta una disonancia crítica en el perfil. Aunque el evaluado demuestra una alta capacidad de resolución inmediata y entrega, la calificación deficiente en el factor estructural "${anchor}" revela un patrón de gestión por urgencia.`,
            accion: 'Adopción inmediata de la "Matriz de Eisenhower".'
        },
        excellence: {
            arquetipo: 'Arquitecto de Procesos y Estándares',
            analisis: () =>
                `El perfil evidencia un nivel de madurez superior en la gestión de la calidad.`,
            accion: 'Elevar a rol de "Auditor Interno de Calidad".'
        },
        good: {
            arquetipo: 'Profesional Metódico y Confiable',
            analisis: () =>
                `El evaluado presenta un desempeño sólido sustentado en hábitos de revisión constantes.`,
            accion: 'Implementar listas de chequeo (Checklists).'
        },
        development: {
            arquetipo: 'Operativo Disperso (Foco Variable)',
            analisis: () =>
                `Se identifican fluctuaciones significativas en los estándares de entrega.`,
            accion: 'Instituir la regla del "Doble Check".'
        }
    },
    resultados: {
        anchorFailure: {
            arquetipo: 'Esforzado sin Estrategia',
            analisis: (anchor) => `Falla crítica en "${anchor}".`,
            accion: 'Aplicación del PHVA.'
        },
        excellence: {
            arquetipo: 'Estratega de Alto Impacto',
            analisis: () => `Resultados excepcionales.`,
            accion: 'Proyectos Transversales.'
        },
        good: {
            arquetipo: 'Orientado al Logro',
            analisis: () => `Perfil pragmático.`,
            accion: 'Entrenamiento en resolución de problemas.'
        },
        development: {
            arquetipo: 'Ejecutor Dependiente',
            analisis: () => `Desempeño limitado a la descripción del cargo.`,
            accion: 'Delegación progresiva.'
        }
    },
    default: {
        anchorFailure: {
            arquetipo: 'Perfil Vulnerable',
            analisis: (anchor) => `Falla en pilar: ${anchor}.`,
            accion: 'Plan de recuperación.'
        },
        excellence: {
            arquetipo: 'Referente',
            analisis: () => 'Dominio total.',
            accion: 'Mentoring.'
        },
        good: {
            arquetipo: 'Sólido',
            analisis: () => 'Cumple expectativas.',
            accion: 'Nuevos retos.'
        },
        development: {
            arquetipo: 'En Formación',
            analisis: () => 'Etapa temprana.',
            accion: 'Capacitación.'
        }
    }
};

// --- 4. CLASE GENERADORA DE NARRATIVA ---

export class NarrativeGenerator {
    static generate(categoryId: string, score: number, anchorFailed: boolean, anchorText: string = '') {
        const db = NARRATIVE_DB[categoryId] || NARRATIVE_DB['default'];
        let template: NarrativeTemplate;
        let nivelRiesgo: AnalysisResult['nivelRiesgo'];

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
            template = db.development;
            nivelRiesgo = 'Crítico';
        }

        return {
            arquetipo: template.arquetipo,
            analisis: template.analisis(anchorText),
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
            return {
                category: categoryId, score: 0, rawScore: 0, maxPossibleScore: 5, percentage: 0,
                anchorFailed: false, arquetipo: 'Error', analisis: 'No configurada',
                accionSugerida: '-', nivelRiesgo: 'Bajo'
            };
        }

        let weightedSum = 0;
        let totalWeight = 0;
        let anchorFailed = false;
        let anchorQuestionText = '';
        const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        config.questions.forEach((q) => {
            const qTextNorm = normalize(q.text);
            const matchedKey = Object.keys(userAnswers).find(k => {
                const kNorm = normalize(k);
                return kNorm.includes(qTextNorm) || qTextNorm.includes(kNorm);
            });

            if (matchedKey) {
                const score = userAnswers[matchedKey];
                weightedSum += score * q.weight;
                totalWeight += q.weight;
                if (q.isAnchor && score <= 3.0) {
                    anchorFailed = true;
                    anchorQuestionText = q.text;
                }
            }
        });

        const finalScore = totalWeight > 0 ? (weightedSum / totalWeight) : 0;
        const roundedScore = parseFloat(finalScore.toFixed(2));
        const narrativa = NarrativeGenerator.generate(categoryId, roundedScore, anchorFailed, anchorQuestionText);

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

    static async callAI(prompt: string): Promise<string> {
        if (!AI_ENABLED) throw new Error('IA deshabilitada');
        const openRouterKey = import.meta.env.VITE_OPENROUTER_API_KEY;
        const googleKey = import.meta.env.VITE_GOOGLE_AI_KEY;

        console.log('[PrismaBrain] Keys check:', { 
            hasOpenRouter: !!openRouterKey, 
            hasGoogle: !!googleKey,
            openRouterModel: import.meta.env.VITE_OPENROUTER_MODEL 
        });

        let lastError = null;

        // 1. Try OpenRouter first
        if (openRouterKey && !openRouterKey.includes('your_openrouter_key')) {
            try {
                // ... (existing OpenRouter code)
                const model = import.meta.env.VITE_OPENROUTER_MODEL || "openrouter/auto";
                const siteUrl = import.meta.env.VITE_SITE_URL || 'http://localhost:5174';
                const siteName = import.meta.env.VITE_SITE_NAME || 'EvalPro UDES';

                const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${openRouterKey}`,
                        "HTTP-Referer": siteUrl,
                        "X-Title": siteName,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        "model": model,
                        "messages": [
                            { 
                                "role": "system", 
                                "content": "Eres el Sistema de Inteligencia Prisma de la Universidad de Santander (UDES). Tu objetivo es proporcionar análisis de desempeño humano profundamente profesionales, constructivos y estratégicos. Utilizas un lenguaje corporativo pero empático, enfocado en el crecimiento y la excelencia académica y administrativa. SIEMPRE responde en formato JSON puro." 
                            },
                            { "role": "user", "content": prompt }
                        ]
                    })
                });
                const data = await response.json();
                
                if (data.choices?.[0]?.message?.content) {
                    return data.choices[0].message.content;
                }
                
                if (data.error) {
                    const errorMsg = data.error.message || JSON.stringify(data.error);
                    throw new Error(`OpenRouter API Error: ${errorMsg}`);
                }
            } catch (err: any) {
                console.error("OpenRouter Error:", err);
                lastError = err;
            }
        }

        if (googleKey) {
            try {
                const genAI = new GoogleGenerativeAI(googleKey);
                const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
                const result = await model.generateContent(prompt);
                const response = await result.response;
                return response.text();
            } catch (err: any) {
                console.error("Google AI error:", err);
                lastError = err;
            }
        }

        throw lastError || new Error("No AI providers configured. Please check your .env file.");
    }

    static getCategories(): string[] {
        return Object.keys(PRISMA_KNOWLEDGE_BASE);
    }

    static async enrichWithAi(result: AnalysisResult): Promise<AnalysisResult> {
        if (!AI_ENABLED) return result;
        try {
            const prompt = `
            Realiza un análisis profundo y estratégico para el colaborador en la competencia: "${result.category}".
            Puntaje obtenido: ${result.score}/5.0.
            Arquetipo detectado: ${result.arquetipo}.
            Nivel de Riesgo: ${result.nivelRiesgo}.

            Contexto Institucional UDES (Universidad de Santander):
            Esta competencia es vital para la Calidad Académica e Integridad Institucional.
            
            Instrucciones:
            1. Proporciona un "analisis" reflexivo y profesional (máximo 450 caracteres) que explique el impacto de este desempeño en su trayectoria.
            2. Define una "accionSugerida" (máximo 300 caracteres) con pasos concretos de crecimiento profesional.
            
            IMPORTANTE: Responde ÚNICAMENTE con el objeto JSON, sin texto adicional.
            {
                "analisis": "...",
                "accionSugerida": "..."
            }
            `;
            const content = await this.callAI(prompt);
            const aiData = this.extractJson(content);
            return {
                ...result,
                analisis: aiData.analisis || result.analisis,
                accionSugerida: aiData.accionSugerida || result.accionSugerida,
                arquetipo: `${result.arquetipo}`
            };
        } catch (error) {
            console.error("Error in enrichWithAi:", error);
            return result;
        }
    }

    static extractJson(content: string): any {
        try {
            // Intentar limpiar bloques de código markdown
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return JSON.parse(content);
        } catch (e) {
            console.error("Failed to parse AI JSON:", content);
            throw new Error("Invalid AI response format");
        }
    }

    static async enrichWithAiForManager(result: AnalysisResult, evaluatedName: string): Promise<AnalysisResult> {
        if (!AI_ENABLED) return result;
        try {
            const prompt = `
            Genera una guía estratégica gerencial para el Líder sobre el desempeño de: ${evaluatedName}.
            Competencia: "${result.category}".
            Puntaje: ${result.score}/5.0.
            Arquetipo: ${result.arquetipo}.

            Instrucciones para el Líder:
            1. En "analisis", describe con enfoque de gestión de talento cómo el desempeño de ${evaluatedName} influye en la oficina (máximo 450 caracteres).
            2. En "accionSugerida", proporciona 2 pasos de liderazgo (feedback o delegación) específicos (máximo 300 caracteres).
            
            Responde ÚNICAMENTE el objeto JSON:
            {
                "analisis": "...",
                "accionSugerida": "..."
            }
            `;
            const content = await this.callAI(prompt);
            const aiData = this.extractJson(content);
            return {
                ...result,
                analisis: aiData.analisis || result.analisis,
                accionSugerida: aiData.accionSugerida || result.accionSugerida,
                arquetipo: `${result.arquetipo}`
            };
        } catch (error) {
            console.error("Error in enrichWithAiForManager:", error);
            return result;
        }
    }

    static async generateExecutiveReport(stats: any): Promise<string> {
        if (!AI_ENABLED) return '';
        try {
            const prompt = `Reporte Ejecutivo Universidad. Promedio Global: ${stats.globalAverage.toFixed(2)}. Redacta 3 párrafos en Markdown.`;
            return await this.callAI(prompt);
        } catch (error) {
            return "No se pudo generar el reporte.";
        }
    }

    static async generateCampusReport(campusName: string, stats: any): Promise<any> {
        if (!AI_ENABLED) return null;
        try {
            const prompt = `Reporte Campus ${campusName}. Puntaje: ${stats.globalScore.toFixed(2)}. Responde solo JSON con executiveSummary, strategicDiagnosis, strengths[], weaknesses[], recommendations[], actionPlan{shortTerm[], mediumTerm[], longTerm[]}.`;
            const text = await this.callAI(prompt);
            const cleanText = text.replace(/```json\n|\n```/g, '').trim();
            return JSON.parse(cleanText);
        } catch (error) {
            return null;
        }
    }

    static async generateUniversityReport(stats: any): Promise<any> {
        if (!AI_ENABLED) return null;
        try {
            const prompt = `Reporte Nacional UDES. Promedio: ${stats.globalAverage.toFixed(2)}. Responde solo JSON similar al de campus pero con lowPerformanceActionPlan.`;
            const text = await this.callAI(prompt);
            const cleanText = text.replace(/```json\n|\n```/g, '').trim();
            return JSON.parse(cleanText);
        } catch (error) {
            return null;
        }
    }
}
