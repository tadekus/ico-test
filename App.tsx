import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, getCurrentUser, getUserProfile, signOut, fetchProjects, fetchAssignedProjects, getProjectRole, isSupabaseConfigured, checkMyPendingInvitation } from './services/supabaseService';
import { Profile, Project, ProjectRole, AppRole } from './types';
import Auth, { SetupAccount } from './components/Auth';
// Lazily load components for code splitting
const InvoicingModule = React.lazy(() => import('./components/InvoicingModule'));
const CostReportModule = React.lazy(() => import('./components/CostReportModule'));
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard'));
const ApprovalModule = React.lazy(() => import('./components/ApprovalModule'));


const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [userRole, setUserRole] = useState<ProjectRole | AppRole | null>(null); // project-specific or app-wide
  const [activeModule, setActiveModule] = useState<'invoicing' | 'costReport' | 'admin' | 'approval'>('invoicing');
  const [loading, setLoading] = useState(false); // General data loading (for profile/projects)
  const [authLoading, setAuthLoading] = useState(true); // Specific for initial auth state check
  const [error, setError] = useState<string | null>(null);
  const [showSetupAccount, setShowSetupAccount] = useState(false);
  const [setupAccountEmail, setSetupAccountEmail] = useState<string | null>(null);
  const [initialInvoiceIdForCostReport, setInitialInvoiceIdForCostReport] = useState<number | null>(null);

  // --- Auth State Change Listener (for *subsequent* changes) ---
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      // Handled by the initial auth check below
      return; 
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed (listener):", event, session);
      if (session?.user) {
        setCurrentUser(session.user);
        setSetupAccountEmail(session.user.email ?? null);
        try {
            const hasPendingInvitation = await checkMyPendingInvitation(session.user.email || '');
            setShowSetupAccount(hasPendingInvitation); 
        } catch (err) {
            console.error("Error checking pending invitation in listener:", err);
            setShowSetupAccount(false); // Default to false if check fails
        }
      } else { // Logged out
        setCurrentUser(null);
        setProfile(null);
        setProjects([]);
        setCurrentProject(null);
        setUserRole(null);
        setShowSetupAccount(false);
        setSetupAccountEmail(null);
      }
      // authLoading is NOT managed by this listener. It's managed by the initial useEffect.
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [isSupabaseConfigured]); // Only depend on config, supabase is stable reference


  // --- Initial Auth Check (to populate currentUser on first load/refresh) ---
  // This useEffect ensures authLoading is set false definitively after the initial check.
  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates on unmounted components

    const setupInitialAuth = async () => {
      setAuthLoading(true); // Ensure spinner is active during this initial async op
      setError(null); // Clear previous errors

      if (!isSupabaseConfigured) {
        if (isMounted) setError("Supabase is not configured. Please check your .env variables.");
        if (isMounted) setCurrentUser(null);
        if (isMounted) setAuthLoading(false); // CRITICAL: Dismiss even on config error
        return;
      }
      if (!supabase) {
        if (isMounted) setError("Supabase client not initialized.");
        if (isMounted) setCurrentUser(null);
        if (isMounted) setAuthLoading(false); // CRITICAL: Dismiss even on client init error
        return;
      }

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (!isMounted) return; // Prevent state update if component unmounted

        if (sessionError) {
          console.error("Error getting initial session:", sessionError);
          setError(sessionError.message || "Failed to retrieve session.");
          setCurrentUser(null);
        } else if (session?.user) {
          setCurrentUser(session.user);
          setSetupAccountEmail(session.user.email ?? null);
          // Initial check for pending invitation
          try {
            const hasPendingInvitation = await checkMyPendingInvitation(session.user.email || '');
            if (isMounted) setShowSetupAccount(hasPendingInvitation);
          } catch (err) {
            console.error("Error checking pending invitation during initial auth:", err);
            if (isMounted) setShowSetupAccount(false); // Default to false if check fails
          }
        } else {
          setCurrentUser(null);
          if (isMounted) setShowSetupAccount(false); // No user, no setup account
        }
      } catch (err: any) {
        console.error("Critical error during initial authentication session retrieval:", err);
        if (isMounted) {
            setError(err.message || "A critical error occurred during authentication initialization.");
            setCurrentUser(null);
        }
      } finally {
        if (isMounted) {
            setAuthLoading(false); // CRITICAL: ALWAYS dismiss authLoading when this initial check is done.
            console.log("Initial auth check finished, authLoading dismissed.");
        }
      }
    };

    // Run this initial setup function once on component mount
    setupInitialAuth();

    // Cleanup function for useEffect to handle unmounting
    return () => {
        isMounted = false;
    };
  }, [isSupabaseConfigured]); // Re-run only if Supabase config changes (should be stable)


  // --- Load Profile & Projects (runs AFTER authLoading is false and currentUser is resolved) ---
  useEffect(() => {
    let isMounted = true; // For cleanup

    const loadProfileAndProjects = async () => {
      if (!currentUser || !isMounted) {
        setLoading(false); // No current user, nothing to load.
        setProfile(null);
        setProjects([]);
        setCurrentProject(null);
        setUserRole(null);
        return;
      }

      setLoading(true); // Start loading for profile/projects
      setError(null);
      try {
        const userProfile = await getUserProfile(currentUser.id);
        
        if (!isMounted) return;

        // If no profile, or profile exists but full_name is missing, trigger setup account.
        // This check is now the authoritative one for showing setupAccount AFTER auth is complete.
        if (!userProfile || !userProfile.full_name) {
          console.log("Profile missing or incomplete. Forcing setup account.");
          setShowSetupAccount(true);
          setSetupAccountEmail(currentUser.email ?? null);
          setProfile(null); // Ensure profile is null during setup
          setProjects([]);
          setCurrentProject(null);
          setUserRole(null);
          // setLoading(false); -- Handled by finally block
          return;
        }

        // If we reach here, profile is valid and complete.
        setShowSetupAccount(false); // Ensure setup account is not shown
        setProfile(userProfile);

        let fetchedProjects: Project[] = [];
        if (userProfile.app_role === 'admin') {
          fetchedProjects = await fetchProjects(); // Admins see all projects
          setActiveModule('admin'); // Default to admin dashboard
          setUserRole('admin'); // Set app-level role
        } else {
          // Superusers and regular users see projects they own or are assigned to
          const assigned = await fetchAssignedProjects(currentUser.id);
          const owned = await fetchProjects(); 
          const uniqueOwnedProjects = owned.filter(p => p.created_by === currentUser?.id && !assigned.some(fp => fp.id === p.id));
          fetchedProjects = [...assigned, ...uniqueOwnedProjects];
          
          if (userProfile.app_role === 'superuser') {
              setUserRole('superuser');
          } else {
              setUserRole('user');
          }
          setActiveModule('invoicing');
        }
        
        if (isMounted) setProjects(fetchedProjects);
        
        if (fetchedProjects.length > 0) {
            const storedProjectId = localStorage.getItem('currentProjectId');
            const storedProject = storedProjectId ? fetchedProjects.find(p => p.id === parseInt(storedProjectId)) : null;
            if (isMounted) setCurrentProject(storedProject || fetchedProjects[0]);
        } else {
            if (isMounted) setCurrentProject(null);
        }

      } catch (err: any) {
        console.error("Error loading profile or projects:", err);
        if (isMounted) {
            setError(err.message || "Failed to load user data. Please ensure database setup is complete.");
            setProfile(null); // Clear profile on error
            setProjects([]);
            setCurrentProject(null);
            setUserRole(null);
        }
      } finally {
        if (isMounted) {
            setLoading(false); // IMPORTANT: Always dismiss main loading spinner here
        }
      }
    };

    // Trigger profile/project loading only if currentUser is set, authLoading is false,
    // AND we are not in the SetupAccount flow (showSetupAccount also means profile incomplete).
    if (currentUser && !authLoading && !showSetupAccount) {
      loadProfileAndProjects();
    } else if (!currentUser && !authLoading) { // If no current user AND authLoading is false, means we're truly logged out.
        setLoading(false); // Ensure main loading is also false.
        setProfile(null);
        setProjects([]);
        setCurrentProject(null);
        setUserRole(null);
    }
    
    return () => { isMounted = false; }; // Cleanup on unmount
  }, [currentUser, authLoading, showSetupAccount]); // Depend on relevant state changes

  // --- Update Project Role based on Current Project ---
  useEffect(() => {
    let isMounted = true; // For cleanup
    const updateProjectRole = async () => {
      if (!profile || !currentProject || profile.app_role === 'admin' || !isMounted) {
        if (isMounted && profile?.app_role) {
            setUserRole(profile.app_role); // Ensure admin role is set if no current project
        }
        return;
      }

      if (profile.app_role === 'user') { // Only for regular app users who might have project roles
        const role = await getProjectRole(profile.id, currentProject.id);
        if (isMounted) setUserRole(role);
      } else { // For superusers, their app_role is their effective role
          if (isMounted) setUserRole(profile.app_role);
      }
    };
    if (profile && currentProject && !loading) { // Only update if main loading is done
        updateProjectRole();
    } else if (profile && !currentProject && !loading && profile.app_role) {
        // If logged in, no project selected yet, set userRole to app_role
        if (isMounted) setUserRole(profile.app_role);
    }
    return () => { isMounted = false; };
  }, [profile, currentProject, loading]);

  // --- Handle Project Selection ---
  const handleSelectProject = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const projectId = parseInt(e.target.value);
    const selected = projects.find(p => p.id === projectId);
    if (selected) {
      setCurrentProject(selected);
      localStorage.setItem('currentProjectId', projectId.toString());
    }
  }, [projects]);

  // --- Handle Deep Linking from Cost Report ---
  const handleNavigateToInvoice = useCallback((invoiceId: number) => {
    setActiveModule('invoicing');
    setInitialInvoiceIdForCostReport(invoiceId);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    localStorage.removeItem('currentProjectId');
    sessionStorage.clear();
    window.location.reload(); // Force full page reload after signOut for clean state
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 text-red-700 p-4">
        <div className="text-center text-lg font-medium">
          <p className="mb-2">🚨 Supabase Configuration Error 🚨</p>
          <p>Please ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in your environment variables.</p>
          <p className="mt-4 text-sm">If you just created your project, it may take a moment for environment variables to propagate.</p>
        </div>
      </div>
    );
  }

  // Primary Auth Loading Spinner (for initial session check)
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // If Auth is done, but no user, show Auth component
  if (!currentUser) {
    return <Auth />;
  }

  // If user is authenticated, but profile is incomplete/missing, show SetupAccount
  if (showSetupAccount && setupAccountEmail) {
      return <SetupAccount email={setupAccountEmail} onSuccess={() => setShowSetupAccount(false)} />;
  }

  // Secondary Loading for profile & project data, after auth is confirmed and profile is setup
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // If there's an error after all loading is done (e.g. project data failed)
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 text-red-700 p-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg">Reload Application</button>
        </div>
      </div>
    );
  }
    
  const LoadingFallback = (
    <div className="flex justify-center items-center h-full min-h-[300px] bg-white rounded-xl shadow-lg border border-slate-200">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm p-4 border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold text-indigo-700">RASPLE2</h1>
            
            {/* Project Selector */}
            {profile?.app_role !== 'admin' && (projects.length > 0 ? (
              <div className="relative">
                <select
                  value={currentProject?.id || ''}
                  onChange={handleSelectProject}
                  className="block w-full pl-3 pr-10 py-2 text-sm border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md bg-white text-slate-700 shadow-sm transition-colors"
                  aria-label="Select Project"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-700">
                  <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            ) : (
                <span className="text-sm text-slate-500 italic">No projects available</span>
            ))}

            {/* Navigation Tabs */}
            <nav className="flex space-x-2">
              {profile?.app_role !== 'admin' && profile?.app_role !== 'superuser' && ( // Regular users, Line Producers, Accountants
                  <>
                    <button
                      onClick={() => setActiveModule('invoicing')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeModule === 'invoicing' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                      Invoicing
                    </button>
                    <button
                      onClick={() => setActiveModule('costReport')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeModule === 'costReport' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                      Cost Report
                    </button>
                    {userRole === 'producer' && ( // Only producer role for current project
                       <button
                          onClick={() => setActiveModule('approval')}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeModule === 'approval' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                          Approval
                        </button>
                    )}
                  </>
              )}
              { (profile?.app_role === 'admin' || profile?.app_role === 'superuser') && ( // Admins & Superusers
                 <button
                    onClick={() => setActiveModule('admin')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeModule === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    Admin
                  </button>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-sm text-right">
              <p className="font-semibold text-slate-800">{profile?.full_name || currentUser.email}</p>
              <p className="text-xs text-slate-500">
                {userRole && userRole !== 'user' ? (
                    <span className="capitalize">{userRole}</span>
                ) : (
                    <span>Team Member ({currentProject?.name})</span>
                )}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-indigo-700 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <Suspense fallback={LoadingFallback}>
          {activeModule === 'invoicing' && currentProject && <InvoicingModule key={currentProject.id} currentProject={currentProject} initialInvoiceId={initialInvoiceIdForCostReport} />}
          {activeModule === 'costReport' && currentProject && <CostReportModule key={currentProject.id} currentProject={currentProject} onNavigateToInvoice={handleNavigateToInvoice} />}
          {activeModule === 'admin' && profile && <AdminDashboard profile={profile} />}
          {activeModule === 'approval' && currentProject && <ApprovalModule key={currentProject.id} currentProject={currentProject} />}

          {/* Placeholder if no project is selected for invoicing/cost report */}
          {(activeModule === 'invoicing' || activeModule === 'costReport' || activeModule === 'approval') && !currentProject && profile?.app_role !== 'admin' && (
              <div className="py-20 text-center text-slate-500">
                  <h2 className="text-xl font-bold mb-2">No Project Selected</h2>
                  <p>Please select a project from the dropdown above to continue, or create a new one in the Admin dashboard.</p>
              </div>
          )}
        </Suspense>
      </main>
    </div>
  );
};

export default App;