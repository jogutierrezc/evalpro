import { useState, useEffect } from 'react';
import { supabase, Evaluation, EvaluationQuestion, EvaluationResponse } from '../../lib/supabase';
import { ArrowLeft, Save } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface EvaluationFormProps {
  evaluation: Evaluation;
  onClose: () => void;
}

export function EvaluationForm({ evaluation, onClose }: EvaluationFormProps) {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadQuestionsAndResponses();
  }, [evaluation.id]);

  const loadQuestionsAndResponses = async () => {
    try {
      const [questionsRes, responsesRes] = await Promise.all([
        supabase
          .from('evaluation_questions')
          .select('*')
          .eq('template_id', evaluation.template_id)
          .order('order_index'),
        supabase
          .from('evaluation_responses')
          .select('*')
          .eq('evaluation_id', evaluation.id),
      ]);

      if (questionsRes.error) throw questionsRes.error;
      if (responsesRes.error) throw responsesRes.error;

      setQuestions(questionsRes.data || []);

      const responsesMap: Record<string, any> = {};
      responsesRes.data?.forEach((response) => {
        responsesMap[response.question_id] = response.response_value;
      });
      setResponses(responsesMap);

      if (evaluation.status === 'pending') {
        await supabase
          .from('evaluations')
          .update({ status: 'in_progress', started_at: new Date().toISOString() })
          .eq('id', evaluation.id);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResponseChange = (questionId: string, value: any) => {
    setResponses({ ...responses, [questionId]: value });
  };

  const handleSave = async (complete: boolean = false) => {
    setSaving(true);

    try {
      await supabase
        .from('evaluation_responses')
        .delete()
        .eq('evaluation_id', evaluation.id);

      const responsesToInsert = Object.entries(responses).map(([questionId, value]) => ({
        evaluation_id: evaluation.id,
        question_id: questionId,
        response_value: value,
      }));

      if (responsesToInsert.length > 0) {
        const { error: responsesError } = await supabase
          .from('evaluation_responses')
          .insert(responsesToInsert);

        if (responsesError) throw responsesError;
      }

      if (complete) {
        const allAnswered = questions.every((q) => responses[q.id] !== undefined);
        if (!allAnswered) {
          alert('Por favor responde todas las preguntas antes de completar');
          setSaving(false);
          return;
        }

        await supabase
          .from('evaluations')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', evaluation.id);

        const overallScore = calculateOverallScore();

        await supabase.from('evaluation_results').insert([
          {
            evaluation_id: evaluation.id,
            overall_score: overallScore,
            category_scores: {},
          },
        ]);

        alert('Evaluación completada exitosamente');
        onClose();
      } else {
        alert('Progreso guardado');
      }
    } catch (error) {
      console.error('Error saving evaluation:', error);
      alert('Error al guardar la evaluación');
    } finally {
      setSaving(false);
    }
  };

  const calculateOverallScore = () => {
    const ratingQuestions = questions.filter((q) => q.question_type === 'rating');
    if (ratingQuestions.length === 0) return 0;

    const total = ratingQuestions.reduce((sum, q) => {
      const value = responses[q.id] || 0;
      return sum + (typeof value === 'number' ? value : 0);
    }, 0);

    return (total / ratingQuestions.length).toFixed(2);
  };

  const renderQuestion = (question: EvaluationQuestion) => {
    switch (question.question_type) {
      case 'rating':
        return (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => handleResponseChange(question.id, rating)}
                className={`w-12 h-12 border-2 rounded-lg font-semibold transition-all ${
                  responses[question.id] === rating
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 hover:border-blue-300'
                }`}
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
              <label
                key={idx}
                className="flex items-center gap-3 cursor-pointer p-3 border-2 border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  checked={responses[question.id] === option}
                  onChange={() => handleResponseChange(question.id, option)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );
      case 'text':
        return (
          <textarea
            value={responses[question.id] || ''}
            onChange={(e) => handleResponseChange(question.id, e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={4}
            placeholder="Escribe tu respuesta..."
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Evaluación</h1>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              Completa todas las preguntas de esta evaluación. Puedes guardar tu progreso y continuar más tarde.
            </p>
          </div>
        </div>

        <div className="space-y-8">
          {questions.map((question, index) => (
            <div key={question.id} className="pb-8 border-b border-gray-200 last:border-0">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {index + 1}. {question.question_text}
              </h3>
              {renderQuestion(question)}
            </div>
          ))}
        </div>

        {questions.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            Este formulario no tiene preguntas configuradas
          </div>
        )}

        {questions.length > 0 && (
          <div className="mt-8 flex gap-3 pt-6 border-t border-gray-200">
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              Guardar Progreso
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              Completar Evaluación
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
