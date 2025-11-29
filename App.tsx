
import React, { useState, useEffect, useRef, useCallback } from 'react';
import InvoicingModule from './components/InvoicingModule';
import CostReportModule from './components/CostReportModule';
import AdminDashboard from './components/AdminDashboard';
import ApprovalModule from './components/ApprovalModule';
import Auth, { SetupAccount } from './components/Auth';
import { Profile, Project, ProjectRole } from './types';
import { isSupabaseConfigured, signOut, supabase, getUserProfile, checkMyPendingInvitation, acceptInvitation, fetchAssignedProjects, getProjectRole, fetchProjects } from './services/supabaseService';
import { User } from '@supabase/supabase-js';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true); // Tracks initial Supabase session check (should resolve once)
  const [isLoadingUserData, setIsLoadingUserData] = useState(false); // Tracks fetching profile, projects, etc.
  const [hasPendingInvite, setHasPendingInvite] = useState(false);
  const [error, setError] = useState<string | null>(null); // Global error state for app issues

  // PROJECT CONTEXT
  const [assignedProjects, setAssignedProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentProjectRole, setCurrentProjectRole] = useState<ProjectRole | null>(null);

  // TABS
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  
  // DEEP LINKING & VIEW CONTROL
  const [targetInvoiceId, setTargetInvoiceId] = useState<number | null>(null);
  const [invoiceModuleKey, setInvoiceModuleKey] = useState(0);

  const configStatus = { gemini: !!process.env.API_KEY, supabase: isSupabaseConfigured };
  const isMounted = useRef(true); // To prevent state updates on unmounted components

  // SYSTEM ROLES (Derived from userProfile, not user)
  const isMasterUser = userProfile?.email?.toLowerCase() === 'tadekus@gmail.com';
  const isAdmin = (userProfile?.app_role === 'admin') || isMasterUser;
  const isSuperuser = (userProfile?.app_role === 'superuser') || (userProfile?.is_superuser === true && !isAdmin);

  // --- Helper to manage user data (profile, projects) after auth session is known ---
  const loadUserData = useCallback(async (currentUser: User | null) => {
    if (!isMounted.current) return;

    setIsLoadingUserData(true); // Start loading user-specific data
    // Reset relevant states before loading new user data
    setUserProfile(null);
    setHasPendingInvite(false);
    setAssignedProjects([]);
    setCurrentProject(null);
    setCurrentProjectRole(null);
    setError(null); 

    if (!currentUser) {
      setUser(null);
      setIsLoadingUserData(false); // No user, so no user data to load
      return;
    }

    setUser(currentUser); // Update user state once confirmed
    
    try {
      // 1. Check for pending invitations
      let isPendingInvitation = false;
      if (currentUser.email) {
        try {
          isPendingInvitation = await checkMyPendingInvitation(currentUser.email);
          if (isMounted.current && isPendingInvitation) {
            setHasPendingInvite(true);
            setIsLoadingUserData(false); // Done loading user data, user needs setup
            return;
          }
        } catch (inviteError: any) {
          console.error("Error checking pending invitation:", inviteError);
          // Don't block loading if invitation check fails, assume no pending.
          if (isMounted.current) setError(inviteError.message || "Failed to check invitations.");
        }
      }

      // 2. Fetch User Profile
      let profile = await getUserProfile(currentUser.id);

      // Master Override (If no profile found for master admin, create a ghost one)
      if (!profile && currentUser.email?.toLowerCase() === 'tadekus@gmail.com') {
        profile = { id: currentUser.id, email: currentUser.email, full_name: 'Master Admin (Ghost)', app_role: 'admin', created_at: new Date().toISOString() };
        console.warn("Master Admin profile not found, using Ghost profile.");
      }
      
      if (isMounted.current && profile) {
          setUserProfile(profile);

          // 3. Fetch Projects (only for non-admin/superuser)
          // Derive roles again here for fresh calculation
          const currentUserIsMaster = currentUser.email?.toLowerCase() === 'tadekus@gmail.com';
          const currentUserIsAdmin = (profile.app_role === 'admin') || currentUserIsMaster;
          const currentUserIsSuperuser = (profile.app_role === 'superuser') || (profile.is_superuser === true && !currentUserIsAdmin);

          if (!currentUserIsAdmin && !currentUserIsSuperuser) {
              let projects = await fetchAssignedProjects(currentUser.id);
              if (isMounted.current) {
                  setAssignedProjects(projects);
                  // Auto-select first project for regular users
                  if (projects.length > 0) {
                      try {
                          await handleProjectChange(projects[0].id.toString(), projects, currentUser);
                      } catch (projChangeError) {
                          console.error("Auto-project select failed", projChangeError);
                          if (isMounted.current) setError("Failed to auto-select project.");
                      }
                  } else {
                      setCurrentProject(null); // No projects assigned
                      setCurrentProjectRole(null);
                  }
              }
          } else {
              // For Admin/Superuser, fetch ALL projects to manage
              const allProjects = await fetchProjects();
              if (isMounted.current) setAssignedProjects(allProjects);
              setCurrentProject(null); // Admin/Superuser typically don't have a 'current' project in the same way
              setCurrentProjectRole(null);
          }
      } else if (!profile && isMounted.current) {
          // If user exists but no profile record, trigger setup account flow
          // (Only if not a pending invitation that's already handled, and not master admin)
          if (!isPendingInvitation && currentUser.email?.toLowerCase() !== 'tadekus@gmail.com') { 
              setHasPendingInvite(true); // Use this to signify "needs setup" regardless of invite status
          }
      }
    } catch (loadError: any) {
      console.error("Error loading user data:", loadError);
      if (isMounted.current) setError(loadError.message || "Failed to load user data.");
    } finally {
      if (isMounted.current) setIsLoadingUserData(false); // Always stop loading user-specific data
    }
  }, [configStatus.supabase]); // Dependencies updated to reflect parameters and remove redundant state dependencies

  // --- EFFECT 1: Initial Session Check on Mount ---
  useEffect(() => {
    isMounted.current = true; // Set ref on mount

    const initSession = async () => {
      try {
        if (!configStatus.supabase || !supabase) {
          console.warn("Supabase not configured. Skipping session check.");
          if (isMounted.current) setIsLoadingSession(false);
          return;
        }

        setIsLoadingSession(true); // Ensure initial session spinner is active
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("Error fetching initial session:", sessionError);
          if (isMounted.current) setError(sessionError.message || "Failed to fetch initial session.");
        }
        
        // After initial session status is known, dismiss the session loading spinner
        if (isMounted.current) setIsLoadingSession(false);

        // Then, proceed to load user-specific data
        await loadUserData(session?.user ?? null);
        
      } catch (err: any) {
        console.error("Error in initSession:", err);
        if (isMounted.current) setError(err.message || "Failed during initial session setup.");
      } finally {
        if (isMounted.current) setIsLoadingSession(false); // Double-ensure initial session loading is off
      }
    };

    initSession();

    return () => {
      isMounted.current = false; // Cleanup ref on unmount
    };
  }, [loadUserData, configStatus.supabase]);

  // --- EFFECT 2: Supabase Auth State Change Listener ---
  useEffect(() => {
    if (!configStatus.supabase || !supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted.current) return;
      console.log("Auth State Change:", event, session?.user?.email);

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          // On auth change, re-load user data; loadUserData manages its own loading state (isLoadingUserData)
          await loadUserData(session?.user ?? null);
      } else if (event === 'SIGNED_OUT') {
          // Explicit sign-out or session invalidation; reset all relevant states
          setUser(null);
          setUserProfile(null);
          setAssignedProjects([]);
          setHasPendingInvite(false);
          setCurrentProject(null);
          setCurrentProjectRole(null);
          setIsLoadingUserData(false); // Ensure user data loading is off
          setIsLoadingSession(false); // Ensure initial session loading is off (should already be false)
          setError(null); // Clear any errors
      }
    });

    return () => subscription.unsubscribe();
  }, [loadUserData, configStatus.supabase]);


  const handleProjectChange = useCallback(async (projectId: string, projectsList = assignedProjects, targetUser: User | null = user) => {
      if (!targetUser || !isMounted.current) return;
      
      const proj = projectsList.find(p => p.id.toString() === projectId) || null;
      setCurrentProject(proj);
      setTargetInvoiceId(null); // Clear any deep-linked invoice when project changes
      
      if (proj) {
          try {
              const role = await getProjectRole(targetUser.id, proj.id);
              if (isMounted.current) setCurrentProjectRole(role);
          } catch (roleError: any) {
              console.error("Error fetching project role:", roleError);
              if (isMounted.current) setError(roleError.message || "Failed to get project role.");
              if (isMounted.current) setCurrentProjectRole(null);
          }
      } else {
          if (isMounted.current) setCurrentProjectRole(null);
      }
  }, [assignedProjects, user]); // Depend on assignedProjects and user for stability

  const handleInvoicingTabClick = () => {
      if (activeTab === 'invoicing' && currentProject) {
          sessionStorage.removeItem(`viewingInvoice_${currentProject.id}`);
          setInvoiceModuleKey(prev => prev + 1); // Force remount of InvoicingModule
          setTargetInvoiceId(null); // Clear deep-linked invoice for fresh view
      }
      setActiveTab('invoicing');
  };

  const handleSetupSuccess = useCallback(async () => {
    if (user?.email && isMounted.current) { 
        try {
            await acceptInvitation(user.email); 
            // After successful setup, re-load user data to update profile/roles
            // loadUserData will manage setIsLoadingUserData
            await loadUserData(user); 
            if (isMounted.current) setHasPendingInvite(false); // Clear setup state
        } catch (setupError: any) {
            console.error("Account setup success handler error:", setupError);
            if (isMounted.current) setError(setupError.message || "Account setup failed to finalize.");
        }
    }
  }, [user, loadUserData]);

  const handleSignOut = useCallback(async () => { 
      try {
        await signOut(); 
        // Explicitly reset states here for immediate UI feedback.
        // The onAuthStateChange listener will also fire, reinforcing this.
        if (isMounted.current) {
            setUser(null);
            setUserProfile(null);
            setAssignedProjects([]);
            setHasPendingInvite(false);
            setCurrentProject(null);
            setCurrentProjectRole(null);
            setIsLoadingUserData(false);
            setIsLoadingSession(false); // Ensure initial loading is off
            setError(null);
            window.location.reload(); // Force full page reload for complete state clear
        }
      } catch (e) {
        console.error("Signout error", e);
        if (isMounted.current) setError((e as Error).message || "Signout failed.");
      }
  }, []);
  
  const handleNavigateToInvoice = useCallback((invoiceId: number) => {
      setTargetInvoiceId(invoiceId);
      // Determine tab based on user's current effective role for the project, not global app_role
      // This logic should ideally be more nuanced if roles vary per project for a single user
      if (currentProjectRole === 'lineproducer') setActiveTab('invoicing');
      if (currentProjectRole === 'producer') setActiveTab('approval');
  }, [currentProjectRole]); // Depend on currentProjectRole

  let headerRole = 'User';
  if (currentProjectRole) {
      switch(currentProjectRole) {
          case 'lineproducer': headerRole = 'Line Producer'; break;
          case 'producer': headerRole = 'Producer'; break;
          case 'accountant': headerRole = 'Accountant'; break;
      }
  } else if (isAdmin) {
      headerRole = 'Administrator';
  } else if (isSuperuser) {
      headerRole = 'Superuser';
  }

  const isLineProducer = currentProjectRole === 'lineproducer';
  const isProducer = currentProjectRole === 'producer';

  // --- CONDITIONAL RENDERING ---
  // 1. Critical configuration missing
  if (!configStatus.gemini) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 text-red-800 p-4">
        <p className="text-center font-medium">
          Error: Gemini API Key is missing. Please configure `API_KEY` environment variable.
        </p>
      </div>
    );
  }
  if (!configStatus.supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 text-red-800 p-4">
        <p className="text-center font-medium">
          Error: Supabase URL or Anon Key is missing. Please configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` environment variables.
        </p>
      </div>
    );
  }

  // 2. Initial session loading spinner
  if (isLoadingSession) return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="text-slate-400 text-sm">Loading workspace...</p>
          </div>
      </div>
  );
  
  // 3. Authentication (login/signup) if no user session
  if (!user) return <Auth />;

  // 4. Account setup if invited user has no full_name or profile
  // This state is set by loadUserData and cleared by handleSetupSuccess
  if (hasPendingInvite && user?.email) return <SetupAccount email={user.email} onSuccess={handleSetupSuccess} />;
  
  // 5. Loading user profile/projects (after initial session, before main app)
  if (isLoadingUserData) return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="text-slate-400 text-sm">Fetching user data...</p>
          </div>
      </div>
  );

  // 6. Main Application Content
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/50 flex flex-col">
        {/* TOP BAR */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-2">
                        <div className="bg-indigo-600 rounded p-1.5"><svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
                        <div>
                            <span className="font-bold text-slate-800 text-lg tracking-tight block leading-none">RASPLE2</span>
                            <span className="text-[10px] text-slate-400 font-medium tracking-wide">powered by Ministerstvo Kouzel</span>
                        </div>
                    </div>

                    {!isAdmin && !isSuperuser && (
                        <div className="hidden md:flex items-center gap-4 border-l border-slate-200 pl-6 ml-6">
                            <div className="flex items-center gap-2">
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

                            {isLineProducer && (
                                <>
                                    <div className="h-6 w-px bg-slate-200"></div>
                                    <div className="flex bg-slate-100 p-1 rounded-lg">
                                        <button onClick={handleInvoicingTabClick} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'invoicing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>INVOICING</button>
                                        <button onClick={() => setActiveTab('costreport')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'costreport' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>COST REPORT</button>
                                    </div>
                                </>
                            )}
                            
                            {isProducer && (
                                <>
                                    <div className="h-6 w-px bg-slate-200"></div>
                                    <div className="flex bg-slate-100 p-1 rounded-lg">
                                        <button onClick={() => setActiveTab('approval')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'approval' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>APPROVAL</button>
                                        <button onClick={() => setActiveTab('costreport')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'costreport' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>COST REPORT</button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    {error && (
                        <div className="text-red-500 text-xs px-2 py-1 bg-red-100 rounded-lg">
                            {error}
                        </div>
                    )}
                    <div className="text-right hidden sm:block">
                        <div className="text-sm font-medium text-slate-900">{userProfile?.full_name || user?.email}</div>
                        <div className="text-xs text-indigo-600 font-bold uppercase tracking-wider flex justify-end items-center gap-1">
                             <span>[ {headerRole} ]</span>
                        </div>
                    </div>
                    <button onClick={handleSignOut} className="text-slate-400 hover:text-red-500 transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </button>
                </div>
            </div>
        </header>

        {/* MAIN CONTENT */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
            
            {(isAdmin || isSuperuser) && (
                <div className="flex justify-center mb-8">
                    <div className="bg-white/50 backdrop-blur-sm p-1 rounded-xl shadow-sm border border-slate-200 inline-flex">
                        <button onClick={() => setActiveTab('admin')} className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'admin' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            {isAdmin ? 'System Admin' : 'Projects & Team'}
                        </button>
                    </div>
                </div>
            )}

            <div className="transition-all duration-300">
                {activeTab === 'invoicing' && isLineProducer && (
                    <InvoicingModule 
                        key={invoiceModuleKey}
                        currentProject={currentProject} 
                        initialInvoiceId={targetInvoiceId}
                    />
                )}
                
                {activeTab === 'approval' && isProducer && currentProject && (
                    <ApprovalModule currentProject={currentProject} />
                )}
                
                {activeTab === 'costreport' && (isLineProducer || isProducer) && currentProject && (
                    <CostReportModule 
                        currentProject={currentProject} 
                        onNavigateToInvoice={handleNavigateToInvoice}
                    />
                )}

                {activeTab === 'admin' && userProfile && (
                    <AdminDashboard profile={userProfile} />
                )}

                {/* EMPTY STATE / PROJECT SELECTOR (Replaces Overview) */}
                {activeTab === 'dashboard' && !isAdmin && !isSuperuser && (
                    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                        {assignedProjects.length === 0 ? (
                             <>
                                <div className="inline-flex p-6 bg-slate-50 rounded-full mb-6">
                                    <svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                    </svg>
                                </div>
                                <h2 className="text-xl font-bold text-slate-800 mb-2">No Projects Assigned</h2>
                                <p className="text-slate-500 max-w-sm mx-auto">
                                    You are not currently assigned to any active projects. Contact your Producer.
                                </p>
                             </>
                        ) : (
                            <>
                                <div className="inline-flex p-6 bg-indigo-50 rounded-full mb-6">
                                    <svg className="w-12 h-12 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                    </svg>
                                </div>
                                <h2 className="text-2xl font-bold text-slate-800 mb-2">Select a Project</h2>
                                <p className="text-slate-500 mb-8 max-w-sm mx-auto">
                                    Select a project from the top menu to access invoices.
                                </p>
                                <select 
                                    value=""
                                    onChange={(e) => handleProjectChange(e.target.value)}
                                    className="bg-white border border-slate-300 text-slate-700 text-lg rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-64 p-3 shadow-sm"
                                >
                                    <option value="" disabled>Choose Project...</option>
                                    {assignedProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </>
                        )}
                    </div>
                )}
            </div>
        </main>
    </div>
  );
}

export default App;
