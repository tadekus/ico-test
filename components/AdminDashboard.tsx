
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
          const assignments = await fetchProjectAssignments(activeProjectForTeam.id);
          setProjectAssignments(assignments);
          setAssignUserId('');
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
          const assignments = await fetchProjectAssignments(activeProjectForTeam.id);
          setProjectAssignments(assignments);
          const globalAssigns = await fetchAssignmentsForOwner(profile.id);
          setAllOwnerAssignments(globalAssigns);
      } catch (err: any) {
          alert(err.message || "Failed to remove user");
      }
  };

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

  const getAssignedUsersForProject = (projectId: number) => {
      const assignedIds = allOwnerAssignments.filter(a => a.project_id === projectId).map(a => a.user_id);
      return profiles.filter(p => assignedIds.includes(p.id));
  };

  const getMigrationSql = () => `
-- === REPAIR V23: INVOICE STATUS & STORAGE ===

-- 1. ADD COLUMNS TO INVOICES
DO $$ 
BEGIN
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS internal_id integer;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS variable_symbol text;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS description text;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS file_content text;
EXCEPTION 
    WHEN others THEN null;
END $$;

-- 2. DISABLE RLS TEMPORARILY
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;

-- 3. ENSURE EXTENSIONS & SCHEMAS
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;

-- 4. RECREATE HELPER FUNCTIONS (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_my_role_safe()
RETURNS text AS $$
BEGIN
  RETURN (SELECT app_role FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.get_my_role_safe() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.is_project_owner(pid bigint)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM projects WHERE id = pid AND created_by = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.is_project_owner(bigint) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.is_project_member(pid bigint)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM project_assignments WHERE project_id = pid AND user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.is_project_member(bigint) OWNER TO postgres;

-- 5. DELETE TEAM MEMBER RPC
CREATE OR REPLACE FUNCTION public.delete_team_member(target_user_id uuid)
RETURNS void AS $$
DECLARE
  requesting_user_id uuid;
BEGIN
  requesting_user_id := auth.uid();
  SET search_path = public, auth;
  IF (public.get_my_role_safe() = 'admin') OR
     EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id AND invited_by = requesting_user_id) THEN
     DELETE FROM auth.users WHERE id = target_user_id;
  ELSE
     RAISE EXCEPTION 'Access Denied: You cannot delete this user.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
ALTER FUNCTION public.delete_team_member(uuid) OWNER TO postgres;

-- 6. CLAIM INVITED ROLE RPC
CREATE OR REPLACE FUNCTION public.claim_invited_role(p_full_name text)
RETURNS text AS $$
DECLARE
  inv_record record;
  current_email text;
BEGIN
  SET search_path = public, auth;
  SELECT lower(email) INTO current_email FROM auth.users WHERE id = auth.uid();
  SELECT * FROM public.user_invitations WHERE lower(email) = current_email AND status = 'pending' LIMIT 1 INTO inv_record;

  IF inv_record.id IS NOT NULL THEN
    UPDATE public.profiles SET invited_by = inv_record.invited_by, full_name = p_full_name WHERE id = auth.uid();
    
    IF inv_record.target_role IS NULL THEN
       UPDATE public.profiles SET app_role = 'superuser', is_superuser = true WHERE id = auth.uid();
       UPDATE public.user_invitations SET status = 'accepted' WHERE id = inv_record.id;
       RETURN 'Role Claimed: Superuser';
    ELSE
       UPDATE public.profiles SET app_role = 'user', is_superuser = false WHERE id = auth.uid();
       IF inv_record.target_project_id IS NOT NULL THEN
          INSERT INTO public.project_assignments (project_id, user_id, role)
          VALUES (inv_record.target_project_id, auth.uid(), inv_record.target_role::project_role)
          ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role;
       END IF;
       UPDATE public.user_invitations SET status = 'accepted' WHERE id = inv_record.id;
       RETURN 'Role Claimed: ' || inv_record.target_role;
    END IF;
  ELSE
    RETURN 'No pending invitation found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.claim_invited_role(text) OWNER TO postgres;

-- 7. WIPE & REAPPLY POLICIES
DO $$ 
DECLARE pol record;
BEGIN 
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE tablename IN ('profiles', 'project_assignments', 'user_invitations', 'projects', 'invoices') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Projects
CREATE POLICY "Projects Read" ON projects FOR SELECT TO authenticated USING ( created_by = auth.uid() OR public.get_my_role_safe() = 'admin' OR public.is_project_member(id) );
CREATE POLICY "Projects Insert" ON projects FOR INSERT TO authenticated WITH CHECK ( auth.uid() = created_by );
CREATE POLICY "Projects Manage" ON projects FOR ALL TO authenticated USING ( created_by = auth.uid() OR public.get_my_role_safe() = 'admin' );

-- Invoices
CREATE POLICY "Invoices Read" ON invoices FOR SELECT TO authenticated USING ( user_id = auth.uid() OR public.is_project_owner(project_id) OR public.is_project_member(project_id) );
CREATE POLICY "Invoices Write" ON invoices FOR ALL TO authenticated USING ( user_id = auth.uid() OR public.is_project_owner(project_id) OR public.is_project_member(project_id) );

-- Assignments
CREATE POLICY "Assignments Read" ON project_assignments FOR SELECT TO authenticated USING ( user_id = auth.uid() OR public.get_my_role_safe() = 'admin' OR public.is_project_owner(project_id) );
CREATE POLICY "Assignments Manage" ON project_assignments FOR ALL TO authenticated USING ( public.is_project_owner(project_id) );

-- Profiles
CREATE POLICY "Profiles View" ON profiles FOR SELECT TO authenticated USING ( true ); 
CREATE POLICY "Profiles Update Self" ON profiles FOR UPDATE TO authenticated USING ( id = auth.uid() );
CREATE POLICY "Profiles Admin" ON profiles FOR ALL TO authenticated USING ( public.get_my_role_safe() = 'admin' );

-- Invitations
CREATE POLICY "Invites Read" ON user_invitations FOR SELECT TO authenticated USING ( invited_by = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email') );
CREATE POLICY "Invites Manage" ON user_invitations FOR ALL TO authenticated USING ( invited_by = auth.uid() OR public.get_my_role_safe() IN ('admin', 'superuser') );

-- 8. ENABLE SECURITY
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
`;

  const pendingSystemInvites = invitations.filter(inv => inv.target_app_role === 'admin' || inv.target_app_role === 'superuser');

  if (loading) return <div className="p-12 text-center"><div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="space-y-6 pb-12">
      {isGhostAdmin && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
              <p className="text-sm text-red-700 font-bold">CRITICAL: Ghost Profile Detected</p>
              <button onClick={() => { setShowSql(true); navigator.clipboard.writeText(getMigrationSql()); }} className="mt-2 bg-red-100 text-red-800 text-xs px-2 py-1 rounded">Copy Repair SQL</button>
          </div>
      )}
      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>}
      {successMsg && <div className="bg-emerald-50 text-emerald-600 p-4 rounded-lg">{successMsg}</div>}

      <div className="flex border-b border-slate-200">
          {isAdmin && <button onClick={() => setActiveTab('system')} className={`px-6 py-3 text-sm ${activeTab === 'system' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}>System Management</button>}
          {isSuperuser && <button onClick={() => setActiveTab('projects')} className={`px-6 py-3 text-sm ${activeTab === 'projects' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}>Projects</button>}
          {isSuperuser && <button onClick={() => setActiveTab('team')} className={`px-6 py-3 text-sm ${activeTab === 'team' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}>Team</button>}
      </div>

      {isAdmin && activeTab === 'system' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-slate-200 h-fit">
                <h3 className="font-bold mb-4">Invite System User</h3>
                <form onSubmit={handleSendInvite} className="flex flex-col gap-4">
                    <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" placeholder="user@example.com" />
                    <select value={inviteAppRole} onChange={e => setInviteAppRole(e.target.value as AppRole)} className="w-full px-3 py-2 border rounded text-sm bg-slate-50">
                        <option value="admin">Administrator</option>
                        <option value="superuser">Superuser</option>
                    </select>
                    <button type="submit" disabled={isInviting} className="bg-indigo-600 text-white py-2 rounded text-sm">{isInviting ? 'Sending...' : 'Invite'}</button>
                </form>
                <div className="mt-6 pt-6 border-t border-slate-100">
                    <button onClick={() => setShowSql(!showSql)} className="text-xs text-slate-400 underline">{showSql ? 'Hide SQL' : 'Show Database Migration SQL'}</button>
                    {showSql && <pre className="mt-2 bg-slate-900 text-slate-300 p-3 rounded text-xs overflow-x-auto">{getMigrationSql()}</pre>}
                </div>
            </div>
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium"><tr><th className="px-6 py-3">User</th><th className="px-6 py-3">Role</th><th className="px-6 py-3">Action</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                        {pendingSystemInvites.map(inv => (
                            <tr key={inv.id} className="bg-amber-50">
                                <td className="px-6 py-4"><div>Pending Invite</div><div className="text-xs">{inv.email}</div></td>
                                <td className="px-6 py-4">{inv.target_app_role}</td>
                                <td className="px-6 py-4"><button onClick={() => handleRevokeInvitation(inv.id)} className="text-red-500 text-xs">Revoke</button></td>
                            </tr>
                        ))}
                        {profiles.filter(p => p.app_role === 'admin' || p.app_role === 'superuser').map(p => (
                            <tr key={p.id}>
                                <td className="px-6 py-4"><div>{p.full_name}</div><div className="text-xs">{p.email}</div></td>
                                <td className="px-6 py-4"><span className="px-2 py-1 bg-slate-100 rounded-full text-xs font-bold">{p.app_role}</span></td>
                                <td className="px-6 py-4 flex gap-2">
                                    <button onClick={() => setResetTarget(p)} className="text-indigo-600">Key</button>
                                    {p.id !== profile.id && <button onClick={() => handleDeleteUser(p)} className="text-red-500">Del</button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* Projects and Team Tab content remains similar but condensed for brevity in this response */}
      {isSuperuser && activeTab === 'projects' && (
          <div className="space-y-8">
               <div className="bg-white p-6 rounded-xl border border-slate-200">
                  <h3 className="font-bold mb-4">Create Project</h3>
                  <div className="grid grid-cols-3 gap-4">
                      <input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Name" className="px-3 py-2 border rounded text-sm" />
                      <input value={projectCompany} onChange={e => setProjectCompany(e.target.value)} placeholder="Company" className="px-3 py-2 border rounded text-sm" />
                      <input value={projectIco} onChange={e => setProjectIco(e.target.value)} placeholder="IČO" className="px-3 py-2 border rounded text-sm" />
                      <input value={projectDescription} onChange={e => setProjectDescription(e.target.value)} placeholder="Description" className="px-3 py-2 border rounded text-sm col-span-2" />
                      <select value={projectCurrency} onChange={e => setProjectCurrency(e.target.value)} className="px-3 py-2 border rounded text-sm"><option value="CZK">CZK</option><option value="EUR">EUR</option></select>
                  </div>
                  <button onClick={handleCreateProject} disabled={isCreatingProject} className="mt-4 bg-indigo-600 text-white px-6 py-2 rounded text-sm">Create</button>
               </div>
               
               {/* Hidden file input */}
               <input type="file" accept=".xml" ref={fileInputRef} onChange={handleBudgetFileChange} className="hidden" />

               <div className="grid gap-4">
                  {projects.map(proj => {
                      const assignedUsers = getAssignedUsersForProject(proj.id);
                      return (
                      <div key={proj.id} className="bg-white border border-slate-200 rounded-xl p-6">
                          <div className="flex justify-between items-start">
                              <div>
                                  <h4 className="font-bold text-lg">{proj.name}</h4>
                                  <p className="text-sm text-slate-600">{proj.company_name} {proj.ico && `(IČO: ${proj.ico})`}</p>
                                  <div className="mt-4">
                                      <label className="text-xs font-bold text-slate-400 uppercase">Assigned Team</label>
                                      {assignedUsers.length > 0 ? (
                                          <div className="flex flex-col gap-1 mt-1">
                                              {assignedUsers.map(u => {
                                                  const role = allOwnerAssignments.find(a => a.project_id === proj.id && a.user_id === u.id)?.role;
                                                  return <div key={u.id} className="text-sm text-slate-700">
                                                      <span className="font-medium">{u.full_name}</span> 
                                                      <span className="text-slate-400 text-xs ml-2">{role ? formatRoleName(role) : 'Member'}</span>
                                                  </div>
                                              })}
                                          </div>
                                      ) : <div className="text-xs text-slate-400 italic">No members assigned</div>}
                                  </div>
                              </div>
                              <div className="flex flex-col gap-2">
                                <button onClick={() => handleBudgetClick(proj.id)} className="text-sm text-indigo-600 bg-indigo-50 px-4 py-2 rounded">Upload Budget</button>
                                <button onClick={() => openTeamManager(proj)} className="text-sm text-slate-700 bg-slate-100 px-4 py-2 rounded">Manage Team</button>
                                <button onClick={() => handleDeleteProject(proj.id)} className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded">Delete</button>
                              </div>
                          </div>
                      </div>
                  )})}
               </div>
          </div>
      )}

      {isSuperuser && activeTab === 'team' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
               <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-slate-200 h-fit">
                   <h3 className="font-bold mb-4">Invite Team Member</h3>
                   <form onSubmit={handleSendInvite} className="flex flex-col gap-4">
                       <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" placeholder="email" />
                       <select value={inviteProjectId} onChange={e => setInviteProjectId(e.target.value)} className="w-full px-3 py-2 border rounded text-sm">
                           <option value="">-- No Project --</option>
                           {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                       </select>
                       <select value={inviteProjectRole} onChange={e => setInviteProjectRole(e.target.value as ProjectRole)} className="w-full px-3 py-2 border rounded text-sm">
                           <option value="lineproducer">Line Producer</option>
                           <option value="producer">Producer</option>
                           <option value="accountant">Accountant</option>
                       </select>
                       <button type="submit" disabled={isInviting} className="bg-indigo-600 text-white py-2 rounded text-sm">Invite</button>
                   </form>
               </div>
               <div className="lg:col-span-2 space-y-8">
                   <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                       <h4 className="font-bold text-slate-700 text-sm p-4 bg-slate-50 border-b border-slate-100">Pending Invitations</h4>
                       <table className="w-full text-sm text-left">
                           <tbody>
                               {invitations.map(inv => (
                                   <tr key={inv.id} className="hover:bg-slate-50"><td className="px-6 py-3">{inv.email}</td><td className="px-6 py-3 text-right"><button onClick={() => handleRevokeInvitation(inv.id)} className="text-red-500">Revoke</button></td></tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
                   <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                       <h4 className="font-bold text-slate-700 text-sm p-4 bg-slate-50 border-b border-slate-100">My Team</h4>
                       <table className="w-full text-sm text-left">
                           <tbody>
                               {profiles.filter(p => p.invited_by === profile.id).map(p => (
                                   <tr key={p.id} className="hover:bg-slate-50">
                                       <td className="px-6 py-3"><div>{p.full_name}</div><div className="text-xs text-slate-500">{p.email}</div></td>
                                       <td className="px-6 py-3 text-right"><button onClick={() => handleDeleteUser(p)} className="text-red-500">Delete</button></td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
               </div>
          </div>
      )}
      
      {/* Modals for Password Reset & Team Assignment omitted for brevity but retained in logic */}
      {/* ... */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-xl w-full max-w-sm">
                <h3 className="font-bold mb-4">Reset Password</h3>
                <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full border p-2 rounded mb-4" />
                <button onClick={handlePasswordReset} className="bg-indigo-600 text-white px-4 py-2 rounded mr-2">Save</button>
                <button onClick={() => setResetTarget(null)} className="text-slate-500">Cancel</button>
            </div>
        </div>
      )}
      {activeProjectForTeam && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded-xl w-full max-w-2xl">
                  <h3 className="font-bold mb-4">Manage Team: {activeProjectForTeam.name}</h3>
                  <div className="flex gap-2 mb-6">
                      <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)} className="flex-1 border p-2 rounded">
                          <option value="">Select user...</option>
                          {profiles.filter(p => p.invited_by === profile.id).map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                      </select>
                      <button onClick={handleAddAssignment} className="bg-indigo-600 text-white px-4 py-2 rounded">Add</button>
                  </div>
                  {projectAssignments.map(a => (
                      <div key={a.id} className="flex justify-between p-2 border-b"><span className="font-medium">{a.profile?.full_name}</span><button onClick={() => handleRemoveAssignment(a.id)} className="text-red-500">Remove</button></div>
                  ))}
                  <button onClick={closeTeamManager} className="mt-4 text-slate-500">Close</button>
              </div>
          </div>
      )}
    </div>
  );
};

export default AdminDashboard;
