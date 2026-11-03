# Supabase Migration Toolkit

Exporta los **datos** de un proyecto Supabase a un único `.sql` para cargarlos en otro proyecto.
El **esquema** se crea con las migraciones de `../nuevo-proyecto-supabase/migrations`.

## Flujo

1. En el proyecto nuevo, aplica las migraciones (`supabase db push`).
2. Exporta los datos del proyecto antiguo:

```bash
pip install -r scripts/requirements.txt
export DATABASE_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
python scripts/export_supabase_data.py --output exports --include-auth
```

3. Carga el archivo generado en el proyecto nuevo:

```bash
psql "$NEW_DATABASE_URL" -f exports/export_data_<fecha>.sql
```

## Opciones

| Opción | Efecto |
|---|---|
| `--database-url` | Conexión (alternativa a `DATABASE_URL`) |
| `--output` | Carpeta de salida (por defecto `../exports`) |
| `--include-auth` | Incluye `auth.users` y `auth.identities` (necesario para que `public.users.id` encuentre su usuario; trae hashes de contraseña) |
| `--exclude-table T` | Omite una tabla de `public` (repetible) |

## Cómo funciona

- Lee en una transacción de solo lectura (`REPEATABLE READ`): foto consistente.
- Ordena las tablas por dependencias de claves foráneas.
- Genera `INSERT ... ON CONFLICT DO NOTHING` por lotes, con cada valor convertido a texto y casteado a su tipo (sirve para `jsonb`, arrays, `uuid`, `timestamptz`...).
- Omite columnas generadas y reinicia las secuencias (`setval`).
- Usa `session_replication_role = replica` durante la carga para tolerar autorreferencias (`users.manager_id`, `offices.parent_id`).
- Omite `_backup_*`.

## Seguridad

La carpeta `exports/` está en `.gitignore`: los volcados contienen datos personales y hashes de contraseña. No los subas al repositorio.
