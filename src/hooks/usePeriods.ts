import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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

                const now = new Date();
                const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
                const active = periodsList.find(p => p.start_date <= today && p.end_date >= today);
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
