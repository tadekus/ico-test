
import React, { useState, useEffect, useRef } from 'react';
import Dropzone from './Dropzone';
import InvoiceDetail from './InvoiceDetail';
import { FileData, Project, SavedInvoice, Budget } from '../types';
import { extractIcoFromDocument } from '../services/geminiService';
import { fetchInvoices, saveExtractionResult, uploadBudget, setBudgetActive, fetchProjects, checkDuplicateInvoice, deleteInvoice } from '../services/supabaseService';

interface InvoicingModuleProps {
  currentProject: Project | null;
  initialInvoiceId?: number | null;
}

const InvoicingModule: React.FC<InvoicingModuleProps> = ({ currentProject, initialInvoiceId }) => {
  const [stagedFiles, setStagedFiles] = useState<FileData[]>([]);
  const [savedInvoices, setSavedInvoices] = useState<SavedInvoice[]>([]);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  
  // List View State
  const [activeListTab, setActiveListTab] = useState<'processing' | 'final_approved'>('processing');
  
  // Budget Management State
  const [budgetList, setBudgetList] = useState<Budget[]>([]);
  const [uploadingBudget, setUploadingBudget] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Track last project ID to prevent redundant re-fetching on focus/renders
  const lastLoadedProjectId = useRef<number | null>(null);

  // EFFECT 1: Handle Project Switching (Fetching Invoices & Resetting View)
  useEffect(() => {
    if (currentProject && currentProject.id !== lastLoadedProjectId.current) {
        lastLoadedProjectId.current = currentProject.id;
        
        setLoadingHistory(true);
        fetchInvoices(currentProject.id)
            .then(setSavedInvoices)
            .catch(console.error)
            .finally(() => setLoadingHistory(false));
        
        setStagedFiles([]);
        
        // Restore view state from session storage if available
        const storedId = sessionStorage.getItem(`viewingInvoice_${currentProject.id}`);
        if (storedId) {
             setViewingInvoiceId(parseInt(storedId));
        } else {
             setViewingInvoiceId(null);
        }
        
        // Init budgets as well
        if(currentProject.budgets) {
            setBudgetList(currentProject.budgets);
        }
    }
  }, [currentProject?.id]); // Only depend on ID change

  // EFFECT 1.5: Handle Deep Linking (from Cost Report)
  useEffect(() => {
      if (initialInvoiceId && initialInvoiceId !== viewingInvoiceId) {
          setViewingInvoiceId(initialInvoiceId);
      }
  }, [initialInvoiceId]);

  // EFFECT 2: Handle Budget Updates (Sync budget list without resetting view)
  useEffect(() => {
      if (currentProject?.budgets) {
          setBudgetList(currentProject.budgets);
      }
  }, [currentProject?.budgets]);

  // EFFECT 3: Persist View State
  useEffect(() => {
      if (currentProject) {
          if (viewingInvoiceId) {
              sessionStorage.setItem(`viewingInvoice_${currentProject.id}`, viewingInvoiceId.toString());
          } else {
              sessionStorage.removeItem(`viewingInvoice_${currentProject.id}`);
          }
      }
  }, [viewingInvoiceId, currentProject?.id]);

  const handleFilesLoaded = async (files: FileData[]) => {
    setStagedFiles(prev => [...prev, ...files]);
    
    // Process one by one
    for (const file of files) {
        setStagedFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'analyzing' } : f));
        
        try {
            const result = await extractIcoFromDocument(file);
            
            // Auto-save as draft if in project
            if (currentProject) {
                // Check for duplicate BEFORE saving
                const isDuplicate = await checkDuplicateInvoice(
                    currentProject.id, 
                    result.ico, 
                    result.variableSymbol || null,
                    result.amountWithVat || null
                );

                if (isDuplicate) {
                    setStagedFiles(prev => prev.map(f => f.id === file.id ? { 
                        ...f, 
                        status: 'error', 
                        error: 'Duplicate Invoice' 
                    } : f));
                    
                    // Auto-remove error from list after 10 seconds
                    setTimeout(() => {
                        setStagedFiles(prev => prev.filter(f => f.id !== file.id));
                    }, 10000);
                    
                    continue; // Skip processing this file further
                }

                await saveExtractionResult(result, currentProject.id, 'draft', file.base64);
                // Refresh list
                const updatedInvoices = await fetchInvoices(currentProject.id);
                setSavedInvoices(updatedInvoices);
                // Remove from staging since it's now in the invoice list
                setStagedFiles(prev => prev.filter(f => f.id !== file.id));
            } else {
                setStagedFiles(prev => prev.map(f => f.id === file.id ? { 
                    ...f, 
                    status: 'ready', 
                    extractionResult: result 
                } : f));
            }

        } catch (err: any) {
            setStagedFiles(prev => prev.map(f => f.id === file.id ? { 
                ...f, 
                status: 'error', 
                error: err.message || 'Failed to analyze' 
            } : f));
        }
    }
  };

  const handleInvoiceUpdated = async (invoiceId: number, nextInvoiceId?: number | null) => {
    if (currentProject) {
        // Refresh data in background
        const updatedInvoices = await fetchInvoices(currentProject.id);
        setSavedInvoices(updatedInvoices);
    }
    
    // Navigation Logic: If next ID provided (Auto-advance), go there. Otherwise close.
    if (nextInvoiceId) {
        setViewingInvoiceId(nextInvoiceId);
    } else {
        setViewingInvoiceId(null);
    }
  };
  
  const handleDeleteInvoice = async (e: React.MouseEvent, id: number) => {
      e.stopPropagation(); // Prevent opening detail view
      if (!window.confirm("Are you sure you want to permanently delete this invoice?")) return;
      try {
          await deleteInvoice(id);
          if (currentProject) {
              const updatedInvoices = await fetchInvoices(currentProject.id);
              setSavedInvoices(updatedInvoices);
          }
      } catch (err: any) {
          alert("Failed to delete: " + err.message);
      }
  };

  const formatAmount = (amount: number | null | undefined, currency: string | null) => {
      if (amount === null || amount === undefined) return '-';
      const curr = currency || 'CZK';
      // Format 1000000 -> 1 000 000.00 (spaces as thousand separator)
      const formattedNum = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      return `${formattedNum} ${curr}`;
  };

  // BUDGET HANDLERS
  const handleBudgetFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !currentProject) return;
    const file = e.target.files[0];
    setUploadingBudget(true);
    try {
        const text = await file.text();
        await uploadBudget(currentProject.id, file.name, text);
        alert(`Budget ${file.name} uploaded successfully!`);
        // Refresh project to get updated budget list
        const allProjs = await fetchProjects(); 
        const updatedProj = allProjs.find(p => p.id === currentProject.id);
        if(updatedProj && updatedProj.budgets) setBudgetList(updatedProj.budgets);
        
    } catch (err: any) {
        alert("Failed to upload: " + err.message);
    } finally {
        setUploadingBudget(false);
        if(fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleToggleBudgetActive = async (budgetId: number) => {
      if(!currentProject) return;
      try {
          await setBudgetActive(currentProject.id, budgetId);
          setBudgetList(prev => prev.map(b => ({ ...b, is_active: b.id === budgetId })));
      } catch(err: any) {
          alert("Error: " + err.message);
      }
  };

  const activeInvoice = savedInvoices.find(inv => inv.id === viewingInvoiceId);
  
  // Find the NEXT draft invoice for the "Approve & Next" workflow
  const draftInvoices = savedInvoices.filter(inv => inv.status === 'draft' && inv.id !== viewingInvoiceId);
  const nextDraftId = draftInvoices.length > 0 ? draftInvoices[0].id : null;

  // Filter Invoices based on Tab
  const displayedInvoices = savedInvoices.filter(inv => {
      if (activeListTab === 'processing') {
          // Show Draft, Approved (Pending Producer), and Rejected
          return ['draft', 'approved', 'rejected'].includes(inv.status);
      } else {
          // Show Final Approved only
          return inv.status === 'final_approved';
      }
  });

  // Map SavedInvoice to FileData structure for InvoiceDetail
  const mappedFileData: FileData | null = activeInvoice ? {
      id: activeInvoice.id.toString(),
      file: new File([], "Stored Invoice"), // Placeholder
      type: 'pdf', 
      status: 'saved',
      base64: activeInvoice.file_content || undefined,
      extractionResult: {
          ico: activeInvoice.ico,
          companyName: activeInvoice.company_name,
          bankAccount: activeInvoice.bank_account,
          iban: activeInvoice.iban,
          amountWithVat: activeInvoice.amount_with_vat,
          amountWithoutVat: activeInvoice.amount_without_vat,
          currency: activeInvoice.currency,
          variableSymbol: activeInvoice.variable_symbol,
          description: activeInvoice.description,
          confidence: activeInvoice.confidence,
          rawText: activeInvoice.raw_text || undefined
      }
  } : null;

  // VIEW: DETAIL EDITOR
  if (viewingInvoiceId && activeInvoice && mappedFileData) {
      return (
          <InvoiceDetail 
             invoice={activeInvoice}
             fileData={mappedFileData}
             project={currentProject}
             nextDraftId={nextDraftId}
             onBack={() => setViewingInvoiceId(null)}
             onSaved={(nextId) => handleInvoiceUpdated(viewingInvoiceId, nextId)}
          />
      );
  }

  // VIEW: MAIN DASHBOARD
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
       {/* LEFT COLUMN: UPLOAD (1/4 width) */}
       <div className="lg:col-span-1 space-y-4">
           <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
               <h3 className="font-bold text-slate-800 mb-3 text-sm">Upload Invoices</h3>
               <Dropzone onFileLoaded={handleFilesLoaded} disabled={!currentProject} />
               {!currentProject && <p className="text-[10px] text-red-500 mt-1">Select a project first.</p>}
           </div>
           
           {/* UPLOAD PROGRESS AREA */}
           {stagedFiles.length > 0 && (
               <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                   <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100 flex justify-between items-center">
                       <h3 className="font-bold text-indigo-900 text-xs">Processing Queue</h3>
                       <span className="text-[10px] font-bold bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded-full">{stagedFiles.length}</span>
                   </div>
                   <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                       {stagedFiles.map(file => (
                           <div key={file.id} className="p-3 flex items-center justify-between opacity-80">
                               <div className="flex items-center gap-2 overflow-hidden">
                                   <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 
                                       ${file.status === 'analyzing' ? 'bg-amber-400 animate-pulse' : 
                                         file.status === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`} 
                                   />
                                   <div className="min-w-0">
                                       <p className="text-xs font-medium text-slate-900 truncate">{file.file.name}</p>
                                       <p className={`text-[10px] italic ${file.status === 'error' ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                                            {file.status === 'analyzing' ? 'Extracting...' : 
                                             file.status === 'error' ? (file.error || 'Error') : 'Saved'}
                                       </p>
                                   </div>
                               </div>
                           </div>
                       ))}
                   </div>
               </div>
           )}
       </div>

       {/* RIGHT COLUMN: PROJECT INVOICE LIST (3/4 width) */}
       <div className="lg:col-span-3 bg-white rounded-xl shadow-lg border border-slate-200 flex flex-col h-[750px]">
           <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
               <div className="flex items-center gap-4">
                   <div>
                       <h3 className="font-bold text-slate-800">Project Invoices</h3>
                       <p className="text-xs text-slate-500">{currentProject ? currentProject.name : 'No Project Selected'}</p>
                   </div>
                   <div className="flex bg-white rounded-lg p-1 border border-slate-200 ml-4">
                        <button 
                            onClick={() => setActiveListTab('processing')}
                            className={`px-3 py-1 text-xs font-bold rounded transition-colors ${activeListTab === 'processing' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            Processing ({savedInvoices.filter(i => ['draft', 'approved', 'rejected'].includes(i.status)).length})
                        </button>
                        <button 
                            onClick={() => setActiveListTab('final_approved')}
                            className={`px-3 py-1 text-xs font-bold rounded transition-colors ${activeListTab === 'final_approved' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            Approved ({savedInvoices.filter(i => i.status === 'final_approved').length})
                        </button>
                   </div>
               </div>
               
               <div className="flex items-center gap-4">
                   {/* BUDGET SETTINGS BUTTON */}
                   <button onClick={() => setShowBudgetModal(true)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded flex items-center gap-1">
                       <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                       Budget Settings
                   </button>
                   {loadingHistory && <div className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full"></div>}
               </div>
           </div>
           
           <div className="flex-1 overflow-auto">
               <table className="w-full text-sm text-left">
                   <thead className="bg-white text-slate-500 font-semibold sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                       <tr>
                           <th className="px-6 py-3 w-16 whitespace-nowrap">#</th>
                           <th className="px-6 py-3 w-24 whitespace-nowrap">Status</th>
                           <th className="px-6 py-3 whitespace-nowrap">Supplier</th>
                           <th className="px-6 py-3 whitespace-nowrap">Description</th>
                           <th className="px-6 py-3 text-right whitespace-nowrap">Base Amount</th>
                           <th className="px-6 py-3 text-right w-12"></th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                       {displayedInvoices.map(inv => (
                           <tr key={inv.id} 
                               onClick={() => setViewingInvoiceId(inv.id)}
                               className={`hover:bg-slate-50 transition-colors cursor-pointer group ${inv.status === 'rejected' ? 'bg-red-50 border-red-200' : ''}`}
                           >
                               <td className="px-6 py-3 font-mono text-indigo-600 font-bold group-hover:text-indigo-800 whitespace-nowrap">
                                   #{inv.internal_id || '-'}
                               </td>
                               <td className="px-6 py-3 whitespace-nowrap">
                                   <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide
                                       ${inv.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 
                                         inv.status === 'final_approved' ? 'bg-indigo-100 text-indigo-700' :
                                         inv.status === 'rejected' ? 'bg-red-100 text-red-700' : 
                                         'bg-amber-100 text-amber-700'}`}>
                                       {inv.status === 'approved' ? 'pending producer' : inv.status}
                                   </span>
                               </td>
                               <td className="px-6 py-3 whitespace-nowrap">
                                   <div className={`font-medium truncate max-w-[200px] ${inv.status === 'rejected' ? 'text-red-900' : 'text-slate-900'}`}>{inv.company_name || 'Unknown'}</div>
                                   <div className={`text-xs font-mono ${inv.status === 'rejected' ? 'text-red-500' : 'text-slate-500'}`}>{inv.ico || '-'}</div>
                               </td>
                               <td className="px-6 py-3 text-slate-600 max-w-xs truncate whitespace-nowrap">
                                   {inv.description || '-'}
                               </td>
                               <td className="px-6 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                                   {formatAmount(inv.amount_without_vat, inv.currency)}
                               </td>
                               <td className="px-6 py-3 text-right">
                                   <button 
                                       onClick={(e) => handleDeleteInvoice(e, inv.id)} 
                                       className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                       title="Delete Invoice"
                                   >
                                       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                       </svg>
                                   </button>
                               </td>
                           </tr>
                       ))}
                       {displayedInvoices.length === 0 && (
                           <tr>
                               <td colSpan={6} className="px-6 py-20 text-center text-slate-400 italic">
                                   No invoices in {activeListTab === 'processing' ? 'processing' : 'archive'}.
                               </td>
                           </tr>
                       )}
                   </tbody>
               </table>
           </div>
       </div>

       {/* BUDGET MODAL */}
       {showBudgetModal && currentProject && (
           <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
               <div className="bg-white p-6 rounded-xl w-full max-w-lg shadow-2xl">
                   <div className="flex justify-between items-center mb-6">
                       <h3 className="font-bold text-lg text-slate-800">Budget Settings</h3>
                       <button onClick={() => setShowBudgetModal(false)} className="text-slate-400 hover:text-slate-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                   </div>
                   
                   <div className="space-y-6">
                       {/* Upload */}
                       <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-center">
                           <input type="file" accept=".xml" ref={fileInputRef} onChange={handleBudgetFileChange} className="hidden" />
                           <button onClick={() => fileInputRef.current?.click()} disabled={uploadingBudget} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded text-sm hover:bg-slate-50 disabled:opacity-50">
                               {uploadingBudget ? 'Uploading...' : 'Upload New Budget (XML)'}
                           </button>
                       </div>

                       {/* List */}
                       <div>
                           <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Available Budgets</h4>
                           {budgetList.length > 0 ? (
                               <div className="flex flex-col gap-2">
                                   {budgetList.map(b => (
                                       <div key={b.id} className={`flex items-center justify-between p-3 rounded border ${b.is_active ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'}`}>
                                           <div className="flex items-center gap-3">
                                               <div className={`w-3 h-3 rounded-full ${b.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                               <span className={`text-sm ${b.is_active ? 'font-medium text-emerald-900' : 'text-slate-600'}`}>{b.version_name}</span>
                                           </div>
                                           {!b.is_active && (
                                               <button onClick={() => handleToggleBudgetActive(b.id)} className="text-xs text-indigo-600 hover:underline">
                                                   Set Active
                                               </button>
                                           )}
                                           {b.is_active && <span className="text-xs text-emerald-600 font-bold uppercase">Active</span>}
                                       </div>
                                   ))}
                               </div>
                           ) : <p className="text-sm text-slate-400 italic text-center">No budgets found.</p>}
                       </div>
                   </div>
               </div>
           </div>
       )}
    </div>
  );
};

export default InvoicingModule;
