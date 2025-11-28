
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
      } catch(err: any) {
          alert(err.message);
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
-- === V33 OPTIMIZATION: INDEXES FOR PERFORMANCE ===

-- 1. Create Composite Index to speed up invoice listing (The Critical Fix)
-- This makes filtering by project_id AND sorting by internal_id practically instant
DROP INDEX IF EXISTS idx_invoices_project_internal;
CREATE INDEX idx_invoices_project_internal ON invoices (project_id, internal_id DESC);

-- 2. Foreign Key Indexes (Postgres doesn't create these automatically)
-- Speeds up fetching allocations and budget lines
DROP INDEX IF EXISTS idx_budget_lines_budget_id;
CREATE INDEX idx_budget_lines_budget_id ON budget_lines (budget_id);

DROP INDEX IF EXISTS idx_invoice_allocations_invoice_id;
CREATE INDEX idx_invoice_allocations_invoice_id ON invoice_allocations (invoice_id);

DROP INDEX IF EXISTS idx_invoice_allocations_budget_line_id;
CREATE INDEX idx_invoice_allocations_budget_line_id ON invoice_allocations (budget_line_id);

DROP INDEX IF EXISTS idx_project_assignments_user_project;
CREATE INDEX idx_project_assignments_user_project ON project_assignments (user_id, project_id);

-- 3. Optimize ICO search index
DROP INDEX IF EXISTS idx_invoices_ico_project;
CREATE INDEX idx_invoices_ico_project ON invoices (project_id, ico);
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
                                    <button onClick={() => setResetTarget(p)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium bg-indigo-50 px-2 py-1 rounded">Password</button>
                                    {p.id !== profile.id && <button onClick={() => handleDeleteUser(p)} className="text-red-500">Del</button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* Projects and Team Tab content */}
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
                  <div className="mt-6 pt-4 border-t border-slate-100">
                        <button onClick={() => setShowSql(!showSql)} className="text-xs text-slate-400 underline">{showSql ? 'Hide SQL' : 'Show Database Migration SQL'}</button>
                        {showSql && <pre className="mt-2 bg-slate-900 text-slate-300 p-3 rounded text-xs overflow-x-auto">{getMigrationSql()}</pre>}
                  </div>
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
                                                      <span className="text-slate-400 text-xs ml-2">{u.email}</span>
                                                      {role && <span className="ml-2 text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100">{formatRoleName(role)}</span>}
                                                  </div>
                                              })}
                                          </div>
                                      ) : <div className="text-xs text-slate-400 italic">No members assigned</div>}
                                  </div>
                                  
                                  {/* BUDGET LIST */}
                                  <div className="mt-4">
                                      <label className="text-xs font-bold text-slate-400 uppercase">Budgets</label>
                                      {proj.budgets && proj.budgets.length > 0 ? (
                                          <div className="flex flex-col gap-2 mt-1">
                                              {proj.budgets.map(b => (
                                                  <div key={b.id} className="flex items-center gap-2 text-sm">
                                                      <div className={`w-2 h-2 rounded-full ${b.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                                      <span className={b.is_active ? 'font-medium text-emerald-800' : 'text-slate-500'}>{b.version_name}</span>
                                                      {!b.is_active && (
                                                          <button onClick={() => handleToggleActiveBudget(proj.id, b.id)} className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                                                              Make Active
                                                          </button>
                                                      )}
                                                  </div>
                                              ))}
                                          </div>
                                      ) : <div className="text-xs text-slate-400 italic">No budgets uploaded</div>}
                                  </div>
                              </div>
                              <div className="flex flex-col gap-2">
                                <button onClick={() => handleBudgetClick(proj.id)} className="text-sm text-indigo-600 bg-indigo-50 px-4 py-2 rounded">
                                    {uploadingBudget && selectedProjectId === proj.id ? 'Uploading...' : 'Upload Budget'}
                                </button>
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
                   <div className="mt-6 pt-4 border-t border-slate-100">
                        <button onClick={() => setShowSql(!showSql)} className="text-xs text-slate-400 underline">{showSql ? 'Hide SQL' : 'Show Database Migration SQL'}</button>
                        {showSql && <pre className="mt-2 bg-slate-900 text-slate-300 p-3 rounded text-xs overflow-x-auto">{getMigrationSql()}</pre>}
                   </div>
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
                           <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold border-b border-slate-100">
                               <tr>
                                   <th className="px-6 py-2">Member</th>
                                   <th className="px-6 py-2">Assignments</th>
                                   <th className="px-6 py-2 text-right">Action</th>
                               </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100">
                               {profiles.filter(p => p.invited_by === profile.id).map(p => {
                                   const assignments = allOwnerAssignments.filter(a => a.user_id === p.id);
                                   return (
                                   <tr key={p.id} className="hover:bg-slate-50">
                                       <td className="px-6 py-3">
                                           <div className="font-medium text-slate-900">{p.full_name || 'Unknown'}</div>
                                           <div className="text-xs text-slate-500">{p.email}</div>
                                       </td>
                                       <td className="px-6 py-3">
                                           {assignments.length > 0 ? (
                                               <div className="space-y-1">
                                                   {assignments.map(a => (
                                                       <div key={a.id} className="flex items-center gap-2 text-xs">
                                                           <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold uppercase text-[10px]">
                                                               {formatRoleName(a.role)}
                                                           </span>
                                                           <span className="text-slate-600 truncate max-w-[150px]" title={a.project?.name}>
                                                               {a.project?.name}
                                                           </span>
                                                       </div>
                                                   ))}
                                               </div>
                                           ) : (
                                               <span className="text-xs text-slate-400 italic">Unassigned</span>
                                           )}
                                       </td>
                                       <td className="px-6 py-3 text-right flex items-center justify-end gap-2">
                                           <button onClick={() => setResetTarget(p)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium px-2 py-1 bg-indigo-50 rounded">Password</button>
                                           <button onClick={() => handleDeleteUser(p)} className="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>
                                       </td>
                                   </tr>
                               )})}
                               {profiles.filter(p => p.invited_by === profile.id).length === 0 && (
                                   <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400 italic">No active team members.</td></tr>
                               )}
                           </tbody>
                       </table>
                   </div>
               </div>
          </div>
      )}
      
      {/* Modals */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-xl w-full max-w-sm">
                <h3 className="font-bold mb-4">Reset Password</h3>
                <p className="text-xs text-slate-500 mb-4">For user: {resetTarget.email}</p>
                <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full border p-2 rounded mb-4" placeholder="New Password" />
                <button onClick={handlePasswordReset} className="bg-indigo-600 text-white px-4 py-2 rounded mr-2" disabled={isResetting}>{isResetting ? 'Saving...' : 'Save'}</button>
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
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {projectAssignments.map(a => (
                        <div key={a.id} className="flex justify-between items-center p-3 border-b hover:bg-slate-50 transition-colors">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-slate-800">{a.profile?.full_name || 'Unknown User'}</span>
                                    <span className="text-[10px] text-slate-500">{a.profile?.email}</span>
                                    <span className="text-[10px] uppercase font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">
                                        {formatRoleName(a.role)}
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => handleRemoveAssignment(a.id)} className="text-red-500 hover:text-red-700 text-sm font-medium px-2 py-1">
                                Remove
                            </button>
                        </div>
                    ))}
                    {projectAssignments.length === 0 && <p className="text-center text-slate-400 italic py-4">No members assigned to this project yet.</p>}
                  </div>
                  <button onClick={closeTeamManager} className="mt-4 text-slate-500 w-full py-2 bg-slate-100 rounded hover:bg-slate-200">Close</button>
              </div>
          </div>
      )}
    </div>
  );
};

export default AdminDashboard;
