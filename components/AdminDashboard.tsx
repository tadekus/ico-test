
import React, { useState, useEffect } from 'react';
import { 
  fetchAllProfiles, 
  fetchProjects, 
  createProject, 
  fetchProjectAssignments, 
  assignUserToProject, 
  removeAssignment,
  toggleSuperuser,
  toggleUserDisabled
} from '../services/supabaseService';
import { Profile, Project, ProjectAssignment, ProjectRole } from '../types';

interface AdminDashboardProps {
  currentUserId: string;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUserId }) => {
  // Data State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);

  // UI State
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState<ProjectRole>('lineproducer');
  const [inviteEmail, setInviteEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

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
      const [profs, projs] = await Promise.all([
        fetchAllProfiles(),
        fetchProjects()
      ]);
      setProfiles(profs);
      setProjects(projs);
    } catch (err: any) {
      setError("Failed to load admin data");
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

  const handleToggleSuperuser = async (profile: Profile) => {
    if (profile.id === currentUserId) {
      alert("You cannot remove your own superuser status.");
      return;
    }
    const newValue = !profile.is_superuser;
    if (window.confirm(`Make ${profile.email} ${newValue ? 'a Superuser' : 'a regular user'}?`)) {
      try {
        await toggleSuperuser(profile.id, newValue);
        setProfiles(profiles.map(p => p.id === profile.id ? {...p, is_superuser: newValue} : p));
      } catch (err) {
        setError("Failed to update role");
      }
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

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    
    // Create mailto link
    const subject = "Invitation to Movie Accountant App";
    const body = `Hello,\n\nYou have been invited to join the Movie Accountant application.\n\nPlease sign up here: ${window.location.origin}\n\nBest regards,`;
    
    window.location.href = `mailto:${inviteEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setInviteEmail('');
  };

  if (loading) return <div className="text-center py-10">Loading Admin Dashboard...</div>;

  return (
    <div className="space-y-8 animate-fade-in">

      {/* 0. Invite User Section */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 rounded-xl shadow-md p-6 text-white">
        <h3 className="text-lg font-bold mb-2">Invite New User</h3>
        <p className="text-indigo-100 text-sm mb-4">Send an email invitation to add a new Superuser or team member.</p>
        <form onSubmit={handleSendInvite} className="flex gap-2 max-w-lg">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@example.com"
            className="flex-1 px-4 py-2 rounded-lg text-slate-900 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button 
            type="submit"
            className="bg-white text-indigo-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-50 transition-colors"
          >
            Send Invite
          </button>
        </form>
      </div>
      
      {/* 1. Project Management Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Project List */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:col-span-1 h-fit">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Projects</h3>
          
          <form onSubmit={handleCreateProject} className="flex gap-2 mb-6">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="New Project Name"
              className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <button type="submit" className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-indigo-700">
              +
            </button>
          </form>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {projects.map(p => (
              <div 
                key={p.id}
                onClick={() => setActiveProject(p)}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  activeProject?.id === p.id ? 'bg-indigo-50 border-indigo-200 border' : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className="font-medium text-slate-700">{p.name}</div>
                <div className="text-xs text-slate-400">{new Date(p.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Assignments for Active Project */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:col-span-2">
          {activeProject ? (
            <>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-800">
                  Team: <span className="text-indigo-600">{activeProject.name}</span>
                </h3>
              </div>

              {/* Assignment Form */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">Add Team Member</h4>
                <div className="flex flex-col md:flex-row gap-3">
                  <select 
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white"
                  >
                    <option value="">Select User...</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.email} {p.is_superuser ? '(Admin)' : ''}</option>
                    ))}
                  </select>
                  <select 
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as ProjectRole)}
                    className="px-3 py-2 border rounded-lg text-sm bg-white"
                  >
                    <option value="lineproducer">Line Producer (Max 1)</option>
                    <option value="producer">Producer (Max 2)</option>
                    <option value="accountant">Accountant (Max 2)</option>
                  </select>
                  <button 
                    onClick={handleAssignUser}
                    disabled={!selectedUser}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Assign
                  </button>
                </div>
                {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
              </div>

              {/* Assignments Table */}
              <table className="min-w-full divide-y divide-slate-200">
                <thead>
                  <tr className="text-left text-xs font-medium text-slate-500 uppercase">
                    <th className="pb-3">Role</th>
                    <th className="pb-3">User</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignments.map(a => (
                    <tr key={a.id}>
                      <td className="py-3 text-sm font-medium">
                        <span className={`px-2 py-1 rounded text-xs ${
                          a.role === 'lineproducer' ? 'bg-purple-100 text-purple-700' :
                          a.role === 'producer' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {a.role}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-slate-600">{a.profile?.email}</td>
                      <td className="py-3 text-right">
                        <button 
                          onClick={() => handleRemoveAssignment(a.id)}
                          className="text-red-400 hover:text-red-600 text-sm"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {assignments.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-sm text-slate-400 italic">No team members assigned.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          ) : (
             <div className="h-full flex items-center justify-center text-slate-400">
               Select a project to manage team
             </div>
          )}
        </div>
      </div>

      {/* 2. User Management (All Users) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4">User Management</h3>
        <p className="text-sm text-slate-500 mb-4">
          Manage system access and superuser privileges.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {profiles.map(p => (
                <tr key={p.id} className={`hover:bg-slate-50 ${p.is_disabled ? 'bg-slate-50' : ''}`}>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm ${p.is_disabled ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                    {p.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {p.is_superuser ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-indigo-100 text-indigo-800">
                        Superuser
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-slate-100 text-slate-600">
                        User
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {p.is_disabled ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                        Disabled
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleToggleSuperuser(p)}
                      className={`text-xs px-2 py-1 rounded transition-colors ${
                        p.is_superuser 
                        ? 'text-slate-500 hover:bg-slate-100' 
                        : 'text-indigo-600 hover:bg-indigo-50'
                      }`}
                    >
                      {p.is_superuser ? 'Remove Admin' : 'Make Admin'}
                    </button>
                    <button
                      onClick={() => handleToggleDisabled(p)}
                      className={`text-xs px-2 py-1 rounded transition-colors border ${
                        p.is_disabled
                        ? 'border-green-200 text-green-600 hover:bg-green-50'
                        : 'border-red-200 text-red-500 hover:bg-red-50'
                      }`}
                    >
                      {p.is_disabled ? 'Enable Login' : 'Disable Login'}
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
