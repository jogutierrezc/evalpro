import { createClient } from '@supabase/supabase-js';

// Use VITE env vars from Vite. If VITE_SUPABASE_URL is not provided, default
// to the Supabase project URL you supplied.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://abchjsydqtfbwivygpet.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_ANON_KEY in environment. Add it to a local .env (see .env.example) and restart the dev server.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = 'admin' | 'office_manager' | 'employee';

export interface User {
  id: string;
  identification: string;
  full_name: string;
  email: string | null;
  role: UserRole;
  office_id: string | null;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Office {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvaluationTemplate {
  id: string;
  name: string;
  description: string | null;
  type: 'soft_skills' | 'self_evaluation' | 'manager_to_employee' | 'employee_to_manager';
  job_position: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvaluationQuestion {
  id: string;
  template_id: string;
  question_text: string;
  question_type: 'rating' | 'multiple_choice' | 'text';
  options: any | null;
  order_index: number;
  created_at: string;
}

export interface Evaluation {
  id: string;
  template_id: string;
  evaluator_id: string;
  evaluated_id: string;
  status: 'pending' | 'in_progress' | 'completed';
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface EvaluationResponse {
  id: string;
  evaluation_id: string;
  question_id: string;
  response_value: any;
  created_at: string;
}

export interface EvaluationResult {
  id: string;
  evaluation_id: string;
  overall_score: number | null;
  category_scores: any | null;
  ai_analysis: string | null;
  recommendations: any | null;
  created_at: string;
  updated_at: string;
}
