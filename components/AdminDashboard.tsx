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
// Explicitly define the return type as React.JSX.Element to prevent TypeScript from inferring 'void'.
export default function AdminDashboard({ profile }: React.PropsWithChildren<AdminDashboardProps>): React.JSX.Element {
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
  const [showSql, setShowSql] = useState(false); // Retained for potential display of other scripts or info

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
  const isGhostAdmin = profile.full_name?.includes('(Ghost)'); // Assuming this means a special admin who can see SQL

  useEffect(() => {
    // Set default tab based on role strictly
    if (isAdmin) {
        setActiveTab('system');
    } else {
        setActiveTab('projects');
    }
    // Only show SQL for a "ghost" admin. The SQL is now only in README and separate.
    if (isGhostAdmin) setShowSql(true); 
    loadData();
  }, [isAdmin, isSuperuser, isGhostAdmin]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projs, invites, profs] = await Promise.all([
         fetchProjects().catch(e => { console.error("Error fetching projects:", e); return []; }),
         fetchPendingInvitations().catch(e => { console.error("Error fetching invitations:", e); return []; }),
         fetchAllProfiles().catch(e => { console.error("Error fetching profiles:", e); return []; })
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
    if(!window.confirm("Are you sure you want to delete this project? This is irreversible.")) return;
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
    if (!window.confirm(`Are you sure you want to PERMANENTLY DELETE ${p.email}? This cannot be undone.`)) return;
    try {
        await deleteProfile(p.id);
        setProfiles(prev => prev.filter(item => item.id !== p.id));
        setSuccessMsg(`User ${p.email} deleted from system.`);
    } catch (err: any) {
        setError(err.message || "Failed to delete user");
    }
  };

  const handleRevokeInvitation = async (id: number) => {
    if (!window.confirm("Revoke this invitation? The user will not be able to join via this link.")) return;
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

  // The SQL script is now provided externally in README.md and executed in stages.
  // This function is retained as a placeholder or if other simpler SQL needs to be displayed.
  const getMigrationSqlInfo = () => `-- SQL migration scripts are now provided in THREE stages in README.md.
-- Stage 1: Core Schema Setup (Tables, Enums, Extensions) - RUN THIS FIRST
-- Stage 2: Administrator Profile Creation (Run AFTER admin user has logged in via the app)
-- Stage 3: Functions, Triggers, RLS Policies (Run AFTER Stage 1 and 2 are complete)

-- Please refer to README.md for the full, updated SQL scripts and detailed instructions.`;


  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full p-6">
      <input type="file" accept=".xml" ref={fileInputRef} onChange={handleBudgetFileChange} className="hidden" />

      {/* Left Column (Navigation & Forms) */}
      <div className="lg:w-1/4 bg-white rounded-xl shadow-lg border border-slate-200 p-6 flex flex-col h-full overflow-y-auto">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Admin Panel</h2>

        <div className="flex flex-col space-y-2 mb-6">
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-4 py-2 text-left rounded-lg font-medium transition-colors ${activeTab === 'projects' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Project Management
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`px-4 py-2 text-left rounded-lg font-medium transition-colors ${activeTab === 'team' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {isAdmin ? 'System Users' : 'My Team'} ({isAdmin ? profiles.length : getRelevantTeamProfiles().length})
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('system')}
              className={`px-4 py-2 text-left rounded-lg font-medium transition-colors ${activeTab === 'system' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              System Invitations
            </button>
          )}
           {isGhostAdmin && (
            <button
              onClick={() => setShowSql(!showSql)}
              className={`px-4 py-2 text-left rounded-lg font-medium transition-colors ${showSql ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              SQL Migration Info
            </button>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center mb-4">
            <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-green-50 text-green-600 text-sm rounded-lg flex items-center mb-4">
            <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {successMsg}
          </div>
        )}

        {/* Create Project Form */}
        {activeTab === 'projects' && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-3 text-sm">Create New Project</h3>
            <form onSubmit={handleCreateProject} className="space-y-3 text-sm">
                <div>
                    <label className="block text-slate-600 mb-1">Project Name</label>
                    <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)} required className="w-full px-3 py-2 border rounded" />
                </div>
                <div>
                    <label className="block text-slate-600 mb-1">Currency</label>
                    <input type="text" value={projectCurrency} onChange={e => setProjectCurrency(e.target.value)} required className="w-full px-3 py-2 border rounded" />
                </div>
                <div>
                    <label className="block text-slate-600 mb-1">Company Name (Optional)</label>
                    <input type="text" value={projectCompany} onChange={e => setProjectCompany(e.target.value)} className="w-full px-3 py-2 border rounded" />
                </div>
                <div>
                    <label className="block text-slate-600 mb-1">IČO (Optional)</label>
                    <input type="text" value={projectIco} onChange={e => setProjectIco(e.target.value)} className="w-full px-3 py-2 border rounded" />
                </div>
                <div>
                    <label className="block text-slate-600 mb-1">Description (Optional)</label>
                    <textarea value={projectDescription} onChange={e => setProjectDescription(e.target.value)} className="w-full px-3 py-2 border rounded resize-y"></textarea>
                </div>
                <button type="submit" disabled={isCreatingProject} className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                    {isCreatingProject ? 'Creating...' : 'Create Project'}
                </button>
            </form>
          </div>
        )}

        {/* Invitation Form (System-level for Admin, Project-level for Superuser) */}
        {activeTab === 'system' && isAdmin && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-3 text-sm">Invite New System User</h3>
            <form onSubmit={handleSendInvite} className="space-y-3 text-sm">
              <div>
                <label className="block text-slate-600 mb-1">Email</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">App Role</label>
                <select value={inviteAppRole} onChange={e => setInviteAppRole(e.target.value as AppRole)} className="w-full px-3 py-2 border rounded">
                  <option value="superuser">Superuser</option>
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </select>
              </div>
              <button type="submit" disabled={isInviting} className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {isInviting ? 'Sending...' : 'Send Invitation'}
              </button>
            </form>
          </div>
        )}
        {activeTab === 'team' && isSuperuser && (
           <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-3 text-sm">Invite Team Member to Project</h3>
            <form onSubmit={handleSendInvite} className="space-y-3 text-sm">
              <div>
                <label className="block text-slate-600 mb-1">Email</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                  <label className="block text-slate-600 mb-1">Project Role</label>
                  <select value={inviteProjectRole} onChange={e => setInviteProjectRole(e.target.value as ProjectRole)} className="w-full px-3 py-2 border rounded">
                    <option value="lineproducer">Line Producer</option>
                    <option value="producer">Producer</option>
                    <option value="accountant">Accountant</option>
                  </select>
              </div>
              <div>
                  <label className="block text-slate-600 mb-1">Assign to Project</label>
                  <select value={inviteProjectId} onChange={e => setInviteProjectId(e.target.value)} required className="w-full px-3 py-2 border rounded">
                      <option value="">Select Project</option>
                      {projects.filter(p => p.created_by === profile.id).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                  </select>
              </div>
              <button type="submit" disabled={isInviting} className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {isInviting ? 'Sending...' : 'Send Invitation'}
              </button>
            </form>
           </div>
        )}
      </div>

      {/* Right Column (Data Display) */}
      <div className="flex-1 lg:w-3/4 bg-white rounded-xl shadow-lg border border-slate-200 p-6 flex flex-col h-full overflow-y-auto">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <>
            {activeTab === 'projects' && (
              <>
                <h3 className="text-xl font-bold text-slate-800 mb-4">Your Projects ({projects.length})</h3>
                <div className="space-y-4">
                  {projects.length === 0 ? (
                    <p className="text-slate-500 italic">No projects created yet. Create one above.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {projects.map(p => (
                      <div key={p.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
                        <div>
                          <h4 className="font-bold text-slate-800 text-lg mb-1">{p.name}</h4>
                          <p className="text-xs text-slate-500 mb-2">{p.description || 'No description'}</p>
                          <div className="flex items-center text-xs text-slate-600 gap-2 mb-2">
                             {p.company_name && <span className="flex items-center"><svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a2 2 0 012-2h2a2 2 0 012 2v5m-10 0h6" /></svg>{p.company_name}</span>}
                             {p.ico && <span className="flex items-center"><svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354l.707.707a1 1 0 001.414 0l.707-.707m-3.536 0l-.707.707m0 0a1 1 0 01-1.414 0l-.707-.707m3.536 0L12 3a1 1 0 00-1-1H3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1h-7.646z" /></svg>{p.ico}</span>}
                             <span className="flex items-center"><svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" /></svg>{p.currency}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                            <button onClick={() => openTeamManager(p)} className="flex-1 bg-indigo-50 text-indigo-700 text-xs px-3 py-1.5 rounded-lg shadow-sm hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h2a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h2m3-11v10m0-10a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2h3m7-3v3m0-3a2 2 0 00-2-2H9a2 2 0 00-2 2v3m7 3h2a2 2 0 002-2v-3m0 0a2 2 0 002-2V7a2 2 0 00-2-2H9a2 2 0 00-2 2v3m7 3h-2" /></svg>
                                Manage Team
                            </button>
                            <button onClick={() => handleBudgetClick(p.id)} disabled={uploadingBudget} className="flex-1 bg-emerald-50 text-emerald-700 text-xs px-3 py-1.5 rounded-lg shadow-sm hover:bg-emerald-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                Upload Budget
                            </button>
                            <button onClick={() => handleDeleteProject(p.id)} disabled={deletingProjectId === p.id} className="bg-red-50 text-red-700 text-xs px-3 py-1.5 rounded-lg shadow-sm hover:bg-red-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </div>
                        {p.budgets && p.budgets.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-200">
                                <h5 className="text-xs font-bold text-slate-500 mb-2">Budgets:</h5>
                                <div className="space-y-1">
                                    {p.budgets.map(b => (
                                        <div key={b.id} className="flex items-center justify-between text-xs">
                                            <span className={`font-medium ${b.is_active ? 'text-emerald-700' : 'text-slate-600'}`}>{b.version_name}</span>
                                            {b.is_active ? (
                                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold">Active</span>
                                            ) : (
                                                <button onClick={() => handleToggleActiveBudget(p.id, b.id)} className="text-indigo-600 hover:underline">Set Active</button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                      </div>
                    ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'team' && (
              <>
                <h3 className="text-xl font-bold text-slate-800 mb-4">
                    {isAdmin ? 'All System Users' : 'My Team Members'} ({isAdmin ? profiles.length : getRelevantTeamProfiles().length})
                </h3>
                <div className="space-y-4">
                  { (isAdmin ? profiles : getRelevantTeamProfiles()).length === 0 ? (
                    <p className="text-slate-500 italic">No users found.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(isAdmin ? profiles : getRelevantTeamProfiles()).map(p => (
                      <div key={p.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
                        <div>
                          <h4 className="font-bold text-slate-800 text-base">{p.full_name || 'N/A'}</h4>
                          <p className="text-sm text-slate-600 mb-2">{p.email}</p>
                          <div className="flex items-center gap-2 text-xs mb-2">
                             <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${p.app_role === 'admin' ? 'bg-red-100 text-red-700' : p.app_role === 'superuser' ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                {p.app_role}
                             </span>
                             {p.is_disabled && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-bold text-[10px]">Suspended</span>}
                          </div>
                          {isSuperuser && !isAdmin && (
                            <div className="text-xs text-slate-500 mt-2">
                                <span className="font-bold">Assignments:</span> {getUserAssignmentsDisplay(p.id)}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 mt-3">
                           {isAdmin && p.id !== profile.id && (
                                <button onClick={() => handleToggleDisabled(p)} className={`flex-1 ${p.is_disabled ? 'bg-emerald-50 text-emerald-700' : 'bg-yellow-50 text-yellow-700'} text-xs px-3 py-1.5 rounded-lg shadow-sm hover:${p.is_disabled ? 'bg-emerald-100' : 'bg-yellow-100'} transition-colors`}>
                                    {p.is_disabled ? 'Activate' : 'Suspend'}
                                </button>
                           )}
                           {p.id !== profile.id && (isAdmin || (isSuperuser && p.invited_by === profile.id)) && (
                                <button onClick={() => { setResetTarget(p); setNewPassword(''); }} className="flex-1 bg-blue-50 text-blue-700 text-xs px-3 py-1.5 rounded-lg shadow-sm hover:bg-blue-100 transition-colors">
                                    Reset Password
                                </button>
                           )}
                           {p.id !== profile.id && (isAdmin || (isSuperuser && p.invited_by === profile.id)) && (
                                <button onClick={() => handleDeleteUser(p)} className="flex-1 bg-red-50 text-red-700 text-xs px-3 py-1.5 rounded-lg shadow-sm hover:bg-red-100 transition-colors">
                                    Delete
                                </button>
                           )}
                        </div>
                      </div>
                    ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'system' && isAdmin && (
              <>
                <h3 className="text-xl font-bold text-slate-800 mb-4">Pending Invitations ({invitations.length})</h3>
                <div className="space-y-4">
                  {invitations.length === 0 ? (
                    <p className="text-slate-500 italic">No pending invitations.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {invitations.map(inv => (
                        <div key={inv.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                          <div>
                            <p className="font-bold text-slate-800">{inv.email}</p>
                            <p className="text-xs text-slate-500">
                                {inv.target_app_role && <span className="capitalize">{inv.target_app_role} role</span>}
                                {inv.target_role && inv.target_project_id && (
                                    <span>{inv.target_role} for Project {inv.target_project_id}</span>
                                )}
                            </p>
                            <p className="text-xs text-slate-400">Invited: {new Date(inv.created_at).toLocaleDateString()}</p>
                          </div>
                          <button onClick={() => handleRevokeInvitation(inv.id)} className="bg-red-50 text-red-700 text-xs px-3 py-1.5 rounded-lg shadow-sm hover:bg-red-100 transition-colors">
                              Revoke
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
            {showSql && isGhostAdmin && (
              <div className="mt-8">
                <h3 className="text-xl font-bold text-slate-800 mb-4">SQL Migration Information</h3>
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg text-sm text-blue-800">
                    <p className="font-bold mb-2">Database Setup is now a MULTI-STAGE PROCESS.</p>
                    <p className="mb-1">1. Run the "Core Schema Setup" SQL Script (found in `README.md`).</p>
                    <p className="mb-1">2. **Log in to the app as `tadekus@gmail.com` at least once.** (This creates the `auth.users` entry).</p>
                    <p className="mb-1">3. Run the "Administrator Profile Creation" SQL Script (found in `README.md`).</p>
                    <p className="mb-1">4. Run the "Functions, Triggers, RLS Policies" SQL Script (found in `README.md`).</p>
                    <p className="mt-2">Refer to `README.md` for the exact SQL scripts and detailed instructions for each stage.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Password Reset Modal */}
      {resetTarget && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded-xl w-full max-w-sm shadow-2xl">
                  <h3 className="font-bold text-lg mb-4">Reset Password for {resetTarget.email}</h3>
                  <form onSubmit={handlePasswordReset} className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                          <input
                              type="password"
                              required
                              value={newPassword}
                              onChange={e => setNewPassword(e.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                      </div>
                      <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setResetTarget(null)} className="px-4 py-2 text-sm rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
                          <button type="submit" disabled={isResetting || !newPassword} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                              {isResetting ? 'Resetting...' : 'Reset Password'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Team Assignment Modal */}
      {activeProjectForTeam && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded-xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
                  <div className="flex justify-between items-center mb-6 border-b pb-4">
                      <h3 className="font-bold text-xl text-slate-800">Team for {activeProjectForTeam.name}</h3>
                      <button onClick={closeTeamManager} className="text-slate-400 hover:text-slate-600"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center mb-4">
                      <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {error}
                    </div>
                  )}
                  {successMsg && (
                    <div className="p-3 bg-green-50 text-green-600 text-sm rounded-lg flex items-center mb-4">
                      <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {successMsg}
                    </div>
                  )}
                  
                  <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <h4 className="font-bold text-slate-800 mb-3 text-sm">Add Team Member</h4>
                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-slate-700 mb-1">Select User</label>
                            <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                                <option value="">Select a user</option>
                                {profiles.filter(p => !projectAssignments.some(pa => pa.user_id === p.id)).map(p => (
                                    <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
                            <select value={assignUserRole} onChange={e => setAssignUserRole(e.target.value as ProjectRole)} className="w-full px-3 py-2 border rounded-lg text-sm">
                                <option value="lineproducer">Line Producer</option>
                                <option value="producer">Producer</option>
                                <option value="accountant">Accountant</option>
                            </select>
                        </div>
                        <button onClick={handleAddAssignment} disabled={!assignUserId || isLoadingAssignments} className="md:self-end px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                            Add
                        </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-2">
                      <h4 className="font-bold text-slate-800 mb-3 text-sm">Current Team Members ({projectAssignments.length})</h4>
                      {isLoadingAssignments ? (
                          <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div></div>
                      ) : projectAssignments.length === 0 ? (
                          <p className="text-center text-slate-500 italic py-8">No members assigned to this project.</p>
                      ) : (
                          <div className="space-y-3">
                              {projectAssignments.map(assignment => (
                                  <div key={assignment.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                                      <div>
                                          <p className="font-bold text-slate-800 text-sm">{assignment.profile?.full_name || assignment.profile?.email || 'Unknown User'}</p>
                                          <p className="text-xs text-slate-500 capitalize">{formatRoleName(assignment.role)}</p>
                                      </div>
                                      <button onClick={() => handleRemoveAssignment(assignment.id)} className="bg-red-50 text-red-700 text-xs px-3 py-1.5 rounded-lg shadow-sm hover:bg-red-100 transition-colors">
                                          Remove
                                      </button>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                      <button onClick={closeTeamManager} className="px-5 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">
                          Done
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}