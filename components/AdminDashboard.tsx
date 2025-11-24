
import React, { useState, useEffect } from 'react';
import { 
  fetchAllProfiles, 
  fetchProjects, 
  createProject, 
  fetchProjectAssignments, 
  assignUserToProject, 
  removeAssignment,
  toggleUserDisabled,
  sendSystemInvitation,
  fetchPendingInvitations,
  deleteInvitation
} from '../services/supabaseService';
import { Profile, Project, ProjectAssignment, ProjectRole, UserInvitation } from '../types';

interface AdminDashboardProps {
  currentUserId: string;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUserId }) => {
  // Data State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);

  // UI State
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState<ProjectRole>('lineproducer');
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeProject) {
      loadAssignments(activeProject.id);
    } else {
      setAssignments([]);
    }
  }, [activeProject]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [profs, projs, invites] = await Promise.all([
        fetchAllProfiles(),
        fetchProjects(),
        fetchPendingInvitations()
      ]);
      setProfiles(profs);
      setProjects(projs);
      setInvitations(invites);
    } catch (err: any) {
      console.error(err);
      setError("Failed to load dashboard data. Check database permissions.");
    } finally {
      setLoading(false);
    }
  };

  const loadAssignments = async (projectId: number) => {
    try {
      const data = await fetchProjectAssignments(projectId);
      setAssignments(data);
    } catch (err) {
      setError("Failed to load assignments");
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setError(null);
    try {
      const newProj = await createProject(newProjectName);
      if (newProj) {
        setProjects([newProj, ...projects]);
        setNewProjectName('');
        setActiveProject(newProj);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAssignUser = async () => {
    if (!activeProject || !selectedUser) return;
    setError(null);
    try {
      await assignUserToProject(activeProject.id, selectedUser, selectedRole);
      await loadAssignments(activeProject.id);
      setSelectedUser('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRemoveAssignment = async (id: number) => {
    try {
      await removeAssignment(id);
      setAssignments(assignments.filter(a => a.id !== id));
    } catch (err: any) {
      setError("Failed to remove user");
    }
  };

  const handleToggleDisabled = async (profile: Profile) => {
    if (profile.id === currentUserId) {
      alert("You cannot disable your own account.");
      return;
    }
    const newValue = !profile.is_disabled;
    const action = newValue ? "DISABLE login for" : "ENABLE login for";
    
    if (window.confirm(`Are you sure you want to ${action} ${profile.email}?`)) {
      try {
        await toggleUserDisabled(profile.id, newValue);
        setProfiles(profiles.map(p => p.id === profile.id ? {...p, is_disabled: newValue} : p));
      } catch (err) {
        setError("Failed to update status");
      }
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    
    setIsInviting(true);
    setError(null);
    setSuccessMsg(null);
    
    try {
      await sendSystemInvitation(inviteEmail);
      setSuccessMsg(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      // Refresh pending list
      const updatedInvites = await fetchPendingInvitations();
      setInvitations(updatedInvites);
    } catch (err: any) {
      setError(err.message || "Failed to send invitation");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevokeInvitation = async (id: number) => {
    if (!window.confirm("Revoke this invitation?")) return;
    try {
      await deleteInvitation(id);
      setInvitations(invitations.filter(i => i.id !== id));
    } catch(err) {
      setError("Failed to revoke invitation");
    }
  };

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg flex items-center">
          <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Col: Projects & Invites */}
        <div className="space-y-8">
          
          {/* Project Creation */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
               <h3 className="text-lg font-bold text-slate-800">Projects</h3>
               <span className="text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded-full border border-slate-100">
                 {projects.length} Total
               </span>
            </div>
            
            <form onSubmit={handleCreateProject} className="flex gap-2 mb-6">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="New Project Name"
                className="flex-1 px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
              <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 shadow-sm transition-colors font-medium">
                Create
              </button>
            </form>

            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {projects.map(p => (
                <div 
                  key={p.id}
                  onClick={() => setActiveProject(p)}
                  className={`p-4 rounded-lg cursor-pointer transition-all border group ${
                    activeProject?.id === p.id 
                    ? 'bg-indigo-50 border-indigo-200 shadow-sm' 
                    : 'bg-white border-slate-100 hover:border-indigo-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className={`font-medium ${activeProject?.id === p.id ? 'text-indigo-900' : 'text-slate-700'}`}>
                      {p.name}
                    </span>
                    {activeProject?.id === p.id && (
                       <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                       </svg>
                    )}
                  </div>
                </div>
              ))}
              {projects.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-lg">
                  <p className="text-sm text-slate-400">No projects created yet.</p>
                </div>
              )}
            </div>
          </div>

          {/* Invite Section */}
          <div className="bg-slate-800 rounded-xl shadow-md p-6 text-white">
            <h3 className="text-lg font-bold mb-2 flex items-center">
              <svg className="w-5 h-5 mr-2 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Invite Administrator
            </h3>
            <p className="text-slate-400 text-xs mb-4">
              Invited users will receive full <strong>Superuser</strong> access upon registration.
            </p>
            <form onSubmit={handleSendInvite} className="flex flex-col gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="w-full px-4 py-2 rounded-lg text-slate-900 text-sm outline-none focus:ring-2 focus:ring-indigo-400 border-none"
                disabled={isInviting}
              />
              <button 
                type="submit"
                disabled={isInviting}
                className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-500 transition-colors disabled:opacity-75"
              >
                {isInviting ? 'Sending Magic Link...' : 'Send Invitation'}
              </button>
            </form>
            {successMsg && <p className="text-emerald-400 text-xs mt-3 font-medium flex items-center"><span className="mr-1">✓</span> {successMsg}</p>}
          </div>

          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-sm uppercase tracking-wide font-bold text-slate-500 mb-4">Pending Invites</h3>
                <div className="space-y-2">
                  {invitations.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg p-3">
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-700 font-medium">{inv.email}</span>
                        <span className="text-[10px] text-slate-400 uppercase">Sent: {new Date(inv.created_at).toLocaleDateString()}</span>
                      </div>
                      <button 
                        onClick={() => handleRevokeInvitation(inv.id)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 hover:bg-red-50 rounded border border-transparent hover:border-red-100 transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
            </div>
          )}
        </div>

        {/* Right Col: Team Management */}
        <div className="space-y-8">
           {/* Team Assignments */}
           <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 min-h-[500px] flex flex-col">
              {activeProject ? (
                <>
                  <div className="flex justify-between items-start mb-6 pb-4 border-b border-slate-100">
                    <div>
                      <h3 className="text-xl font-bold text-slate-800">{activeProject.name}</h3>
                      <p className="text-sm text-slate-500 mt-1">Manage Team & Roles</p>
                    </div>
                    <div className="text-right">
                       <span className="bg-indigo-50 text-indigo-700 text-xs font-mono px-2 py-1 rounded">
                        ID: {activeProject.id}
                      </span>
                    </div>
                  </div>

                  {/* Add Member */}
                  <div className="bg-slate-50 p-5 rounded-xl mb-6 border border-slate-100">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 block">Assign Team Member</label>
                    <div className="grid grid-cols-1 gap-3">
                      <select 
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">Select User...</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.full_name || p.email} {p.is_superuser ? '★' : ''}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <select 
                          value={selectedRole}
                          onChange={(e) => setSelectedRole(e.target.value as ProjectRole)}
                          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          <option value="lineproducer">Line Producer</option>
                          <option value="producer">Producer</option>
                          <option value="accountant">Accountant</option>
                        </select>
                        <button 
                          onClick={handleAssignUser}
                          disabled={!selectedUser}
                          className="bg-slate-800 text-white px-6 py-2 rounded-lg text-sm hover:bg-slate-900 disabled:opacity-50 transition-colors shadow-sm"
                        >
                          Assign
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Assignments List */}
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 block">Current Team</label>
                    <div className="space-y-3">
                      {assignments.map(a => (
                        <div key={a.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-lg hover:border-slate-300 transition-colors group">
                          <div className="flex items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                                a.role === 'lineproducer' ? 'bg-purple-100 text-purple-600' :
                                a.role === 'producer' ? 'bg-amber-100 text-amber-600' :
                                'bg-blue-100 text-blue-600'
                            }`}>
                              <span className="text-xs font-bold">{a.role[0].toUpperCase()}</span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-700">{a.profile?.full_name || a.profile?.email}</p>
                              <p className="text-xs text-slate-400 capitalize">{a.role}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleRemoveAssignment(a.id)}
                            className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2"
                            title="Remove User"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      {assignments.length === 0 && (
                        <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                          <p className="text-sm text-slate-400">No team members assigned.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <h4 className="text-slate-900 font-medium mb-1">No Project Selected</h4>
                  <p className="text-sm max-w-xs text-center">Select a project from the left list to manage team assignments and roles.</p>
                </div>
              )}
           </div>
        </div>
      </div>

      {/* 3. User Management Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4">All Registered Users</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {profiles.map(p => (
                <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${p.is_disabled ? 'opacity-60 bg-slate-50' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    <div className="font-medium">{p.full_name || 'No Name'}</div>
                    <div className="text-xs text-slate-400">{p.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {p.is_superuser ? (
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                        Administrator
                      </span>
                    ) : (
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        User
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {p.is_disabled ? (
                      <div className="flex items-center text-red-600">
                        <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                        <span className="font-medium text-xs">Disabled</span>
                      </div>
                    ) : (
                      <div className="flex items-center text-emerald-600">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></span>
                        <span className="font-medium text-xs">Active</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleToggleDisabled(p)}
                      disabled={p.id === currentUserId}
                      className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors border ${
                          p.is_disabled 
                          ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50' 
                          : 'border-slate-200 text-slate-500 hover:border-red-200 hover:text-red-500 hover:bg-red-50'
                      } ${p.id === currentUserId ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {p.is_disabled ? 'Enable Account' : 'Disable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default AdminDashboard;
