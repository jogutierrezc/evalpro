import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Get the current local date as ISO string (YYYY-MM-DD) with timezone adjustment.
 */
export function getLocalDateString(): string {
    const now = new Date();
    const local = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 10);
}

/**
 * Check if a date string (from DB) falls within a range, comparing as Date objects.
 * This handles both 'date' type strings (YYYY-MM-DD) and timestamptz strings.
 */
export function isDateInRange(dateStr: string, startStr: string, endStr: string): boolean {
    const date = new Date(dateStr + 'T00:00:00');
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    return date >= start && date <= end;
}

/**
 * Determine if a period is currently active based on date range and is_active flag.
 */
export function isPeriodActive(period: { start_date: string; end_date: string; is_active?: boolean }): boolean {
    // If is_active is explicitly false, period is not active
    if (period.is_active === false) return false;
    const today = getLocalDateString();
    return isDateInRange(today, period.start_date, period.end_date);
}

export function usePeriods() {
    const [periods, setPeriods] = useState<any[]>([]);
    const [activePeriod, setActivePeriod] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadPeriods() {
            try {
                const { data } = await supabase
                    .from('evaluation_periods')
                    .select('*')
                    .order('start_date', { ascending: false });
                
                const periodsList = data || [];
                setPeriods(periodsList);

                const active = periodsList.find((p: any) => isPeriodActive(p));
                setActivePeriod(active || null);
            } catch (err) {
                console.error('Error loading periods:', err);
            } finally {
                setLoading(false);
            }
        }
        loadPeriods();
    }, []);

    return { periods, activePeriod, loading };
}
