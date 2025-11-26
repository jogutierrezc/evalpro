import { useState } from 'react';
import {
    BookOpen,
    ChevronRight,
    ChevronLeft,
    LogIn,
    LayoutDashboard,
    FileCheck,
    BarChart3,
    CheckCircle2
} from 'lucide-react';

export function UserGuideModule() {
    const [currentStep, setCurrentStep] = useState(0);

    const steps = [
        {
            title: "1. Acceso al Sistema",
            description: "Ingrese al sistema PRISMA utilizando sus credenciales institucionales. Asegúrese de seleccionar su rol correcto si el sistema lo solicita.",
            image: "/guide_login.png",
            icon: LogIn,
            tips: [
                "Utilice su correo institucional completo.",
                "Si olvidó su contraseña, contacte a soporte técnico.",
                "El acceso es compatible con dispositivos móviles."
            ]
        },
        {
            title: "2. Panel de Control (Dashboard)",
            description: "Al ingresar, verá el Dashboard principal. Aquí encontrará un resumen de sus evaluaciones pendientes, completadas y métricas clave.",
            image: "/guide_dashboard.png",
            icon: LayoutDashboard,
            tips: [
                "Verifique las notificaciones en la parte superior.",
                "El menú lateral le permite navegar entre módulos.",
                "Los indicadores de color muestran el estado de sus tareas."
            ]
        },
        {
            title: "3. Realizar una Evaluación",
            description: "Seleccione 'Evaluaciones' en el menú. Elija la evaluación pendiente y responda cada pregunta seleccionando la escala de 1 a 5.",
            image: "/guide_evaluation.png",
            icon: FileCheck,
            tips: [
                "Lea cuidadosamente cada pregunta antes de responder.",
                "Puede guardar su progreso y continuar después.",
                "Asegúrese de responder todas las preguntas obligatorias."
            ]
        },
        {
            title: "4. Visualización de Resultados",
            description: "Una vez completada la evaluación, podrá ver los resultados detallados en el módulo 'Resultados', incluyendo gráficos de radar y barras.",
            image: "/guide_results.png",
            icon: BarChart3,
            tips: [
                "Los gráficos de radar comparan su desempeño con el promedio.",
                "Puede descargar los informes en formato PDF.",
                "Revise las recomendaciones automáticas generadas por el sistema."
            ]
        }
    ];

    const nextStep = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="text-center mb-10">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
                    <BookOpen className="w-8 h-8 text-blue-600" />
                    Guía de Usuario PRISMA
                </h1>
                <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
                    Aprenda a utilizar el sistema de evaluación de desempeño paso a paso.
                    Siga esta guía visual para completar sus procesos de manera efectiva.
                </p>
            </div>

            {/* Progress Bar */}
            <div className="flex justify-center mb-8">
                <div className="flex items-center gap-2">
                    {steps.map((_, idx) => (
                        <div
                            key={idx}
                            className={`h-2 w-16 rounded-full transition-all duration-300 ${idx === currentStep ? 'bg-blue-600 w-24' :
                                    idx < currentStep ? 'bg-green-500' : 'bg-gray-200'
                                }`}
                        />
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 flex flex-col md:flex-row min-h-[600px]">

                {/* Left Content */}
                <div className="w-full md:w-1/3 p-8 bg-slate-50 flex flex-col justify-between border-r border-gray-100">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-bold mb-6">
                            Paso {currentStep + 1} de {steps.length}
                        </div>

                        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                            {(() => {
                                const Icon = steps[currentStep].icon;
                                return <Icon className="w-6 h-6 text-blue-600" />;
                            })()}
                            {steps[currentStep].title}
                        </h2>

                        <p className="text-gray-600 leading-relaxed mb-8 text-lg">
                            {steps[currentStep].description}
                        </p>

                        <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
                            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                Tips Importantes
                            </h3>
                            <ul className="space-y-3">
                                {steps[currentStep].tips.map((tip, idx) => (
                                    <li key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                                        {tip}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="flex gap-4 mt-8">
                        <button
                            onClick={prevStep}
                            disabled={currentStep === 0}
                            className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5" />
                            Anterior
                        </button>
                        <button
                            onClick={nextStep}
                            disabled={currentStep === steps.length - 1}
                            className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-200"
                        >
                            Siguiente
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Right Image */}
                <div className="w-full md:w-2/3 bg-gray-100 relative group overflow-hidden flex items-center justify-center p-8">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5" />
                    <img
                        src={steps[currentStep].image}
                        alt={steps[currentStep].title}
                        className="rounded-lg shadow-2xl max-w-full max-h-full object-contain transform transition-transform duration-700 hover:scale-105"
                    />
                </div>
            </div>
        </div>
    );
}
