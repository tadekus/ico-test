
import React, { useState, useEffect } from 'react';
import { FileData, ExtractionResult, Project, SavedInvoice } from '../types';
import { updateInvoice } from '../services/supabaseService';

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

  const isReapproving = invoice.status === 'approved';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
      
      {/* LEFT: DATA ENTRY (Narrower) */}
      <div className="lg:col-span-1 bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col h-full">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-xl">
           <button onClick={onBack} className="text-slate-500 hover:text-indigo-600 text-sm flex items-center gap-1 font-medium">
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
             </svg>
             Back
           </button>
           <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Invoice Data #{invoice.internal_id}</h2>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
            {/* Status Info */}
            <div className="bg-indigo-50 p-3 rounded-lg text-xs text-indigo-800 mb-2">
                <div className="font-semibold">Project: {project?.name}</div>
                <div>Status: <span className="uppercase font-bold">{invoice.status}</span></div>
            </div>

            {/* Form Fields - Compact, Line by Line */}
            <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Supplier</label>
                <input 
                  type="text" 
                  value={editedResult.companyName || ''} 
                  onChange={e => handleInputChange('companyName', e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-indigo-500 outline-none" 
                />
            </div>
            
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">IČO</label>
                    <input 
                      type="text" 
                      value={editedResult.ico || ''} 
                      onChange={e => handleInputChange('ico', e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-mono" 
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Var. Symbol</label>
                    <input 
                      type="text" 
                      value={editedResult.variableSymbol || ''} 
                      onChange={e => handleInputChange('variableSymbol', e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-mono" 
                    />
                </div>
            </div>

            <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Description</label>
                <textarea 
                  value={editedResult.description || ''} 
                  onChange={e => handleInputChange('description', e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm h-16 resize-none" 
                />
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Excl. VAT</label>
                    <input 
                      type="number" 
                      value={editedResult.amountWithoutVat || ''} 
                      onChange={e => handleInputChange('amountWithoutVat', parseFloat(e.target.value))}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-mono text-right" 
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Incl. VAT</label>
                    <input 
                      type="number" 
                      value={editedResult.amountWithVat || ''} 
                      onChange={e => handleInputChange('amountWithVat', parseFloat(e.target.value))}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-mono text-right bg-slate-50" 
                    />
                </div>
            </div>

            <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Bank Account</label>
                <input 
                  type="text" 
                  value={editedResult.bankAccount || ''} 
                  onChange={e => handleInputChange('bankAccount', e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-mono mb-1" 
                  placeholder="Local"
                />
                <input 
                  type="text" 
                  value={editedResult.iban || ''} 
                  onChange={e => handleInputChange('iban', e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-mono" 
                  placeholder="IBAN"
                />
            </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl">
            {errorMessage && <div className="text-red-500 text-xs mb-2">{errorMessage}</div>}
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
                <div className="text-center text-[10px] text-slate-400 mt-2">
                    Next invoice will load automatically
                </div>
            )}
        </div>
      </div>

      {/* RIGHT: PREVIEW (Wider) */}
      <div className="lg:col-span-2 bg-slate-800 rounded-xl overflow-hidden flex flex-col h-full shadow-2xl">
        <div className="bg-slate-900 p-2 text-slate-400 text-xs flex justify-between items-center px-4">
             <span className="font-mono">Document Preview</span>
             <span className="uppercase bg-slate-700 px-2 py-0.5 rounded text-[10px]">{fileData.type}</span>
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
