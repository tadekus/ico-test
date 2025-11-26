
import React, { useState, useEffect } from 'react';
import InvoicingModule from './components/InvoicingModule';
import AdminDashboard from './components/AdminDashboard';
import Auth, { SetupAccount } from './components/Auth';
import { Profile, Project, ProjectRole } from './types';
import { isSupabaseConfigured, signOut, supabase, getUserProfile, checkMyPendingInvitation, acceptInvitation, fetchAssignedProjects } from './services/supabaseService';
import { User } from '@supabase/supabase-js';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [hasPendingInvite, setHasPendingInvite] = useState(false);

  // PROJECT CONTEXT
  const [assignedProjects, setAssignedProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentProjectRole, setCurrentProjectRole] = useState<ProjectRole | null>(null);

  // TABS
  const [activeTab, setActiveTab] = useState<string>('invoicing');

  const configStatus = { gemini: !!process.env.API_KEY, supabase: isSupabaseConfigured };

  // SYSTEM ROLES
  const isMasterUser = user?.email?.toLowerCase() === 'tadekus@gmail.com';
  const isAdmin = (userProfile?.app_role === 'admin') || isMasterUser;
  const isSuperuser = (userProfile?.app_role === 'superuser') || (userProfile?.is_superuser === true && !isAdmin);

  useEffect(() => {
    if (configStatus.supabase && supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => handleUserSession(session?.user ?? null));
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => handleUserSession(session?.user ?? null));
      return () => subscription.unsubscribe();
    } else {
      setIsLoadingSession(false);
    }
  }, []);

  const handleUserSession = async (currentUser: User | null) => {
    setUser(currentUser);
    if (currentUser) {
      if (currentUser.email) {
        const isPending = await checkMyPendingInvitation(currentUser.email);
        if (isPending) { setHasPendingInvite(true); setIsLoadingSession(false); return; }
      }

      let profile = await getUserProfile(currentUser.id);
      
      // Master Override
      if (!profile && currentUser.email?.toLowerCase() === 'tadekus@gmail.com') {
          profile = { id: currentUser.id, email: currentUser.email, full_name: 'Master Admin (Ghost)', app_role: 'admin', created_at: new Date().toISOString() };
      }
      
      if (profile) setUserProfile(profile);

      // Load Projects
      const projects = await fetchAssignedProjects(currentUser.id);
      setAssignedProjects(projects);
      
      // Select first project default
      if (projects.length > 0) {
          setCurrentProject(projects[0]);
      }

    } else {
      setUserProfile(null);
      setHasPendingInvite(false);
      setAssignedProjects([]);
      setCurrentProject(null);
    }
    setIsLoadingSession(false);
  };

  const handleProjectChange = (projectId: string) => {
      const proj = assignedProjects.find(p => p.id.toString() === projectId) || null;
      setCurrentProject(proj);
      // Determine Role for this specific project (We need to fetch assignments or store them with projects. 
      // For simplicity, we fetched projects based on assignment, but didn't store the specific role in the project object yet.
      // Let's assume generic 'Member' for now or update service to return role with project)
  };

  const handleSetupSuccess = async () => {
    if (user?.email) { await acceptInvitation(user.email); setHasPendingInvite(false); await signOut(); alert("Setup complete! Please sign in."); }
  };

  const handleSignOut = async () => { await signOut(); setUser(null); setUserProfile(null); setHasPendingInvite(false); };

  // DYNAMIC HEADER LABEL
  let headerRole = 'User';
  if (isAdmin) headerRole = 'Administrator';
  else if (isSuperuser) headerRole = 'Superuser';
  else if (currentProject) headerRole = 'Project Member'; // Ideally specific role like "Line Producer"

  if (isLoadingSession) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;
  if (hasPendingInvite && user?.email) return <SetupAccount email={user.email} onSuccess={handleSetupSuccess} />;
  if (configStatus.supabase && !user) return <Auth />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/50 flex flex-col">
        {/* TOP BAR */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-2">
                        <div className="bg-indigo-600 rounded p-1.5"><svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
                        <span className="font-bold text-slate-800 text-lg tracking-tight">MovieAcct</span>
                    </div>

                    {/* PROJECT SELECTOR (Visible for everyone except maybe pure Admins who focus on System) */}
                    {!isAdmin && (
                        <div className="hidden md:flex items-center gap-2 border-l border-slate-200 pl-6">
                            <label className="text-xs font-bold text-slate-400 uppercase">Project</label>
                            <select 
                                value={currentProject?.id || ''}
                                onChange={(e) => handleProjectChange(e.target.value)}
                                className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 min-w-[200px]"
                            >
                                {assignedProjects.length === 0 && <option value="">No Active Projects</option>}
                                {assignedProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <div className="text-sm font-medium text-slate-900">{userProfile?.full_name || user?.email}</div>
                        <div className="text-xs text-indigo-600 font-bold uppercase tracking-wider">{headerRole}</div>
                    </div>
                    <button onClick={handleSignOut} className="text-slate-400 hover:text-red-500 transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </button>
                </div>
            </div>
        </header>

        {/* MAIN CONTENT */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
            
            {/* TABS */}
            <div className="flex justify-center mb-8">
                <div className="bg-white/50 backdrop-blur-sm p-1 rounded-xl shadow-sm border border-slate-200 inline-flex">
                    <button onClick={() => setActiveTab('invoicing')} className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'invoicing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        Invoicing
                    </button>
                    {(isAdmin || isSuperuser) && (
                        <button onClick={() => setActiveTab('admin')} className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'admin' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            {isAdmin ? 'System Admin' : 'Projects & Team'}
                        </button>
                    )}
                </div>
            </div>

            {/* CONTENT AREA */}
            <div className="transition-all duration-300">
                {activeTab === 'invoicing' && (
                    <InvoicingModule currentProject={currentProject} />
                )}

                {activeTab === 'admin' && userProfile && (
                    <AdminDashboard profile={userProfile} />
                )}
            </div>
        </main>
    </div>
  );
}

export default App;
