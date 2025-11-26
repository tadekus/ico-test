
import React, { useState, useEffect } from 'react';
import Dropzone from './Dropzone';
import InvoiceDetail from './InvoiceDetail';
import { FileData, Project, SavedInvoice } from '../types';
import { extractIcoFromDocument } from '../services/geminiService';
import { fetchInvoices, saveExtractionResult } from '../services/supabaseService';

interface InvoicingModuleProps {
  currentProject: Project | null;
}

const InvoicingModule: React.FC<InvoicingModuleProps> = ({ currentProject }) => {
  const [stagedFiles, setStagedFiles] = useState<FileData[]>([]);
  const [savedInvoices, setSavedInvoices] = useState<SavedInvoice[]>([]);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load project history when project changes
  useEffect(() => {
    if (currentProject) {
      setLoadingHistory(true);
      fetchInvoices(currentProject.id)
        .then(setSavedInvoices)
        .catch(console.error)
        .finally(() => setLoadingHistory(false));
      
      setStagedFiles([]);
      setViewingInvoiceId(null);
    }
  }, [currentProject?.id]);

  const handleFilesLoaded = async (files: FileData[]) => {
    setStagedFiles(prev => [...prev, ...files]);
    
    // Process one by one
    for (const file of files) {
        setStagedFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'analyzing' } : f));
        
        try {
            const result = await extractIcoFromDocument(file);
            
            // Auto-save as draft
            if (currentProject) {
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

        } catch (err) {
            setStagedFiles(prev => prev.map(f => f.id === file.id ? { 
                ...f, 
                status: 'error', 
                error: 'Failed to analyze' 
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

  const formatAmount = (amount: number | null | undefined, currency: string | null) => {
      if (amount === null || amount === undefined) return '-';
      const curr = currency || 'CZK';
      // Format 1000000 -> 1 000 000.00
      const formattedNum = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      return `${formattedNum} ${curr}`;
  };

  const activeInvoice = savedInvoices.find(inv => inv.id === viewingInvoiceId);
  
  // Find the NEXT draft invoice for the "Approve & Next" workflow
  // We filter out the current one and look for the first draft available
  const draftInvoices = savedInvoices.filter(inv => inv.status === 'draft' && inv.id !== viewingInvoiceId);
  const nextDraftId = draftInvoices.length > 0 ? draftInvoices[0].id : null;

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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
       {/* LEFT COLUMN: UPLOAD */}
       <div className="lg:col-span-1 space-y-6">
           <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
               <h3 className="font-bold text-slate-800 mb-4">Upload Invoices</h3>
               <Dropzone onFileLoaded={handleFilesLoaded} disabled={!currentProject} />
               {!currentProject && <p className="text-xs text-red-500 mt-2">Please select a project first.</p>}
           </div>
           
           {/* UPLOAD PROGRESS AREA */}
           {stagedFiles.length > 0 && (
               <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                   <div className="bg-indigo-50 px-6 py-3 border-b border-indigo-100 flex justify-between items-center">
                       <h3 className="font-bold text-indigo-900 text-sm">Processing Queue</h3>
                       <span className="text-xs font-bold bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full">{stagedFiles.length}</span>
                   </div>
                   <div className="divide-y divide-slate-100">
                       {stagedFiles.map(file => (
                           <div key={file.id} className="p-4 flex items-center justify-between opacity-80">
                               <div className="flex items-center gap-3 overflow-hidden">
                                   <div className={`w-2 h-2 rounded-full flex-shrink-0 
                                       ${file.status === 'analyzing' ? 'bg-amber-400 animate-pulse' : 'bg-red-500'}`} 
                                   />
                                   <div className="min-w-0">
                                       <p className="text-sm font-medium text-slate-900 truncate">{file.file.name}</p>
                                       <p className="text-xs text-slate-400 italic">
                                            {file.status === 'analyzing' ? 'Extracting & Saving...' : 'Error'}
                                       </p>
                                   </div>
                               </div>
                           </div>
                       ))}
                   </div>
               </div>
           )}
       </div>

       {/* RIGHT COLUMN: PROJECT INVOICE LIST */}
       <div className="lg:col-span-2 bg-white rounded-xl shadow-lg border border-slate-200 flex flex-col h-[700px]">
           <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
               <div>
                   <h3 className="font-bold text-slate-800">Project Invoices</h3>
                   <p className="text-xs text-slate-500">{currentProject ? currentProject.name : 'No Project Selected'}</p>
               </div>
               {loadingHistory && <div className="animate-spin w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full"></div>}
           </div>
           
           <div className="flex-1 overflow-auto">
               <table className="w-full text-sm text-left">
                   <thead className="bg-white text-slate-500 font-semibold sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                       <tr>
                           <th className="px-6 py-3 w-20 whitespace-nowrap">#</th>
                           <th className="px-6 py-3 whitespace-nowrap">Status</th>
                           <th className="px-6 py-3 whitespace-nowrap">Supplier</th>
                           <th className="px-6 py-3">Description</th>
                           <th className="px-6 py-3 text-right whitespace-nowrap">Amount</th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                       {savedInvoices.map(inv => (
                           <tr key={inv.id} 
                               onClick={() => setViewingInvoiceId(inv.id)}
                               className="hover:bg-slate-50 transition-colors cursor-pointer group"
                           >
                               <td className="px-6 py-3 font-mono text-indigo-600 font-bold group-hover:text-indigo-800 whitespace-nowrap">
                                   #{inv.internal_id || '-'}
                               </td>
                               <td className="px-6 py-3 whitespace-nowrap">
                                   <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wide
                                       ${inv.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                       {inv.status}
                                   </span>
                               </td>
                               <td className="px-6 py-3 whitespace-nowrap">
                                   <div className="font-medium text-slate-900 truncate max-w-[200px]">{inv.company_name || 'Unknown'}</div>
                                   <div className="text-xs text-slate-500 font-mono">{inv.ico || '-'}</div>
                               </td>
                               <td className="px-6 py-3 text-slate-600 max-w-xs truncate">
                                   {inv.description || '-'}
                               </td>
                               <td className="px-6 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                                   {formatAmount(inv.amount_with_vat, inv.currency)}
                               </td>
                           </tr>
                       ))}
                       {savedInvoices.length === 0 && (
                           <tr>
                               <td colSpan={5} className="px-6 py-20 text-center text-slate-400 italic">
                                   No invoices processed for this project yet.
                                   <br/>Upload files to get started.
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
