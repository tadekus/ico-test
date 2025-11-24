
import React, { useState, useEffect } from 'react';
import Dropzone from './components/Dropzone';
import ResultCard from './components/ResultCard';
import InvoiceHistory from './components/InvoiceHistory';
import Auth from './components/Auth';
import { extractIcoFromDocument } from './services/geminiService';
import { FileData, ExtractionResult } from './types';
import { isSupabaseConfigured, signOut, supabase } from './services/supabaseService';
import { User } from '@supabase/supabase-js';

function App() {
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'extract' | 'history'>('extract');
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Configuration Status Check
  const configStatus = {
    gemini: !!process.env.API_KEY,
    supabase: isSupabaseConfigured
  };

  useEffect(() => {
    // Debug logging for deployment troubleshooting
    console.log("App Config Status:", { 
      Gemini: configStatus.gemini ? "Set" : "Missing",
      Supabase: configStatus.supabase ? "Set" : "Missing"
    });

    if (configStatus.supabase && supabase) {
      // Check active session
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        setIsLoadingSession(false);
      });

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });

      return () => subscription.unsubscribe();
    } else {
      setIsLoadingSession(false);
    }
  }, []);

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
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="text-center md:text-left space-y-2 flex-1">
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center justify-center md:justify-start gap-3">
                <div className="inline-flex items-center justify-center p-2 bg-indigo-600 rounded-lg shadow-md">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                IČO Extractor
              </h1>
              <p className="text-slate-600 text-sm md:text-base">
                Extract business details from PDF or Excel invoices using AI.
              </p>
            </div>
            
            {user && (
              <div className="flex items-center justify-center gap-4 bg-white py-2 px-4 rounded-full shadow-sm border border-slate-200">
                <div className="text-xs text-slate-500">
                  <span className="block font-medium text-slate-800">{user.email}</span>
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

        {/* Configuration Warning Banner */}
        {!configStatus.gemini && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row items-start gap-4 shadow-sm animate-pulse max-w-2xl mx-auto">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-sm font-semibold text-amber-800">Missing API Key</h3>
                <p className="text-sm text-amber-700 mt-1 mb-2">
                  To run the app, create a <code>.env</code> file in the project root (or set Environment Variables in Render) and add your <code>API_KEY</code>.
                </p>
              </div>
            </div>
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              className="whitespace-nowrap px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-medium rounded-lg transition-colors flex items-center"
            >
              Get Gemini Key
              <svg className="w-4 h-4 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}

        {/* Navigation Tabs */}
        {configStatus.supabase && (
          <div className="flex justify-center mb-6">
            <div className="bg-slate-100 p-1 rounded-lg inline-flex shadow-inner">
              <button
                onClick={() => setActiveTab('extract')}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  activeTab === 'extract'
                    ? 'bg-white text-indigo-600 shadow-sm transform scale-[1.02]'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Extractor
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  activeTab === 'history'
                    ? 'bg-white text-indigo-600 shadow-sm transform scale-[1.02]'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                My Invoices
              </button>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className={`transition-all duration-500 ease-in-out ${!configStatus.gemini ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
          
          {activeTab === 'extract' ? (
            <div className="max-w-2xl mx-auto">
              {!fileData && !isProcessing && (
                <div className="bg-white p-6 rounded-2xl shadow-xl shadow-slate-200/50 border border-white">
                  <Dropzone onFileLoaded={handleFileLoaded} disabled={!configStatus.gemini} />
                  <div className="mt-6 flex items-center justify-center space-x-6 text-sm text-slate-400">
                    <span className="flex items-center">
                      <span className={`w-2 h-2 rounded-full mr-2 ${configStatus.gemini ? 'bg-green-400' : 'bg-red-400'}`}></span>
                      Gemini AI
                    </span>
                    <span className="flex items-center">
                      <span className={`w-2 h-2 rounded-full mr-2 ${configStatus.supabase ? 'bg-green-400' : 'bg-slate-300'}`}></span>
                      Secure Database
                    </span>
                  </div>
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
                    <p className="text-slate-500">
                      Extracting IČO, company name, bank details, and calculating payment amounts.
                    </p>
                  </div>
                </div>
              )}

              {!isProcessing && result && (
                <ResultCard result={result} onReset={handleReset} />
              )}

              {!isProcessing && error && (
                <div className="bg-red-50 rounded-xl p-6 border border-red-100 flex items-start space-x-4 animate-shake">
                  <div className="flex-shrink-0 text-red-500 mt-1">
                     <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                     </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-red-800 font-semibold mb-1">Extraction Failed</h3>
                    <p className="text-red-600 text-sm">{error}</p>
                    <button 
                      onClick={handleReset}
                      className="mt-4 text-sm font-medium text-red-700 hover:text-red-900 underline"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="animate-fade-in">
              <InvoiceHistory />
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}

export default App;
