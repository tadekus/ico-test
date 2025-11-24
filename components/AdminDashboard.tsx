
import React, { useState, useEffect } from 'react';
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
  const [showSql, setShowSql] = useState(false);
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

  useEffect(() => {
    loadData();
    // Get current email from profiles if possible, or just checking auth
    const masterCheck = profiles.find(p => p.id === currentUserId);
    if(masterCheck) setCurrentUserEmail(masterCheck.email);
  }, []);

  const isMasterUser = (email: string) => email?.toLowerCase() === 'tadekus@gmail.com';
  // We determine Master status based on a hardcoded check for the specific email for UI rendering
  const amIMaster = isMasterUser(currentUserEmail || 'tadekus@gmail.com'); // This will update once data loads

  const loadData = async () => {
    setLoading(true);
    try {
      const [profs, invites, projs] = await Promise.all([
        fetchAllProfiles(),
        fetchPendingInvitations(),
        fetchProjects()
      ]);
      setProfiles(profs);
      setInvitations(invites);
      setProjects(projs);
      
      const me = profs.find(p => p.id === currentUserId);
      if(me) setCurrentUserEmail(me.email);

      // Default active tab based on role
      if (me && isMasterUser(me.email)) {
          setActiveTab('users');
      } else {
          setActiveTab('projects');
      }
    } catch (err: any) {
      console.error(err);
      setError("Failed to load dashboard data.");
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
      try {
          const newProj = await createProject(projectName, projectCurrency);
          setProjects([newProj, ...projects]);
          setProjectName('');
          setSuccessMsg("Project created successfully");
      } catch (err: any) {
          setError(err.message);
      } finally {
          setIsCreatingProject(false);
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

  // --- SQL REPAIR SCRIPT ---
  const getRepairSql = () => {
    return `
-- REPAIR SCRIPT v5.0 (Hierarchy & Budgets)

-- 1. DROP OLD FUNCTION
DROP FUNCTION IF EXISTS claim_invited_role() CASCADE;

-- 2. CREATE/UPDATE TABLES
create table if not exists projects (
  id bigint generated by default as identity primary key,
  name text not null,
  currency text default 'CZK',
  created_by uuid references auth.users,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists budgets (
  id bigint generated by default as identity primary key,
  project_id bigint references projects on delete cascade,
  version_name text,
  xml_content text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists project_assignments (
  id bigint generated by default as identity primary key,
  project_id bigint references projects on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null,
  unique(project_id, user_id)
);

-- ADD COLUMNS if missing
do $$ begin
    alter table profiles add column invited_by uuid references auth.users;
    alter table user_invitations add column target_role text;
    alter table user_invitations add column target_project_id bigint;
exception when others then null; end $$;

-- 3. RLS SECURITY
alter table budgets enable row level security;
alter table projects enable row level security;
alter table project_assignments enable row level security;

-- 4. RPC FUNCTION (The Brain)
create or replace function claim_invited_role()
returns text as $$
declare
  inv_record record;
  current_email text;
begin
  set search_path = public, auth;
  select lower(email) into current_email from auth.users where id = auth.uid();
  
  -- Find Invitation
  select * from public.user_invitations 
  where lower(email) = current_email and status = 'pending'
  limit 1 into inv_record;

  if inv_record.id is not null then
    -- Link who invited them
    update public.profiles set invited_by = inv_record.invited_by where id = auth.uid();
    
    -- Check Role
    if inv_record.target_role is null then
       -- No role = Superuser (Invited by Master)
       update public.profiles set is_superuser = true where id = auth.uid();
    else
       -- Has role = Team Member
       update public.profiles set is_superuser = false where id = auth.uid();
       
       if inv_record.target_project_id is not null then
          insert into public.project_assignments (project_id, user_id, role)
          values (inv_record.target_project_id, auth.uid(), inv_record.target_role)
          on conflict do nothing;
       end if;
    end if;

    update public.user_invitations set status = 'accepted' where id = inv_record.id;
    return 'Role Claimed: ' || coalesce(inv_record.target_role, 'Superuser');
  else
    return 'No pending invitation found';
  end if;
end;
$$ language plpgsql security definer;

-- 5. POLICIES (Visibility Hierarchy)

-- Projects: Created by me OR I am master
drop policy if exists "Manage own projects" on projects;
create policy "Manage own projects" on projects for all to authenticated
using ( created_by = auth.uid() OR lower(auth.jwt() ->> 'email') = 'tadekus@gmail.com' );

-- Profiles: I am master OR I invited them
drop policy if exists "View hierarchy" on profiles;
create policy "View hierarchy" on profiles for select to authenticated
using ( 
   lower(auth.jwt() ->> 'email') = 'tadekus@gmail.com' 
   OR invited_by = auth.uid() 
   OR id = auth.uid()
);

-- Invites: I am master OR I sent them
drop policy if exists "Manage own invites" on user_invitations;
create policy "Manage own invites" on user_invitations for all to authenticated
using ( 
   lower(auth.jwt() ->> 'email') = 'tadekus@gmail.com' 
   OR invited_by = auth.uid() 
   OR lower(email) = lower(auth.jwt() ->> 'email')
);
`;
  };

  if (loading) return <div className="p-12 text-center"><div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {error && <div className="bg-red-50 text-red-600 p-4 rounded-lg">{error}</div>}
      
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
                {successMsg && <p className="text-emerald-400 text-xs mt-2">{successMsg}</p>}
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

              <div className="grid grid-cols-1 gap-4">
                  {projects.map(proj => (
                      <div key={proj.id} className="bg-white border border-slate-200 rounded-xl p-6 flex justify-between items-center shadow-sm">
                          <div>
                              <h4 className="text-lg font-bold text-slate-800">{proj.name}</h4>
                              <p className="text-xs text-slate-500">Created {new Date(proj.created_at).toLocaleDateString()} • {proj.currency}</p>
                          </div>
                          <div className="flex gap-2">
                             <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full border border-slate-200">
                                {proj.budgets?.length || 0} Budgets
                             </span>
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
                  {successMsg && <p className="text-emerald-400 text-xs mt-2">{successMsg}</p>}
              </div>

              <div className="space-y-6">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                      <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Pending Invites</h3>
                      <div className="space-y-2">
                          {invitations.map(inv => (
                              <div key={inv.id} className="flex justify-between items-center p-2 bg-slate-50 rounded">
                                  <div className="flex flex-col">
                                      <span className="text-sm font-medium">{inv.email}</span>
                                      <span className="text-xs text-slate-400">{inv.target_role || 'Superuser'}</span>
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
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* REPAIR SQL (Shared) */}
      <div className="mt-12 pt-8 border-t border-slate-200">
        <button onClick={() => setShowSql(!showSql)} className="text-slate-400 text-xs hover:text-indigo-600 underline">
          {showSql ? 'Hide Database Tools' : 'Show Database Repair Tools'}
        </button>
        {showSql && (
          <div className="mt-4 bg-slate-900 rounded-lg p-6 relative">
            <h4 className="text-white font-bold mb-2">Database Schema Update</h4>
            <p className="text-slate-400 text-xs mb-4">Copy and run this to enable Project & Budget features.</p>
            <pre className="bg-black text-emerald-400 p-4 rounded text-xs font-mono overflow-x-auto h-64">
              {getRepairSql()}
            </pre>
            <button 
                onClick={() => navigator.clipboard.writeText(getRepairSql())}
                className="absolute top-6 right-6 bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1 rounded"
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
