
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
import { Profile, UserInvitation, Project, ProjectRole } from '../types';

interface AdminDashboardProps {
  currentUserId: string;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUserId }) => {
  // Common Data
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');

  // UI State
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'projects' | 'team'>('users');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Forms
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('lineproducer');
  const [inviteProjectId, setInviteProjectId] = useState<string>('');
  const [isInviting, setIsInviting] = useState(false);

  const [projectName, setProjectName] = useState('');
  const [projectCurrency, setProjectCurrency] = useState('CZK');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Budget Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [uploadingBudget, setUploadingBudget] = useState(false);

  useEffect(() => {
    // Initial email check from prop or session
    // We will refine this once profiles load
    loadData();
  }, []);

  const isMasterUser = (email: string) => email?.toLowerCase() === 'tadekus@gmail.com';
  
  // We determine Master status based on the current user's email
  const amIMaster = isMasterUser(currentUserEmail || 'tadekus@gmail.com');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Projects (Superusers need this first)
      const projs = await fetchProjects().catch(e => {
        console.warn("Failed to fetch projects:", e);
        return [];
      });
      setProjects(projs);

      // 2. Fetch Invitations
      const invites = await fetchPendingInvitations().catch(e => {
        console.warn("Failed to fetch invites:", e);
        return [];
      });
      setInvitations(invites);

      // 3. Fetch Profiles (This was causing the recursion crash)
      const profs = await fetchAllProfiles().catch(e => {
        console.error("Critical: Failed to fetch profiles:", e);
        setError("Database permission error. Please run the SQL fix script.");
        return [];
      });
      setProfiles(profs);
      
      // Update current user email from profile if found
      const me = profs.find(p => p.id === currentUserId);
      if(me) {
        setCurrentUserEmail(me.email);
        // Reset tab logic based on confirmed identity
        if (isMasterUser(me.email)) {
            setActiveTab('users');
        } else if (activeTab === 'users') {
            // If I'm not master but tab is 'users' (default), switch to projects
            setActiveTab('projects');
        }
      }

    } catch (err: any) {
      console.error(err);
      setError("Failed to load dashboard data. Permissions might need fixing.");
    } finally {
      setLoading(false);
    }
  };

  // --- ACTIONS ---

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    
    setIsInviting(true);
    setError(null);
    setSuccessMsg(null);
    
    try {
      if (amIMaster) {
         // Master always invites Superusers (no role/project needed)
         await sendSystemInvitation(inviteEmail);
      } else {
         // Superuser invites Team Members
         if (!inviteProjectId) throw new Error("Please select a project.");
         await sendSystemInvitation(inviteEmail, inviteRole, parseInt(inviteProjectId));
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
          await createProject(projectName, projectCurrency);
          // Refresh list to include new project and any budget structures
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
        
        // Refresh projects to show new budget count
        const updatedProjs = await fetchProjects();
        setProjects(updatedProjs);
    } catch (err: any) {
        setError("Failed to upload budget: " + err.message);
    } finally {
        setUploadingBudget(false);
        setSelectedProjectId(null);
        if(fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleToggleDisabled = async (profile: Profile) => {
    if (profile.id === currentUserId) return;
    const newValue = !profile.is_disabled;
    if (window.confirm(`Are you sure you want to ${newValue ? 'disable' : 'enable'} ${profile.email}?`)) {
      try {
        await toggleUserDisabled(profile.id, newValue);
        setProfiles(profiles.map(p => p.id === profile.id ? {...p, is_disabled: newValue} : p));
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

  if (loading) return <div className="p-12 text-center"><div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-lg flex flex-col gap-2">
          <p className="font-bold flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Error
          </p>
          <p>{error}</p>
        </div>
      )}
      
      {successMsg && <div className="bg-emerald-50 text-emerald-600 p-4 rounded-lg">{successMsg}</div>}
      
      {/* TABS FOR SUPERUSERS */}
      {!amIMaster && (
          <div className="flex space-x-4 border-b border-slate-200">
              <button 
                  onClick={() => setActiveTab('projects')}
                  className={`pb-2 px-4 font-medium text-sm ${activeTab === 'projects' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}
              >
                  My Projects
              </button>
              <button 
                  onClick={() => setActiveTab('team')}
                  className={`pb-2 px-4 font-medium text-sm ${activeTab === 'team' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}
              >
                  My Team & Invites
              </button>
          </div>
      )}

      {/* MASTER VIEW: USERS ONLY */}
      {amIMaster && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-purple-900 rounded-xl shadow-md p-6 text-white h-fit">
                <h3 className="text-lg font-bold mb-2">Invite Superuser</h3>
                <p className="text-purple-200 text-xs mb-4">Grant full project creation rights.</p>
                <form onSubmit={handleSendInvite} className="flex flex-col gap-3">
                    <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="superuser@example.com"
                        className="w-full px-4 py-2 rounded text-slate-900 text-sm outline-none"
                    />
                    <button type="submit" disabled={isInviting} className="bg-purple-500 hover:bg-purple-400 text-white py-2 rounded font-bold text-sm">
                        {isInviting ? 'Sending...' : 'Invite Admin'}
                    </button>
                </form>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">All Superusers</h3>
                <div className="space-y-2">
                    {profiles.filter(p => p.is_superuser && !isMasterUser(p.email)).map(p => (
                        <div key={p.id} className="flex justify-between items-center p-2 bg-slate-50 rounded">
                            <span className="text-sm font-medium">{p.full_name || p.email}</span>
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">Superuser</span>
                        </div>
                    ))}
                    {profiles.filter(p => p.is_superuser && !isMasterUser(p.email)).length === 0 && (
                        <p className="text-slate-400 text-sm italic">No superusers invited yet.</p>
                    )}
                </div>
            </div>
         </div>
      )}

      {/* SUPERUSER VIEW: PROJECTS */}
      {!amIMaster && activeTab === 'projects' && (
          <div className="space-y-8">
              <div className="bg-indigo-900 rounded-xl shadow-md p-6 text-white">
                  <h3 className="text-lg font-bold mb-4">Create New Project</h3>
                  <form onSubmit={handleCreateProject} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                      <div className="flex flex-col gap-1">
                          <label className="text-xs text-indigo-300">Project Name</label>
                          <input 
                             type="text" required value={projectName} onChange={e => setProjectName(e.target.value)}
                             className="px-3 py-2 rounded text-slate-900 text-sm" placeholder="e.g. Summer Commercial"
                          />
                      </div>
                      <div className="flex flex-col gap-1">
                          <label className="text-xs text-indigo-300">Currency</label>
                          <select 
                             value={projectCurrency} onChange={e => setProjectCurrency(e.target.value)}
                             className="px-3 py-2 rounded text-slate-900 text-sm"
                          >
                              <option value="CZK">CZK (Kč)</option>
                              <option value="EUR">EUR (€)</option>
                              <option value="USD">USD ($)</option>
                          </select>
                      </div>
                      <button type="submit" disabled={isCreatingProject} className="bg-indigo-500 hover:bg-indigo-400 text-white py-2 rounded font-bold text-sm">
                          Create Project
                      </button>
                  </form>
              </div>

              {/* Hidden file input for budgets */}
              <input 
                  type="file" 
                  accept=".xml" 
                  ref={fileInputRef} 
                  onChange={handleBudgetFileChange} 
                  className="hidden" 
              />

              <div className="grid grid-cols-1 gap-4">
                  {projects.map(proj => (
                      <div key={proj.id} className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row justify-between items-center shadow-sm gap-4">
                          <div>
                              <h4 className="text-lg font-bold text-slate-800">{proj.name}</h4>
                              <p className="text-xs text-slate-500">Created {new Date(proj.created_at).toLocaleDateString()} • {proj.currency}</p>
                              <div className="mt-2 text-xs text-slate-400">
                                  {proj.budgets?.length || 0} budget versions loaded
                              </div>
                          </div>
                          <div className="flex gap-3">
                             <button 
                                onClick={() => handleBudgetClick(proj.id)}
                                disabled={uploadingBudget}
                                className="text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded font-medium flex items-center transition-colors"
                             >
                                {uploadingBudget && selectedProjectId === proj.id ? (
                                    <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                                ) : (
                                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                )}
                                Upload Budget XML
                             </button>
                          </div>
                      </div>
                  ))}
                  {projects.length === 0 && <p className="text-center text-slate-400 py-8">You haven&apos;t created any projects yet.</p>}
              </div>
          </div>
      )}

      {/* SUPERUSER VIEW: TEAM */}
      {!amIMaster && activeTab === 'team' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-slate-800 rounded-xl shadow-md p-6 text-white h-fit">
                  <h3 className="text-lg font-bold mb-2">Invite Team Member</h3>
                  <form onSubmit={handleSendInvite} className="flex flex-col gap-3">
                      <input
                          type="email" required
                          value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="crew@example.com"
                          className="w-full px-4 py-2 rounded text-slate-900 text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2">
                          <select 
                             value={inviteRole} onChange={(e) => setInviteRole(e.target.value as ProjectRole)}
                             className="px-3 py-2 rounded text-slate-900 text-sm"
                          >
                              <option value="lineproducer">Line Producer</option>
                              <option value="producer">Producer</option>
                              <option value="accountant">Accountant</option>
                          </select>
                          <select 
                             value={inviteProjectId} onChange={(e) => setInviteProjectId(e.target.value)}
                             className="px-3 py-2 rounded text-slate-900 text-sm"
                             required
                          >
                              <option value="">Select Project...</option>
                              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                      </div>
                      <button type="submit" disabled={isInviting} className="bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded font-bold text-sm">
                          {isInviting ? 'Sending...' : 'Send Invitation'}
                      </button>
                  </form>
              </div>

              <div className="space-y-6">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                      <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Pending Invites</h3>
                      <div className="space-y-2">
                          {invitations.map(inv => (
                              <div key={inv.id} className="flex justify-between items-center p-2 bg-slate-50 rounded">
                                  <div className="flex flex-col">
                                      <span className="text-sm font-medium">{inv.email}</span>
                                      <span className="text-xs text-slate-400">
                                        {inv.target_role ? `${inv.target_role} (Project #${inv.target_project_id})` : 'Superuser'}
                                      </span>
                                  </div>
                                  <button onClick={() => handleRevokeInvitation(inv.id)} className="text-xs text-red-500 hover:underline">Revoke</button>
                              </div>
                          ))}
                          {invitations.length === 0 && <p className="text-slate-400 text-xs italic">No pending invites.</p>}
                      </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                      <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">My Team</h3>
                      <div className="space-y-2">
                          {profiles.filter(p => !p.is_superuser && !isMasterUser(p.email)).map(p => (
                              <div key={p.id} className="flex justify-between items-center p-2 bg-slate-50 rounded">
                                  <span className="text-sm font-medium">{p.full_name || p.email}</span>
                                  <button onClick={() => handleToggleDisabled(p)} className={`text-xs ${p.is_disabled ? 'text-red-500' : 'text-emerald-600'}`}>
                                      {p.is_disabled ? 'Disabled' : 'Active'}
                                  </button>
                              </div>
                          ))}
                           {profiles.filter(p => !p.is_superuser && !isMasterUser(p.email)).length === 0 && (
                            <p className="text-slate-400 text-xs italic">No team members yet.</p>
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
