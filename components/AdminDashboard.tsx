
import React, { useState, useEffect } from 'react';
import { 
  fetchAllProfiles, 
  fetchProjects, 
  createProject, 
  fetchProjectAssignments, 
  assignUserToProject, 
  removeAssignment,
  toggleSuperuser,
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
  const [showSql, setShowSql] = useState(false);

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
      setError("Failed to load admin data. ensure you have run the DB Setup SQL.");
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

  // SQL Script Generator
  const getSqlScript = () => {
    return `
-- 1. PROFILES & AUTH TRIGGER
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  is_superuser boolean default false,
  is_disabled boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Automatically create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
declare
  has_invite boolean;
begin
  -- Check if invited
  select exists(select 1 from public.user_invitations where email = new.email and status = 'pending') into has_invite;
  
  insert into public.profiles (id, email, is_superuser, is_disabled)
  values (new.id, new.email, has_invite, false);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. PROJECTS
create table if not exists projects (
  id bigint generated by default as identity primary key,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. ROLES & ASSIGNMENTS
do $$ begin
    create type project_role as enum ('lineproducer', 'producer', 'accountant');
exception
    when duplicate_object then null;
end $$;

create table if not exists project_assignments (
  id bigint generated by default as identity primary key,
  project_id bigint references projects on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role project_role not null,
  unique(project_id, user_id)
);

-- 4. INVOICES
create table if not exists invoices (
  id bigint generated by default as identity primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users not null,
  project_id bigint references projects(id),
  ico text,
  company_name text,
  bank_account text,
  iban text,
  amount_with_vat numeric,
  amount_without_vat numeric,
  currency text,
  confidence float,
  raw_text text
);

-- 5. INVITATIONS
create table if not exists user_invitations (
  id bigint generated by default as identity primary key,
  email text not null,
  invited_by uuid references auth.users,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  status text default 'pending'
);

-- 6. SECURITY (ROW LEVEL SECURITY)
alter table profiles enable row level security;
alter table projects enable row level security;
alter table project_assignments enable row level security;
alter table invoices enable row level security;
alter table user_invitations enable row level security;

-- 7. POLICIES (PERMISSIONS)
do $$ begin
  -- Profiles
  drop policy if exists "Read profiles" on profiles;
  create policy "Read profiles" on profiles for select to authenticated using (true);
  
  drop policy if exists "Superusers update profiles" on profiles;
  create policy "Superusers update profiles" on profiles for update to authenticated 
    using (exists (select 1 from profiles where id = auth.uid() and is_superuser = true));
    
  drop policy if exists "Users update own profile" on profiles;
  create policy "Users update own profile" on profiles for update to authenticated 
    using (id = auth.uid());

  -- Projects
  drop policy if exists "Superusers full projects" on projects;
  create policy "Superusers full projects" on projects for all to authenticated 
    using (exists (select 1 from profiles where id = auth.uid() and is_superuser = true));

  drop policy if exists "Assigned users read projects" on projects;
  create policy "Assigned users read projects" on projects for select to authenticated 
    using (exists (select 1 from project_assignments where user_id = auth.uid() and project_id = projects.id));

  -- Assignments
  drop policy if exists "Superusers manage assignments" on project_assignments;
  create policy "Superusers manage assignments" on project_assignments for all to authenticated 
    using (exists (select 1 from profiles where id = auth.uid() and is_superuser = true));

  drop policy if exists "Read own assignments" on project_assignments;
  create policy "Read own assignments" on project_assignments for select to authenticated 
    using (user_id = auth.uid());

  -- Invoices
  drop policy if exists "Users manage own invoices" on invoices;
  create policy "Users manage own invoices" on invoices for all to authenticated using (auth.uid() = user_id);

  drop policy if exists "Superusers view all invoices" on invoices;
  create policy "Superusers view all invoices" on invoices for select to authenticated 
    using (exists (select 1 from profiles where id = auth.uid() and is_superuser = true));

  -- Invitations
  drop policy if exists "Superusers manage invitations" on user_invitations;
  create policy "Superusers manage invitations" on user_invitations for all to authenticated 
    using (exists (select 1 from profiles where id = auth.uid() and is_superuser = true));
    
  drop policy if exists "Read own invitation" on user_invitations;
  create policy "Read own invitation" on user_invitations for select to authenticated 
    using ( (select auth.jwt() ->> 'email') = email );
end $$;

-- 8. SET MASTER USER
update profiles set is_superuser = true where email = 'tadekus@gmail.com';
`;
  };

  // Check if master user is missing DB permissions
  const isMasterButNotSuper = currentUserId && 
    profiles.find(p => p.id === currentUserId && !p.is_superuser) && 
    profiles.find(p => p.id === currentUserId)?.email?.toLowerCase() === 'tadekus@gmail.com';

  if (loading) return <div className="text-center py-10">Loading Admin Dashboard...</div>;

  return (
    <div className="space-y-8 animate-fade-in">
      
      {isMasterButNotSuper && (
        <div className="bg-amber-100 border-l-4 border-amber-500 text-amber-700 p-4 rounded shadow-sm">
          <p className="font-bold">⚠️ Permission Warning</p>
          <p>You are recognized as the Master User in the App, but you do not have Superuser permissions in the Database yet.</p>
          <p className="mt-2 text-sm">Please scroll down to "Database & Configuration" and run the SQL script in Supabase.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Col: Invite & Projects */}
        <div className="space-y-8">
          
          {/* Invite Section */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 rounded-xl shadow-md p-6 text-white">
            <h3 className="text-lg font-bold mb-2">Invite New User</h3>
            <p className="text-indigo-100 text-sm mb-4">
              Send a magic link. User will be prompted to set a password upon clicking.
            </p>
            <form onSubmit={handleSendInvite} className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="flex-1 px-4 py-2 rounded-lg text-slate-900 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                disabled={isInviting}
              />
              <button 
                type="submit"
                disabled={isInviting}
                className="bg-white text-indigo-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-50 transition-colors disabled:opacity-75"
              >
                {isInviting ? 'Sending...' : 'Send Invite'}
              </button>
            </form>
            {successMsg && <p className="text-emerald-300 text-sm mt-2">✓ {successMsg}</p>}
            {error && <p className="text-red-300 text-sm mt-2">⚠ {error}</p>}
          </div>

          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-md font-bold text-slate-700 mb-4">Pending Invitations</h3>
                <div className="space-y-2">
                  {invitations.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-700 font-medium">{inv.email}</span>
                        <span className="text-xs text-slate-400">Sent: {new Date(inv.created_at).toLocaleDateString()}</span>
                      </div>
                      <button 
                        onClick={() => handleRevokeInvitation(inv.id)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 hover:bg-red-50 rounded"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
            </div>
          )}

          {/* Project Creation */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
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
                Create
              </button>
            </form>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {projects.map(p => (
                <div 
                  key={p.id}
                  onClick={() => setActiveProject(p)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors border ${
                    activeProject?.id === p.id 
                    ? 'bg-indigo-50 border-indigo-500' 
                    : 'bg-slate-50 border-transparent hover:border-slate-300'
                  }`}
                >
                  <div className="font-medium text-slate-700 flex justify-between">
                    {p.name}
                    {activeProject?.id === p.id && <span className="text-indigo-600 text-xs font-bold">ACTIVE</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Col: Team Management */}
        <div className="space-y-8">
           {/* Team Assignments */}
           <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 min-h-[400px]">
              {activeProject ? (
                <>
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">{activeProject.name}</h3>
                      <p className="text-xs text-slate-500">Manage Team Roles</p>
                    </div>
                    <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded">
                      ID: {activeProject.id}
                    </span>
                  </div>

                  {/* Add Member */}
                  <div className="bg-slate-50 p-4 rounded-lg mb-6">
                    <div className="grid grid-cols-1 gap-3">
                      <select 
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                      >
                        <option value="">Select User...</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.full_name || p.email} {p.is_superuser ? '(Admin)' : ''}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <select 
                          value={selectedRole}
                          onChange={(e) => setSelectedRole(e.target.value as ProjectRole)}
                          className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white"
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
                    </div>
                  </div>

                  {/* Assignments List */}
                  <div className="space-y-2">
                    {assignments.map(a => (
                      <div key={a.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded shadow-sm">
                        <div className="flex items-center">
                          <span className={`w-2 h-2 rounded-full mr-3 ${
                              a.role === 'lineproducer' ? 'bg-purple-500' :
                              a.role === 'producer' ? 'bg-amber-500' :
                              'bg-blue-500'
                          }`}></span>
                          <div>
                            <p className="text-sm font-medium text-slate-700">{a.profile?.full_name || a.profile?.email}</p>
                            <p className="text-xs text-slate-400 capitalize">{a.role}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleRemoveAssignment(a.id)}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    {assignments.length === 0 && (
                      <div className="text-center py-8 text-slate-400 italic text-sm">
                        No team members assigned yet.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <svg className="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p>Select a project from the left to manage the team.</p>
                </div>
              )}
           </div>
        </div>
      </div>

      {/* 3. User Management Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4">All Users</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {profiles.map(p => (
                <tr key={p.id} className={`hover:bg-slate-50 ${p.is_disabled ? 'opacity-60 bg-slate-50' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    <div>{p.full_name || 'No Name'}</div>
                    <div className="text-xs text-slate-400">{p.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {p.is_superuser ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-indigo-100 text-indigo-800">Superuser</span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-slate-100 text-slate-600">User</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {p.is_disabled ? (
                      <span className="text-red-600 font-medium text-xs">Disabled</span>
                    ) : (
                      <span className="text-green-600 font-medium text-xs">Active</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleToggleSuperuser(p)}
                      className="text-xs text-indigo-600 hover:text-indigo-900"
                    >
                      {p.is_superuser ? 'Demote' : 'Promote'}
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={() => handleToggleDisabled(p)}
                      className={`text-xs ${p.is_disabled ? 'text-green-600 hover:text-green-900' : 'text-red-500 hover:text-red-700'}`}
                    >
                      {p.is_disabled ? 'Enable' : 'Disable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Database Config Section */}
      <div className="bg-slate-800 rounded-xl shadow-lg p-6 text-slate-300">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Database & Configuration</h3>
            <p className="text-xs opacity-70">Use this SQL script to update your Supabase schema.</p>
          </div>
          <button 
            onClick={() => setShowSql(!showSql)}
            className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-white transition-colors"
          >
            {showSql ? 'Hide SQL' : 'Show SQL Schema'}
          </button>
        </div>
        
        {showSql && (
          <div className="relative">
            <textarea
              readOnly
              className="w-full h-64 bg-slate-900 font-mono text-xs p-4 rounded-lg text-emerald-400 focus:outline-none"
              value={getSqlScript()}
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(getSqlScript());
                alert("SQL copied to clipboard! Run this in Supabase SQL Editor.");
              }}
              className="absolute top-2 right-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1 rounded shadow"
            >
              Copy SQL
            </button>
          </div>
        )}
      </div>

    </div>
  );
};

export default AdminDashboard;
