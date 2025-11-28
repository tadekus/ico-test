
import React, { useState, useEffect } from 'react';
import InvoicingModule from './components/InvoicingModule';
import CostReportModule from './components/CostReportModule';
import AdminDashboard from './components/AdminDashboard';
import Auth, { SetupAccount } from './components/Auth';
import { Profile, Project, ProjectRole } from './types';
import { isSupabaseConfigured, signOut, supabase, getUserProfile, checkMyPendingInvitation, acceptInvitation, fetchAssignedProjects, getProjectRole } from './services/supabaseService';
import { User } from '@supabase/supabase-js';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [hasPendingInvite, setHasPendingInvite] = useState(false);

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

  // SYSTEM ROLES
  const isMasterUser = user?.email?.toLowerCase() === 'tadekus@gmail.com';
  const isAdmin = (userProfile?.app_role === 'admin') || isMasterUser;
  const isSuperuser = (userProfile?.app_role === 'superuser') || (userProfile?.is_superuser === true && !isAdmin);

  useEffect(() => {
    const initSession = async () => {
        try {
            if (configStatus.supabase && supabase) {
                const { data: { session } } = await supabase.auth.getSession();
                await handleUserSession(session?.user ?? null);

                const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
                    if (event === 'SIGNED_OUT') {
                         // Strictly clear everything
                         setUser(null);
                         setUserProfile(null);
                         setAssignedProjects([]);
                         setHasPendingInvite(false);
                         setCurrentProject(null);
                         setCurrentProjectRole(null);
                         setIsRedirecting(false);
                    } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                        handleUserSession(session?.user ?? null);
                    }
                });
                return () => subscription.unsubscribe();
            } else {
                setIsLoadingSession(false);
            }
        } catch (err) {
            console.error("Init Error", err);
            setIsLoadingSession(false);
        }
    };
    initSession();
  }, []);

  useEffect(() => {
    // Only update tabs if we are NOT in the middle of a redirect
    if (isRedirecting || isLoadingSession) return;

    if (isAdmin || isSuperuser) {
      setActiveTab('admin');
    } else if (currentProject && currentProjectRole === 'lineproducer') {
      // Default to invoicing if just logged in/switched project, but respect user choice if already on costreport
      if (activeTab !== 'costreport') {
          setActiveTab('invoicing');
      }
    } else {
      setActiveTab('dashboard');
    }
  }, [isAdmin, isSuperuser, currentProject, currentProjectRole, isRedirecting, isLoadingSession]);

  const handleUserSession = async (currentUser: User | null) => {
    try {
      if (currentUser?.id === user?.id && userProfile) {
          if (currentUser) setUser(currentUser);
          setIsLoadingSession(false);
          return;
      }

      setUser(currentUser);
      if (currentUser) {
        if (currentUser.email) {
          const isPending = await checkMyPendingInvitation(currentUser.email);
          if (isPending) { 
              setHasPendingInvite(true); 
              setIsLoadingSession(false); 
              return; 
          }
        }

        let profile = await getUserProfile(currentUser.id);
        
        // Master Override
        if (!profile && currentUser.email?.toLowerCase() === 'tadekus@gmail.com') {
            profile = { id: currentUser.id, email: currentUser.email, full_name: 'Master Admin (Ghost)', app_role: 'admin', created_at: new Date().toISOString() };
        }
        
        if (profile) setUserProfile(profile);

        // Load Projects with Retry Logic
        let projects = await fetchAssignedProjects(currentUser.id);
        
        // If regular user (Line Producer) has 0 projects, it might be a race condition.
        // Wait and retry once to prevent the "No Projects" flash.
        if (projects.length === 0 && profile?.app_role === 'user') {
             await new Promise(r => setTimeout(r, 800)); // Wait 800ms
             projects = await fetchAssignedProjects(currentUser.id);
        }

        setAssignedProjects(projects);
        
        // AUTO-REDIRECT LOGIC
        // If regular user (Line Producer), instantly pick first project and go there.
        if (projects.length > 0 && profile?.app_role === 'user') {
            setIsRedirecting(true);
            // Ensure we don't flash dashboard by keeping loading true effectively via isRedirecting
            try {
              await handleProjectChange(projects[0].id.toString(), projects, currentUser);
              // Explicitly set tab here to ensure it's ready before render
              setActiveTab('invoicing'); 
            } catch (err) {
              console.error("Auto-redirect failed", err);
            } finally {
              setIsRedirecting(false);
              setIsLoadingSession(false);
            }
        } else {
            setCurrentProject(null);
            setCurrentProjectRole(null);
            setIsLoadingSession(false);
        }

      } else {
        setUserProfile(null);
        setHasPendingInvite(false);
        setAssignedProjects([]);
        setCurrentProject(null);
        setCurrentProjectRole(null);
        setIsLoadingSession(false);
      }
    } catch (error) {
      console.error("Session loading error:", error);
      setIsLoadingSession(false);
    }
  };

  const handleProjectChange = async (projectId: string, projectsList = assignedProjects, targetUser: User | null = user) => {
      const proj = projectsList.find(p => p.id.toString() === projectId) || null;
      setCurrentProject(proj);
      
      // Clear deep linking when switching projects
      setTargetInvoiceId(null);
      
      if (proj && targetUser) {
          const role = await getProjectRole(targetUser.id, proj.id);
          setCurrentProjectRole(role);
      } else {
          setCurrentProjectRole(null);
      }
  };

  const handleInvoicingTabClick = () => {
      // If clicking "Invoicing" while already active, perform a "Reset to List"
      if (activeTab === 'invoicing' && currentProject) {
          // Clear the session storage persistence for this project's view state
          sessionStorage.removeItem(`viewingInvoice_${currentProject.id}`);
          // Force InvoicingModule to remount/reset by changing key
          setInvoiceModuleKey(prev => prev + 1);
          // Clear any deep links
          setTargetInvoiceId(null);
      }
      setActiveTab('invoicing');
  };

  const handleSetupSuccess = async () => {
    if (user?.email) { 
        await acceptInvitation(user.email); 
        setHasPendingInvite(false); 
        await handleSignOut(); // Force re-login after setup
        alert("Setup complete! Please sign in."); 
    }
  };

  const handleSignOut = async () => { 
      try {
        await signOut(); 
      } catch (e) {
        console.error("Signout error", e);
      } finally {
        // Force state clear
        setUser(null); 
        setUserProfile(null); 
        setHasPendingInvite(false); 
        setAssignedProjects([]);
        setCurrentProject(null);
        setActiveTab('dashboard');
      }
  };
  
  // Navigation Handler from Cost Report
  const handleNavigateToInvoice = (invoiceId: number) => {
      setTargetInvoiceId(invoiceId);
      setActiveTab('invoicing');
  };

  // DYNAMIC HEADER LABEL
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

  const canInvoice = currentProjectRole === 'lineproducer';

  // BLOCK RENDER UNTIL READY
  if (isLoadingSession || isRedirecting) return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="text-slate-400 text-sm">Loading workspace...</p>
          </div>
      </div>
  );
  
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

                            {/* LINE PRODUCER TAB SWITCHER */}
                            {canInvoice && (
                                <>
                                    <div className="h-6 w-px bg-slate-200"></div>
                                    <div className="flex bg-slate-100 p-1 rounded-lg">
                                        <button 
                                            onClick={handleInvoicingTabClick}
                                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'invoicing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            INVOICING
                                        </button>
                                        <button 
                                            onClick={() => setActiveTab('costreport')}
                                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'costreport' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            COST REPORT
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4">
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
                {activeTab === 'invoicing' && canInvoice && (
                    <InvoicingModule 
                        key={invoiceModuleKey}
                        currentProject={currentProject} 
                        initialInvoiceId={targetInvoiceId}
                    />
                )}
                
                {activeTab === 'costreport' && canInvoice && currentProject && (
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
