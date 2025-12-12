import React, { useState, useEffect } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

interface PrismaLoaderProps {
  messages?: string[];
  interval?: number;
}

const DEFAULT_MESSAGES = [
  "¿Sabías que Prisma es un Motor de Inteligencia Artificial?",
  "Pensado en la valoración y seguimiento de resultados de evaluación de desempeño de la Universidad de Santander.",
  "Analizando patrones de comportamiento y competencias...",
  "Generando recomendaciones personalizadas para el desarrollo profesional...",
  "Identificando fortalezas y oportunidades de mejora...",
  "Procesando datos históricos para una evaluación más precisa..."
];

export const PrismaLoader: React.FC<PrismaLoaderProps> = ({ 
  messages = DEFAULT_MESSAGES, 
  interval = 4000 
}) => {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % messages.length);
    }, interval);

    return () => clearInterval(timer);
  }, [messages, interval]);

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6 min-h-[400px]">
      <div className="w-64 h-64">
        <DotLottieReact
          src="https://lottie.host/b8c0c422-5016-4f23-87e9-b452fd3a2d72/KGUKJTbWv6.lottie"
          loop
          autoplay
        />
      </div>
      
      <div className="max-w-md text-center space-y-2 animate-fade-in">
        <h3 className="text-xl font-semibold text-blue-900">
          Generando Análisis Inteligente
        </h3>
        <p className="text-slate-600 text-lg min-h-[3.5rem] transition-all duration-500 ease-in-out">
          {messages[currentMessageIndex]}
        </p>
      </div>
    </div>
  );
};
