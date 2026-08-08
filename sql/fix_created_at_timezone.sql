-- orders.created_at y designs.created_at eran "timestamp without time zone",
-- las unicas dos columnas de todo el schema publico sin timezone (todo el
-- resto ya usa timestamptz). Postgres/PostgREST devuelve esos valores sin
-- sufijo de zona (sin "Z"/offset), y el frontend (new Date(...)) los
-- reinterpreta como hora LOCAL del navegador (Argentina) en vez de UTC.
-- Como los datos ya estaban guardados como UTC (via el default now() de
-- Postgres, o via new Date().toISOString() del frontend en carga manual de
-- pedidos), el resultado era que toda hora se mostraba 3 horas adelantada
-- (el offset de Argentina, UTC-3) en cualquier lugar que la mostrara:
-- admin, produccion, etc — no era un bug de un lugar puntual, sino del tipo
-- de columna en si, que afectaba a todos los que la leian por igual.
--
-- USING ... AT TIME ZONE 'UTC' preserva los datos existentes tal cual estan
-- (misma hora, ahora con la marca de zona correcta) en vez de correrlos.
--
-- Aplicado en produccion (Supabase) el 2026-08-08 via MCP apply_migration.
-- Verificado despues: mismos digitos de created_at, ahora con sufijo +00.

alter table public.orders
  alter column created_at type timestamptz using created_at at time zone 'UTC';

alter table public.designs
  alter column created_at type timestamptz using created_at at time zone 'UTC';
