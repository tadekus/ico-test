
import React, { useState, useEffect } from 'react';
import Dropzone from './Dropzone';
import InvoiceDetail from './InvoiceDetail';
import { FileData, Project, SavedInvoice } from '../types';
import { extractIcoFromDocument } from '../services/geminiService';
import { fetchInvoices } from '../services/supabaseService';

interface InvoicingModuleProps {
  currentProject: Project | null;
}

const InvoicingModule: React.FC<InvoicingModuleProps> = ({ currentProject }) => {
  const [stagedFiles, setStagedFiles] = useState<FileData[]>([]);
  const [savedInvoices, setSavedInvoices] = useState<SavedInvoice[]>([]);
  const [viewingFileId, setViewingFileId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load project history when project changes
  useEffect(() => {
    if (currentProject) {
      setLoadingHistory(true);
      fetchInvoices(currentProject.id)
        .then(setSavedInvoices)
        .catch(console.error)
        .finally(() => setLoadingHistory(false));
      
      // Clear staging on project switch
      setStagedFiles([]);
      setViewingFileId(null);
    }
  }, [currentProject?.id]);

  const handleFilesLoaded = async (files: FileData[]) => {
    setStagedFiles(prev => [...prev, ...files]);
    
    // Process one by one
    for (const file of files) {
        setStagedFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'analyzing' } : f));
        
        try {
            const result = await extractIcoFromDocument(file);
            setStagedFiles(prev => prev.map(f => f.id === file.id ? { 
                ...f, 
                status: 'ready', 
                extractionResult: result 
            } : f));
        } catch (err) {
            setStagedFiles(prev => prev.map(f => f.id === file.id ? { 
                ...f, 
                status: 'error', 
                error: 'Failed to analyze' 
            } : f));
        }
    }
  };

  const handleInvoiceSaved = (fileId: string) => {
    // Remove from staging
    setStagedFiles(prev => prev.filter(f => f.id !== fileId));
    setViewingFileId(null);
    
    // Refresh list
    if (currentProject) {
        fetchInvoices(currentProject.id).then(setSavedInvoices);
    }
  };

  const activeFile = stagedFiles.find(f => f.id === viewingFileId);

  // VIEW: DETAIL EDITOR
  if (viewingFileId && activeFile) {
      return (
          <InvoiceDetail 
             fileData={activeFile} 
             project={currentProject} 
             onBack={() => setViewingFileId(null)}
             onSaved={handleInvoiceSaved}
          />
      );
  }

  // VIEW: MAIN DASHBOARD
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
       {/* LEFT COLUMN: UPLOAD */}
       <div className="lg:col-span-1 space-y-6">
           <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
               <h3 className="font-bold text-slate-800 mb-4">Upload Invoices</h3>
               <Dropzone onFileLoaded={handleFilesLoaded} disabled={!currentProject} />
               {!currentProject && <p className="text-xs text-red-500 mt-2">Please select a project first.</p>}
           </div>
           
           {/* STAGING AREA */}
           {stagedFiles.length > 0 && (
               <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                   <div className="bg-indigo-50 px-6 py-3 border-b border-indigo-100 flex justify-between items-center">
                       <h3 className="font-bold text-indigo-900 text-sm">Drafts & Analysis</h3>
                       <span className="text-xs font-bold bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full">{stagedFiles.length}</span>
                   </div>
                   <div className="divide-y divide-slate-100">
                       {stagedFiles.map(file => (
                           <div key={file.id} 
                                onClick={() => file.status === 'ready' && setViewingFileId(file.id)}
                                className={`p-4 transition-colors flex items-center justify-between
                                    ${file.status === 'ready' ? 'hover:bg-slate-50 cursor-pointer' : 'opacity-70'}
                                `}
                           >
                               <div className="flex items-center gap-3 overflow-hidden">
                                   <div className={`w-2 h-2 rounded-full flex-shrink-0 
                                       ${file.status === 'analyzing' ? 'bg-amber-400 animate-pulse' : 
                                         file.status === 'ready' ? 'bg-emerald-500' : 'bg-red-500'}`} 
                                   />
                                   <div className="min-w-0">
                                       <p className="text-sm font-medium text-slate-900 truncate">{file.file.name}</p>
                                       {file.extractionResult ? (
                                           <p className="text-xs text-slate-500 truncate">
                                               {file.extractionResult.companyName || 'Unknown Supplier'} • {file.extractionResult.amountWithoutVat} {file.extractionResult.currency}
                                           </p>
                                       ) : (
                                           <p className="text-xs text-slate-400 italic">
                                               {file.status === 'analyzing' ? 'Extracting data...' : file.status}
                                           </p>
                                       )}
                                   </div>
                               </div>
                               {file.status === 'ready' && (
                                   <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                   </svg>
                               )}
                           </div>
                       ))}
                   </div>
               </div>
           )}
       </div>

       {/* RIGHT COLUMN: PROJECT INVOICE LIST */}
       <div className="lg:col-span-2 bg-white rounded-xl shadow-lg border border-slate-200 flex flex-col h-[600px]">
           <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
               <div>
                   <h3 className="font-bold text-slate-800">Project Invoices</h3>
                   <p className="text-xs text-slate-500">{currentProject ? currentProject.name : 'No Project Selected'}</p>
               </div>
               {loadingHistory && <div className="animate-spin w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full"></div>}
           </div>
           
           <div className="flex-1 overflow-auto">
               <table className="w-full text-sm text-left">
                   <thead className="bg-white text-slate-500 font-semibold sticky top-0 z-10 border-b border-slate-200">
                       <tr>
                           <th className="px-6 py-3 w-20">#</th>
                           <th className="px-6 py-3">Supplier</th>
                           <th className="px-6 py-3">Description</th>
                           <th className="px-6 py-3 text-right">Amount (Excl. VAT)</th>
                           <th className="px-6 py-3 text-right">VAT</th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                       {savedInvoices.map(inv => (
                           <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                               <td className="px-6 py-3 font-mono text-indigo-600 font-bold">
                                   #{inv.internal_id || '-'}
                               </td>
                               <td className="px-6 py-3">
                                   <div className="font-medium text-slate-900">{inv.company_name}</div>
                                   <div className="text-xs text-slate-500 font-mono">{inv.ico}</div>
                               </td>
                               <td className="px-6 py-3 text-slate-600 max-w-xs truncate">
                                   {inv.description || '-'}
                               </td>
                               <td className="px-6 py-3 text-right font-medium text-slate-900">
                                   {inv.amount_without_vat} {inv.currency}
                               </td>
                               <td className="px-6 py-3 text-right text-slate-500">
                                   {inv.amount_with_vat ? (inv.amount_with_vat - (inv.amount_without_vat || 0)).toFixed(2) : '-'}
                               </td>
                           </tr>
                       ))}
                       {savedInvoices.length === 0 && (
                           <tr>
                               <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                                   No invoices processed for this project yet.
                               </td>
                           </tr>
                       )}
                   </tbody>
               </table>
           </div>
       </div>
    </div>
  );
};

export default InvoicingModule;
