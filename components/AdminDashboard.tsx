
import React, { useState, useEffect, useRef } from 'react';
import { 
  fetchAllProfiles, 
  toggleUserDisabled,
  sendSystemInvitation,
  fetchPendingInvitations,
  deleteInvitation,
  createProject,
  fetchProjects,
  deleteProject,
  uploadBudget,
  setBudgetActive,
  fetchProjectAssignments,
  addProjectAssignment,
  removeProjectAssignment,
  fetchAssignmentsForOwner,
  adminResetPassword,
  superuserResetPassword,
  deleteProfile
} from '../services/supabaseService';
import { Profile, UserInvitation, Project, ProjectAssignment, ProjectRole, AppRole } from '../types';

interface AdminDashboardProps {
  profile: Profile;
}

// Changed to a function declaration for better module interoperability.
export default function AdminDashboard({ profile }: AdminDashboardProps) {
  // Data State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allOwnerAssignments, setAllOwnerAssignments] = useState<any[]>([]);

  // UI State
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'system' | 'projects' | 'team'>('projects');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);

  // Invitation Forms
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteAppRole, setInviteAppRole] = useState<AppRole>('superuser');
  const [inviteProjectRole, setInviteProjectRole] = useState<ProjectRole>('lineproducer');
  const [inviteProjectId, setInviteProjectId] = useState<string>('');
  const [isInviting, setIsInviting] = useState(false);

  // Project Forms
  const [projectName, setProjectName] = useState('');
  const [projectCurrency, setProjectCurrency] = useState('CZK');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectCompany, setProjectCompany] = useState('');
  const [projectIco, setProjectIco] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null);

  // Budget & Team Management
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [uploadingBudget, setUploadingBudget] = useState(false);

  // Team Assignment Modal
  const [activeProjectForTeam, setActiveProjectForTeam] = useState<Project | null>(null);
  const [projectAssignments, setProjectAssignments] = useState<ProjectAssignment[]>([]);
  const [assignUserRole, setAssignUserRole] = useState<ProjectRole>('lineproducer');
  const [assignUserId, setAssignUserId] = useState<string>('');
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);

  // Password Reset Modal
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const isMasterUser = profile.email?.toLowerCase() === 'tadekus@gmail.com';
  const isAdmin = profile.app_role === 'admin' || isMasterUser;
  const isSuperuser = profile.app_role === 'superuser' || (profile.is_superuser === true && !isAdmin);
  const isGhostAdmin = profile.full_name?.includes('(Ghost)');

  useEffect(() => {
    // Set default tab based on role strictly
    if (isAdmin) {
        setActiveTab('system');
    } else {
        setActiveTab('projects');
    }
    if (isGhostAdmin) setShowSql(true);
    loadData();
  }, [isAdmin, isSuperuser, isGhostAdmin]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projs, invites, profs] = await Promise.all([
         fetchProjects().catch(e => []),
         fetchPendingInvitations().catch(e => []),
         fetchAllProfiles().catch(e => [])
      ]);
      setProjects(projs);
      setInvitations(invites);
      setProfiles(profs);
      if (isSuperuser && profile.id) {
        const assigns = await fetchAssignmentsForOwner(profile.id);
        setAllOwnerAssignments(assigns);
      }
    } catch (err: any) {
      console.error(err);
      setError("Failed to load dashboard data. Permissions might need fixing.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setIsInviting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      if (isAdmin) {
         await sendSystemInvitation(inviteEmail, inviteAppRole, null, null);
      } else {
         const pId = inviteProjectId ? parseInt(inviteProjectId) : null;
         await sendSystemInvitation(inviteEmail, null, inviteProjectRole, pId);
      }
      setSuccessMsg(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      const updatedInvites = await fetchPendingInvitations();
      setInvitations(updatedInvites);
    } catch (err: any) {
      setError(err.message || "Failed to send invitation");
    } finally {
      setIsInviting(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!projectName) return;
      setIsCreatingProject(true);
      setError(null);
      try {
          await createProject(projectName, projectCurrency, projectDescription, projectCompany, projectIco);
          const updatedProjs = await fetchProjects(); 
          setProjects(updatedProjs);
          setProjectName('');
          setProjectDescription('');
          setProjectCompany('');
          setProjectIco('');
          setSuccessMsg("Project created successfully");
      } catch (err: any) {
          setError(err.message);
      } finally {
          setIsCreatingProject(false);
      }
  };

  const handleDeleteProject = async (id: number) => {
    if(!window.confirm("Are you sure you want to delete this project?")) return;
    setDeletingProjectId(id);
    try {
        await deleteProject(id);
        setProjects(prev => prev.filter(p => p.id !== id));
        setSuccessMsg("Project deleted.");
    } catch (err: any) {
        alert("Failed to delete project: " + err.message);
    } finally {
        setDeletingProjectId(null);
    }
  };

  const handleBudgetClick = (projectId: number) => {
    setSelectedProjectId(projectId);
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleBudgetFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !selectedProjectId) return;
    const file = e.target.files[0];
    setUploadingBudget(true);
    setError(null);
    try {
        const text = await file.text();
        await uploadBudget(selectedProjectId, file.name, text);
        setSuccessMsg(`Budget ${file.name} uploaded!`);
        const updatedProjs = await fetchProjects(); 
        setProjects(updatedProjs);
    } catch (err: any) {
        setError("Failed to upload: " + err.message);
    } finally {
        setUploadingBudget(false);
        setSelectedProjectId(null);
        if(fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleToggleActiveBudget = async (projId: number, budgetId: number) => {
      try {
          await setBudgetActive(projId, budgetId);
          setProjects(prev => prev.map(p => {
              if (p.id !== projId) return p;
              return {
                  ...p,
                  budgets: p.budgets?.map(b => ({ ...b, is_active: b.id === budgetId }))
              };
          }));
          setSuccessMsg("Active budget updated.");
      } catch(err: any) {
          console.error("Toggle Active Budget Error:", err);
          alert("Error: " + err.message);
      }
  };

  const handleToggleDisabled = async (p: Profile) => {
    if (p.id === profile.id) return;
    const newValue = !p.is_disabled;
    if (window.confirm(`Are you sure you want to ${newValue ? 'SUSPEND' : 'ACTIVATE'} ${p.email}?`)) {
      try {
        await toggleUserDisabled(p.id, newValue);
        setProfiles(profiles.map(item => item.id === p.id ? {...item, is_disabled: newValue} : item));
      } catch (err) { setError("Failed to update status"); }
    }
  };

  const handleDeleteUser = async (p: Profile) => {
    if (!window.confirm(`Are you sure you want to DELETE ${p.email}?`)) return;
    try {
        await deleteProfile(p.id);
        setProfiles(prev => prev.filter(item => item.id !== p.id));
        setSuccessMsg(`User ${p.email} deleted from system.`);
    } catch (err: any) {
        setError(err.message || "Failed to delete user");
    }
  };

  const handleRevokeInvitation = async (id: number) => {
    if (!window.confirm("Revoke this invitation?")) return;
    try {
      await deleteInvitation(id);
      setInvitations(invitations.filter(i => i.id !== id));
    } catch(err) { setError("Failed to revoke invitation"); }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!resetTarget || !newPassword) return;
      if (newPassword.length < 6) {
          alert("Password must be at least 6 characters.");
          return;
      }
      setIsResetting(true);
      try {
          if (isAdmin) {
              await adminResetPassword(resetTarget.id, newPassword);
          } else {
              // Superuser logic
              await superuserResetPassword(resetTarget.id, newPassword);
          }
          setSuccessMsg(`Password updated for ${resetTarget.email}`);
          setResetTarget(null);
          setNewPassword('');
      } catch (err: any) {
          alert("Failed to reset password: " + err.message);
      } finally {
          setIsResetting(false);
      }
  };

  // --- TEAM ASSIGNMENT LOGIC ---
  const openTeamManager = async (project: Project) => {
      setActiveProjectForTeam(project);
      setIsLoadingAssignments(true);
      try {
          const assignments = await fetchProjectAssignments(project.id);
          setProjectAssignments(assignments);
      } catch (err) {
          console.error(err);
      } finally {
          setIsLoadingAssignments(false);
      }
  };
  
  const closeTeamManager = () => {
      setActiveProjectForTeam(null);
      setProjectAssignments([]);
      setAssignUserId('');
      setAssignUserRole('lineproducer'); // Reset to default
      setError(null);
      setSuccessMsg(null);
  };
  
  const handleAddAssignment = async () => {
      if(!activeProjectForTeam || !assignUserId) return;
      try {
          await addProjectAssignment(activeProjectForTeam.id, assignUserId, assignUserRole);
          const assignments = await fetchProjectAssignments(activeProjectForTeam.id);
          setProjectAssignments(assignments);
          const globalAssigns = await fetchAssignmentsForOwner(profile.id);
          setAllOwnerAssignments(globalAssigns);
          setAssignUserId('');
          setAssignUserRole('lineproducer');
          setSuccessMsg("User assigned to project.");
      } catch (err: any) {
          console.error("Add Assignment Error:", err);
          setError(err.message || "Failed to assign user");
      }
  };
  
  const handleRemoveAssignment = async (id: number) => {
       if(!activeProjectForTeam) return;
       setError(null);
       setSuccessMsg(null);
       try {
          await removeProjectAssignment(id);
          const assignments = await fetchProjectAssignments(activeProjectForTeam.id);
          setProjectAssignments(assignments);
          const globalAssigns = await fetchAssignmentsForOwner(profile.id);
          setAllOwnerAssignments(globalAssigns);
          setSuccessMsg("User removed from project.");
      } catch (err: any) {
          console.error("Remove Assignment Error:", err);
          setError(err.message || "Failed to remove user");
      }
  };

  // Helper to format role names for display
  const formatRoleName = (role: string) => {
      switch(role) {
          case 'lineproducer': return 'Line Producer';
          case 'producer': return 'Producer';
          case 'accountant': return 'Accountant';
          case 'admin': return 'Administrator'; // For system-level roles
          case 'superuser': return 'Superuser'; // For system-level roles
          default: return role;
      }
  };

  // Get users who are either invited by this owner OR assigned to their projects
  // This ensures Superuser's 'My Team' tab only shows relevant profiles.
  const getRelevantTeamProfiles = () => {
      const invitedProfiles = profiles.filter(p => p.invited_by === profile.id);
      const assignedUserIdsInOwnerProjects = new Set(
          allOwnerAssignments.filter(a => a.project?.created_by === profile.id).map(a => a.user_id)
      );
      
      const uniqueUserIds = Array.from(new Set([...invitedProfiles.map(p => p.id), ...assignedUserIdsInOwnerProjects]));
      
      return profiles.filter(p => uniqueUserIds.includes(p.id));
  };
  
  // Get all assignments for a specific user to display in "My Team" tab
  const getUserAssignmentsDisplay = (userId: string) => {
    const userAssigns = allOwnerAssignments.filter(a => a.user_id === userId);
    if (userAssigns.length === 0) return "Unassigned";
    
    return userAssigns.map(a => 
      <span key={a.id} className="inline-flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100 font-bold uppercase mr-1 mb-1">
        {formatRoleName(a.role)} {a.project?.name ? `(${a.project.name})` : ''}
      </span>
    );
  };


  // --- V36 SQL MIGRATION SCRIPT ---
  const getMigrationSql = () => `
-- === V36 MIGRATION: INVOICE ALLOCATION SUMMARY & RLS OPTIMIZATION ===
-- Adds total_allocated_amount and has_allocations columns to 'invoices' table.
-- Creates a trigger to automatically update these fields when 'invoice_allocations' change.
-- Optimizes RLS policies for better performance and fixes foreign key cascades.

-- 1. AGGRESSIVE CLEANUP OF OLD POLICIES AND FUNCTIONS
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all policies from relevant tables (dynamic discovery)
    FOR r IN (
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN ('profiles', 'projects', 'budgets', 'budget_lines', 'project_assignments', 'user_invitations', 'invoices', 'invoice_allocations')
    )
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.' || r.tablename || ';';
        RAISE NOTICE 'Dropped policy: % on %', r.policyname, r.tablename;
    END LOOP;

    -- Drop all functions (CASCADE to remove dependencies cleanly)
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
    DROP FUNCTION IF EXISTS get_my_role_safe() CASCADE; -- Old function name
    DROP FUNCTION IF EXISTS get_my_team_mates() CASCADE; -- Old function name
    DROP FUNCTION IF EXISTS is_project_member(bigint) CASCADE; -- Old function name
    DROP FUNCTION IF EXISTS is_project_owner(bigint) CASCADE; -- Old function name
    DROP FUNCTION IF EXISTS get_profile_role(uuid) CASCADE; -- Old function name
    DROP FUNCTION IF EXISTS check_email_exists_global(text) CASCADE;
    
    RAISE NOTICE 'Cleaned up all old policies and functions.';
END $$;


-- 2. CREATE ENUM (Safely)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_role') THEN
        CREATE TYPE project_role AS ENUM ('lineproducer', 'producer', 'accountant');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE app_role AS ENUM ('admin', 'superuser', 'user');
    END IF;
END $$;


-- 3. CREATE/UPDATE TABLE SCHEMAS (Safely and Idempotently with ON DELETE CASCADE/SET NULL)

-- profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid references auth.users on delete cascade primary key,
  email text NOT NULL,
  full_name text,
  app_role app_role DEFAULT 'user' NOT NULL, -- New column for proper RBAC
  is_disabled boolean DEFAULT FALSE NOT NULL,
  invited_by uuid references auth.users ON DELETE SET NULL, -- Who invited this user
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
-- Ensure columns exist and have correct defaults/constraints
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS app_role app_role DEFAULT 'user' NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_disabled boolean DEFAULT FALSE NOT NULL;
-- Ensure FK constraint for invited_by (handled by drop/add below)


-- projects table
CREATE TABLE IF NOT EXISTS projects (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  description text,
  company_name text,
  ico text,
  currency text DEFAULT 'CZK' NOT NULL,
  created_by uuid REFERENCES auth.users ON DELETE SET NULL, -- Project owner
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ico text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS currency text DEFAULT 'CZK' NOT NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users ON DELETE SET NULL;


-- budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id bigint REFERENCES projects ON DELETE CASCADE NOT NULL,
  version_name text,
  xml_content text,
  is_active boolean DEFAULT FALSE NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT FALSE NOT NULL;


-- budget_lines table
CREATE TABLE IF NOT EXISTS budget_lines (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  budget_id bigint REFERENCES budgets ON DELETE CASCADE NOT NULL,
  account_number text NOT NULL,
  account_description text,
  category_number text,
  category_description text,
  original_amount numeric NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- project_assignments table
CREATE TABLE IF NOT EXISTS project_assignments (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id bigint REFERENCES projects ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role project_role NOT NULL,
  UNIQUE(project_id, user_id)
);


-- user_invitations table
CREATE TABLE IF NOT EXISTS user_invitations (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  email text NOT NULL,
  invited_by uuid REFERENCES auth.users ON DELETE SET NULL,
  status text DEFAULT 'pending' NOT NULL, -- 'pending', 'accepted', 'rejected'
  target_app_role app_role, -- For system-level invites (admin, superuser)
  target_role project_role, -- For project-level invites (lineproducer, producer, accountant)
  target_project_id bigint REFERENCES projects(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' NOT NULL;
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS target_app_role app_role;
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS target_role project_role;
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS target_project_id bigint REFERENCES projects(id) ON DELETE SET NULL;


-- invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  user_id uuid REFERENCES auth.users ON DELETE SET NULL NOT NULL, -- Uploader of the invoice
  project_id bigint REFERENCES projects(id) ON DELETE SET NULL, -- Linked project
  internal_id bigint, -- Project specific sequence number (1, 2, 3...)
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
  status text DEFAULT 'draft' NOT NULL, -- 'draft', 'approved', 'final_approved', 'rejected'
  rejection_reason text,
  file_content text, -- Base64 content for preview
  
  -- New fields for allocation summary (updated by trigger)
  total_allocated_amount numeric DEFAULT 0 NOT NULL,
  has_allocations boolean DEFAULT FALSE NOT NULL
);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS internal_id bigint;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS variable_symbol text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft' NOT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS file_content text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_allocated_amount numeric DEFAULT 0 NOT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS has_allocations boolean DEFAULT FALSE NOT NULL;
ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'draft'; -- Ensure default for existing rows


-- invoice_allocations table
CREATE TABLE IF NOT EXISTS invoice_allocations (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  invoice_id bigint REFERENCES invoices ON DELETE CASCADE NOT NULL,
  budget_line_id bigint REFERENCES budget_lines ON DELETE CASCADE NOT NULL,
  amount numeric NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- 4. FIX FOREIGN KEY CASCADES (Crucial for user deletion)
-- Drop old FKs and re-add with ON DELETE CASCADE/SET NULL where appropriate
DO $$ BEGIN
    -- profiles.invited_by
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_invited_by_fkey;
    ALTER TABLE profiles ADD CONSTRAINT profiles_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    
    -- invoices.user_id
    ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_user_id_fkey;
    ALTER TABLE invoices ADD CONSTRAINT invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

    -- invoices.project_id
    ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_project_id_fkey;
    ALTER TABLE invoices ADD CONSTRAINT invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

    RAISE NOTICE 'Fixed Foreign Key constraints for cascades.';
END $$;


-- 5. DATA CLEANUP & MIGRATION (Idempotent)
DO $$ BEGIN
    -- Ensure app_role is set for existing profiles
    UPDATE profiles SET app_role = 'admin' WHERE lower(email) = 'tadekus@gmail.com' AND app_role IS DISTINCT FROM 'admin';
    UPDATE profiles SET app_role = 'superuser' WHERE is_superuser = TRUE AND app_role IS DISTINCT FROM 'superuser';
    UPDATE profiles SET app_role = 'user' WHERE app_role IS NULL;

    -- Clean existing IČO data in invoices (strip non-digits)
    UPDATE invoices SET ico = REGEXP_REPLACE(ico, '[^0-9]', '', 'g') WHERE ico IS NOT NULL AND ico ~ '[^0-9]';
    -- Clean existing variable_symbol data in invoices (strip spaces)
    UPDATE invoices SET variable_symbol = REPLACE(variable_symbol, ' ', '') WHERE variable_symbol IS NOT NULL AND variable_symbol LIKE '% %';
    RAISE NOTICE 'Cleaned up ICO and Variable Symbol data in invoices and set app_roles.';
END $$;


-- 6. CREATE OPTIMIZED RLS HELPER FUNCTIONS (SECURITY DEFINER)
-- These functions run with 'postgres' privileges, bypassing RLS to safely check roles/memberships

-- Get current user's app_role safely
CREATE OR REPLACE FUNCTION get_my_app_role_safe()
RETURNS app_role LANGUAGE plpgsql SECURITY DEFINER AS $$
  DECLARE
    user_app_role app_role;
  BEGIN
    SELECT p.app_role INTO user_app_role FROM public.profiles p WHERE p.id = (select auth.uid());
    RETURN COALESCE(user_app_role, 'user'); -- Default to 'user' if profile not found
  END;
$$;
ALTER FUNCTION get_my_app_role_safe() OWNER TO postgres;

-- Check if current user is an 'admin'
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
  BEGIN
    RETURN (SELECT get_my_app_role_safe()) = 'admin';
  END;
$$;
ALTER FUNCTION is_admin() OWNER TO postgres;

-- Check if current user is a 'superuser' or 'admin'
CREATE OR REPLACE FUNCTION is_superuser_app()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
  BEGIN
    RETURN (SELECT get_my_app_role_safe()) = 'superuser' OR (SELECT is_admin());
  END;
$$;
ALTER FUNCTION is_superuser_app() OWNER TO postgres;

-- Check if a user is a member of a specific project (bypasses RLS on profiles for lookup)
CREATE OR REPLACE FUNCTION is_user_project_member(p_user_id uuid, p_project_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.project_assignments
        WHERE user_id = p_user_id AND project_id = p_project_id
    );
END;
$$;
ALTER FUNCTION is_user_project_member(uuid, bigint) OWNER TO postgres;

-- Check if current user is member of an invoice's project
CREATE OR REPLACE FUNCTION is_current_user_invoice_project_member(p_invoice_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_project_id bigint;
BEGIN
    SELECT project_id INTO v_project_id FROM public.invoices WHERE id = p_invoice_id;
    RETURN (SELECT is_user_project_member((select auth.uid()), v_project_id));
END;
$$;
ALTER FUNCTION is_current_user_invoice_project_member(bigint) OWNER TO postgres;

-- Function to check if an email exists globally in auth.users or pending invitations
CREATE OR REPLACE FUNCTION check_email_exists_global(target_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  SET search_path = public, auth;
  RETURN EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(target_email))
         OR EXISTS (SELECT 1 FROM public.user_invitations WHERE lower(email) = lower(target_email) AND status = 'pending');
END;
$$;
ALTER FUNCTION check_email_exists_global(text) OWNER TO postgres;

-- Function for Admin to reset any password (super-privileges)
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
ALTER FUNCTION admin_reset_user_password(uuid, text) OWNER TO postgres;

-- Function for Superuser to reset passwords of users they invited
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
ALTER FUNCTION superuser_reset_password(uuid, text) OWNER TO postgres;

-- Function to update profile and claim role for invited users (SECURITY DEFINER for bypass)
CREATE OR REPLACE FUNCTION claim_invited_role(p_full_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  inv_record record;
  current_email text;
  profile_id uuid := (select auth.uid());
  user_app_role app_role := 'user'; -- Default if no invite or not admin/superuser
  user_project_role project_role := NULL;
  user_project_id bigint := NULL;
BEGIN
  SET search_path = public, auth;
  
  SELECT lower(email) INTO current_email FROM auth.users WHERE id = profile_id;
  
  -- Find the Pending Invitation
  SELECT * FROM public.user_invitations 
  WHERE lower(email) = current_email AND status = 'pending'
  LIMIT 1 INTO inv_record;

  IF inv_record.id IS NOT NULL THEN
    -- Determine roles from invitation
    user_app_role := COALESCE(inv_record.target_app_role, 'user');
    user_project_role := inv_record.target_role;
    user_project_id := inv_record.target_project_id;

    -- Update the profile directly (bypasses RLS due to SECURITY DEFINER)
    UPDATE public.profiles 
    SET 
        full_name = p_full_name, 
        app_role = user_app_role, 
        invited_by = inv_record.invited_by 
    WHERE id = profile_id;

    -- If it's a project team member, assign to project
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

    -- Mark invite as used
    UPDATE public.user_invitations SET status = 'accepted' WHERE id = inv_record.id;
    RETURN 'Account Setup Complete: Role ' || user_app_role || ' / ' || coalesce(user_project_role::text, 'N/A');
  ELSE
    -- If no invite, just update name for existing profile (should only happen for manual signups)
    UPDATE public.profiles SET full_name = p_full_name WHERE id = profile_id;
    RETURN 'No pending invitation found, name updated.';
  END IF;
END;
$$;
ALTER FUNCTION claim_invited_role(text) OWNER TO postgres;

-- Function to delete user (from auth.users which cascades to profiles, assignments etc)
CREATE OR REPLACE FUNCTION delete_team_member(target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Check if the current user is an admin or is the inviter of the target_user_id
    IF (SELECT is_admin()) OR (
        SELECT p.invited_by FROM public.profiles p WHERE p.id = target_user_id
    ) = (select auth.uid()) THEN
        -- Delete from auth.users, which should cascade to profiles, assignments, etc.
        DELETE FROM auth.users WHERE id = target_user_id;
    ELSE
        RAISE EXCEPTION 'Permission denied: Not an admin or not the inviter of this user.';
    END IF;
END;
$$;
ALTER FUNCTION delete_team_member(uuid) OWNER TO postgres;


-- 7. CREATE TRIGGER FUNCTION FOR INVOICE ALLOCATION SUMMARY
CREATE OR REPLACE FUNCTION update_invoice_allocation_summary()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_total_allocated NUMERIC;
    v_has_allocations BOOLEAN;
    target_invoice_id BIGINT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_invoice_id := OLD.invoice_id;
    ELSIF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        target_invoice_id := NEW.invoice_id;
    END IF;

    -- Calculate current summary for the affected invoice_id
    SELECT 
        COALESCE(SUM(amount), 0),
        COUNT(*) > 0
    INTO 
        v_total_allocated, 
        v_has_allocations
    FROM public.invoice_allocations 
    WHERE invoice_id = target_invoice_id;
    
    -- Update the parent invoice
    UPDATE public.invoices
    SET 
        total_allocated_amount = v_total_allocated,
        has_allocations = v_has_allocations
    WHERE id = target_invoice_id;
    
    -- AFTER triggers usually return NEW or OLD, or NULL
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;
ALTER FUNCTION update_invoice_allocation_summary() OWNER TO postgres;

-- Trigger to call the summary function on INSERT, UPDATE, DELETE of invoice_allocations
CREATE TRIGGER tr_update_invoice_allocation_summary
AFTER INSERT OR UPDATE OR DELETE ON invoice_allocations
FOR EACH ROW EXECUTE FUNCTION update_invoice_allocation_summary();


-- 8. RLS POLICIES (Updated and Optimized for V36)
-- Use (select auth.uid()) pattern for caching and explicit function calls for role checks

-- --- PROFILES ---
CREATE POLICY "Profiles Admin Full" ON profiles FOR ALL TO authenticated USING ( (select is_admin()) );
CREATE POLICY "Profiles View Self and Invites" ON profiles FOR SELECT TO authenticated
USING ( 
    id = (select auth.uid()) 
    OR invited_by = (select auth.uid()) 
    OR (select is_admin())
    OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.user_id = (select auth.uid()) AND pa.project_id IN (SELECT p.project_id FROM project_assignments p WHERE p.user_id = profiles.id))
);
CREATE POLICY "Profiles Update Self" ON profiles FOR UPDATE TO authenticated USING ( id = (select auth.uid()) );


-- --- PROJECTS ---
CREATE POLICY "Projects Admin Full" ON projects FOR ALL TO authenticated USING ( (select is_admin()) );
CREATE POLICY "Projects Owners Full" ON projects FOR ALL TO authenticated USING ( created_by = (select auth.uid()) );
CREATE POLICY "Projects Team Read" ON projects FOR SELECT TO authenticated USING ( 
    (select is_user_project_member((select auth.uid()), id))
    OR (select is_superuser_app()) 
);


-- --- BUDGETS ---
CREATE POLICY "Budgets Admin Full" ON budgets FOR ALL TO authenticated USING ( (select is_admin()) );
CREATE POLICY "Budgets Owners Full" ON budgets FOR ALL TO authenticated USING ( 
    EXISTS (SELECT 1 FROM projects WHERE id = budgets.project_id AND created_by = (select auth.uid()))
);
CREATE POLICY "Budgets Team Read" ON budgets FOR SELECT TO authenticated USING ( 
    EXISTS (SELECT 1 FROM project_assignments WHERE project_id = budgets.project_id AND user_id = (select auth.uid())) 
);
CREATE POLICY "Budgets Team Write" ON budgets FOR ALL TO authenticated -- Superusers, LPs, Producers can manage budgets
USING ( 
    EXISTS (SELECT 1 FROM project_assignments WHERE project_id = budgets.project_id AND user_id = (select auth.uid()))
    OR EXISTS (SELECT 1 FROM projects WHERE id = budgets.project_id AND created_by = (select auth.uid()))
);


-- --- BUDGET_LINES ---
CREATE POLICY "Budget Lines Admin Full" ON budget_lines FOR ALL TO authenticated USING ( (select is_admin()) );
CREATE POLICY "Budget Lines Owners Full" ON budget_lines FOR ALL TO authenticated USING ( 
    EXISTS (SELECT 1 FROM budgets b JOIN projects p ON b.project_id = p.id WHERE b.id = budget_lines.budget_id AND p.created_by = (select auth.uid()))
);
CREATE POLICY "Budget Lines Team Read" ON budget_lines FOR SELECT TO authenticated USING ( 
    EXISTS (SELECT 1 FROM budgets b JOIN project_assignments pa ON b.project_id = pa.project_id WHERE b.id = budget_lines.budget_id AND pa.user_id = (select auth.uid()))
);
CREATE POLICY "Budget Lines Team Write" ON budget_lines FOR ALL TO authenticated -- Superusers, LPs, Producers can manage budget lines
USING (
    EXISTS (SELECT 1 FROM budgets b JOIN project_assignments pa ON b.project_id = pa.project_id WHERE b.id = budget_lines.budget_id AND pa.user_id = (select auth.uid()))
    OR EXISTS (SELECT 1 FROM budgets b JOIN projects p ON b.project_id = p.id WHERE b.id = budget_lines.budget_id AND p.created_by = (select auth.uid()))
);


-- --- PROJECT_ASSIGNMENTS ---
CREATE POLICY "Assignments Admin Full" ON project_assignments FOR ALL TO authenticated USING ( (select is_admin()) );
CREATE POLICY "Assignments Owner Manage" ON project_assignments FOR ALL TO authenticated USING ( 
    EXISTS (SELECT 1 FROM projects WHERE id = project_assignments.project_id AND created_by = (select auth.uid()))
);
CREATE POLICY "Assignments Read Self" ON project_assignments FOR SELECT TO authenticated USING ( user_id = (select auth.uid()) );


-- --- USER_INVITATIONS ---
CREATE POLICY "Invitations Admin Full" ON user_invitations FOR ALL TO authenticated USING ( (select is_admin()) );
CREATE POLICY "Invitations Owner Manage" ON user_invitations FOR ALL TO authenticated USING ( invited_by = (select auth.uid()) );
CREATE POLICY "Invitations Read Self" ON user_invitations FOR SELECT TO authenticated USING ( lower(email) = lower((select auth.jwt() ->> 'email')) );


-- --- INVOICES ---
CREATE POLICY "Invoices Admin Full" ON invoices FOR ALL TO authenticated USING ( (select is_admin()) );
-- Team members can read ALL invoices in their assigned projects
CREATE POLICY "Invoices Team Read" ON invoices FOR SELECT TO authenticated USING ( (select is_current_user_invoice_project_member(id)) );
-- Line Producers can create/update their own invoices if they are part of the project
CREATE POLICY "Invoices Line Producer Manage" ON invoices FOR ALL TO authenticated -- INSERT, UPDATE, DELETE
USING ( 
    (select is_user_project_member((select auth.uid()), project_id)) AND (select get_my_app_role_safe()) = 'user'
) WITH CHECK (
    (select is_user_project_member((select auth.uid()), project_id)) AND (select get_my_app_role_safe()) = 'user' 
    AND status IN ('draft', 'rejected') -- Can only manage drafts or rejected, not approved/final_approved
);
-- Producers can update status and rejection reason for pending invoices
CREATE POLICY "Invoices Producer Update Status" ON invoices FOR UPDATE TO authenticated USING (
    (select is_user_project_member((select auth.uid()), project_id)) 
    AND (select get_my_app_role_safe()) = 'user' -- For role check
    AND old.status = 'approved' -- Only invoices waiting for approval
) WITH CHECK (
    -- Producer can ONLY change status or rejection_reason
    (status IN ('final_approved', 'rejected') AND (total_allocated_amount IS NOT DISTINCT FROM old.total_allocated_amount) AND (has_allocations IS NOT DISTINCT FROM old.has_allocations) AND (company_name IS NOT DISTINCT FROM old.company_name) AND (ico IS NOT DISTINCT FROM old.ico) AND (variable_symbol IS NOT DISTINCT FROM old.variable_symbol) AND (description IS NOT DISTINCT FROM old.description) AND (amount_without_vat IS NOT DISTINCT FROM old.amount_without_vat) AND (amount_with_vat IS NOT DISTINCT FROM old.amount_with_vat) AND (bank_account IS NOT DISTINCT FROM old.bank_account) AND (iban IS NOT DISTINCT FROM old.iban) AND (currency IS NOT DISTINCT FROM old.currency))
);


-- --- INVOICE_ALLOCATIONS ---
CREATE POLICY "Allocations Admin Full" ON invoice_allocations FOR ALL TO authenticated USING ( (select is_admin()) );
CREATE POLICY "Allocations Team Read" ON invoice_allocations FOR SELECT TO authenticated USING ( 
    EXISTS (SELECT 1 FROM invoices WHERE id = invoice_allocations.invoice_id AND (select is_current_user_invoice_project_member(invoices.id)))
);
CREATE POLICY "Allocations Line Producer Manage" ON invoice_allocations FOR ALL TO authenticated -- INSERT, UPDATE, DELETE
USING (
    EXISTS (SELECT 1 FROM invoices WHERE id = invoice_allocations.invoice_id AND (select get_my_app_role_safe()) = 'user' AND invoices.status IN ('draft', 'rejected') AND (select is_current_user_invoice_project_member(invoices.id)))
);


-- 9. CREATE DATABASE INDEXES (for performance)
CREATE INDEX IF NOT EXISTS idx_invoices_project_id_internal_id ON invoices (project_id, internal_id DESC);
CREATE INDEX IF NOT EXISTS idx_budget_lines_budget_id ON budget_lines (budget_id);
CREATE INDEX IF NOT EXISTS idx_invoice_allocations_invoice_id ON invoice_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_allocations_budget_line_id ON invoice_allocations (budget_line_id);
CREATE INDEX IF NOT EXISTS idx_invoices_ico ON invoices (ico);
CREATE INDEX IF NOT EXISTS idx_invoices_variable_symbol ON invoices (variable_symbol);
CREATE INDEX IF NOT EXISTS idx_profiles_invited_by ON profiles (invited_by);
CREATE INDEX IF NOT EXISTS idx_project_assignments_user_project ON project_assignments (user_id, project_id);


-- 10. INITIAL DATA MIGRATION/SETUP (Idempotent for tadekus@gmail.com)
-- This runs once to ensure the master admin profile and initial extension are set up.
DO $$ BEGIN
    -- Ensure pgcrypto extension is enabled for password hashing functions
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
    
    -- Ensure master admin profile exists and has correct role
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

    RAISE NOTICE 'Initial admin profile setup complete.';
END $$;
    