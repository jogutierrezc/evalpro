-- ============================================================
-- Script: Asignar todo el personal actual al periodo 2025
-- Uso:   psql -U <user> -d <db> -f scripts/assign_users_to_period_2025.sql
-- ============================================================

DO $$
DECLARE
    target_period_id uuid;
    inserted_count integer := 0;
    skipped_count integer := 0;
BEGIN

    -- 1. Buscar (o crear) el periodo del año 2025
    --    Si ya existe un periodo en 2025, lo usamos; si hay varios, tomamos el más reciente.
    SELECT id INTO target_period_id
    FROM evaluation_periods
    WHERE year = 2025
    ORDER BY start_date DESC
    LIMIT 1;

    IF target_period_id IS NULL THEN
        -- No existe periodo 2025 → crear uno por defecto (ene-dic 2025, inactivo)
        INSERT INTO evaluation_periods (year, start_date, end_date, is_active)
        VALUES (2025, '2025-01-01', '2025-12-31', false)
        RETURNING id INTO target_period_id;

        RAISE NOTICE 'Periodo 2025 creado con id: %', target_period_id;
    ELSE
        RAISE NOTICE 'Usando periodo 2025 existente con id: %', target_period_id;
    END IF;

    -- 2. Insertar todos los usuarios no-admin como colaboradores del periodo
    --    Se excluye el rol 'admin' para no saturar la lista.
    --    Usamos ON CONFLICT para saltar los que ya estén asignados.
    INSERT INTO period_collaborators (period_id, user_id, is_active, role_in_period)
    SELECT
        target_period_id,
        u.id,
        true,
        u.role
    FROM users u
    WHERE u.role IS DISTINCT FROM 'admin'
      AND u.role IS DISTINCT FROM 'administrador'
    ON CONFLICT (period_id, user_id) DO NOTHING;

    -- 3. Informar resultados
    GET DIAGNOSTICS inserted_count = ROW_COUNT;

    -- Contar los que ya existían (skipped)
    SELECT COUNT(*) INTO skipped_count
    FROM period_collaborators
    WHERE period_id = target_period_id;

    RAISE NOTICE '--------------------------------------------';
    RAISE NOTICE 'Insertados: % colaboradores', inserted_count;
    RAISE NOTICE 'Total en periodo_collaborators para 2025: %', skipped_count;
    RAISE NOTICE '--------------------------------------------';

END $$;
