import { useState, useEffect } from 'react';
import { supabase, EvaluationTemplate, EvaluationQuestion } from '../../lib/supabase';
import { ArrowLeft } from 'lucide-react';

interface TemplatePreviewProps {
  template: EvaluationTemplate;
  onClose: () => void;
}

export function TemplatePreview({ template, onClose }: TemplatePreviewProps) {
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuestions();
  }, [template.id]);

  const loadQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('evaluation_questions')
        .select('*')
        .eq('template_id', template.id)
        .order('order_index');

      if (error) throw error;
      setQuestions(data || []);
    } catch (error) {
      console.error('Error loading questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderQuestionPreview = (question: EvaluationQuestion) => {
    switch (question.question_type) {
      case 'rating':
        return (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                className="w-12 h-12 border-2 border-gray-300 rounded-lg hover:border-blue-500 transition-colors"
                disabled
              >
                {rating}
              </button>
            ))}
          </div>
        );
      case 'multiple_choice':
        return (
          <div className="space-y-2">
            {(question.options as string[])?.map((option, idx) => (
              <label key={idx} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name={`question-${question.id}`} disabled className="w-4 h-4" />
                <span className="text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );
      case 'text':
        return (
          <textarea
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={4}
            placeholder="Escribe tu respuesta..."
            disabled
          />
        );
      default:
        return null;
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div>
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        Volver
      </button>

      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{template.name}</h1>
          {template.description && (
            <p className="text-gray-600">{template.description}</p>
          )}
          {template.job_position && (
            <span className="inline-block mt-2 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
              {template.job_position}
            </span>
          )}
        </div>

        <div className="space-y-8">
          {questions.map((question, index) => (
            <div key={question.id} className="pb-8 border-b border-gray-200 last:border-0">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {index + 1}. {question.question_text}
              </h3>
              {renderQuestionPreview(question)}
            </div>
          ))}
        </div>

        {questions.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            Este formulario no tiene preguntas
          </div>
        )}
      </div>
    </div>
  );
}
