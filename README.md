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

## 4. Database Setup (SQL - Essential Stages)

**IMPORTANT:** The database setup is now a **multi-stage process** to ensure proper synchronization with Supabase Authentication and to bypass specific parsing issues in the Supabase SQL editor. You **MUST** perform these steps in order on a **CLEAN, FRESH SUPABASE PROJECT**.

**Before you start:**
1.  **Delete your existing Supabase project.** (Project Settings -> General Settings -> Delete Project).
2.  **Create a brand new Supabase project.**

---

### **Stage 1: Run Core Schema Setup (Tables & Enums ONLY)**

This script creates **only** the tables, enums, and the `pgcrypto` extension. It purposely excludes all RLS policies, triggers, and helper functions for maximum reliability.

Copy and run the following script in your **Supabase SQL Editor**:

```sql
-- === SQL SCRIPT 1: CORE SCHEMA SETUP (Tables & Enums ONLY) ===
-- Designed for a CLEAN, FRESH SUPABASE PROJECT.
-- This script creates ONLY the tables, enums, and the pgcrypto extension.
-- It EXCLUDES all RLS policies, triggers, and helper functions, which will be added in later stages.

-- 1. AGGRESSIVE CLEANUP (Ensuring a truly fresh start)
DO $$
BEGIN
    RAISE NOTICE 'Starting simplified aggressive cleanup (Tables & Enums ONLY)...';

    -- Drop tables with CASCADE to remove dependent objects like FKs and Triggers
    RAISE NOTICE 'Dropping tables with CASCADE (if they exist)...';
    DROP TABLE IF EXISTS public.invoice_allocations CASCADE;
    DROP TABLE IF EXISTS public.invoices CASCADE;
    DROP TABLE IF EXISTS public.user_invitations CASCADE;
    DROP TABLE IF EXISTS public.project_assignments CASCADE;
    DROP TABLE IF EXISTS public.budget_lines CASCADE;
    DROP TABLE IF EXISTS public.budgets CASCADE;
    DROP TABLE IF EXISTS public.projects CASCADE;
    DROP TABLE IF EXISTS public.profiles CASCADE;
    RAISE NOTICE 'Tables dropped.';

    -- Drop enums if they exist
    RAISE NOTICE 'Dropping enums (if they exist)...';
    DROP TYPE IF EXISTS public.project_role CASCADE;
    DROP TYPE IF EXISTS public.app_role CASCADE;
    RAISE NOTICE 'Enums dropped.';

    RAISE NOTICE 'Simplified aggressive cleanup complete.';
END $$;


-- 2. CREATE ENUM (Safely)
DO $$ BEGIN
    RAISE NOTICE 'Creating/Updating enums...';
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_role') THEN
        CREATE TYPE public.project_role AS ENUM ('lineproducer', 'producer', 'accountant');
        RAISE NOTICE 'Created ENUM project_role.';
    ELSE
        RAISE NOTICE 'ENUM project_role already exists.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('admin', 'superuser', 'user');
        RAISE NOTICE 'Created ENUM app_role.';
    ELSE
        RAISE NOTICE 'ENUM app_role already exists.';
    END IF;
    RAISE NOTICE 'Enums created/updated.';
END $$;


-- 3. CREATE TABLES (Safely and Idempotently with FOREIGN KEYS INLINE)
DO $$ BEGIN
    RAISE NOTICE 'Creating tables...';
END $$;

-- profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email text NOT NULL,
  full_name text,
  app_role public.app_role DEFAULT 'user' NOT NULL,
  is_disabled boolean DEFAULT FALSE NOT NULL,
  invited_by uuid REFERENCES auth.users ON DELETE SET NULL, -- FK defined inline
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
DO $$ BEGIN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS app_role public.app_role DEFAULT 'user' NOT NULL;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_disabled boolean DEFAULT FALSE NOT NULL;
    RAISE NOTICE 'Table profiles created/updated.';
END $$;


-- projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  description text,
  company_name text,
  ico text,
  currency text DEFAULT 'CZK' NOT NULL,
  created_by uuid REFERENCES auth.users ON DELETE SET NULL, -- FK defined inline
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
DO $$ BEGIN
    ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description text;
    ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS company_name text;
    ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS ico text;
    ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS currency text DEFAULT 'CZK' NOT NULL;
    RAISE NOTICE 'Table projects created/updated.';
END $$;


-- budgets table
CREATE TABLE IF NOT EXISTS public.budgets (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id bigint REFERENCES public.projects ON DELETE CASCADE NOT NULL, -- FK defined inline
  version_name text,
  xml_content text,
  is_active boolean DEFAULT FALSE NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
DO $$ BEGIN
    ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT FALSE NOT NULL;
    RAISE NOTICE 'Table budgets created/updated.';
END $$;


-- budget_lines table
CREATE TABLE IF NOT EXISTS public.budget_lines (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  budget_id bigint REFERENCES public.budgets ON DELETE CASCADE NOT NULL, -- FK defined inline
  account_number text NOT NULL,
  account_description text,
  category_number text,
  category_description text,
  original_amount numeric NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
DO $$ BEGIN
    RAISE NOTICE 'Table budget_lines created/updated.';
END $$;


-- project_assignments table
CREATE TABLE IF NOT EXISTS public.project_assignments (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id bigint REFERENCES public.projects ON DELETE CASCADE NOT NULL, -- FK defined inline
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL, -- FK defined inline
  role public.project_role NOT NULL,
  UNIQUE(project_id, user_id)
);
DO $$ BEGIN
    RAISE NOTICE 'Table project_assignments created/updated.';
END $$;


-- user_invitations table
CREATE TABLE IF NOT EXISTS public.user_invitations (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  email text NOT NULL,
  invited_by uuid REFERENCES auth.users ON DELETE SET NULL, -- FK defined inline
  status text DEFAULT 'pending' NOT NULL,
  target_app_role public.app_role,
  target_role public.project_role,
  target_project_id bigint REFERENCES public.projects(id) ON DELETE SET NULL, -- FK defined inline
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
DO $$ BEGIN
    ALTER TABLE public.user_invitations ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' NOT NULL;
    ALTER TABLE public.user_invitations ADD COLUMN IF NOT EXISTS target_app_role public.app_role;
    ALTER TABLE public.user_invitations ADD COLUMN IF NOT EXISTS target_role public.project_role;
    ALTER TABLE public.user_invitations ADD COLUMN IF NOT EXISTS target_project_id bigint;
    RAISE NOTICE 'Table user_invitations created/updated.';
END $$;


-- invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  user_id uuid REFERENCES auth.users ON DELETE SET NULL NOT NULL, -- FK defined inline
  project_id bigint REFERENCES public.projects(id) ON DELETE SET NULL, -- FK defined inline
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
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS internal_id bigint;
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS variable_symbol text;
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS description text;
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft' NOT NULL;
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS rejection_reason text;
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS file_content text;
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS total_allocated_amount numeric DEFAULT 0 NOT NULL;
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS has_allocations boolean DEFAULT FALSE NOT NULL;
    ALTER TABLE public.invoices ALTER COLUMN status SET DEFAULT 'draft';
    RAISE NOTICE 'Table invoices created/updated.';
END $$;


-- invoice_allocations table
CREATE TABLE IF NOT EXISTS public.invoice_allocations (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  invoice_id bigint REFERENCES public.invoices ON DELETE CASCADE NOT NULL, -- FK defined inline
  budget_line_id bigint REFERENCES public.budget_lines ON DELETE CASCADE NOT NULL, -- FIX: Corrected to reference public.budget_lines
  amount numeric NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
DO $$ BEGIN
    RAISE NOTICE 'Table invoice_allocations created/updated.';
    RAISE NOTICE 'All tables created/updated.';
END $$;


-- 4. EXTENSIONS (Idempotent)
DO $$ BEGIN
    RAISE NOTICE 'Starting extensions setup...';
    
    -- Ensure pgcrypto extension is enabled for password hashing functions
    CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
    RAISE NOTICE 'Pgcrypto extension setup complete.';
    RAISE NOTICE 'Extensions setup complete.';
END $$;

DO $$ BEGIN
    RAISE NOTICE 'SQL Script 1 (Core Schema Setup) completed successfully.';
END $$;
```