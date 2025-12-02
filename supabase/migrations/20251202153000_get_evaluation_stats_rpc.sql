-- Create a secure function to get anonymized evaluation scores for comparative analysis
-- This function runs with SECURITY DEFINER to bypass RLS on evaluation_results
CREATE OR REPLACE FUNCTION get_evaluation_stats()
RETURNS TABLE (
  score numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT overall_score
  FROM evaluation_results
  JOIN evaluations ON evaluations.id = evaluation_results.evaluation_id
  WHERE evaluations.status = 'completed'
  AND overall_score IS NOT NULL;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_evaluation_stats() TO authenticated;
