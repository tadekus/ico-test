
import React, { useState, useEffect } from 'react';
import Dropzone from './components/Dropzone';
import ResultCard from './components/ResultCard';
import InvoiceHistory from './components/InvoiceHistory';
import AdminDashboard from './components/AdminDashboard';
import Auth from './components/Auth';
import { extractIcoFromDocument } from './services/geminiService';
import { FileData, ExtractionResult, Profile } from './types';
import { isSupabaseConfigured, signOut, supabase, getUserProfile } from './services/supabaseService';
import { User } from '@supabase/supabase-js';

function App() {
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Navigation Tabs: 'extract' | 'history' | 'admin'
  const [activeTab, setActiveTab] = useState<string>('extract');
  
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Configuration Status Check
  const configStatus = {
    gemini: !!process.env.API_KEY,
    supabase: isSupabaseConfigured
  };

  useEffect(() => {
    if (configStatus.supabase && supabase) {
      // Check active session
      supabase.auth.getSession().then(({ data: { session } }) => {
        handleUserSession(session?.user ?? null);
      });

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        handleUserSession(session?.user ?? null);
      });

      return () => subscription.unsubscribe();
    } else {
      setIsLoadingSession(false);
    }
  }, []);

  const handleUserSession = async (currentUser: User | null) => {
    setUser(currentUser);
    if (currentUser) {
      const profile = await getUserProfile(currentUser.id);
      
      // Check if user is disabled
      if (profile?.is_disabled) {
        await signOut();
        alert("Your account has been disabled by an administrator.");
        setUser(null);
        setUserProfile(null);
        setIsLoadingSession(false);
        return;
      }
      
      setUserProfile(profile);
    } else {
      setUserProfile(null);
    }
    setIsLoadingSession(false);
  };

  const handleFileLoaded = async (data: FileData) => {
    setFileData(data);
    setIsProcessing(true);
    setError(null);

    try {
      const extractionResult = await extractIcoFromDocument(data);
      setResult(extractionResult);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to process the document.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setFileData(null);
    setResult(null);
    setError(null);
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    setUserProfile(null);
  };

  // Loading state
  if (isLoadingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // If Supabase is configured but user is not logged in, show Auth screen
  if (configStatus.supabase && !user) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="text-center md:text-left space-y-2 flex-1">
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center justify-center md:justify-start gap-3">
                <div className="inline-flex items-center justify-center p-2 bg-indigo-600 rounded-lg shadow-md">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                    </svg>
                </div>
                Movie Accountant
              </h1>
              <p className="text-slate-600 text-sm md:text-base">
                AI Invoicing & Project Management
              </p>
            </div>
            
            {user && (
              <div className="flex items-center justify-center gap-4 bg-white py-2 px-4 rounded-full shadow-sm border border-slate-200">
                <div className="text-xs text-slate-500">
                  <span className="block font-medium text-slate-800">{user.email}</span>
                  {userProfile?.is_superuser && (
                    <span className="text-indigo-600 font-bold">Administrator</span>
                  )}
                </div>
                <button 
                  onClick={handleSignOut}
                  className="text-xs font-medium text-red-500 hover:text-red-700 hover:underline"
                >
                  Sign Out
                </button>
              </div>
            )}
        </div>

        {/* Navigation Tabs */}
        {configStatus.supabase && (
          <div className="flex justify-center mb-6">
            <div className="bg-slate-100 p-1 rounded-lg inline-flex shadow-inner">
              <button
                onClick={() => setActiveTab('extract')}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  activeTab === 'extract' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Invoicing
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  activeTab === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                My Invoices
              </button>
              {userProfile?.is_superuser && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    activeTab === 'admin' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Admin & Projects
                </button>
              )}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className={`transition-all duration-500 ease-in-out ${!configStatus.gemini ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
          
          {activeTab === 'extract' && (
            <div className="max-w-2xl mx-auto">
              {!fileData && !isProcessing && (
                <div className="bg-white p-6 rounded-2xl shadow-xl shadow-slate-200/50 border border-white">
                  <Dropzone onFileLoaded={handleFileLoaded} disabled={!configStatus.gemini} />
                </div>
              )}

              {isProcessing && (
                <div className="bg-white rounded-2xl shadow-xl p-12 text-center border border-slate-100">
                  <div className="flex flex-col items-center">
                    <div className="relative w-16 h-16 mb-6">
                      <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                    </div>
                    <h3 className="text-xl font-semibold text-slate-800 mb-2">Analyzing Document...</h3>
                    <p className="text-slate-500">Processing financial data...</p>
                  </div>
                </div>
              )}

              {!isProcessing && result && (
                <ResultCard result={result} onReset={handleReset} />
              )}
              
              {!isProcessing && error && (
                <div className="bg-red-50 p-4 rounded text-red-600">{error}</div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="animate-fade-in">
              <InvoiceHistory />
            </div>
          )}

          {activeTab === 'admin' && user && userProfile?.is_superuser && (
            <AdminDashboard currentUserId={user.id} />
          )}
          
        </div>
      </div>
    </div>
  );
}

export default App;
