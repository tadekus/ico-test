
import React, { useState } from 'react';
import { ExtractionResult } from '../types';
import { saveExtractionResult, isSupabaseConfigured } from '../services/supabaseService';

interface ResultCardProps {
  result: ExtractionResult;
  onReset: () => void;
}

const ResultCard: React.FC<ResultCardProps> = ({ result, onReset }) => {
  const isFound = result.ico !== null && result.ico !== undefined;
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSave = async () => {
    setSaveStatus('saving');
    setErrorMessage(null);
    
    try {
      // For now, save without project ID (null). 
      // In a full implementation, you'd select the project via a dropdown here.
      await saveExtractionResult(result);
      setSaveStatus('success');
    } catch (err: any) {
      setSaveStatus('error');
      if (err.code === '42P01' || err.message?.includes('relation')) {
        setErrorMessage("Database tables missing. Please run the SQL setup script in Supabase.");
      } else if (err.code === '42501') {
         setErrorMessage("Permission denied. Check RLS policies.");
      } else {
        setErrorMessage(err.message || "Failed to save");
      }
    }
  };

  const formatCurrency = (amount: number | null | undefined, currency: string | null | undefined) => {
    if (amount === null || amount === undefined) return 'N/A';
    try {
      return new Intl.NumberFormat('cs-CZ', {
        style: 'currency',
        currency: currency || 'CZK',
      }).format(amount);
    } catch (e) {
      return `${amount} ${currency || ''}`;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden animate-fade-in-up">
      <div className={`h-2 w-full ${isFound ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-800">Extraction Result</h2>
          {result.confidence && (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              result.confidence > 0.8 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {Math.round(result.confidence * 100)}% Confidence
            </span>
          )}
        </div>

        {isFound ? (
          <div className="space-y-8">
            <div className="bg-slate-50 p-6 rounded-lg border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2 block">
                  Supplier IČO
                </label>
                <div className="flex items-center space-x-3">
                  <span className="text-3xl font-mono font-bold text-indigo-600 tracking-tight">
                    {result.ico}
                  </span>
                  <button 
                    onClick={() => { if (result.ico) navigator.clipboard.writeText(result.ico); }}
                    className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-indigo-600"
                  >
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 012 2v8a2 2 0 01-2 2h-8a2 2 0 01-2-2v-8a2 2 0 012-2z" />
                    </svg>
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2 block">
                  Company Name
                </label>
                <p className="text-lg text-slate-800 font-medium break-words">
                  {result.companyName || <span className="text-slate-400 italic">Not found</span>}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                 <div className="flex items-center mb-4 text-emerald-600">
                    <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="font-semibold">Amounts</h3>
                 </div>
                 <div className="space-y-3">
                   <div className="flex justify-between items-baseline border-b border-slate-100 pb-2">
                     <span className="text-sm text-slate-500">Total (With VAT)</span>
                     <span className="text-xl font-bold text-slate-900">
                       {formatCurrency(result.amountWithVat, result.currency)}
                     </span>
                   </div>
                   <div className="flex justify-between items-baseline">
                     <span className="text-sm text-slate-500">Without VAT</span>
                     <span className="text-base font-medium text-slate-700">
                       {formatCurrency(result.amountWithoutVat, result.currency)}
                     </span>
                   </div>
                 </div>
              </div>
              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                 <div className="flex items-center mb-4 text-blue-600">
                    <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    <h3 className="font-semibold">Bank Details</h3>
                 </div>
                 <div className="space-y-3">
                   <div>
                     <span className="text-xs text-slate-400 block mb-1">Account Number</span>
                     <p className="font-mono text-slate-800 bg-slate-50 p-1.5 rounded text-sm">
                       {result.bankAccount || <span className="text-slate-400 italic">Not found</span>}
                     </p>
                   </div>
                   {result.iban && (
                    <div>
                      <span className="text-xs text-slate-400 block mb-1">IBAN</span>
                      <p className="font-mono text-slate-800 bg-slate-50 p-1.5 rounded text-sm break-all">
                        {result.iban}
                      </p>
                    </div>
                   )}
                 </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <h3 className="text-lg font-medium text-slate-900 mb-1">IČO Not Found</h3>
            <p className="text-slate-500 max-w-xs mx-auto">
              We analyzed the document but couldn't confidently identify a Czech business ID number.
            </p>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
          <div className="flex flex-col">
             <div className="flex items-center space-x-3">
               {isSupabaseConfigured && isFound ? (
                  <button
                    onClick={handleSave}
                    disabled={saveStatus === 'saving' || saveStatus === 'success'}
                    className={`
                      flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all
                      ${saveStatus === 'success' 
                        ? 'bg-emerald-100 text-emerald-700 cursor-default' 
                        : saveStatus === 'error'
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg'}
                      ${saveStatus === 'saving' ? 'opacity-75 cursor-wait' : ''}
                    `}
                  >
                    {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'success' ? 'Saved' : 'Save Invoice'}
                  </button>
               ) : !isSupabaseConfigured && isFound && (
                   <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">Config Missing</span>
               )}
             </div>
             {saveStatus === 'error' && errorMessage && (
               <span className="text-xs text-red-500 mt-2">{errorMessage}</span>
             )}
          </div>
          <button onClick={onReset} className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors">
            Process another
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResultCard;
