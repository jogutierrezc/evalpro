#!/usr/bin/env python3
"""Exporta los DATOS de un proyecto Supabase a un unico archivo .sql.

El esquema NO se exporta aqui: se crea con las migraciones
(nuevo-proyecto-supabase/migrations). Este script genera INSERTs para
cargar los datos en el proyecto nuevo, despues de aplicar las migraciones.

Uso:
    export DATABASE_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
    python export_supabase_data.py --output ../exports
    python export_supabase_data.py --include-auth          # incluye auth.users / auth.identities
    python export_supabase_data.py --exclude-table notification_log

Importar en el proyecto nuevo:
    psql "$NEW_DATABASE_URL" -f ../exports/export_data_<fecha>.sql
"""

import argparse
import datetime
import os
import sys

import psycopg2

BATCH_SIZE = 500
# Tablas de respaldo temporales creadas por migraciones antiguas.
DEFAULT_EXCLUDES = {"_backup_colaboradores", "_backup_collaborator_offices"}
AUTH_TABLES = [("auth", "users"), ("auth", "identities")]


def q_ident(name):
    return '"' + name.replace('"', '""') + '"'


def q_lit(value):
    """Literal SQL de un valor ya convertido a texto (None -> NULL)."""
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def qualified(schema, table):
    return f"{q_ident(schema)}.{q_ident(table)}"


def list_tables(cur, exclude):
    cur.execute(
        """
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
        """
    )
    return [("public", r[0]) for r in cur.fetchall() if r[0] not in exclude]


def fk_edges(cur):
    """Devuelve {(schema, tabla): {(schema, tabla_referenciada), ...}} (sin autoreferencias)."""
    cur.execute(
        """
        SELECT cn.nspname, c.relname, rn.nspname, r.relname
        FROM pg_constraint k
        JOIN pg_class c  ON c.oid = k.conrelid
        JOIN pg_namespace cn ON cn.oid = c.relnamespace
        JOIN pg_class r  ON r.oid = k.confrelid
        JOIN pg_namespace rn ON rn.oid = r.relnamespace
        WHERE k.contype = 'f' AND k.conrelid <> k.confrelid
        """
    )
    deps = {}
    for cs, ct, rs, rt in cur.fetchall():
        deps.setdefault((cs, ct), set()).add((rs, rt))
    return deps


def topo_sort(tables, deps):
    """Ordena para que cada tabla vaya despues de las que referencia. Ciclos: orden alfabetico."""
    pending = list(sorted(tables))
    selected = set(pending)
    done, ordered = set(), []
    while pending:
        ready = [t for t in pending if not (deps.get(t, set()) & selected) - done]
        if not ready:  # ciclo: se rompe por el primero (se ejecuta con replica, ver cabecera)
            ready = [pending[0]]
        for t in ready:
            ordered.append(t)
            done.add(t)
            pending.remove(t)
    return ordered


def insertable_columns(cur, schema, table):
    """Columnas no generadas, con su tipo formateado."""
    cur.execute(
        """
        SELECT a.attname, format_type(a.atttypid, a.atttypmod)
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = %s AND c.relname = %s
          AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
        ORDER BY a.attnum
        """,
        (schema, table),
    )
    return cur.fetchall()


def sequences_to_reset(cur, schema, table):
    """(columna, secuencia) de columnas serial/identity de la tabla."""
    cur.execute(
        """
        SELECT a.attname, pg_get_serial_sequence(%s, a.attname)
        FROM pg_attribute a
        WHERE a.attrelid = %s::regclass AND a.attnum > 0 AND NOT a.attisdropped
        """,
        (qualified(schema, table), qualified(schema, table)),
    )
    return [(c, s) for c, s in cur.fetchall() if s]


def export_table(conn, out, schema, table):
    with conn.cursor() as cur:
        cols = insertable_columns(cur, schema, table)
        seqs = sequences_to_reset(cur, schema, table)
    if not cols:
        return 0

    col_list = ", ".join(q_ident(c) for c, _ in cols)
    select_list = ", ".join(f"{q_ident(c)}::text" for c, _ in cols)
    types = [t for _, t in cols]
    full = qualified(schema, table)

    out.write(f"\n-- {full}\n")
    total = 0
    # cursor con nombre = server-side, no carga toda la tabla en memoria
    with conn.cursor(name=f"exp_{schema}_{table}"[:60]) as cur:
        cur.itersize = BATCH_SIZE
        cur.execute(f"SELECT {select_list} FROM {full}")
        batch = []

        def flush():
            if batch:
                out.write(
                    f"INSERT INTO {full} ({col_list}) OVERRIDING SYSTEM VALUE VALUES\n  "
                    + ",\n  ".join(batch)
                    + "\nON CONFLICT DO NOTHING;\n"
                )
                batch.clear()

        for row in cur:
            values = [
                "NULL" if v is None else f"{q_lit(v)}::{t}" for v, t in zip(row, types)
            ]
            batch.append("(" + ", ".join(values) + ")")
            total += 1
            if len(batch) >= BATCH_SIZE:
                flush()
        flush()

    for col, seq in seqs:
        out.write(
            f"SELECT setval('{seq}', COALESCE((SELECT MAX({q_ident(col)}) FROM {full}), 1), "
            f"(SELECT MAX({q_ident(col)}) FROM {full}) IS NOT NULL);\n"
        )
    return total


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--database-url", default=os.environ.get("DATABASE_URL"),
                   help="Cadena de conexion (o variable DATABASE_URL)")
    p.add_argument("--output", default="../exports", help="Carpeta de salida")
    p.add_argument("--include-auth", action="store_true",
                   help="Incluye auth.users y auth.identities (contiene hashes de contrasena)")
    p.add_argument("--exclude-table", action="append", default=[],
                   help="Tabla de public a omitir (repetible)")
    args = p.parse_args()

    if not args.database_url:
        sys.exit("Falta la conexion: usa --database-url o la variable DATABASE_URL")

    os.makedirs(args.output, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(args.output, f"export_data_{stamp}.sql")

    conn = psycopg2.connect(args.database_url)
    conn.set_session(readonly=True, isolation_level="REPEATABLE READ")  # foto consistente

    with conn.cursor() as cur:
        public_tables = list_tables(cur, DEFAULT_EXCLUDES | set(args.exclude_table))
        deps = fk_edges(cur)
    auth_tables = AUTH_TABLES if args.include_auth else []
    ordered = topo_sort(auth_tables + public_tables, deps)

    counts = {}
    with open(path, "w", encoding="utf-8", newline="\n") as out:
        out.write(f"-- Exportacion de datos EvalPro - {datetime.datetime.now().isoformat()}\n")
        out.write("-- Aplicar DESPUES de las migraciones del esquema.\n")
        out.write("SET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;\n")
        out.write("-- Desactiva FKs/triggers durante la carga (tablas con autorreferencias y ciclos).\n")
        out.write("SET session_replication_role = replica;\nBEGIN;\n")
        for schema, table in ordered:
            counts[(schema, table)] = export_table(conn, out, schema, table)
            print(f"{schema}.{table}: {counts[(schema, table)]} filas")
        out.write("\nCOMMIT;\nSET session_replication_role = DEFAULT;\n")

    conn.close()
    print(f"\nListo: {path} ({sum(counts.values())} filas, {len(counts)} tablas)")
    if args.include_auth:
        print("AVISO: el archivo contiene hashes de contrasena. No lo subas a git.")


if __name__ == "__main__":
    main()
