# IČO & Invoice Extractor Configuration

This application requires API keys to function.

## 1. Get Your Keys

### Google Gemini API
- **Link**: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- **Key**: `API_KEY`

### Supabase
- **Link**: [https://supabase.com/dashboard](https://supabase.com/dashboard) -> Select Project -> Project Settings -> API
- **URL**: `SUPABASE_URL`
- **Key**: `SUPABASE_ANON_KEY` (use the `anon public` key)

---

## 2. Local Development Setup

1. Create a file named `.env` in the root directory.
2. Paste your keys:
   ```bash
   API_KEY=your_gemini_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
3. Run `npm run dev`.

---

## 3. Deployment on Render.com

Since you cannot upload `.env` files to Render, you must set them in the dashboard.

1. Go to your **Render Dashboard**.
2. Select your Service.
3. Click **Environment** in the left sidebar.
4. Click **Add Environment Variable**.
5. Add all 3 keys (`API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`).
6. **Trigger a new deployment** (Manual Deploy -> Clear Cache & Deploy) so the build process can read these variables.

---

## 4. Database Setup (SQL)

Copy and run the following script in your **Supabase SQL Editor** to set up all tables and permissions.

```sql
-- === V36 MIGRATION: INVOICE ALLOCATION SUMMARY & RLS OPTIMIZATION ===
-- Designed for a CLEAN, FRESH SUPABASE PROJECT.
-- Adds total_allocated_amount and has_allocations columns to 'invoices' table.
-- Creates a trigger to automatically update these fields when 'invoice_allocations' change.
-- Optimizes RLS policies for better performance and fixes foreign key cascades.

-- 1. AGGRESSIVE CLEANUP (Ensuring a truly fresh start by dropping tables first if needed)
DO $$
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE 'Starting aggressive cleanup...';

    -- First, drop all policies to avoid conflicts
    RAISE NOTICE 'Dropping policies...';
    FOR r IN (
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN ('profiles', 'projects', 'budgets', 'budget_lines', 'project_assignments', 'user_invitations', 'invoices', 'invoice_allocations')
    )
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.' || r.tablename || ';';
        RAISE NOTICE 'Dropped policy: % on %', r.policyname, r.tablename;
    END LOOP;
    RAISE NOTICE 'Policies dropped.';

    -- Drop all functions (CASCADE to remove any dependent views, etc.)
    RAISE NOTICE 'Dropping functions...';
    DROP FUNCTION IF EXISTS claim_invited_role(text) CASCADE;
    DROP FUNCTION IF EXISTS get_my_app_role_safe() CASCADE;
    DROP FUNCTION IF EXISTS is_admin() CASCADE;
    DROP FUNCTION IF EXISTS is_superuser_app() CASCADE;
    DROP FUNCTION IF EXISTS is_user_project_member(uuid, bigint) CASCADE;
    DROP FUNCTION IF EXISTS is_current_user_invoice_project_member(bigint) CASCADE;
    DROP FUNCTION IF EXISTS admin_reset_user_password(uuid, text) CASCADE;
    DROP FUNCTION IF EXISTS superuser_reset_password(uuid, text) CASCADE;
    DROP FUNCTION IF EXISTS delete_team_member(uuid) CASCADE;
    DROP FUNCTION IF EXISTS update_invoice_allocation_summary() CASCADE;
    DROP FUNCTION IF EXISTS is_producer_allowed_invoice_update_check(BIGINT, TEXT, NUMERIC, BOOLEAN, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS is_producer_allowed_to_update_invoice_access(BIGINT) CASCADE;
    
    -- Clean up old function names if they exist
    DROP FUNCTION IF EXISTS get_my_role_safe() CASCADE;
    DROP FUNCTION IF EXISTS get_my_team_mates() CASCADE;
    DROP FUNCTION IF EXISTS is_project_member(bigint) CASCADE;
    DROP FUNCTION IF EXISTS is_project_owner(bigint) CASCADE;
    DROP FUNCTION IF EXISTS get_profile_role(uuid) CASCADE;
    DROP FUNCTION IF EXISTS check_email_exists_global(text) CASCADE;
    RAISE NOTICE 'Functions dropped.';

    -- Drop tables with CASCADE to remove dependent objects like FKs and TRiggers
    -- Order from most dependent to least dependent, or just all with CASCADE.
    RAISE NOTICE 'Dropping tables with CASCADE (if they exist)...';
    DROP TABLE IF EXISTS invoice_allocations CASCADE;
    DROP TABLE IF EXISTS invoices CASCADE;
    DROP TABLE IF EXISTS user_invitations CASCADE;
    DROP TABLE IF EXISTS project_assignments CASCADE;
    DROP TABLE IF EXISTS budget_lines CASCADE;
    DROP TABLE IF EXISTS budgets CASCADE;
    DROP TABLE IF EXISTS projects CASCADE;
    DROP TABLE IF EXISTS profiles CASCADE;
    RAISE NOTICE 'Tables dropped.';

    -- Drop enums if they exist
    RAISE NOTICE 'Dropping enums (if they exist)...';
    DROP TYPE IF EXISTS project_role CASCADE;
    DROP TYPE IF EXISTS app_role CASCADE;
    RAISE NOTICE 'Enums dropped.';

    RAISE NOTICE 'Aggressive cleanup complete.';
END $$;


-- 2. CREATE ENUM (Safely)
DO $$ BEGIN
    RAISE NOTICE 'Creating/Updating enums...';
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_role') THEN
        CREATE TYPE project_role AS ENUM ('lineproducer', 'producer', 'accountant');
        RAISE NOTICE 'Created ENUM project_role.';
    ELSE
        RAISE NOTICE 'ENUM project_role already exists.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE app_role AS ENUM ('admin', 'superuser', 'user');
        RAISE NOTICE 'Created ENUM app_role.';
    ELSE
        RAISE NOTICE 'ENUM app_role already exists.';
    END IF;
    RAISE NOTICE 'Enums created/updated.';
END $$;


-- 3. CREATE TABLES (Safely and Idempotently with correct FKs)
DO $$ BEGIN
    RAISE NOTICE 'Creating tables...';
END $$;

-- profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid references auth.users on delete cascade primary key,
  email text NOT NULL,
  full_name text,
  app_role app_role DEFAULT 'user' NOT NULL,
  is_disabled boolean DEFAULT FALSE NOT NULL,
  invited_by uuid,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
DO $$ BEGIN
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name text;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS app_role app_role DEFAULT 'user' NOT NULL;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_disabled boolean DEFAULT FALSE NOT NULL;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_invited_by_fkey' AND confrelid = 'auth.users'::regclass) THEN
        ALTER TABLE profiles DROP CONSTRAINT profiles_invited_by_fkey;
    END IF;
    ALTER TABLE profiles ADD CONSTRAINT profiles_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    RAISE NOTICE 'Table profiles created/updated.';
END $$;


-- projects table
CREATE TABLE IF NOT EXISTS projects (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  description text,
  company_name text,
  ico text,
  currency text DEFAULT 'CZK' NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
DO $$ BEGIN
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS description text;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS company_name text;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS ico text;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS currency text DEFAULT 'CZK' NOT NULL;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_created_by_fkey' AND confrelid = 'auth.users'::regclass) THEN
        ALTER TABLE projects DROP CONSTRAINT projects_created_by_fkey;
    END IF;
    ALTER TABLE projects ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    RAISE NOTICE 'Table projects created/updated.';
END $$;


-- budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id bigint NOT NULL,
  version_name text,
  xml_content text,
  is_active boolean DEFAULT FALSE NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
DO $$ BEGIN
    ALTER TABLE budgets ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT FALSE NOT NULL;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budgets_project_id_fkey' AND confrelid = 'public.projects'::regclass) THEN
        ALTER TABLE budgets DROP CONSTRAINT budgets_project_id_fkey;
    END IF;
    ALTER TABLE budgets ADD CONSTRAINT budgets_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects ON DELETE CASCADE;
    RAISE NOTICE 'Table budgets created/updated.';
END $$;


-- budget_lines table
CREATE TABLE IF NOT EXISTS budget_lines (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  budget_id bigint NOT NULL,
  account_number text NOT NULL,
  account_description text,
  category_number text,
  category_description text,
  original_amount numeric NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_lines_budget_id_fkey' AND confrelid = 'public.budgets'::regclass) THEN
        ALTER TABLE budget_lines DROP CONSTRAINT budget_lines_budget_id_fkey;
    END IF;
    ALTER TABLE budget_lines ADD CONSTRAINT budget_lines_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES budgets ON DELETE CASCADE;
    RAISE NOTICE 'Table budget_lines created/updated.';
END $$;


-- project_assignments table
CREATE TABLE IF NOT EXISTS project_assignments (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id bigint NOT NULL,
  user_id uuid NOT NULL,
  role project_role NOT NULL,
  UNIQUE(project_id, user_id)
);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_assignments_project_id_fkey' AND confrelid = 'public.projects'::regclass) THEN
        ALTER TABLE project_assignments DROP CONSTRAINT project_assignments_project_id_fkey;
    END IF;
    ALTER TABLE project_assignments ADD CONSTRAINT project_assignments_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects ON DELETE CASCADE;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_assignments_user_id_fkey' AND confrelid = 'public.profiles'::regclass) THEN
        ALTER TABLE project_assignments DROP CONSTRAINT project_assignments_user_id_fkey;
    END IF;
    ALTER TABLE project_assignments ADD CONSTRAINT project_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'Table project_assignments created/updated.';
END $$;


-- user_invitations table
CREATE TABLE IF NOT EXISTS user_invitations (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  email text NOT NULL,
  invited_by uuid,
  status text DEFAULT 'pending' NOT NULL,
  target_app_role app_role,
  target_role project_role,
  target_project_id bigint,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
DO $$ BEGIN
    ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' NOT NULL;
    ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS target_app_role app_role;
    ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS target_role project_role;
    ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS target_project_id bigint;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_invitations_invited_by_fkey' AND confrelid = 'auth.users'::regclass) THEN
        ALTER TABLE user_invitations DROP CONSTRAINT user_invitations_invited_by_fkey;
    END IF;
    ALTER TABLE user_invitations ADD CONSTRAINT user_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_invitations_target_project_id_fkey' AND confrelid = 'public.projects'::regclass) THEN
        ALTER TABLE user_invitations DROP CONSTRAINT user_invitations_target_project_id_fkey;
    END IF;
    ALTER TABLE user_invitations ADD CONSTRAINT user_invitations_target_project_id_fkey FOREIGN KEY (target_project_id) REFERENCES projects(id) ON DELETE SET NULL;
    RAISE NOTICE 'Table user_invitations created/updated.';
END $$;


-- invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  user_id uuid NOT NULL,
  project_id bigint,
  internal_id bigint,
  ico text,
  company_name text,
  bank_account text,
  iban text,
  variable_symbol text,
  description text,
  amount_with_vat numeric,
  amount_without_vat numeric,
  currency text,
  confidence float,
  raw_text text,
  status text DEFAULT 'draft' NOT NULL,
  rejection_reason text,
  file_content text,
  
  -- New fields for allocation summary (updated by trigger)
  total_allocated_amount numeric DEFAULT 0 NOT NULL,
  has_allocations boolean DEFAULT FALSE NOT NULL
);
DO $$ BEGIN
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS internal_id bigint;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS variable_symbol text;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS description text;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft' NOT NULL;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS rejection_reason text;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS file_content text;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_allocated_amount numeric DEFAULT 0 NOT NULL;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS has_allocations boolean DEFAULT FALSE NOT NULL;
    ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'draft';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_user_id_fkey' AND confrelid = 'auth.users'::regclass) THEN
        ALTER TABLE invoices DROP CONSTRAINT invoices_user_id_fkey;
    END IF;
    ALTER TABLE invoices ADD CONSTRAINT invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_project_id_fkey' AND confrelid = 'public.projects'::regclass) THEN
        ALTER TABLE invoices DROP CONSTRAINT invoices_project_id_fkey;
    END IF;
    ALTER TABLE invoices ADD CONSTRAINT invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
    RAISE NOTICE 'Table invoices created/updated.';
END $$;


-- invoice_allocations table
CREATE TABLE IF NOT EXISTS invoice_allocations (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  invoice_id bigint NOT NULL,
  budget_line_id bigint NOT NULL,
  amount numeric NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_allocations_invoice_id_fkey' AND confrelid = 'public.invoices'::regclass) THEN
        ALTER TABLE invoice_allocations DROP CONSTRAINT invoice_allocations_invoice_id_fkey;
    END IF;
    ALTER TABLE invoice_allocations ADD CONSTRAINT invoice_allocations_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices ON DELETE CASCADE;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_allocations_budget_line_id_fkey' AND confrelid = 'public.budget_lines'::regclass) THEN
        ALTER TABLE invoice_allocations DROP CONSTRAINT invoice_allocations_budget_line_id_fkey;
    END IF;
    ALTER TABLE invoice_allocations ADD CONSTRAINT invoice_allocations_budget_line_id_fkey FOREIGN KEY (budget_line_id) REFERENCES budget_lines ON DELETE CASCADE;
    RAISE NOTICE 'Table invoice_allocations created/updated.';
    RAISE NOTICE 'All tables created/updated.';
END $$;


-- 4. DATA CLEANUP & MIGRATION (Idempotent)
DO $$ BEGIN
    RAISE NOTICE 'Starting data cleanup and initial migration...';
    UPDATE profiles SET app_role = 'admin' WHERE lower(email) = 'tadekus@gmail.com' AND app_role IS DISTINCT FROM 'admin';
    UPDATE profiles SET app_role = 'superuser' WHERE app_role IS NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = profiles.id AND u.raw_app_meta_data->>'is_superuser' = 'true');
    UPDATE profiles SET app_role = 'user' WHERE app_role IS NULL;

    UPDATE invoices SET ico = REGEXP_REPLACE(ico, '[^0-9]', '', 'g') WHERE ico IS NOT NULL AND ico ~ '[^0-9]';
    UPDATE invoices SET variable_symbol = REPLACE(variable_symbol, ' ', '') WHERE variable_symbol IS NOT NULL AND variable_symbol LIKE '% %';
    RAISE NOTICE 'Cleaned up ICO and Variable Symbol data in invoices and set app_roles.';
    RAISE NOTICE 'Data cleanup and initial migration complete.';
END $$;


-- 5. CREATE OPTIMIZED RLS HELPER FUNCTIONS (SECURITY DEFINER)
DO $$ BEGIN RAISE NOTICE 'Creating RLS helper functions...'; END $$;

CREATE OR REPLACE FUNCTION get_my_app_role_safe()
RETURNS app_role LANGUAGE plpgsql SECURITY DEFINER AS $$
  DECLARE
    user_app_role app_role;
  BEGIN
    SET search_path = public, auth, extensions;
    SELECT p.app_role INTO user_app_role FROM public.profiles p WHERE p.id = (select auth.uid());
    RETURN COALESCE(user_app_role, 'user');
  END;
$$;
DO $$ BEGIN
    ALTER FUNCTION get_my_app_role_safe() OWNER TO postgres;
    RAISE NOTICE 'Function get_my_app_role_safe created/updated.';
END $$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
  BEGIN
    SET search_path = public, auth, extensions;
    RETURN (SELECT get_my_app_role_safe()) = 'admin';
  END;
$$;
DO $$ BEGIN
    ALTER FUNCTION is_admin() OWNER TO postgres;
    RAISE NOTICE 'Function is_admin created/updated.';
END $$;

CREATE OR REPLACE FUNCTION is_superuser_app()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
  BEGIN
    SET search_path = public, auth, extensions;
    RETURN (SELECT get_my_app_role_safe()) = 'superuser' OR (SELECT is_admin());
  END;
$$;
DO $$ BEGIN
    ALTER FUNCTION is_superuser_app() OWNER TO postgres;
    RAISE NOTICE 'Function is_superuser_app created/updated.';
END $$;

CREATE OR REPLACE FUNCTION is_user_project_member(p_user_id uuid, p_project_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    SET search_path = public, auth, extensions;
    RETURN EXISTS (
        SELECT 1 FROM public.project_assignments
        WHERE user_id = p_user_id AND project_id = p_project_id
    );
END;
$$;
DO $$ BEGIN
    ALTER FUNCTION is_user_project_member(uuid, bigint) OWNER TO postgres;
    RAISE NOTICE 'Function is_user_project_member created/updated.';
END $$;

CREATE OR REPLACE FUNCTION is_current_user_invoice_project_member(p_invoice_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_project_id bigint;
BEGIN
    SET search_path = public, auth, extensions;
    SELECT project_id INTO v_project_id FROM public.invoices WHERE id = p_invoice_id;
    RETURN (SELECT is_user_project_member((select auth.uid()), v_project_id));
END;
$$;
DO $$ BEGIN
    ALTER FUNCTION is_current_user_invoice_project_member(bigint) OWNER TO postgres;
    RAISE NOTICE 'Function is_current_user_invoice_project_member created/updated.';
END $$;

CREATE OR REPLACE FUNCTION check_email_exists_global(target_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  SET search_path = public, auth, extensions;
  RETURN EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(target_email))
         OR EXISTS (SELECT 1 FROM public.user_invitations WHERE lower(email) = lower(target_email) AND status = 'pending');
END;
$$;
DO $$ BEGIN
    ALTER FUNCTION check_email_exists_global(text) OWNER TO postgres;
    RAISE NOTICE 'Function check_email_exists_global created/updated.';
END $$;

CREATE OR REPLACE FUNCTION admin_reset_user_password(target_user_id uuid, new_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    SET search_path = public, auth, extensions;
    IF (SELECT is_admin()) THEN
        UPDATE auth.users
        SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf'))
        WHERE id = target_user_id;
    ELSE
        RAISE EXCEPTION 'Permission denied: Only administrators can reset any user password.';
    END IF;
END;
$$;
DO $$ BEGIN
    ALTER FUNCTION admin_reset_user_password(uuid, text) OWNER TO postgres;
    RAISE NOTICE 'Function admin_reset_user_password created/updated.';
END $$;

CREATE OR REPLACE FUNCTION superuser_reset_password(target_user_id uuid, new_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    SET search_path = public, auth, extensions;
    IF (SELECT is_superuser_app()) AND EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id AND invited_by = (select auth.uid())) THEN
        UPDATE auth.users
        SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf'))
        WHERE id = target_user_id;
    ELSE
        RAISE EXCEPTION 'Permission denied: You can only reset passwords for users you have invited.';
    END IF;
END;
$$;
DO $$ BEGIN
    ALTER FUNCTION superuser_reset_password(uuid, text) OWNER TO postgres;
    RAISE NOTICE 'Function superuser_reset_password created/updated.';
END $$;

CREATE OR REPLACE FUNCTION claim_invited_role(p_full_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  inv_record record;
  current_email text;
  profile_id uuid := (select auth.uid());
  user_app_role app_role := 'user';
  user_project_role project_role := NULL;
  user_project_id bigint := NULL;
BEGIN
  SET search_path = public, auth, extensions;
  
  SELECT lower(email) INTO current_email FROM auth.users WHERE id = profile_id;
  
  SELECT * FROM public.user_invitations 
  WHERE lower(email) = current_email AND status = 'pending'
  LIMIT 1 INTO inv_record;

  IF inv_record.id IS NOT NULL THEN
    user_app_role := COALESCE(inv_record.target_app_role, 'user');
    user_project_role := inv_record.target_role;
    user_project_id := inv_record.target_project_id;

    UPDATE public.profiles 
    SET 
        full_name = p_full_name, 
        app_role = user_app_role, 
        invited_by = inv_record.invited_by 
    WHERE id = profile_id;

    IF user_project_role IS NOT NULL AND user_project_id IS NOT NULL THEN
        BEGIN
            INSERT INTO public.project_assignments (project_id, user_id, role)
            VALUES (user_project_id, profile_id, user_project_role::project_role) 
            ON CONFLICT (project_id, user_id) DO NOTHING;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING 'Failed to auto-assign user % to project % with role %: %', profile_id, user_project_id, user_project_role, SQLERRM;
        END;
    END IF;

    UPDATE public.user_invitations SET status = 'accepted' WHERE id = inv_record.id;
    RETURN 'Account Setup Complete: Role ' || user_app_role || ' / ' || coalesce(user_project_role::text, 'N/A');
  ELSE
    UPDATE public.profiles SET full_name = p_full_name WHERE id = profile_id;
    RETURN 'No pending invitation found, name updated.';
  END IF;
END;
$$;
DO $$ BEGIN
    ALTER FUNCTION claim_invited_role(text) OWNER TO postgres;
    RAISE NOTICE 'Function claim_invited_role created/updated.';
END $$;

CREATE OR REPLACE FUNCTION delete_team_member(target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    SET search_path = public, auth, extensions;
    IF (SELECT is_admin()) OR (
        SELECT p.invited_by FROM public.profiles p WHERE p.id = target_user_id
    ) = (select auth.uid()) THEN
        DELETE FROM auth.users WHERE id = target_user_id;
    ELSE
        RAISE EXCEPTION 'Permission denied: Not an admin or not the inviter of this user.';
    END IF;
END;
$$;
DO $$ BEGIN
    ALTER FUNCTION delete_team_member(uuid) OWNER TO postgres;
    RAISE NOTICE 'Function delete_team_member created/updated.';
END $$;

DO $$ BEGIN RAISE NOTICE 'RLS helper functions created/updated.'; END $$;


-- 6.1 CREATE TRIGGER FUNCTION FOR INVOICE ALLOCATION SUMMARY
CREATE OR REPLACE FUNCTION update_invoice_allocation_summary()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_total_allocated NUMERIC;
    v_has_allocations BOOLEAN;
    target_invoice_id BIGINT;
BEGIN
    SET search_path = public, auth, extensions;
    IF TG_OP = 'DELETE' THEN
        target_invoice_id := OLD.invoice_id;
    ELSIF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        target_invoice_id := NEW.invoice_id;
    END IF;

    SELECT 
        COALESCE(SUM(amount), 0),
        COUNT(*) > 0
    INTO 
        v_total_allocated, 
        v_has_allocations
    FROM public.invoice_allocations 
    WHERE invoice_id = target_invoice_id;
    
    UPDATE public.invoices
    SET 
        total_allocated_amount = v_total_allocated,
        has_allocations = v_has_allocations
    WHERE id = target_invoice_id;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;
DO $$ BEGIN
    ALTER FUNCTION update_invoice_allocation_summary() OWNER TO postgres;
    RAISE NOTICE 'Trigger function update_invoice_allocation_summary created/updated.';
END $$;

DO $$ BEGIN
    RAISE NOTICE 'Creating trigger tr_update_invoice_allocation_summary...';
    CREATE TRIGGER tr_update_invoice_allocation_summary
    AFTER INSERT OR UPDATE OR DELETE ON invoice_allocations
    FOR EACH ROW EXECUTE FUNCTION update_invoice_allocation_summary();
    RAISE NOTICE 'Trigger tr_update_invoice_allocation_summary created.';
END $$;


-- 6.2 RLS HELPER FUNCTION FOR INVOICES PRODUCER UPDATE CHECK (for WITH CHECK clause)
CREATE OR REPLACE FUNCTION is_producer_allowed_invoice_update_check(
    p_new_id BIGINT,
    p_new_status TEXT,
    p_new_total_allocated_amount NUMERIC,
    p_new_has_allocations BOOLEAN,
    p_new_company_name TEXT,
    p_new_ico TEXT,
    p_new_variable_symbol TEXT,
    p_new_description TEXT,
    p_new_amount_without_vat NUMERIC,
    p_new_amount_with_vat NUMERIC,
    p_new_bank_account TEXT,
    p_new_iban TEXT,
    p_new_currency TEXT,
    p_new_rejection_reason TEXT
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    p_old_invoice public.invoices;
BEGIN
    SET search_path = public, auth, extensions;
    SELECT * INTO p_old_invoice FROM public.invoices WHERE id = p_new_id;

    IF p_old_invoice IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN (
        p_new_status IN ('final_approved', 'rejected') AND
        p_new_total_allocated_amount IS NOT DISTINCT FROM p_old_invoice.total_allocated_amount AND
        p_new_has_allocations IS NOT DISTINCT FROM p_old_invoice.has_allocations AND
        p_new_company_name IS NOT DISTINCT FROM p_old_invoice.company_name AND
        p_new_ico IS NOT DISTINCT FROM p_old_invoice.ico AND
        p_new_variable_symbol IS NOT DISTINCT FROM p_old_invoice.variable_symbol AND
        p_new_description IS NOT DISTINCT FROM p_old_invoice.description AND
        p_new_amount_without_vat IS NOT DISTINCT FROM p_old_invoice.amount_without_vat AND
        p_new_amount_with_vat IS NOT DISTINCT FROM p_old_invoice.amount_with_vat AND
        p_new_bank_account IS NOT DISTINCT FROM p_old_invoice.bank_account AND
        p_new_iban IS NOT DISTINCT FROM p_old_invoice.iban AND
        p_new_currency IS NOT DISTINCT FROM p_old_invoice.currency AND
        p_new_rejection_reason IS NOT DISTINCT FROM p_old_invoice.rejection_reason
    );
END;
$$;
DO $$ BEGIN
    ALTER FUNCTION is_producer_allowed_invoice_update_check(BIGINT, TEXT, NUMERIC, BOOLEAN, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT) OWNER TO postgres;
    RAISE NOTICE 'Function is_producer_allowed_invoice_update_check created/updated.';
END $$;


-- 6.3 NEW RLS HELPER FUNCTION FOR INVOICES PRODUCER UPDATE ACCESS (for USING clause)
CREATE OR REPLACE FUNCTION is_producer_allowed_to_update_invoice_access(p_invoice_id BIGINT)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_invoice_project_id BIGINT;
    v_invoice_status TEXT;
    v_user_is_producer BOOLEAN;
BEGIN
    SET search_path = public, auth, extensions;

    SELECT project_id, status INTO v_invoice_project_id, v_invoice_status
    FROM public.invoices
    WHERE id = p_invoice_id;

    SELECT EXISTS (
        SELECT 1 FROM public.project_assignments pa
        WHERE pa.project_id = v_invoice_project_id
          AND pa.user_id = (select auth.uid())
          AND pa.role = 'producer'
    ) INTO v_user_is_producer;

    RETURN v_user_is_producer AND v_invoice_status = 'approved';
END;
$$;
DO $$ BEGIN
    ALTER FUNCTION is_producer_allowed_to_update_invoice_access(BIGINT) OWNER TO postgres;
    RAISE NOTICE 'Function is_producer_allowed_to_update_invoice_access created/updated.';
END $$;


-- 7. RLS POLICIES (Updated and Optimized for V36)
DO $$ BEGIN RAISE NOTICE 'Creating RLS policies...'; END $$;

-- --- PROFILES ---
DO $$ BEGIN
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Profiles Admin Full" ON profiles FOR ALL TO authenticated USING ( (select is_admin()) );
    CREATE POLICY "Profiles View Self and Invites" ON profiles FOR SELECT TO authenticated
    USING ( 
        id = (select auth.uid()) 
        OR invited_by = (select auth.uid()) 
        OR (select is_admin())
        OR EXISTS (SELECT 1 FROM public.project_assignments pa WHERE pa.user_id = (select auth.uid()) AND pa.project_id IN (SELECT p.project_id FROM public.project_assignments p WHERE p.user_id = profiles.id))
    );
    CREATE POLICY "Profiles Update Self" ON profiles FOR UPDATE TO authenticated USING ( id = (select auth.uid()) );
    RAISE NOTICE 'Policies for profiles created.';
END $$;


-- --- PROJECTS ---
DO $$ BEGIN
    ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Projects Admin Full" ON projects FOR ALL TO authenticated USING ( (select is_admin()) );
    CREATE POLICY "Projects Owners Full" ON projects FOR ALL TO authenticated USING ( created_by = (select auth.uid()) );
    CREATE POLICY "Projects Team Read" ON projects FOR SELECT TO authenticated USING ( 
        (select is_user_project_member((select auth.uid()), id))
        OR (select is_superuser_app()) 
    );
    RAISE NOTICE 'Policies for projects created.';
END $$;


-- --- BUDGETS ---
DO $$ BEGIN
    ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Budgets Admin Full" ON budgets FOR ALL TO authenticated USING ( (select is_admin()) );
    CREATE POLICY "Budgets Owners Full" ON budgets FOR ALL TO authenticated USING ( 
        EXISTS (SELECT 1 FROM public.projects WHERE id = budgets.project_id AND created_by = (select auth.uid()))
    );
    CREATE POLICY "Budgets Team Read" ON budgets FOR SELECT TO authenticated USING ( 
        EXISTS (SELECT 1 FROM public.project_assignments WHERE project_id = budgets.project_id AND user_id = (select auth.uid())) 
    );
    CREATE POLICY "Budgets Team Write" ON budgets FOR ALL TO authenticated
    USING ( 
        EXISTS (SELECT 1 FROM public.project_assignments WHERE project_id = budgets.project_id AND user_id = (select auth.uid()))
        OR EXISTS (SELECT 1 FROM public.projects WHERE id = budgets.project_id AND created_by = (select auth.uid()))
    );
    RAISE NOTICE 'Policies for budgets created.';
END $$;


-- --- BUDGET_LINES ---
DO $$ BEGIN
    ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Budget Lines Admin Full" ON budget_lines FOR ALL TO authenticated USING ( (select is_admin()) );
    CREATE POLICY "Budget Lines Owners Full" ON budget_lines FOR ALL TO authenticated USING ( 
        EXISTS (SELECT 1 FROM public.budgets b JOIN public.projects p ON b.project_id = p.id WHERE b.id = budget_lines.budget_id AND p.created_by = (select auth.uid()))
    );
    CREATE POLICY "Budget Lines Team Read" ON budget_lines FOR SELECT TO authenticated USING ( 
        EXISTS (SELECT 1 FROM public.budgets b JOIN public.project_assignments pa ON b.project_id = pa.project_id WHERE b.id = budget_lines.budget_id AND pa.user_id = (select auth.uid()))
    );
    CREATE POLICY "Budget Lines Team Write" ON budget_lines FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.budgets b JOIN public.project_assignments pa ON b.project_id = pa.project_id WHERE b.id = budget_lines.budget_id AND pa.user_id = (select auth.uid()))
        OR EXISTS (SELECT 1 FROM public.budgets b JOIN public.projects p ON b.project_id = p.id WHERE b.id = budget_lines.budget_id AND p.created_by = (select auth.uid()))
    );
    RAISE NOTICE 'Policies for budget_lines created.';
END $$;


-- --- PROJECT_ASSIGNMENTS ---
DO $$ BEGIN
    ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Assignments Admin Full" ON project_assignments FOR ALL TO authenticated USING ( (select is_admin()) );
    CREATE POLICY "Assignments Owner Manage" ON project_assignments FOR ALL TO authenticated USING ( 
        EXISTS (SELECT 1 FROM public.projects WHERE id = project_assignments.project_id AND created_by = (select auth.uid()))
    );
    CREATE POLICY "Assignments Read Self" ON project_assignments FOR SELECT TO authenticated USING ( user_id = (select auth.uid()) );
    RAISE NOTICE 'Policies for project_assignments created.';
END $$;


-- --- USER_INVITATIONS ---
DO $$ BEGIN
    ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Invitations Admin Full" ON user_invitations FOR ALL TO authenticated USING ( (select is_admin()) );
    CREATE POLICY "Invitations Owner Manage" ON user_invitations FOR ALL TO authenticated USING ( invited_by = (select auth.uid()) );
    CREATE POLICY "Invitations Read Self" ON user_invitations FOR SELECT TO authenticated USING ( lower(email) = lower((select auth.jwt() ->> 'email')) );
    RAISE NOTICE 'Policies for user_invitations created.';
END $$;


-- --- INVOICES ---
DO $$ BEGIN
    ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Invoices Admin Full" ON invoices FOR ALL TO authenticated USING ( (select is_admin()) );
    CREATE POLICY "Invoices Team Read" ON invoices FOR SELECT TO authenticated USING ( (select is_current_user_invoice_project_member(id)) );
    CREATE POLICY "Invoices Line Producer Manage" ON invoices FOR ALL TO authenticated
    USING ( 
        (select is_user_project_member((select auth.uid()), project_id)) AND (select get_my_app_role_safe()) = 'user'
    ) WITH CHECK (
        (select is_user_project_member((select auth.uid()), project_id)) AND (select get_my_app_role_safe()) = 'user' 
        AND status IN ('draft', 'rejected')
    );
    CREATE POLICY "Invoices Producer Update Status" ON invoices FOR UPDATE TO authenticated 
    USING (
        (select is_producer_allowed_to_update_invoice_access(id)) 
    ) WITH CHECK (
        (select is_producer_allowed_invoice_update_check(
            new.id,
            new.status,
            new.total_allocated_amount,
            new.has_allocations,
            new.company_name,
            new.ico,
            new.variable_symbol,
            new.description,
            new.amount_without_vat,
            new.amount_with_vat,
            new.bank_account,
            new.iban,
            new.currency,
            new.rejection_reason
        )) 
    );
    RAISE NOTICE 'Policies for invoices created.';
END $$;


-- --- INVOICE_ALLOCATIONS ---
DO $$ BEGIN
    ALTER TABLE invoice_allocations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allocations Admin Full" ON invoice_allocations FOR ALL TO authenticated USING ( (select is_admin()) );
    CREATE POLICY "Allocations Team Read" ON invoice_allocations FOR SELECT TO authenticated USING ( 
        EXISTS (SELECT 1 FROM public.invoices WHERE id = invoice_allocations.invoice_id AND (select is_current_user_invoice_project_member(invoices.id)))
    );
    CREATE POLICY "Allocations Line Producer Manage" ON invoice_allocations FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.invoices WHERE id = invoice_allocations.invoice_id AND (select get_my_app_role_safe()) = 'user' AND invoices.status IN ('draft', 'rejected') AND (select is_current_user_invoice_project_member(invoices.id)))
    );
    RAISE NOTICE 'Policies for invoice_allocations created.';
    RAISE NOTICE 'All RLS policies created.';
END $$;


-- 8. CREATE DATABASE INDEXES (for performance)
DO $$ BEGIN
    RAISE NOTICE 'Creating database indexes...';
    CREATE INDEX IF NOT EXISTS idx_invoices_project_id_internal_id ON invoices (project_id, internal_id DESC);
    CREATE INDEX IF NOT EXISTS idx_budget_lines_budget_id ON budget_lines (budget_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_allocations_invoice_id ON invoice_allocations (invoice_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_allocations_budget_line_id ON invoice_allocations (budget_line_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_ico ON invoices (ico);
    CREATE INDEX IF NOT EXISTS idx_invoices_variable_symbol ON invoices (variable_symbol);
    CREATE INDEX IF NOT EXISTS idx_profiles_invited_by ON profiles (invited_by);
    CREATE INDEX IF NOT EXISTS idx_project_assignments_user_project ON project_assignments (user_id, project_id);
    RAISE NOTICE 'All indexes created.';
END $$;


-- 9. INITIAL DATA MIGRATION/SETUP (Idempotent for tadekus@gmail.com)
DO $$ BEGIN
    RAISE NOTICE 'Running initial data setup...';
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
    
    INSERT INTO public.profiles (id, email, full_name, app_role)
    VALUES (
        (SELECT id FROM auth.users WHERE lower(email) = 'tadekus@gmail.com'),
        'tadekus@gmail.com',
        'Master Administrator',
        'admin'
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        app_role = EXCLUDED.app_role;

    RAISE NOTICE 'Initial admin profile setup complete for tadekus@gmail.com.';
    RAISE NOTICE 'Initial data setup complete.';
END $$;

DO $$ BEGIN
    RAISE NOTICE 'SQL migration script (V36) completed successfully.';
END $$;
```</content>
  </change>
</changes>