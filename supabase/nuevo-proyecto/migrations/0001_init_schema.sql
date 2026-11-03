-- ============================================
-- Migracion 0001: Configuracion Inicial
-- ============================================

-- Extension para generar UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Configuracion de zona horaria
SET timezone = 'UTC';

-- Configuracion de cliente
SET client_encoding = 'UTF8';

-- Mensaje de inicio
DO $$ BEGIN RAISE NOTICE 'Ejecutando migracion 0001: Configuracion Inicial'; END $$;
