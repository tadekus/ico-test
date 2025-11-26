
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
  fetchProjectAssignments,
  addProjectAssignment,
  removeProjectAssignment,
  fetchAssignmentsForOwner,
  adminResetPassword,
  deleteProfile
} from '../services/supabaseService';
import { Profile, UserInvitation, Project, ProjectAssignment, ProjectRole, AppRole } from '../types';

interface AdminDashboardProps {
  profile: Profile;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ profile }) => {
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
  
  // Admin Invite State
  const [inviteAppRole, setInviteAppRole] = useState<AppRole>('superuser');
  
  // Superuser Invite State
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
    
    // Auto-show SQL if we are in ghost mode
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

      // Load all assignments for this user's projects (to display specific roles in list)
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
         // Admin inviting Admin/Superuser
         await sendSystemInvitation(inviteEmail, inviteAppRole, null, null);
      } else {
         // Superuser inviting Team Member
         const pId = inviteProjectId ? parseInt(inviteProjectId) : null;
         await sendSystemInvitation(inviteEmail, null, inviteProjectRole, pId);
      }

      setSuccessMsg(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      // Refresh invites
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
    if(!window.confirm("Are you sure you want to delete this project? This will assume all budgets and assignments are deleted.")) return;
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

  const handleToggleDisabled = async (p: Profile) => {
    if (p.id === profile.id) return; // Can't disable self
    const newValue = !p.is_disabled;
    if (window.confirm(`Are you sure you want to ${newValue ? 'SUSPEND' : 'ACTIVATE'} ${p.email}?`)) {
      try {
        await toggleUserDisabled(p.id, newValue);
        setProfiles(profiles.map(item => item.id === p.id ? {...item, is_disabled: newValue} : item));
      } catch (err) { setError("Failed to update status"); }
    }
  };

  const handleDeleteUser = async (p: Profile) => {
    if (!window.confirm(`Are you sure you want to DELETE ${p.email}? This action CANNOT be undone and will prevent them from logging in.`)) return;
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
          await adminResetPassword(resetTarget.id, newPassword);
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
  };
  
  const handleAddAssignment = async () => {
      if(!activeProjectForTeam || !assignUserId) return;
      try {
          await addProjectAssignment(activeProjectForTeam.id, assignUserId, assignUserRole);
          // Refresh list
          const assignments = await fetchProjectAssignments(activeProjectForTeam.id);
          setProjectAssignments(assignments);
          setAssignUserId('');
          // Also refresh global assignments
          const globalAssigns = await fetchAssignmentsForOwner(profile.id);
          setAllOwnerAssignments(globalAssigns);
      } catch (err: any) {
          alert(err.message || "Failed to assign user");
      }
  };
  
  const handleRemoveAssignment = async (id: number) => {
       if(!activeProjectForTeam) return;
       try {
          await removeProjectAssignment(id);
          // Refresh list
          const assignments = await fetchProjectAssignments(activeProjectForTeam.id);
          setProjectAssignments(assignments);
          // Refresh global
          const globalAssigns = await fetchAssignmentsForOwner(profile.id);
          setAllOwnerAssignments(globalAssigns);
      } catch (err: any) {
          alert(err.message || "Failed to remove user");
      }
  };

  // Helper to get formatted role string for team list
  const getUserRolesText = (userId: string) => {
    const userAssigns = allOwnerAssignments.filter(a => a.user_id === userId);
    if (userAssigns.length === 0) return "Unassigned";
    if (userAssigns.length === 1) {
        return `${formatRoleName(userAssigns[0].role)} (${userAssigns[0].project?.name})`;
    }
    return `${userAssigns.length} Active Roles`;
  };

  const formatRoleName = (role: string) => {
      switch(role) {
          case 'lineproducer': return 'Line Producer';
          case 'producer': return 'Producer';
          case 'accountant': return 'Accountant';
          default: return role;
      }
  };

  // Get users assigned to a specific project for card display
  const getAssignedUsersForProject = (projectId: number) => {
      const assignedIds = allOwnerAssignments
        .filter(a => a.project_id === projectId)
        .map(a => a.user_id);
      
      return profiles.filter(p => assignedIds.includes(p.id));
  };

  const getMigrationSql = () => `
-- === REPAIR V19 (SOLIDIFICATION & FULL NAME FIX) ===

-- 1. DISABLE SECURITY
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_assignments DISABLE ROW LEVEL SECURITY;

-- 2. SETUP EXTENSIONS
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;

-- 3. CLEANUP OLD FUNCTIONS
DROP FUNCTION IF EXISTS public.delete_team_member(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.claim_invited_role() CASCADE; -- Drop old 0-arg version
DROP FUNCTION IF EXISTS public.claim_invited_role(text) CASCADE; -- Drop new version if exists
DROP FUNCTION IF EXISTS public.get_my_role_safe() CASCADE;
DROP FUNCTION IF EXISTS public.get_my_team_mates_ids() CASCADE;
DROP FUNCTION IF EXISTS public.is_project_owner(bigint) CASCADE;
DROP FUNCTION IF EXISTS public.is_project_member(bigint) CASCADE;
DROP FUNCTION IF EXISTS public.admin_reset_user_password(uuid, text) CASCADE;

-- 4. HELPER FUNCTIONS (SECURITY DEFINER)

-- Check Role
CREATE OR REPLACE FUNCTION public.get_my_role_safe()
RETURNS text AS $$
BEGIN
  RETURN (SELECT app_role FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.get_my_role_safe() OWNER TO postgres;

-- Check Project Ownership
CREATE OR REPLACE FUNCTION public.is_project_owner(pid bigint)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM projects WHERE id = pid AND created_by = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.is_project_owner(bigint) OWNER TO postgres;

-- Check Project Membership
CREATE OR REPLACE FUNCTION public.is_project_member(pid bigint)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM project_assignments WHERE project_id = pid AND user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.is_project_member(bigint) OWNER TO postgres;

-- Password Reset
CREATE OR REPLACE FUNCTION admin_reset_user_password(target_user_id uuid, new_password text)
RETURNS void AS $$
BEGIN
  IF lower(auth.jwt() ->> 'email') <> 'tadekus@gmail.com' THEN
    RAISE EXCEPTION 'Access Denied';
  END IF;
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;
ALTER FUNCTION admin_reset_user_password(uuid, text) OWNER TO postgres;

-- 5. NEW: DELETE TEAM MEMBER (Auth + Profile)
CREATE OR REPLACE FUNCTION public.delete_team_member(target_user_id uuid)
RETURNS void AS $$
DECLARE
  requesting_user_id uuid;
BEGIN
  requesting_user_id := auth.uid();
  SET search_path = public, auth;

  -- Permission Check: Master Admin OR Inviter
  IF (lower(auth.jwt() ->> 'email') = 'tadekus@gmail.com') OR
     EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id AND invited_by = requesting_user_id) THEN

     -- Delete from AUTH (cascades to public tables)
     DELETE FROM auth.users WHERE id = target_user_id;
  ELSE
     RAISE EXCEPTION 'Access Denied: You cannot delete this user.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
ALTER FUNCTION public.delete_team_member(uuid) OWNER TO postgres;

-- 6. GLOBAL EMAIL CHECK
CREATE OR REPLACE FUNCTION public.check_email_exists_global(target_email text)
RETURNS boolean AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(target_email)) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.user_invitations WHERE lower(email) = lower(target_email) AND status = 'pending') THEN RETURN true; END IF;
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.check_email_exists_global(text) OWNER TO postgres;

-- 7. CLAIM INVITED ROLE (NOW ACCEPTS NAME)
CREATE OR REPLACE FUNCTION public.claim_invited_role(p_full_name text)
RETURNS text AS $$
DECLARE
  inv_record record;
  current_email text;
BEGIN
  SET search_path = public, auth;
  SELECT lower(email) INTO current_email FROM auth.users WHERE id = auth.uid();
  
  SELECT * FROM public.user_invitations 
  WHERE lower(email) = current_email AND status = 'pending'
  LIMIT 1 INTO inv_record;

  IF inv_record.id IS NOT NULL THEN
    -- Update Name & Inviter & Role (All in God Mode)
    UPDATE public.profiles SET 
        invited_by = inv_record.invited_by,
        full_name = p_full_name
    WHERE id = auth.uid();
    
    IF inv_record.target_role IS NULL THEN
       -- Admin/Superuser Invite
       UPDATE public.profiles SET app_role = 'superuser', is_superuser = true WHERE id = auth.uid();
       
       -- Mark as Accepted
       UPDATE public.user_invitations SET status = 'accepted' WHERE id = inv_record.id;
       RETURN 'Role Claimed: Superuser';
    ELSE
       -- Team Member Invite
       UPDATE public.profiles SET app_role = 'user', is_superuser = false WHERE id = auth.uid();
       
       -- Force Assignment Insert
       IF inv_record.target_project_id IS NOT NULL THEN
          INSERT INTO public.project_assignments (project_id, user_id, role)
          VALUES (inv_record.target_project_id, auth.uid(), inv_record.target_role)
          ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role;
          
          -- Mark as Accepted
          UPDATE public.user_invitations SET status = 'accepted' WHERE id = inv_record.id;
          RETURN 'Role Claimed: ' || inv_record.target_role;
       END IF;
       
       -- Mark as Accepted
       UPDATE public.user_invitations SET status = 'accepted' WHERE id = inv_record.id;
       RETURN 'Role Claimed: User (No Project)';
    END IF;

  ELSE
    RETURN 'No pending invitation found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.claim_invited_role(text) OWNER TO postgres;

-- 8. WIPE OLD POLICIES
DO $$ 
DECLARE 
  pol record;
BEGIN 
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE tablename IN ('profiles', 'project_assignments', 'user_invitations', 'projects', 'budgets') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- 9. RE-APPLY POLICIES (No loops)

-- Projects
CREATE POLICY "Projects Read" ON projects FOR SELECT TO authenticated 
USING ( created_by = auth.uid() OR lower(auth.jwt() ->> 'email') = 'tadekus@gmail.com' OR public.get_my_role_safe() = 'admin' OR public.is_project_member(id) );

CREATE POLICY "Projects Insert" ON projects FOR INSERT TO authenticated 
WITH CHECK ( auth.uid() = created_by );

CREATE POLICY "Projects Update/Delete" ON projects FOR ALL TO authenticated 
USING ( created_by = auth.uid() OR lower(auth.jwt() ->> 'email') = 'tadekus@gmail.com' );

-- Assignments
CREATE POLICY "Assignments Read" ON project_assignments FOR SELECT TO authenticated 
USING ( user_id = auth.uid() OR public.get_my_role_safe() = 'admin' OR public.is_project_owner(project_id) );

CREATE POLICY "Assignments Manage Owner" ON project_assignments FOR ALL TO authenticated 
USING ( public.is_project_owner(project_id) )
WITH CHECK ( public.is_project_owner(project_id) );

-- Profiles
CREATE POLICY "Profiles Read Self" ON profiles FOR SELECT TO authenticated USING ( id = auth.uid() );
CREATE POLICY "Profiles Read Admin" ON profiles FOR SELECT TO authenticated USING ( lower(auth.jwt() ->> 'email') = 'tadekus@gmail.com' OR public.get_my_role_safe() = 'admin');
CREATE POLICY "Profiles Read Invitees" ON profiles FOR SELECT TO authenticated USING ( invited_by = auth.uid() );
CREATE POLICY "Profiles Read Team" ON profiles FOR SELECT TO authenticated 
USING ( id IN (SELECT user_id FROM project_assignments WHERE project_id IN (SELECT id FROM projects WHERE created_by = auth.uid())) );

CREATE POLICY "Profiles Update Self" ON profiles FOR UPDATE TO authenticated USING ( id = auth.uid() ) WITH CHECK ( id = auth.uid() );
CREATE POLICY "Profiles Update Admin" ON profiles FOR UPDATE TO authenticated USING ( lower(auth.jwt() ->> 'email') = 'tadekus@gmail.com' OR public.get_my_role_safe() = 'admin' );
CREATE POLICY "Profiles Delete Invitees" ON profiles FOR DELETE TO authenticated USING ( invited_by = auth.uid() );

-- Invitations
CREATE POLICY "Invitations Read" ON user_invitations FOR SELECT TO authenticated USING ( invited_by = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email') OR public.get_my_role_safe() = 'admin' );
CREATE POLICY "Invitations Write" ON user_invitations FOR ALL TO authenticated USING ( invited_by = auth.uid() OR public.get_my_role_safe() IN ('admin', 'superuser') );

-- 10. RE-ENABLE SECURITY
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- 11. OVERRIDE
UPDATE profiles SET is_superuser = true, app_role = 'admin' WHERE lower(email) = 'tadekus@gmail.com';
`;

  // Merge Profiles and Pending System Invites for the Admin List
  const pendingSystemInvites = invitations.filter(inv => inv.target_app_role === 'admin' || inv.target_app_role === 'superuser');

  if (loading) return <div className="p-12 text-center"><div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="space-y-6 animate-fade-in pb-12 relative">
      {isGhostAdmin && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
              <div className="flex">
                  <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                  </div>
                  <div className="ml-3">
                      <p className="text-sm text-red-700 font-bold">
                          CRITICAL: "Infinite Recursion" or "Ghost Profile" Detected
                      </p>
                      <p className="text-sm text-red-700 mt-1">
                          The database permission rules are currently broken (infinite loop).
                          <br/>
                          <strong>Run the EMERGENCY SQL below to fix permissions and restore your Admin profile.</strong>
                      </p>
                      <button 
                        onClick={() => { setShowSql(true); navigator.clipboard.writeText(getMigrationSql()); }}
                        className="mt-2 bg-red-100 text-red-800 text-xs px-2 py-1 rounded border border-red-200 hover:bg-red-200"
                      >
                          Copy Repair SQL
                      </button>
                  </div>
              </div>
          </div>
      )}

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-100">{error}</div>}
      {successMsg && <div className="bg-emerald-50 text-emerald-600 p-4 rounded-lg">{successMsg}</div>}

      {/* TABS - Strictly Separated */}
      <div className="flex border-b border-slate-200">
          {isAdmin && (
             <button onClick={() => setActiveTab('system')}
                className={`px-6 py-3 font-medium text-sm ${activeTab === 'system' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}>
                System Management
             </button>
          )}
          {isSuperuser && (
            <>
              <button onClick={() => setActiveTab('projects')}
                 className={`px-6 py-3 font-medium text-sm ${activeTab === 'projects' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}>
                 Projects
              </button>
              <button onClick={() => setActiveTab('team')}
                 className={`px-6 py-3 font-medium text-sm ${activeTab === 'team' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}>
                 Team
              </button>
            </>
          )}
      </div>

      {/* === SYSTEM TAB (ADMIN ONLY) === */}
      {isAdmin && activeTab === 'system' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Invite Form */}
            <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-fit">
                <h3 className="font-bold text-slate-800 mb-4">Invite System User</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Invite new Administrators or Superusers to manage the platform or productions.
                </p>
                <form onSubmit={handleSendInvite} className="flex flex-col gap-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase">Email Address</label>
                        <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                           className="w-full mt-1 px-3 py-2 border rounded text-sm" placeholder="user@example.com" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase">System Role</label>
                        <select value={inviteAppRole} onChange={e => setInviteAppRole(e.target.value as AppRole)}
                           className="w-full mt-1 px-3 py-2 border rounded text-sm bg-slate-50">
                            <option value="admin">Administrator</option>
                            <option value="superuser">Superuser</option>
                        </select>
                        <p className="text-xs text-slate-400 mt-1">
                            {inviteAppRole === 'admin' 
                                ? 'Full access to System Management.' 
                                : 'Can manage Projects and Teams.'}
                        </p>
                    </div>
                    <button type="submit" disabled={isInviting} className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded font-medium text-sm">
                        {isInviting ? 'Sending...' : 'Send System Invitation'}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-slate-100">
                    <button onClick={() => setShowSql(!showSql)} className="text-xs text-slate-400 hover:text-indigo-600 underline">
                        {showSql ? 'Hide SQL' : 'Show Database Migration SQL'}
                    </button>
                    {showSql && (
                        <div className="mt-2 bg-slate-900 text-slate-300 p-3 rounded text-xs font-mono overflow-x-auto">
                            <pre>{getMigrationSql()}</pre>
                            <p className="mt-2 text-yellow-500">Run this in Supabase SQL Editor to enable Role-Based Access.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* User List - Filtered for Admins/Superusers Only */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800">System Administrators & Superusers</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-3">User</th>
                                <th className="px-6 py-3">Role</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {/* PENDING INVITATIONS */}
                            {pendingSystemInvites.map(inv => (
                                <tr key={`inv-${inv.id}`} className="bg-amber-50/50 hover:bg-amber-50">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-xs font-bold">
                                                ?
                                            </div>
                                            <div>
                                                <div className="font-medium text-slate-900 italic opacity-75">Pending Setup...</div>
                                                <div className="text-slate-500 text-xs">{inv.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {inv.target_app_role === 'admin' && <span className="px-2 py-1 border border-purple-200 text-purple-600 rounded-full text-xs font-medium">Administrator</span>}
                                        {inv.target_app_role === 'superuser' && <span className="px-2 py-1 border border-indigo-200 text-indigo-600 rounded-full text-xs font-medium">Superuser</span>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-amber-600 font-medium text-xs bg-amber-100 px-2 py-1 rounded">Pending Invite</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => handleRevokeInvitation(inv.id)} className="text-xs text-red-500 hover:text-red-700 hover:underline">Revoke</button>
                                    </td>
                                </tr>
                            ))}

                            {/* ACTIVE PROFILES */}
                            {profiles
                              .filter(p => p.app_role === 'admin' || p.app_role === 'superuser')
                              .map(p => (
                                <tr key={p.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-900">{p.full_name || 'Pending Setup'}</div>
                                        <div className="text-slate-500 text-xs">{p.email}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {p.app_role === 'admin' && <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">Administrator</span>}
                                        {p.app_role === 'superuser' && <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">Superuser</span>}
                                    </td>
                                    <td className="px-6 py-4">
                                        {p.is_disabled 
                                            ? <span className="text-red-500 font-medium">Suspended</span>
                                            : <span className="text-emerald-600 font-medium">Active</span>}
                                    </td>
                                    <td className="px-6 py-4 text-right flex items-center justify-end gap-3">
                                        {p.id !== profile.id && (
                                            <>
                                                <button 
                                                    onClick={() => setResetTarget(p)}
                                                    className="text-slate-400 hover:text-indigo-600"
                                                    title="Reset Password"
                                                >
                                                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                                    </svg>
                                                </button>
                                                <button onClick={() => handleToggleDisabled(p)} 
                                                    className={`text-xs font-medium hover:underline ${p.is_disabled ? 'text-emerald-600' : 'text-red-500'}`}>
                                                    {p.is_disabled ? 'Activate' : 'Suspend'}
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

      {/* === PROJECTS TAB (SUPERUSER ONLY) === */}
      {isSuperuser && activeTab === 'projects' && (
          <div className="space-y-8">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="font-bold text-slate-800 mb-4">Create New Project</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                      <div className="col-span-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">Project Name</label>
                          <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
                             className="w-full mt-1 px-3 py-2 border rounded text-sm" placeholder="e.g. Autumn Commercial" />
                      </div>
                      <div className="col-span-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">Production Company</label>
                          <input type="text" value={projectCompany} onChange={e => setProjectCompany(e.target.value)}
                             className="w-full mt-1 px-3 py-2 border rounded text-sm" placeholder="e.g. Studio X s.r.o." />
                      </div>
                      <div className="col-span-1">
                           <label className="text-xs font-bold text-slate-500 uppercase">IČO (Company ID)</label>
                           <input type="text" value={projectIco} onChange={e => setProjectIco(e.target.value)}
                              className="w-full mt-1 px-3 py-2 border rounded text-sm" placeholder="12345678" />
                      </div>
                      <div className="col-span-1 md:col-span-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
                          <input type="text" value={projectDescription} onChange={e => setProjectDescription(e.target.value)}
                             className="w-full mt-1 px-3 py-2 border rounded text-sm" placeholder="Short description of the project" />
                      </div>
                      <div className="col-span-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">Currency</label>
                          <select value={projectCurrency} onChange={e => setProjectCurrency(e.target.value)}
                             className="w-full mt-1 px-3 py-2 border rounded text-sm bg-white">
                              <option value="CZK">CZK</option>
                              <option value="EUR">EUR</option>
                              <option value="USD">USD</option>
                          </select>
                      </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                      <button onClick={handleCreateProject} disabled={isCreatingProject} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded font-medium text-sm">
                          {isCreatingProject ? 'Creating...' : 'Create Project'}
                      </button>
                  </div>
              </div>

               {/* Hidden file input */}
               <input type="file" accept=".xml" ref={fileInputRef} onChange={handleBudgetFileChange} className="hidden" />

              <div className="grid grid-cols-1 gap-4">
                  {projects.map(proj => {
                      // Get assigned users for this project
                      const assignedUsers = getAssignedUsersForProject(proj.id);
                      
                      return (
                      <div key={proj.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                          <div className="flex justify-between items-start mb-4">
                              <div className="max-w-xl">
                                  <h4 className="font-bold text-slate-800 text-lg">{proj.name}</h4>
                                  {proj.company_name && <p className="text-sm font-medium text-slate-600">{proj.company_name} {proj.ico && `(IČO: ${proj.ico})`}</p>}
                                  {proj.description && <p className="text-sm text-slate-500 mt-1">{proj.description}</p>}
                                  <p className="text-xs text-slate-400 mt-2">{proj.currency} • Created {new Date(proj.created_at).toLocaleDateString()}</p>
                                  
                                  {/* Team List on Card */}
                                  <div className="mt-4">
                                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Assigned Team</label>
                                      {assignedUsers.length > 0 ? (
                                          <div className="flex flex-col gap-1.5 mt-2">
                                              {assignedUsers.map(u => {
                                                  // Find specific role for THIS project
                                                  const role = allOwnerAssignments.find(a => a.project_id === proj.id && a.user_id === u.id)?.role;
                                                  return (
                                                      <div key={u.id} className="flex items-center text-sm text-slate-700">
                                                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mr-2"></div>
                                                          <span className="font-medium mr-1.5">{u.full_name?.split(' ')[0] || 'User'}</span>
                                                          <span className="text-slate-400 text-xs">
                                                              — {role ? formatRoleName(role) : 'Member'}
                                                          </span>
                                                      </div>
                                                  );
                                              })}
                                          </div>
                                      ) : (
                                          <span className="text-xs text-slate-400 italic">No members assigned</span>
                                      )}
                                  </div>
                              </div>
                              <div className="flex flex-col space-y-2">
                                <button onClick={() => handleBudgetClick(proj.id)} disabled={uploadingBudget}
                                    className="text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded transition-colors whitespace-nowrap">
                                    {uploadingBudget && selectedProjectId === proj.id ? 'Uploading...' : 'Upload Budget XML'}
                                </button>
                                <button onClick={() => openTeamManager(proj)}
                                    className="text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded transition-colors whitespace-nowrap">
                                    Manage Team
                                </button>
                                <button onClick={() => handleDeleteProject(proj.id)} disabled={deletingProjectId === proj.id}
                                    className="text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2 rounded transition-colors whitespace-nowrap flex items-center justify-center gap-1">
                                    {deletingProjectId === proj.id ? 'Deleting...' : (
                                        <>
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                            Delete
                                        </>
                                    )}
                                </button>
                              </div>
                          </div>
                          <div className="text-xs text-slate-400 border-t border-slate-100 pt-3 flex items-center gap-4">
                              <span>{proj.budgets?.length || 0} budget versions</span>
                          </div>
                      </div>
                  )})}
                  {projects.length === 0 && (
                      <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                          No projects created yet.
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* === TEAM TAB (SUPERUSER ONLY) === */}
      {isSuperuser && activeTab === 'team' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
               <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-fit">
                   <h3 className="font-bold text-slate-800 mb-4">Invite New Team Member</h3>
                   <form onSubmit={handleSendInvite} className="flex flex-col gap-4">
                       <div>
                           <label className="text-xs font-semibold text-slate-500 uppercase">Email Address</label>
                           <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                              className="w-full mt-1 px-3 py-2 border rounded text-sm" placeholder="colleague@example.com" />
                       </div>
                       <div>
                           <label className="text-xs font-semibold text-slate-500 uppercase">Assign to Project (Optional)</label>
                           <select value={inviteProjectId} onChange={e => setInviteProjectId(e.target.value)}
                              className="w-full mt-1 px-3 py-2 border rounded text-sm bg-slate-50">
                               <option value="">-- No Project Assignment --</option>
                               {projects.map(p => (
                                   <option key={p.id} value={p.id}>{p.name}</option>
                               ))}
                           </select>
                       </div>
                       <div>
                           <label className="text-xs font-semibold text-slate-500 uppercase">Role</label>
                           <select value={inviteProjectRole} onChange={e => setInviteProjectRole(e.target.value as ProjectRole)}
                              className="w-full mt-1 px-3 py-2 border rounded text-sm bg-slate-50">
                               <option value="lineproducer">Line Producer</option>
                               <option value="producer">Producer</option>
                               <option value="accountant">Accountant</option>
                           </select>
                       </div>
                       <button type="submit" disabled={isInviting} className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded font-medium text-sm disabled:opacity-50">
                           {isInviting ? 'Sending...' : 'Send Team Invitation'}
                       </button>
                   </form>
               </div>

               <div className="lg:col-span-2 space-y-8">
                   {/* Pending Invites */}
                   <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                       <div className="p-4 border-b border-slate-100 bg-slate-50">
                           <h4 className="font-bold text-slate-700 text-sm">Pending Team Invitations</h4>
                       </div>
                       <table className="w-full text-sm text-left">
                           <tbody className="divide-y divide-slate-100">
                               {invitations.map(inv => (
                                   <tr key={inv.id} className="hover:bg-slate-50">
                                       <td className="px-6 py-3">
                                           <div className="font-medium text-slate-900">{inv.email}</div>
                                           <div className="text-xs text-slate-500">
                                               {inv.target_role || 'No Role'} • {projects.find(p => p.id === inv.target_project_id)?.name || 'Unassigned'}
                                           </div>
                                       </td>
                                       <td className="px-6 py-3 text-right">
                                           <button onClick={() => handleRevokeInvitation(inv.id)} className="text-xs text-red-500 hover:underline">Revoke</button>
                                       </td>
                                   </tr>
                               ))}
                               {invitations.length === 0 && (
                                   <tr><td colSpan={2} className="px-6 py-4 text-center text-slate-400 text-xs italic">No pending invitations.</td></tr>
                               )}
                           </tbody>
                       </table>
                   </div>

                   {/* Active Team Members */}
                   <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                       <div className="p-4 border-b border-slate-100 bg-slate-50">
                           <h4 className="font-bold text-slate-700 text-sm">My Active Team Members</h4>
                           <p className="text-xs text-slate-400 mt-1">Users invited by you.</p>
                       </div>
                       <table className="w-full text-sm text-left">
                           <tbody className="divide-y divide-slate-100">
                               {profiles
                                 .filter(p => p.invited_by === profile.id)
                                 .map(p => (
                                   <tr key={p.id} className="hover:bg-slate-50">
                                       <td className="px-6 py-3">
                                           <div className="font-medium text-slate-900">{p.full_name || 'Unnamed'}</div>
                                           <div className="text-xs text-slate-500">{p.email}</div>
                                       </td>
                                       <td className="px-6 py-3">
                                            <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-semibold uppercase">
                                                {getUserRolesText(p.id)}
                                            </span>
                                       </td>
                                       <td className="px-6 py-3 text-right flex items-center justify-end gap-3">
                                           <button onClick={() => handleToggleDisabled(p)} 
                                               className={`text-xs font-medium hover:underline ${p.is_disabled ? 'text-emerald-600' : 'text-amber-500'}`}>
                                               {p.is_disabled ? 'Activate' : 'Suspend'}
                                           </button>
                                           <button 
                                              onClick={() => handleDeleteUser(p)}
                                              className="text-slate-400 hover:text-red-500 transition-colors"
                                              title="Delete User"
                                           >
                                               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                               </svg>
                                           </button>
                                       </td>
                                   </tr>
                               ))}
                               {profiles.filter(p => p.invited_by === profile.id).length === 0 && (
                                   <tr><td colSpan={3} className="px-6 py-4 text-center text-slate-400 text-xs italic">No active team members found.</td></tr>
                               )}
                           </tbody>
                       </table>
                   </div>
               </div>
          </div>
      )}

      {/* === MANAGE TEAM MODAL === */}
      {activeProjectForTeam && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-slate-800">Manage Team: {activeProjectForTeam.name}</h3>
                      <button onClick={closeTeamManager} className="text-slate-400 hover:text-slate-600">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                      </button>
                  </div>
                  
                  <div className="p-6 bg-slate-50 border-b border-slate-200">
                      <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Add Existing Team Member</label>
                      <div className="flex gap-2">
                          <select 
                            value={assignUserId} 
                            onChange={e => setAssignUserId(e.target.value)}
                            className="flex-1 px-3 py-2 border rounded text-sm bg-white"
                          >
                              <option value="">Select user...</option>
                              {profiles
                                .filter(p => p.invited_by === profile.id) // Only allow assigning my own team
                                .filter(p => !projectAssignments.find(a => a.user_id === p.id)) // Exclude already assigned
                                .map(p => (
                                  <option key={p.id} value={p.id}>
                                      {p.full_name || p.email} ({p.email})
                                  </option>
                              ))}
                          </select>
                          <select 
                            value={assignUserRole} 
                            onChange={e => setAssignUserRole(e.target.value as ProjectRole)}
                            className="w-40 px-3 py-2 border rounded text-sm bg-white"
                          >
                               <option value="lineproducer">Line Producer</option>
                               <option value="producer">Producer</option>
                               <option value="accountant">Accountant</option>
                          </select>
                          <button 
                            onClick={handleAddAssignment}
                            disabled={!assignUserId}
                            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                          >
                              Add
                          </button>
                      </div>
                  </div>

                  <div className="p-6">
                       <h4 className="font-bold text-slate-700 text-sm mb-4">Assigned Members</h4>
                       {isLoadingAssignments ? (
                           <div className="text-center py-4"><div className="animate-spin inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full"></div></div>
                       ) : (
                           <div className="space-y-2">
                               {projectAssignments.map(assign => (
                                   <div key={assign.id} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
                                       <div>
                                           <div className="font-medium text-slate-900">
                                               {assign.profile?.full_name || 'Unknown User'}
                                           </div>
                                           <div className="text-xs text-slate-500">
                                               {assign.profile?.email}
                                           </div>
                                       </div>
                                       <div className="flex items-center gap-4">
                                           <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-semibold uppercase">
                                               {formatRoleName(assign.role)}
                                           </span>
                                           <button 
                                              onClick={() => handleRemoveAssignment(assign.id)}
                                              className="text-red-400 hover:text-red-600"
                                              title="Remove"
                                           >
                                               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                               </svg>
                                           </button>
                                       </div>
                                   </div>
                               ))}
                               {projectAssignments.length === 0 && (
                                   <div className="text-center py-8 text-slate-400 text-sm italic">No members assigned to this project yet.</div>
                               )}
                           </div>
                       )}
                  </div>
                  
                  <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end">
                      <button onClick={closeTeamManager} className="text-slate-600 hover:text-slate-900 font-medium text-sm">
                          Close
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* === PASSWORD RESET MODAL === */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-2">Reset Password</h3>
                <p className="text-sm text-slate-500 mb-4">
                    Enter a new password for <strong>{resetTarget.email}</strong>.
                </p>
                <form onSubmit={handlePasswordReset}>
                    <input 
                        type="text" 
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="New Password"
                        className="w-full px-3 py-2 border rounded text-sm mb-4"
                        required
                        minLength={6}
                    />
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => { setResetTarget(null); setNewPassword(''); }} className="px-4 py-2 text-slate-600 text-sm hover:bg-slate-100 rounded">
                            Cancel
                        </button>
                        <button type="submit" disabled={isResetting} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">
                            {isResetting ? 'Saving...' : 'Set Password'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;
