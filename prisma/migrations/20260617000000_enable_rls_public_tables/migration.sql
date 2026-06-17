-- Enable Row-Level Security (RLS) on all application tables in the `public` schema.
--
-- Why: Supabase exposes a Data API (PostgREST) reachable with the project's
-- anon key. With RLS disabled, anyone with that key could read/edit/delete
-- every row (Supabase advisor `rls_disabled_in_public`, severity Critical).
--
-- Safe for this app: the app never uses the Supabase Data API or anon key --
-- it connects only through Prisma using the `postgres` role, which carries
-- BYPASSRLS. Enabling RLS with no policy therefore denies all anon/authenticated
-- access (the goal) while Prisma keeps full access. No policies are required.
--
-- Scope: every ordinary table in `public` (31 Prisma models + _prisma_migrations).
-- Extension-owned tables (e.g. PostGIS `spatial_ref_sys`, not owned by `postgres`)
-- are excluded via pg_depend so the migration cannot fail on an un-ownable table.
-- The statement is idempotent: re-enabling RLS on a table is a no-op.
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not exists (
        select 1 from pg_depend d
        where d.objid = c.oid and d.deptype = 'e'
      )
  loop
    execute format('alter table public.%I enable row level security;', r.relname);
  end loop;
end $$;
