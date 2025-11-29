
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, getCurrentUser, getUserProfile, signOut, fetchProjects, fetchAssignedProjects, getProjectRole, isSupabaseConfigured, checkMyPendingInvitation } from './services/supabaseService';
import { Profile, Project, ProjectRole, AppRole } from './types';
import Auth, { SetupAccount } from './components/Auth';
// import InvoicingModule from './components/InvoicingModule'; // Removed direct import
// import CostReportModule from './components/CostReportModule'; // Removed direct import
// import AdminDashboard from './components/AdminDashboard'; // Removed direct import
// import ApprovalModule from './components/ApprovalModule'; // Removed direct import

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
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSetupAccount, setShowSetupAccount] = useState(false);
  const [setupAccountEmail, setSetupAccountEmail] = useState<string | null>(null);
  const [initialInvoiceIdForCostReport, setInitialInvoiceIdForCostReport] = useState<number | null>(null);

  // --- Auth State Change Listener ---
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Supabase is not configured. Please check your .env variables.");
      setLoading(false);
      setAuthLoading(false);
      return;
    }

    if (!supabase) { // Add null check for supabase
      setError("Supabase client not initialized.");
      setLoading(false);
      setAuthLoading(false);
      return;
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event, session);
      if (session?.user) {
        setCurrentUser(session.user);
        setSetupAccountEmail(session.user.email ?? null); // Coalesce undefined to null
        // Check if user has a pending invitation to claim role
        const hasPendingInvitation = await checkMyPendingInvitation(session.user.email || '');
        if (hasPendingInvitation) {
            setShowSetupAccount(true);
        }
      } else {
        setCurrentUser(null);
        setProfile(null);
        setProjects([]);
        setCurrentProject(null);
        setUserRole(null);
        setShowSetupAccount(false);
        setSetupAccountEmail(null);
      }
      setAuthLoading(false);
    });

    // Initial check for session
    const checkSession = async () => {
      if (!supabase) return; // Add null check for supabase
      setAuthLoading(true); // Explicitly start loading state for initial check
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser(session.user);
        setSetupAccountEmail(session.user.email ?? null); // Coalesce undefined to null
      }
      setAuthLoading(false);
    };

    checkSession();

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // --- Load Profile & Projects ---
  useEffect(() => {
    const loadProfileAndProjects = async () => {
      if (!currentUser) {
        setLoading(false);
        setProfile(null);
        setProjects([]);
        setCurrentProject(null);
        setUserRole(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const userProfile = await getUserProfile(currentUser.id);
        if (!userProfile) {
          throw new Error("User profile not found. Please contact support.");
        }
        setProfile(userProfile);
        
        // If profile exists but full_name is missing, show setup account
        if (!userProfile.full_name && !showSetupAccount) {
            console.log("Profile missing full name, showing setup account.");
            setShowSetupAccount(true);
            setLoading(false);
            return;
        }

        // Fetch projects based on app role
        let fetchedProjects: Project[] = [];
        if (userProfile.app_role === 'admin') {
          fetchedProjects = await fetchProjects(); // Admins see all projects
          setActiveModule('admin'); // Default to admin dashboard
          setUserRole('admin'); // Set app-level role
        } else {
          // Superusers and regular users see projects they own or are assigned to
          fetchedProjects = await fetchAssignedProjects(currentUser.id);
          // Also fetch projects they created (owner) which might not be in assignments
          const ownedProjects = await fetchProjects(); // Fetch all and filter locally for created_by
          const uniqueOwnedProjects = ownedProjects.filter(p => p.created_by === currentUser?.id && !fetchedProjects.some(fp => fp.id === p.id));
          fetchedProjects = [...fetchedProjects, ...uniqueOwnedProjects];
          
          if (userProfile.app_role === 'superuser') {
              setUserRole('superuser'); // Set app-level role
          } else {
              // Default to 'user' for app_role, actual project_role will be fetched later
              setUserRole('user');
          }
          setActiveModule('invoicing'); // Default to invoicing for team members/superusers
        }
        
        setProjects(fetchedProjects);
        
        // Set initial project if none selected or if previously selected project is no longer available
        if (fetchedProjects.length > 0) {
            const storedProjectId = localStorage.getItem('currentProjectId');
            const storedProject = storedProjectId ? fetchedProjects.find(p => p.id === parseInt(storedProjectId)) : null;
            setCurrentProject(storedProject || fetchedProjects[0]);
        } else {
            setCurrentProject(null);
        }

      } catch (err: any) {
        console.error("Error loading profile or projects:", err);
        setError(err.message || "Failed to load user data.");
      } finally {
        setLoading(false);
      }
    };

    if (currentUser && !showSetupAccount) {
      loadProfileAndProjects();
    } else if (!currentUser) {
        setLoading(false); // No current user, not loading profile/projects
    }
  }, [currentUser, showSetupAccount]);

  // --- Update Project Role based on Current Project ---
  useEffect(() => {
    const updateProjectRole = async () => {
      if (profile && currentProject && profile.app_role === 'user') {
        const role = await getProjectRole(profile.id, currentProject.id);
        setUserRole(role);
      } else if (profile && profile.app_role !== 'user') {
          // If it's admin or superuser, their app_role is their 'role'
          setUserRole(profile.app_role);
      } else {
        setUserRole(null);
      }
    };
    updateProjectRole();
  }, [profile, currentProject]);

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
    // Clear local storage items that might persist state
    localStorage.removeItem('currentProjectId');
    sessionStorage.clear();
    // A full page reload is added here to ensure all React component states and
    // Supabase client instance are completely reset, resolving potential
    // "spinning wheel on logout" issues due to stale state or race conditions.
    window.location.reload();
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 text-red-700 p-4">
        <div className="text-center text-lg font-medium">
          <p className="mb-2">🚨 Supabase Configuration Error 🚨</p>
          <p>Please ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in your environment variables.</p>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Auth />;
  }

  if (showSetupAccount && setupAccountEmail) {
      return <SetupAccount email={setupAccountEmail} onSuccess={() => setShowSetupAccount(false)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 text-red-700 p-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg">Retry</button>
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
