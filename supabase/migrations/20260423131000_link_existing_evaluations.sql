-- Helper migration to link existing evaluations to the most recent period
-- Use this ONLY if you want to see historical data for evaluations already performed
DO $$
DECLARE
    latest_period_id uuid;
BEGIN
    SELECT id INTO latest_period_id FROM evaluation_periods ORDER BY start_date DESC LIMIT 1;
    
    IF latest_period_id IS NOT NULL THEN
        UPDATE evaluations SET period_id = latest_period_id WHERE period_id IS NULL;
        RAISE NOTICE 'Linked evaluations to period %', latest_period_id;
    END IF;
END $$;
