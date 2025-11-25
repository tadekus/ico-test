
import React, { useState, useEffect, useRef } from 'react';
import { 
  fetchAllProfiles, 
  toggleUserDisabled,
  sendSystemInvitation,
  fetchPendingInvitations,
  deleteInvitation,
  createProject,
  fetchProjects,
  uploadBudget
} from '../services/supabaseService';
import { Profile, UserInvitation, Project, ProjectRole, AppRole } from '../types';

interface AdminDashboardProps {
  profile: Profile;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ profile }) => {
  // Data State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

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
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Budget
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [uploadingBudget, setUploadingBudget] = useState(false);

  const isAdmin = profile.app_role === 'admin';
  const isGhostAdmin = profile.full_name?.includes('(Ghost)');

  useEffect(() => {
    // Set default tab based on role
    if (isAdmin) setActiveTab('system');
    else setActiveTab('projects');
    
    // Auto-show SQL if we are in ghost mode
    if (isGhostAdmin) setShowSql(true);

    loadData();
  }, [isAdmin, isGhostAdmin]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // If we are ghost admin, profile fetch will likely fail due to RLS, so we skip critical checks
      const [projs, invites, profs] = await Promise.all([
         fetchProjects().catch(e => []),
         fetchPendingInvitations().catch(e => []),
         fetchAllProfiles().catch(e => {
             console.error("Profile fetch error (Likely RLS or Missing Record):", e);
             return [];
         })
      ]);
      
      setProjects(projs);
      setInvitations(invites);
      setProfiles(profs);

    } catch (err: any) {
      console.error(err);
      setError("Failed to load some dashboard data.");
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
      if (activeTab === 'system') {
         // Admin inviting Admin/Superuser
         await sendSystemInvitation(inviteEmail, inviteAppRole, null, null);
      } else {
         // Superuser inviting Team Member
         if (!inviteProjectId) throw new Error("Please select a project.");
         await sendSystemInvitation(inviteEmail, null, inviteProjectRole, parseInt(inviteProjectId));
      }

      setSuccessMsg(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      const updatedInvites = await fetchPendingInvitations();
      setInvitations(updatedInvites);
    } catch (err: any) {
      setError(err.message || "Failed to send invitation");
      if (err.message?.includes("recursion")) {
         setShowSql(true);
         setError("Database Error: Infinite Recursion. Please run the Repair SQL below.");
      }
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
          await createProject(projectName, projectCurrency);
          const updatedProjs = await fetchProjects(); 
          setProjects(updatedProjs);
          setProjectName('');
          setSuccessMsg("Project created successfully");
      } catch (err: any) {
          setError(err.message);
      } finally {
          setIsCreatingProject(false);
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

  const handleRevokeInvitation = async (id: number) => {
    if (!window.confirm("Revoke this invitation?")) return;
    try {
      await deleteInvitation(id);
      setInvitations(invitations.filter(i => i.id !== id));
    } catch(err) { setError("Failed to revoke invitation"); }
  };

  const getMigrationSql = () => `
-- === 1. ADD COLUMNS (If Missing) ===
DO $$ 
BEGIN
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS app_role text DEFAULT 'user';
    ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS target_app_role text;
EXCEPTION WHEN others THEN null; END $$;

-- === 2. HELPER FUNCTION TO PREVENT RECURSION ===
-- This is critical. It allows policies to check roles without triggering infinite loops.
CREATE OR REPLACE FUNCTION public.get_my_app_role()
RETURNS text AS $$
BEGIN
  RETURN (SELECT app_role FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- === 3. UPDATE RLS FOR VISIBILITY ===

-- PROFILES POLICY
DROP POLICY IF EXISTS "View profiles strict" ON profiles;
DROP POLICY IF EXISTS "View related profiles" ON profiles;
DROP POLICY IF EXISTS "Read profiles" ON profiles;

CREATE POLICY "View profiles strict" ON profiles FOR SELECT TO authenticated
USING (
   public.get_my_app_role() = 'admin' -- Admins see all (Via Helper)
   OR id = auth.uid()                 -- Self
   OR invited_by = auth.uid()         -- My Invitees
);

-- MASTER UPDATE POLICY
DROP POLICY IF EXISTS "Master updates profiles" ON profiles;
CREATE POLICY "Master updates profiles" ON profiles FOR UPDATE TO authenticated
USING ( public.get_my_app_role() = 'admin' );

-- === 4. UPDATE OTHER POLICIES ===

-- USER INVITATIONS
DROP POLICY IF EXISTS "Master manages all invites" ON user_invitations;
CREATE POLICY "Master manages all invites" ON user_invitations FOR ALL TO authenticated
USING ( public.get_my_app_role() = 'admin' );

-- PROJECTS
DROP POLICY IF EXISTS "Master manages all projects" ON projects;
CREATE POLICY "Master manages all projects" ON projects FOR ALL TO authenticated
USING ( public.get_my_app_role() = 'admin' );


-- === 5. FIX MASTER PROFILE ===
-- Ensures tadekus is an admin
INSERT INTO public.profiles (id, email, full_name, app_role, is_superuser)
SELECT id, email, 'Master Admin', 'admin', true
FROM auth.users
WHERE lower(email) = 'tadekus@gmail.com'
ON CONFLICT (id) DO UPDATE
SET app_role = 'admin', is_superuser = true;
`;

  if (loading) return <div className="p-12 text-center"><div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {isGhostAdmin && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4">
              <div className="flex">
                  <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                  </div>
                  <div className="ml-3">
                      <p className="text-sm text-red-700 font-bold">
                          CRITICAL: Admin Profile Missing or Broken
                      </p>
                      <p className="text-sm text-red-700 mt-1">
                          You are logged in as Master Admin, but your database permissions are causing errors (Infinite Recursion).
                          <br/>
                          <strong>You must run the Repair SQL below to fix the policies.</strong>
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

      {/* TABS */}
      <div className="flex border-b border-slate-200">
          {isAdmin && (
             <button onClick={() => setActiveTab('system')}
                className={`px-6 py-3 font-medium text-sm ${activeTab === 'system' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}>
                System Management
             </button>
          )}
          <button onClick={() => setActiveTab('projects')}
             className={`px-6 py-3 font-medium text-sm ${activeTab === 'projects' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}>
             Projects
          </button>
          <button onClick={() => setActiveTab('team')}
             className={`px-6 py-3 font-medium text-sm ${activeTab === 'team' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}>
             Team
          </button>
      </div>

      {/* === SYSTEM TAB (ADMIN ONLY) === */}
      {isAdmin && activeTab === 'system' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Invite Form */}
            <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-fit">
                <h3 className="font-bold text-slate-800 mb-4">Invite New User</h3>
                <form onSubmit={handleSendInvite} className="flex flex-col gap-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase">Email Address</label>
                        <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                           className="w-full mt-1 px-3 py-2 border rounded text-sm" placeholder="email@example.com" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase">System Role</label>
                        <select value={inviteAppRole} onChange={e => setInviteAppRole(e.target.value as AppRole)}
                           className="w-full mt-1 px-3 py-2 border rounded text-sm bg-slate-50">
                            <option value="admin">Administrator</option>
                            <option value="superuser">Superuser</option>
                        </select>
                        <p className="text-xs text-slate-400 mt-1">
                            {inviteAppRole === 'admin' ? 'Full system access.' : 'Can manage projects and invite team members.'}
                        </p>
                    </div>
                    <button type="submit" disabled={isInviting} className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded font-medium text-sm">
                        {isInviting ? 'Sending...' : 'Send Invitation'}
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

            {/* User List */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800">All Users</h3>
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
                            {profiles.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-900">{p.full_name || 'Pending Setup'}</div>
                                        <div className="text-slate-500 text-xs">{p.email}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {p.app_role === 'admin' && <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">Administrator</span>}
                                        {p.app_role === 'superuser' && <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">Superuser</span>}
                                        {(!p.app_role || p.app_role === 'user') && <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs">User</span>}
                                    </td>
                                    <td className="px-6 py-4">
                                        {p.is_disabled 
                                            ? <span className="text-red-500 font-medium">Suspended</span>
                                            : <span className="text-emerald-600 font-medium">Active</span>}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {p.id !== profile.id && (
                                            <button onClick={() => handleToggleDisabled(p)} 
                                                className={`text-xs font-medium hover:underline ${p.is_disabled ? 'text-emerald-600' : 'text-red-500'}`}>
                                                {p.is_disabled ? 'Activate' : 'Suspend'}
                                            </button>
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

      {/* === PROJECTS TAB === */}
      {activeTab === 'projects' && (
          <div className="space-y-8">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row gap-4 items-end">
                  <div className="flex-1 w-full">
                      <label className="text-xs font-bold text-slate-500 uppercase">New Project Name</label>
                      <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
                         className="w-full mt-1 px-3 py-2 border rounded text-sm" placeholder="e.g. Autumn Commercial" />
                  </div>
                  <div className="w-32">
                      <label className="text-xs font-bold text-slate-500 uppercase">Currency</label>
                      <select value={projectCurrency} onChange={e => setProjectCurrency(e.target.value)}
                         className="w-full mt-1 px-3 py-2 border rounded text-sm bg-white">
                          <option value="CZK">CZK</option>
                          <option value="EUR">EUR</option>
                          <option value="USD">USD</option>
                      </select>
                  </div>
                  <button onClick={handleCreateProject} disabled={isCreatingProject} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded font-medium text-sm h-[38px]">
                      Create
                  </button>
              </div>

               {/* Hidden file input */}
               <input type="file" accept=".xml" ref={fileInputRef} onChange={handleBudgetFileChange} className="hidden" />

              <div className="grid grid-cols-1 gap-4">
                  {projects.map(proj => (
                      <div key={proj.id} className="bg-white border border-slate-200 rounded-xl p-6 flex justify-between items-center shadow-sm">
                          <div>
                              <h4 className="font-bold text-slate-800 text-lg">{proj.name}</h4>
                              <p className="text-xs text-slate-500">{proj.currency} • Created {new Date(proj.created_at).toLocaleDateString()}</p>
                              <div className="mt-2 text-xs text-slate-400 bg-slate-50 inline-block px-2 py-1 rounded">
                                  {proj.budgets?.length || 0} budget versions
                              </div>
                          </div>
                          <button onClick={() => handleBudgetClick(proj.id)} disabled={uploadingBudget}
                             className="text-sm border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded font-medium text-slate-600 flex items-center">
                              {uploadingBudget && selectedProjectId === proj.id ? 'Uploading...' : 'Upload Budget XML'}
                          </button>
                      </div>
                  ))}
                  {projects.length === 0 && <p className="text-center text-slate-400 py-8">No projects found.</p>}
              </div>
          </div>
      )}

      {/* === TEAM TAB === */}
      {activeTab === 'team' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-fit">
                  <h3 className="font-bold text-slate-800 mb-4">Invite Team Member</h3>
                  <form onSubmit={handleSendInvite} className="flex flex-col gap-4">
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                          <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                             className="w-full mt-1 px-3 py-2 border rounded text-sm" placeholder="crew@example.com" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Role</label>
                            <select value={inviteProjectRole} onChange={e => setInviteProjectRole(e.target.value as ProjectRole)}
                               className="w-full mt-1 px-3 py-2 border rounded text-sm bg-white">
                                <option value="lineproducer">Line Producer</option>
                                <option value="producer">Producer</option>
                                <option value="accountant">Accountant</option>
                            </select>
                         </div>
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Project</label>
                            <select value={inviteProjectId} onChange={e => setInviteProjectId(e.target.value)}
                               className="w-full mt-1 px-3 py-2 border rounded text-sm bg-white" required>
                                <option value="">Select...</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                         </div>
                      </div>
                      <button type="submit" disabled={isInviting} className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded font-medium text-sm">
                          Invite to Project
                      </button>
                  </form>
              </div>

              <div className="lg:col-span-2 space-y-6">
                  {invitations.length > 0 && (
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                          <h3 className="text-xs font-bold text-slate-500 uppercase mb-4">Pending Team Invites</h3>
                          <div className="space-y-2">
                              {invitations.map(inv => (
                                  <div key={inv.id} className="flex justify-between items-center p-3 bg-slate-50 rounded">
                                      <div>
                                          <div className="text-sm font-medium text-slate-800">{inv.email}</div>
                                          <div className="text-xs text-slate-500">
                                            {inv.target_app_role ? `System: ${inv.target_app_role}` : `Project: ${inv.target_role}`}
                                          </div>
                                      </div>
                                      <button onClick={() => handleRevokeInvitation(inv.id)} className="text-xs text-red-500 hover:underline">Revoke</button>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}

                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                      <h3 className="text-xs font-bold text-slate-500 uppercase mb-4">My Team Members</h3>
                       {/* Show only regular users in this list to avoid clutter */}
                       <div className="space-y-2">
                           {profiles.filter(p => !p.app_role || p.app_role === 'user').map(p => (
                               <div key={p.id} className="flex justify-between items-center p-3 bg-slate-50 rounded">
                                   <div>
                                       <div className="text-sm font-medium text-slate-800">{p.full_name || p.email}</div>
                                       <div className="text-xs text-slate-500">{p.email}</div>
                                   </div>
                                   <button onClick={() => handleToggleDisabled(p)} className={`text-xs font-medium ${p.is_disabled ? 'text-red-500' : 'text-emerald-600'}`}>
                                       {p.is_disabled ? 'Suspended' : 'Active'}
                                   </button>
                               </div>
                           ))}
                           {profiles.filter(p => !p.app_role || p.app_role === 'user').length === 0 && (
                               <p className="text-slate-400 text-sm italic">No team members assigned.</p>
                           )}
                       </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default AdminDashboard;
