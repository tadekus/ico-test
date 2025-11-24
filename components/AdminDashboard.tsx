
import React, { useState, useEffect } from 'react';
import { 
  fetchAllProfiles, 
  toggleUserDisabled,
  sendSystemInvitation,
  fetchPendingInvitations,
  deleteInvitation
} from '../services/supabaseService';
import { Profile, UserInvitation } from '../types';

interface AdminDashboardProps {
  currentUserId: string;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUserId }) => {
  // Data State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);

  // UI State
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [profs, invites] = await Promise.all([
        fetchAllProfiles(),
        fetchPendingInvitations()
      ]);
      setProfiles(profs);
      setInvitations(invites);
    } catch (err: any) {
      console.error(err);
      setError("Failed to load dashboard data. Check database permissions.");
    } finally {
      setLoading(false);
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

  const getRepairSql = () => {
    return `
-- 0. Drop existing function first to avoid "return type mismatch" errors
DROP FUNCTION IF EXISTS claim_invited_role();

-- 1. Create function to securely claim superuser role
-- SECURITY DEFINER = Runs with Admin privileges (Bypasses RLS)
create or replace function claim_invited_role()
returns text as $$
declare
  is_invited boolean;
  current_email text;
begin
  -- Set search path to ensure we use public tables
  set search_path = public, auth;

  -- Get current user email safely
  select lower(email) into current_email from auth.users where id = auth.uid();
  
  if current_email is null then
    return 'No authenticated user found';
  end if;

  -- Check if invited (Case Insensitive)
  select exists(
    select 1 from public.user_invitations 
    where lower(email) = current_email
  ) into is_invited;

  if is_invited then
    -- Update profile to superuser
    update public.profiles 
    set is_superuser = true 
    where id = auth.uid();
    
    -- Mark invitation as accepted
    update public.user_invitations
    set status = 'accepted'
    where lower(email) = current_email;
    
    return 'Role Claimed: Superuser assigned';
  else
    return 'No invitation found for ' || current_email;
  end if;
end;
$$ language plpgsql security definer;

-- 2. Grant permission to run this function
grant execute on function claim_invited_role to authenticated;

-- 3. Fix existing invited users (Retroactive Fix)
update profiles 
set is_superuser = true 
where lower(email) in (select lower(email) from user_invitations);

-- 4. Ensure RLS allows users to see their own invites
drop policy if exists "Read own invitation" on user_invitations;
create policy "Read own invitation" on user_invitations 
for select to authenticated 
using ( lower(email) = lower(auth.jwt() ->> 'email') );
`;
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
        
        {/* Left Col: Invitations */}
        <div className="space-y-8">
          
          {/* Invite Section */}
          <div className="bg-slate-800 rounded-xl shadow-md p-6 text-white h-fit">
            <h3 className="text-lg font-bold mb-2 flex items-center">
              <svg className="w-5 h-5 mr-2 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Invite User
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
        </div>

        {/* Right Col: Pending Invites */}
        <div className="space-y-8">
          {invitations.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-fit">
                <h3 className="text-sm uppercase tracking-wide font-bold text-slate-500 mb-4">Pending Invites</h3>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
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
          ) : (
             <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 p-8 text-center h-fit flex flex-col items-center justify-center text-slate-400">
               <svg className="w-10 h-10 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
               </svg>
               <p className="text-sm">No pending invitations.</p>
             </div>
          )}
        </div>
      </div>

      {/* Full Width: User Management Table */}
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

      {/* Database Repair Section */}
      <div className="mt-12 pt-8 border-t border-slate-200">
        <button 
          onClick={() => setShowSql(!showSql)}
          className="text-slate-400 text-xs hover:text-indigo-600 font-medium underline"
        >
          {showSql ? 'Hide Database Tools' : 'Show Database Repair Tools'}
        </button>
        
        {showSql && (
          <div className="mt-4 bg-slate-900 rounded-lg p-6">
            <h4 className="text-white font-bold mb-2">Database Repair SQL</h4>
            <p className="text-slate-400 text-xs mb-4">
              Run this SQL in Supabase to fix the &quot;Invited users are not Superusers&quot; issue.
              It creates a backend function that the app calls during setup.
            </p>
            <div className="relative">
              <pre className="bg-black text-emerald-400 p-4 rounded text-xs font-mono overflow-x-auto">
                {getRepairSql()}
              </pre>
              <button 
                onClick={() => navigator.clipboard.writeText(getRepairSql())}
                className="absolute top-2 right-2 bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1 rounded"
              >
                Copy SQL
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default AdminDashboard;
