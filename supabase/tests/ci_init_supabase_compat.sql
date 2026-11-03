-- ==============================================================================
-- Beastmode 90 — CI Supabase Compatibility Layer Initialization
-- File: supabase/tests/ci_init_supabase_compat.sql
-- Description:
--   Initializes Supabase-compatible roles, schemas, auth mock tables,
--   and session-variable helper functions (auth.uid(), auth.role(), auth.jwt())
--   in an isolated PostgreSQL container for CI / staging test execution.
-- ==============================================================================

-- 1. Create Supabase Standard Roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOLOGIN;
  END IF;
END $$;

-- Allow postgres superuser to switch to authenticated/anon via SET LOCAL ROLE
GRANT anon, authenticated, service_role TO postgres;

-- 2. Auth Schema
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, postgres;

-- 3. Mock auth.users table for Foreign Key References
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  raw_app_meta_data JSONB DEFAULT '{}'::jsonb,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Fixture Users (Alice, Bob, Charlie)
INSERT INTO auth.users (id, email)
VALUES
  ('a1111111-0000-0000-0000-000000000001', 'alice@beastmode.test'),
  ('b2222222-0000-0000-0000-000000000002', 'bob@beastmode.test'),
  ('c3333333-0000-0000-0000-000000000003', 'charlie@beastmode.test')
ON CONFLICT (id) DO NOTHING;

-- 4. Supabase JWT Session Variable Functions
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text;
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    jsonb_build_object(
      'sub', current_setting('request.jwt.claim.sub', true),
      'role', current_setting('request.jwt.claim.role', true)
    )
  );
$$;

-- Grant Execution Permissions
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role, postgres;

-- 5. Standard Public Schema Grants for Supabase Execution
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;

