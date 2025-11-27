
import React, { useState, useEffect } from 'react';
import { FileData, ExtractionResult, Project, SavedInvoice, BudgetLine, InvoiceAllocation } from '../types';
import { updateInvoice, fetchActiveBudgetLines, fetchInvoiceAllocations, saveInvoiceAllocation, deleteInvoiceAllocation, fetchVendorBudgetHistory } from '../services/supabaseService';

interface InvoiceDetailProps {
  invoice: SavedInvoice;
  fileData: FileData;
  project: Project | null;
  nextDraftId: number | null; // ID of the next draft invoice to load immediately
  onBack: () => void;
  onSaved: (nextId?: number | null) => void;
}

const InvoiceDetail: React.FC<InvoiceDetailProps> = ({ invoice, fileData, project, nextDraftId, onBack, onSaved }) => {
  const [editedResult, setEditedResult] = useState<ExtractionResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Budget Allocation State
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [allocations, setAllocations] = useState<InvoiceAllocation[]>([]);
  const [allocationSearch, setAllocationSearch] = useState('');
  const [allocationAmount, setAllocationAmount] = useState<number>(0);
  const [selectedBudgetLine, setSelectedBudgetLine] = useState<BudgetLine | null>(null);
  const [isAllocating, setIsAllocating] = useState(false);
  
  // Smart Suggestions
  const [suggestedLines, setSuggestedLines] = useState<BudgetLine[]>([]);
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  // RESET BUTTON STATE when loading a new invoice (e.g. auto-advance)
  useEffect(() => {
    setSaveStatus('idle');
    setErrorMessage(null);
    setAllocations([]);
    setSelectedBudgetLine(null);
    setAllocationSearch('');
    setSuggestedLines([]);
    setHasAutoSelected(false);
    setAllocationAmount(0); // Ensure amount resets
    
    // Load Budget Data & Vendor History
    if (project) {
        fetchActiveBudgetLines(project.id).then(setBudgetLines).catch(console.error);
        fetchInvoiceAllocations(invoice.id).then(setAllocations).catch(console.error);
        
        if (invoice.ico) {
            fetchVendorBudgetHistory(project.id, invoice.ico).then(history => {
                setSuggestedLines(history);
                // AUTO SELECT: If we found history and haven't allocated anything yet
                if (history.length > 0 && allocations.length === 0) {
                    setSelectedBudgetLine(history[0]);
                    setAllocationSearch(`${history[0].account_number} - ${history[0].account_description}`);
                    // Explicitly set amount to 0 so user must verify
                    setAllocationAmount(0); 
                    setHasAutoSelected(true);
                }
            }).catch(console.error);
        }
    }
  }, [invoice.id, project?.id, invoice.ico]); // Added allocations length dep logic via hasAutoSelected if needed, but better inside history fetch

  useEffect(() => {
    if (fileData.extractionResult) {
      setEditedResult(fileData.extractionResult);
    }
  }, [fileData]);

  if (!editedResult) return <div>Loading data...</div>;

  const handleApprove = async () => {
    setSaveStatus('saving');
    try {
      if (!project) throw new Error("No project context.");
      
      // Map extracted result back to SavedInvoice structure
      const updates: Partial<SavedInvoice> = {
          company_name: editedResult.companyName || null,
          ico: editedResult.ico || null,
          variable_symbol: editedResult.variableSymbol || null,
          description: editedResult.description || null,
          amount_without_vat: editedResult.amountWithoutVat || null,
          amount_with_vat: editedResult.amountWithVat || null,
          bank_account: editedResult.bankAccount || null,
          iban: editedResult.iban || null,
          currency: editedResult.currency || 'CZK', // Default to CZK if missing
          status: 'approved'
      };

      await updateInvoice(invoice.id, updates);
      
      setSaveStatus('success');
      setTimeout(() => {
          // If there is a next draft invoice, we signal the parent to load it immediately
          if (nextDraftId) {
             onSaved(nextDraftId);
          } else {
             onSaved(null); // Return to list if no more drafts
          }
      }, 500);
    } catch (err: any) {
      setSaveStatus('error');
      setErrorMessage(err.message || "Failed to save");
    }
  };

  const handleInputChange = (field: keyof ExtractionResult, value: string | number) => {
    setEditedResult(prev => prev ? ({ ...prev, [field]: value }) : null);
  };

  const handleSelectBudgetLine = (line: BudgetLine) => {
      setSelectedBudgetLine(line);
      setAllocationSearch(`${line.account_number} - ${line.account_description}`);
      
      // Auto-fill with remaining amount if possible
      const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
      const invoiceTotal = editedResult?.amountWithoutVat || 0;
      const remaining = Math.max(0, invoiceTotal - totalAllocated);
      setAllocationAmount(remaining > 0 ? remaining : 0);
  };

  const handleConfirmAllocation = async () => {
      if (!selectedBudgetLine || allocationAmount <= 0) return;
      setIsAllocating(true);
      try {
          await saveInvoiceAllocation(invoice.id, selectedBudgetLine.id, allocationAmount);
          // Refresh
          const updated = await fetchInvoiceAllocations(invoice.id);
          setAllocations(updated);
          // Reset Selection
          setSelectedBudgetLine(null);
          setAllocationSearch('');
          setAllocationAmount(0);
      } catch (err) {
          alert("Failed to allocate budget line");
      } finally {
          setIsAllocating(false);
      }
  };

  const handleRemoveAllocation = async (id: number) => {
      try {
          await deleteInvoiceAllocation(id);
          setAllocations(prev => prev.filter(a => a.id !== id));
      } catch (err) { alert("Failed to remove allocation"); }
  };

  const isReapproving = invoice.status === 'approved';

  // Helper to determine input style (Red background if empty/null)
  const getInputClass = (value: string | number | null | undefined) => {
      const isMissing = value === null || value === undefined || value === '' || (typeof value === 'number' && isNaN(value));
      return `w-full px-2 border rounded text-[10px] outline-none transition-colors ${
          isMissing 
            ? 'bg-red-50 border-red-300 focus:border-red-500 text-red-900 placeholder-red-300' 
            : 'bg-white border-slate-300 focus:border-indigo-500 text-slate-900'
      }`;
  };
  
  const getNumberInputClass = (value: number | null | undefined) => {
      const isMissing = value === null || value === undefined || isNaN(value);
      return `w-full px-2 border rounded font-mono text-right outline-none transition-colors ${
          isMissing 
            ? 'bg-red-50 border-red-300 focus:border-red-500 text-red-900' 
            : 'bg-white border-slate-300 focus:border-indigo-500 text-slate-900'
      }`;
  };

  const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  };

  // Filter budget lines for search
  const filteredBudgetLines = allocationSearch && !selectedBudgetLine
    ? budgetLines.filter(l => 
        l.account_number.toLowerCase().includes(allocationSearch.toLowerCase()) || 
        l.account_description.toLowerCase().includes(allocationSearch.toLowerCase()) ||
        l.category_description.toLowerCase().includes(allocationSearch.toLowerCase())
      ).slice(0, 20) // Limit results
    : [];

  const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
  const invoiceTotal = editedResult?.amountWithoutVat || 0;
  const unallocated = invoiceTotal - totalAllocated;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 h-[calc(100vh-140px)]">
      
      {/* LEFT: DATA ENTRY (Wider 40%) */}
      <div className="lg:col-span-2 bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col h-full overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-xl shrink-0">
           <button onClick={onBack} className="text-slate-500 hover:text-indigo-600 text-xs flex items-center gap-1 font-medium">
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
             </svg>
             Back
           </button>
           <div className="text-xs text-slate-500 font-mono">Invoice #{invoice.internal_id}</div>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
            
            {/* --- BUDGET ALLOCATION SECTION (Moved to Top) --- */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">Budget Allocation</label>
                    <span className="text-[9px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {allocations.length} items
                    </span>
                </div>
                
                {/* Search & Add Row */}
                <div className="flex gap-2 mb-2 relative">
                    <div className="flex-1 relative">
                        <input 
                            type="text" 
                            placeholder="Search budget line..."
                            value={allocationSearch}
                            onChange={e => {
                                setAllocationSearch(e.target.value);
                                setSelectedBudgetLine(null); 
                            }}
                            className="w-full text-xs px-2 py-1.5 border rounded outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        {/* Dropdown */}
                        {filteredBudgetLines.length > 0 && (
                            <div className="absolute top-full left-0 w-full bg-white border shadow-xl rounded-lg mt-1 max-h-48 overflow-auto z-50 text-xs divide-y divide-slate-50">
                                {filteredBudgetLines.map(line => (
                                    <div 
                                        key={line.id} 
                                        className="p-2 hover:bg-indigo-50 cursor-pointer flex justify-between items-center group"
                                        onClick={() => handleSelectBudgetLine(line)}
                                    >
                                        <div className="overflow-hidden pr-2">
                                            <div className="font-bold text-indigo-700 truncate">
                                                <span className="font-mono mr-2 opacity-80">{line.account_number}</span>
                                                {line.account_description}
                                            </div>
                                            <div className="text-[9px] text-slate-400 truncate">{line.category_description}</div>
                                        </div>
                                        <div className="font-mono text-slate-500 whitespace-nowrap text-[10px] bg-slate-50 px-1.5 py-0.5 rounded group-hover:bg-white">
                                            {formatCurrency(line.original_amount)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <input 
                        type="number"
                        value={allocationAmount}
                        onChange={e => setAllocationAmount(parseFloat(e.target.value))}
                        className="w-20 text-xs px-2 py-1.5 border rounded text-right outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button 
                        onClick={handleConfirmAllocation}
                        disabled={!selectedBudgetLine || allocationAmount <= 0 || isAllocating}
                        className="bg-indigo-600 text-white px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                    >
                        Add
                    </button>
                </div>

                {/* --- SMART SUGGESTIONS --- */}
                {suggestedLines.length > 0 && allocations.length === 0 && !hasAutoSelected && (
                    <div className="mb-2">
                        <label className="text-[9px] font-bold text-slate-400 uppercase mb-1 block">Suggested</label>
                        <div className="space-y-1">
                            {suggestedLines.map(line => (
                                <div key={line.id} className="flex justify-between items-center bg-indigo-50 border border-indigo-100 p-1 rounded text-xs">
                                    <div className="truncate flex-1 pr-2">
                                        <span className="font-mono font-bold text-indigo-600 mr-1">{line.account_number}</span>
                                        <span className="text-indigo-900 truncate">{line.account_description}</span>
                                    </div>
                                    <button 
                                        onClick={() => handleSelectBudgetLine(line)}
                                        className="text-[9px] bg-white text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded hover:bg-indigo-600 hover:text-white transition-colors"
                                    >
                                        Use
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Allocations List */}
                <div className="space-y-1 max-h-24 overflow-y-auto mb-2">
                    {allocations.map(alloc => (
                        <div key={alloc.id} className="flex justify-between items-center text-xs bg-white border border-slate-200 p-1.5 rounded">
                            <div className="flex-1 min-w-0">
                                <span className="font-mono font-bold text-indigo-600 mr-2 text-[10px]">{alloc.budget_line?.account_number}</span>
                                <span className="truncate text-slate-700">{alloc.budget_line?.account_description}</span>
                            </div>
                            <div className="flex items-center gap-3 ml-2">
                                <span className="font-mono font-medium">{formatCurrency(alloc.amount)}</span>
                                <button onClick={() => handleRemoveAllocation(alloc.id)} className="text-slate-300 hover:text-red-500 text-[10px]">✕</button>
                            </div>
                        </div>
                    ))}
                    {allocations.length === 0 && (
                        <div className="text-center text-[9px] text-slate-400 py-1 italic border border-dashed border-slate-200 rounded">
                            No allocations
                        </div>
                    )}
                </div>
                
                {/* Summary Footer */}
                <div className="pt-2 border-t border-slate-200 text-xs space-y-1">
                    <div className="flex justify-between items-center">
                        <span className="text-[9px] text-slate-400 uppercase">Allocated / Total</span>
                        <div className="font-mono font-bold text-slate-700">
                            {formatCurrency(totalAllocated)} <span className="text-slate-400 text-[9px] font-normal mx-1">of</span> {formatCurrency(invoiceTotal)}
                        </div>
                    </div>
                    <div className="flex justify-between items-center pt-1 mt-1">
                        <span className="text-[9px] text-slate-400 uppercase font-bold">Unallocated</span>
                        <span className={`font-mono font-bold ${Math.abs(unallocated) > 1 ? (unallocated < 0 ? 'text-red-500' : 'text-emerald-600') : 'text-slate-300'}`}>
                            {formatCurrency(unallocated)}
                        </span>
                    </div>
                </div>
            </div>

            {/* --- COMPACT DATA ENTRY --- */}
            <div className="space-y-1">
                <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Supplier</label>
                    <input 
                      type="text" 
                      value={editedResult.companyName || ''} 
                      onChange={e => handleInputChange('companyName', e.target.value)}
                      className={`${getInputClass(editedResult.companyName)} h-6 py-0.5`}
                      placeholder="Missing Company Name"
                    />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">IČO</label>
                        <input 
                          type="text" 
                          value={editedResult.ico || ''} 
                          onChange={e => handleInputChange('ico', e.target.value)}
                          className={`${getInputClass(editedResult.ico)} font-mono h-6 py-0.5`} 
                          placeholder="Missing"
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Var. Symbol</label>
                        <input 
                          type="text" 
                          value={editedResult.variableSymbol || ''} 
                          onChange={e => handleInputChange('variableSymbol', e.target.value)}
                          className={`${getInputClass(editedResult.variableSymbol)} font-mono h-6 py-0.5`} 
                          placeholder="Missing"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Description</label>
                    <textarea 
                      value={editedResult.description || ''} 
                      onChange={e => handleInputChange('description', e.target.value)}
                      className={`${getInputClass(editedResult.description)} h-10 resize-none py-1 leading-tight`} 
                      placeholder="Missing Description"
                    />
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Excl. VAT (Base)</label>
                        <input 
                          type="number" 
                          value={editedResult.amountWithoutVat || ''} 
                          onChange={e => handleInputChange('amountWithoutVat', parseFloat(e.target.value))}
                          className={`${getNumberInputClass(editedResult.amountWithoutVat)} text-[10px] h-6 py-0.5`} 
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Incl. VAT (Total)</label>
                        <input 
                          type="number" 
                          value={editedResult.amountWithVat || ''} 
                          onChange={e => handleInputChange('amountWithVat', parseFloat(e.target.value))}
                          className={`${getNumberInputClass(editedResult.amountWithVat)} text-[10px] h-6 py-0.5`} 
                        />
                    </div>
                </div>
                
                <div className="grid grid-cols-1 gap-1 pt-1">
                    <input 
                      type="text" 
                      value={editedResult.bankAccount || ''} 
                      onChange={e => handleInputChange('bankAccount', e.target.value)}
                      className={`${getInputClass(editedResult.bankAccount)} font-mono text-[9px] h-6 py-0.5`} 
                      placeholder="Local Account"
                    />
                    <input 
                      type="text" 
                      value={editedResult.iban || ''} 
                      onChange={e => handleInputChange('iban', e.target.value)}
                      className={`${getInputClass(editedResult.iban)} font-mono text-[9px] h-6 py-0.5`} 
                      placeholder="IBAN"
                    />
                </div>
                
                <div className="grid grid-cols-2 gap-2 pt-1">
                     <div>
                         <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Currency</label>
                         <input 
                           type="text" 
                           value={editedResult.currency || 'CZK'} 
                           onChange={e => handleInputChange('currency', e.target.value)}
                           className={`${getInputClass(editedResult.currency)} font-mono uppercase text-center h-6 py-0.5`} 
                         />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Status</label>
                        <div className="w-full px-2 py-0.5 border border-slate-200 bg-slate-50 rounded text-[10px] font-bold uppercase text-center text-slate-600 h-6 flex items-center justify-center">
                            {invoice.status}
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <div className="p-3 border-t border-slate-100 bg-slate-50 rounded-b-xl shrink-0">
            {errorMessage && <div className="text-red-500 text-xs mb-2 text-center">{errorMessage}</div>}
            <button 
               onClick={handleApprove}
               disabled={saveStatus === 'saving' || saveStatus === 'success'}
               className={`w-full py-2 rounded-lg text-white font-medium shadow-sm transition-all text-sm
                 ${saveStatus === 'success' ? 'bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-700'}
                 disabled:opacity-75 disabled:cursor-not-allowed
               `}
            >
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'success' ? 'Saved' : (isReapproving ? 'Re-approve Invoice' : 'Approve Invoice')}
            </button>
            {nextDraftId && saveStatus !== 'success' && (
                <div className="text-center text-[9px] text-slate-400 mt-2">
                    Auto-advance enabled
                </div>
            )}
        </div>
      </div>

      {/* RIGHT: PREVIEW (Wider 60%) */}
      <div className="lg:col-span-3 bg-slate-800 rounded-xl overflow-hidden flex flex-col h-full shadow-2xl border border-slate-700">
        <div className="bg-slate-900 p-2 text-slate-400 text-xs flex justify-between items-center px-4 shrink-0">
             <span className="font-mono">Document Preview</span>
             <span className="uppercase bg-slate-700 px-2 py-0.5 rounded text-[10px] font-bold text-slate-300">{fileData.type}</span>
        </div>
        <div className="flex-1 bg-slate-200 overflow-auto relative flex items-center justify-center p-4">
           {fileData.type === 'image' && fileData.preview && (
               <img src={fileData.preview} alt="Invoice Preview" className="max-w-full max-h-full object-contain shadow-lg" />
           )}
           {fileData.type === 'pdf' && (
               <iframe 
                 src={(fileData.preview || (fileData.base64 ? `data:application/pdf;base64,${fileData.base64}` : '')) + '#toolbar=0&navpanes=0&scrollbar=0&zoom=80'} 
                 className="w-full h-full shadow-lg bg-white" 
                 title="PDF Preview"
               />
           )}
           {fileData.type === 'excel' && (
               <div className="p-8 text-center text-slate-500 bg-white shadow rounded-lg">
                   <p>Excel Preview not available.</p>
                   <pre className="mt-4 text-xs text-left bg-slate-50 p-4 rounded border overflow-auto max-h-96">
                       {fileData.textContent}
                   </pre>
               </div>
           )}
           {!fileData.preview && !fileData.base64 && !fileData.textContent && (
               <div className="text-slate-500">Preview not available</div>
           )}
        </div>
      </div>
    </div>
  );
};

export default InvoiceDetail;
