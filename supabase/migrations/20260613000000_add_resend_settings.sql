-- Verificar si la tabla admin_settings existe, si no, crearla
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'admin_settings') THEN
    CREATE TABLE public.admin_settings (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      key text NOT NULL,
      value jsonb DEFAULT '{}'::jsonb,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now(),
      CONSTRAINT admin_settings_pkey PRIMARY KEY (id),
      CONSTRAINT admin_settings_key_key UNIQUE (key)
    ) TABLESPACE pg_default;
  END IF;
END $$;

-- Insertar o actualizar la configuración de Resend
INSERT INTO public.admin_settings (key, value)
VALUES (
  'resend_config',
  jsonb_build_object(
    'api_key', '',
    'from_email', 'notificaciones@evalpro.udes.edu.co',
    'enabled', false
  )
)
ON CONFLICT (key) DO UPDATE SET
  value = jsonb_build_object(
    'api_key', COALESCE(admin_settings.value->>'api_key', ''),
    'from_email', COALESCE(admin_settings.value->>'from_email', 'notificaciones@evalpro.udes.edu.co'),
    'enabled', COALESCE((admin_settings.value->>'enabled')::boolean, false)
  ),
  updated_at = now();
