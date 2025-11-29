import React, { useState, useEffect } from 'react';
import { FileData, ExtractionResult, Project, SavedInvoice, BudgetLine, InvoiceAllocation } from '../types';
import { updateInvoice, fetchActiveBudgetLines, fetchInvoiceAllocations, saveInvoiceAllocation, deleteInvoiceAllocation, fetchVendorBudgetHistory, fetchInvoiceFileContent } from '../services/supabaseService';
import { stampInvoicePdf } from '../services/pdfService';

interface InvoiceDetailProps {
  invoice: SavedInvoice;
  fileData: FileData;
  project: Project | null;
  nextDraftId: number | null; 
  onBack: () => void;
  onSaved: (nextId?: number | null) => void;
  userRole?: string; // Optional: To enable Producer-specific controls
}

const InvoiceDetail: React.FC<InvoiceDetailProps> = ({ invoice, fileData, project, nextDraftId, onBack, onSaved, userRole }) => {
  const [editedResult, setEditedResult] = useState<ExtractionResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadedFileContent, setLoadedFileContent] = useState<string | undefined>(fileData.base64);

  // Budget Allocation State
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [allocations, setAllocations] = useState<InvoiceAllocation[]>([]);
  const [allocationSearch, setAllocationSearch] = useState('');
  const [allocationAmount, setAllocationAmount] = useState<number>(0);
  const [selectedBudgetLine, setSelectedBudgetLine] = useState<BudgetLine | null>(null);
  const [isAllocating, setIsAllocating] = useState(false);
  const [suggestedLines, setSuggestedLines] = useState<BudgetLine[]>([]);
  
  // Producer Approval State
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const isLocked = invoice.status === 'final_approved';
  const isProducer = userRole === 'producer';
  const isReadyForReview = invoice.status === 'approved';
  const isRejected = invoice.status === 'rejected';

  useEffect(() => {
    // Reset State
    setSaveStatus('idle');
    setErrorMessage(null);
    setAllocations([]);
    setSelectedBudgetLine(null);
    setAllocationSearch('');
    setAllocationAmount(0);
    setSuggestedLines([]);
    
    // Load file content if missing (Performance optimization)
    if (!fileData.base64 && invoice.id) {
        fetchInvoiceFileContent(invoice.id).then(content => {
            if (content) setLoadedFileContent(content);
        });
    } else {
        setLoadedFileContent(fileData.base64);
    }
    
    if (project) {
        fetchActiveBudgetLines(project.id).then(setBudgetLines).catch(console.error);
        fetchInvoiceAllocations(invoice.id).then(async (currentAllocations) => {
            setAllocations(currentAllocations);
            if (invoice.ico && !isLocked) { // Don't fetch suggestions if locked
                try {
                    const history = await fetchVendorBudgetHistory(project.id, invoice.ico);
                    if (history.length > 0) setSuggestedLines(history);
                } catch (e) { console.error(e); }
            }
        }).catch(console.error);
    }
  }, [invoice.id, project?.id, invoice.ico, fileData.base64]); 

  useEffect(() => {
    if (fileData.extractionResult) {
      setEditedResult(fileData.extractionResult);
    }
  }, [fileData]);

  if (!editedResult) return <div>Loading data...</div>;

  // Render-time calculation for UI feedback
  const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
  const invoiceTotal = editedResult?.amountWithoutVat || 0;
  const unallocated = invoiceTotal - totalAllocated;
  const isBalanced = Math.abs(unallocated) <= 1; // Allow small tolerance for UI

  const handleSave = async (targetStatus: SavedInvoice['status'] = 'approved') => {
    setSaveStatus('idle'); // Reset status
    setErrorMessage(null);
    
    // RECALCULATE STRICTLY INSIDE HANDLER
    // This prevents using stale closure variables
    const currentTotalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
    const currentInvoiceTotal = editedResult?.amountWithoutVat || 0;
    const currentUnallocated = currentInvoiceTotal - currentTotalAllocated;
    
    // STRICT VALIDATION: Block approval if unallocated amount exists
    // Only applies when Line Producer submits for approval (status 'approved')
    if (targetStatus === 'approved' && !isProducer) {
        // We allow a tiny tolerance (1.0) for rounding issues
        if (Math.abs(currentUnallocated) > 1.0) {
            setSaveStatus('error');
            setErrorMessage(`Cannot approve: Unallocated amount is ${currentUnallocated.toFixed(2)}. It must be 0.`);
            return;
        }
    }

    setSaveStatus('saving');
    try {
      if (!project) throw new Error("No project context.");
      
      const updates: Partial<SavedInvoice> = {
          company_name: editedResult.companyName || null,
          ico: editedResult.ico || null,
          variable_symbol: editedResult.variableSymbol || null,
          description: editedResult.description || null,
          amount_without_vat: editedResult.amountWithoutVat || null,
          amount_with_vat: editedResult.amountWithVat || null,
          bank_account: editedResult.bankAccount || null,
          iban: editedResult.iban || null,
          currency: editedResult.currency || 'CZK',
          status: targetStatus,
          // Clear rejection reason if being re-submitted or approved
          rejection_reason: targetStatus === 'rejected' ? rejectionReason : null 
      };

      await updateInvoice(invoice.id, updates);
      
      setSaveStatus('success');
      setTimeout(() => {
          // Advance if Approved/FinalApproved AND Next ID exists
          if (nextDraftId && (targetStatus === 'approved' || targetStatus === 'final_approved')) {
             onSaved(nextDraftId);
          } else {
             onSaved(null);
          }
      }, 500);
    } catch (err: any) {
      setSaveStatus('error');
      setErrorMessage(err.message || "Failed to save");
    }
  };

  const handleProducerAction = (action: 'approve' | 'reject') => {
      if (action === 'approve') {
          // Direct approval without confirmation dialog
          handleSave('final_approved');
      } else {
          setShowRejectModal(true);
      }
  };

  const confirmRejection = () => {
      handleSave('rejected');
      setShowRejectModal(false);
  }

  const handleDownloadStamp = async () => {
      if (!project || !loadedFileContent) return;
      try {
          const stampedPdfBytes = await stampInvoicePdf(loadedFileContent, invoice, project, allocations);
          const blob = new Blob([stampedPdfBytes], { type: 'application/pdf' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `stamped_invoice_${invoice.internal_id}.pdf`;
          link.click();
      } catch (err: any) {
          alert("Failed to generate stamped PDF: " + err.message);
      }
  };

  const handleInputChange = (field: keyof ExtractionResult, value: string | number) => {
    if (isLocked) return;
    setEditedResult(prev => prev ? ({ ...prev, [field]: value }) : null);
  };

  const handleSelectBudgetLine = (line: BudgetLine) => {
      setSelectedBudgetLine(line);
      setAllocationSearch(`${line.account_number} - ${line.account_description}`);
      const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
      const invoiceTotal = editedResult?.amountWithoutVat || 0;
      const remaining = Math.max(0, invoiceTotal - totalAllocated);
      setAllocationAmount(remaining > 0 ? remaining : 0);
  };

  const handleConfirmAllocation = async () => {
      if (!selectedBudgetLine || isAllocating || isLocked) return;
      setIsAllocating(true);
      try {
          await saveInvoiceAllocation(invoice.id, selectedBudgetLine.id, allocationAmount);
          const updated = await fetchInvoiceAllocations(invoice.id);
          setAllocations(updated);
          setSelectedBudgetLine(null);
          setAllocationSearch('');
          setAllocationAmount(0);
      } catch (err) { alert("Failed to allocate budget line"); } finally { setIsAllocating(false); }
  };

  const handleRemoveAllocation = async (id: number) => {
      if(isLocked) return;
      try {
          await deleteInvoiceAllocation(id);
          setAllocations(prev => prev.filter(a => a.id !== id));
      } catch (err) { alert("Failed to remove allocation"); }
  };

  const getInputClass = (value: string | number | null | undefined) => {
      const isMissing = value === null || value === undefined || value === '' || (typeof value === 'number' && isNaN(value));
      return `w-full px-2 border rounded text-[10px] outline-none transition-colors ${
          isLocked ? 'bg-slate-50 text-slate-600 border-transparent' : 
          isMissing 
            ? 'bg-red-50 border-red-300 focus:border-red-500 text-red-900 placeholder-red-300' 
            : 'bg-white border-slate-300 focus:border-indigo-500 text-slate-900'
      }`;
  };
  
  const getNumberInputClass = (value: number | null | undefined) => {
      const isMissing = value === null || value === undefined || isNaN(value);
      return `w-full px-2 border rounded font-mono text-right outline-none transition-colors ${
          isLocked ? 'bg-slate-50 text-slate-600 border-transparent' : 
          isMissing 
            ? 'bg-red-50 border-red-300 focus:border-red-500 text-red-900' 
            : 'bg-white border-slate-300 focus:border-indigo-500 text-slate-900'
      }`;
  };

  const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount).replace(/\s/g, ' ');
  };

  const filteredBudgetLines = allocationSearch && !selectedBudgetLine
    ? budgetLines.filter(l => 
        l.account_number.toLowerCase().includes(allocationSearch.toLowerCase()) || 
        l.account_description.toLowerCase().includes(allocationSearch.toLowerCase())
      ).slice(0, 20)
    : [];

  const availableSuggestions = suggestedLines.filter(line => !allocations.some(a => a.budget_line_id === line.id));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 h-[calc(100vh-140px)]">
      
      {/* LEFT: DATA ENTRY */}
      <div className="lg:col-span-2 bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col h-full overflow-hidden relative">
        {/* Status Overlay for Locked/Rejected */}
        {isLocked && <div className="absolute top-0 right-0 m-2 px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full z-10 shadow-sm border border-emerald-200">APPROVED BY PRODUCER</div>}
        
        <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-xl shrink-0">
           <button onClick={onBack} className="text-slate-500 hover:text-indigo-600 text-xs flex items-center gap-1 font-medium">
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
             Back
           </button>
           <div className="text-xs text-slate-500 font-mono">Invoice #{invoice.internal_id}</div>
        </div>

        {isRejected && !isProducer && (
            <div className="bg-red-50 border-b border-red-100 p-3">
                <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <div>
                        <p className="text-xs font-bold text-red-700">REJECTED BY PRODUCER</p>
                        <p className="text-xs text-red-600 mt-1">{invoice.rejection_reason}</p>
                    </div>
                </div>
            </div>
        )}

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
            
            {/* ALLOCATION */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                    <label className="text-xs font-bold text-indigo-600 uppercase tracking-wide">Budget Allocation</label>
                    <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {allocations.length} items
                    </span>
                </div>

                {/* SUGGESTIONS: Hide if Locked OR Producer */}
                {!isLocked && !isProducer && availableSuggestions.length > 0 && (
                    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg shadow-sm">
                        <h4 className="text-xs font-bold text-amber-800 uppercase mb-3 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            Suggested for this Supplier
                        </h4>
                        <div className="space-y-3">
                            {availableSuggestions.map(line => (
                                <div key={line.id} className="flex justify-between items-center bg-white p-3 rounded border border-amber-100 shadow-sm">
                                    <div className="min-w-0 flex-1 mr-3">
                                        <div className="font-bold text-slate-800 text-sm truncate">
                                            <span className="font-mono text-indigo-600 mr-2 text-xs bg-indigo-50 px-1.5 py-0.5 rounded">{line.account_number}</span>
                                            {line.account_description}
                                        </div>
                                    </div>
                                    <button onClick={() => handleSelectBudgetLine(line)} className="text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded shadow-sm transition-colors">USE</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {/* SEARCH & ADD: Hide if Locked OR Producer */}
                {!isLocked && !isProducer && (
                    <div className="flex gap-2 mb-4 relative">
                        <div className="flex-1 relative">
                            <input 
                                type="text" placeholder="Search budget line..."
                                value={allocationSearch}
                                onChange={e => { setAllocationSearch(e.target.value); setSelectedBudgetLine(null); }}
                                className="w-full text-sm px-3 py-2 border rounded outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            {filteredBudgetLines.length > 0 && (
                                <div className="absolute top-full left-0 w-full bg-white border shadow-xl rounded-lg mt-1 max-h-60 overflow-auto z-50 text-sm divide-y divide-slate-50">
                                    {filteredBudgetLines.map(line => (
                                        <div key={line.id} className="p-3 hover:bg-indigo-50 cursor-pointer flex justify-between items-center group transition-colors" onClick={() => handleSelectBudgetLine(line)}>
                                            <div className="overflow-hidden pr-2">
                                                <div className="font-bold text-indigo-700 truncate"><span className="font-mono mr-2 opacity-80 bg-indigo-50 px-1 rounded">{line.account_number}</span>{line.account_description}</div>
                                                <div className="text-xs text-slate-400 truncate mt-0.5">{line.category_description}</div>
                                            </div>
                                            <div className="font-mono text-slate-500 whitespace-nowrap text-xs bg-slate-50 px-2 py-1 rounded border border-slate-100">{formatCurrency(line.original_amount)}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <input type="number" value={allocationAmount} onChange={e => setAllocationAmount(parseFloat(e.target.value))} className="w-28 text-sm px-3 py-2 border rounded text-right outline-none font-mono focus:ring-2 focus:ring-indigo-500" />
                        <button onClick={handleConfirmAllocation} disabled={!selectedBudgetLine || isAllocating} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm font-bold shadow-sm disabled:opacity-50 transition-colors">Add</button>
                    </div>
                )}

                <div className="space-y-2 max-h-48 overflow-y-auto mb-3 pr-1">
                    {allocations.map(alloc => (
                        <div key={alloc.id} className="flex justify-between items-center text-sm bg-white border border-slate-200 p-2.5 rounded shadow-sm hover:border-indigo-300 transition-colors">
                            <div className="flex-1 min-w-0">
                                <span className="font-mono font-bold text-indigo-600 mr-2 text-xs bg-indigo-50 px-1.5 py-0.5 rounded">{alloc.budget_line?.account_number}</span>
                                <span className="truncate text-slate-700 font-medium">{alloc.budget_line?.account_description}</span>
                            </div>
                            <div className="flex items-center gap-4 ml-3">
                                <span className={`font-mono font-bold ${alloc.amount === 0 ? 'text-red-500' : 'text-slate-800'}`}>{formatCurrency(alloc.amount)}</span>
                                {/* REMOVE: Hide if Locked OR Producer */}
                                {!isLocked && !isProducer && <button onClick={() => handleRemoveAllocation(alloc.id)} className="text-slate-300 hover:text-red-500 text-xs font-bold px-2 py-1 hover:bg-red-50 rounded transition-colors">✕</button>}
                            </div>
                        </div>
                    ))}
                </div>
                
                <div className="pt-3 border-t border-slate-200 text-sm space-y-2 bg-slate-50/50 -mx-4 -mb-4 p-4 rounded-b-lg">
                    <div className="flex justify-between items-center"><span className="text-xs text-slate-500 uppercase font-bold tracking-wide">Total Allocated</span><div className="font-mono font-bold text-slate-800 text-base">{formatCurrency(totalAllocated)}</div></div>
                    <div className="flex justify-between items-center"><span className="text-xs text-slate-500 uppercase tracking-wide">Invoice Total (Base)</span><div className="font-mono text-slate-500">{formatCurrency(invoiceTotal)}</div></div>
                    <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-200"><span className="text-xs text-slate-600 uppercase font-bold tracking-wide">Unallocated</span><span className={`font-mono font-bold text-base ${!isBalanced ? 'text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100' : 'text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100'}`}>{formatCurrency(unallocated)}</span></div>
                </div>
            </div>

            {/* DATA FORM */}
            <div className="space-y-1">
                <div><label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Supplier</label><input disabled={isLocked} type="text" value={editedResult.companyName || ''} onChange={e => handleInputChange('companyName', e.target.value)} className={`${getInputClass(editedResult.companyName)} h-6 py-0.5`} /></div>
                <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">IČO</label><input disabled={isLocked} type="text" value={editedResult.ico || ''} onChange={e => handleInputChange('ico', e.target.value)} className={`${getInputClass(editedResult.ico)} font-mono h-6 py-0.5`} /></div>
                    <div><label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Var. Symbol</label><input disabled={isLocked} type="text" value={editedResult.variableSymbol || ''} onChange={e => handleInputChange('variableSymbol', e.target.value)} className={`${getInputClass(editedResult.variableSymbol)} font-mono h-6 py-0.5`} /></div>
                </div>
                <div><label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Description</label><textarea disabled={isLocked} value={editedResult.description || ''} onChange={e => handleInputChange('description', e.target.value)} className={`${getInputClass(editedResult.description)} h-10 resize-none py-1 leading-tight`} /></div>
                <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Excl. VAT</label><input disabled={isLocked} type="number" value={editedResult.amountWithoutVat || ''} onChange={e => handleInputChange('amountWithoutVat', parseFloat(e.target.value))} className={`${getNumberInputClass(editedResult.amountWithoutVat)} text-[10px] h-6 py-0.5`} /></div>
                    <div><label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Incl. VAT</label><input disabled={isLocked} type="number" value={editedResult.amountWithVat || ''} onChange={e => handleInputChange('amountWithVat', parseFloat(e.target.value))} className={`${getNumberInputClass(editedResult.amountWithVat)} text-[10px] h-6 py-0.5`} /></div>
                </div>
                <div className="grid grid-cols-1 gap-1 pt-1">
                    <input disabled={isLocked} type="text" value={editedResult.bankAccount || ''} onChange={e => handleInputChange('bankAccount', e.target.value)} className={`${getInputClass(editedResult.bankAccount)} font-mono text-[9px] h-6 py-0.5`} placeholder="Local Account" />
                    <input disabled={isLocked} type="text" value={editedResult.iban || ''} onChange={e => handleInputChange('iban', e.target.value)} className={`${getInputClass(editedResult.iban)} font-mono text-[9px] h-6 py-0.5`} placeholder="IBAN" />
                </div>
            </div>
        </div>

        <div className="p-3 border-t border-slate-100 bg-slate-50 rounded-b-xl shrink-0">
            {errorMessage && <div className="text-red-500 text-xs mb-2 text-center font-bold bg-red-50 p-2 rounded border border-red-200">{errorMessage}</div>}
            
            {isProducer && isReadyForReview ? (
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => handleProducerAction('reject')} className="bg-red-100 text-red-700 hover:bg-red-200 py-2 rounded-lg font-medium text-sm">Reject</button>
                    <button onClick={() => handleProducerAction('approve')} className="bg-emerald-600 text-white hover:bg-emerald-700 py-2 rounded-lg font-medium text-sm shadow-sm">Final Approve</button>
                </div>
            ) : !isLocked ? (
                <div className="flex gap-2">
                    <button 
                        onClick={() => handleSave('approved')} 
                        disabled={saveStatus === 'saving' || saveStatus === 'success'} 
                        className={`flex-1 py-2 rounded-lg text-white font-medium shadow-sm transition-all text-sm ${saveStatus === 'success' ? 'bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-700'} disabled:opacity-50 disabled:bg-slate-400`}
                    >
                        {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'success' ? 'Saved' : (isRejected ? 'Re-Submit for Approval' : (invoice.status === 'approved' ? 'Re-approve Invoice' : 'Approve Invoice'))}
                    </button>
                    {isBalanced && (
                        <button 
                            onClick={handleDownloadStamp}
                            className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-lg shadow-sm"
                            title="Download Stamped PDF"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </button>
                    )}
                </div>
            ) : (
                <div className="text-center text-xs text-slate-400 italic py-2">Invoice is locked.</div>
            )}
        </div>
      </div>

      {/* RIGHT: PREVIEW */}
      <div className="lg:col-span-3 bg-slate-800 rounded-xl overflow-hidden flex flex-col h-full shadow-2xl border border-slate-700">
        <div className="bg-slate-900 p-2 text-slate-400 text-xs flex justify-between items-center px-4 shrink-0">
             <span className="font-mono">Document Preview</span>
             <span className="uppercase bg-slate-700 px-2 py-0.5 rounded text-[10px] font-bold text-slate-300">{fileData.type}</span>
        </div>
        <div className="flex-1 bg-slate-200 overflow-auto relative flex items-center justify-center p-4">
           {fileData.type === 'image' && fileData.preview && <img src={fileData.preview} alt="Preview" className="max-w-full max-h-full object-contain shadow-lg" />}
           {fileData.type === 'pdf' && <iframe src={(fileData.preview || (loadedFileContent ? `data:application/pdf;base64,${loadedFileContent}` : '')) + '#toolbar=0&navpanes=0&scrollbar=0&zoom=80'} className="w-full h-full shadow-lg bg-white" title="PDF Preview" />}
           {fileData.type === 'excel' && <div className="p-8 text-center text-slate-500 bg-white shadow rounded-lg"><pre className="mt-4 text-xs text-left bg-slate-50 p-4 rounded border overflow-auto max-h-96">{fileData.textContent}</pre></div>}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded-xl w-full max-w-sm">
                  <h3 className="font-bold text-lg mb-2">Reject Invoice</h3>
                  <textarea 
                      value={rejectionReason} 
                      onChange={e => setRejectionReason(e.target.value)}
                      placeholder="Reason for rejection..." 
                      className="w-full border p-2 rounded mb-4 text-sm h-24"
                  />
                  <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowRejectModal(false)} className="text-slate-500 text-sm px-3">Cancel</button>
                      <button onClick={confirmRejection} disabled={!rejectionReason} className="bg-red-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50">Confirm Rejection</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default InvoiceDetail;