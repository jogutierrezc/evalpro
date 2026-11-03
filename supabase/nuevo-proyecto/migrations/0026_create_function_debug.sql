-- Create a debug function to check database counts
CREATE OR REPLACE FUNCTION get_debug_stats()
RETURNS TABLE (
  total_evaluations bigint,
  completed_evaluations bigint,
  total_results bigint,
  results_with_completed_eval bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT
    (SELECT count(*) FROM evaluations) as total_evaluations,
    (SELECT count(*) FROM evaluations WHERE status = 'completed') as completed_evaluations,
    (SELECT count(*) FROM evaluation_results) as total_results,
    (SELECT count(*) FROM evaluation_results JOIN evaluations ON evaluations.id = evaluation_results.evaluation_id WHERE evaluations.status = 'completed') as results_with_completed_eval;
END;
$$;

GRANT EXECUTE ON FUNCTION get_debug_stats() TO authenticated;
