
import React, { useState, useEffect } from 'react';
import { FileData, ExtractionResult, Project } from '../types';
import { saveExtractionResult, isSupabaseConfigured } from '../services/supabaseService';

interface InvoiceDetailProps {
  fileData: FileData;
  project: Project | null;
  onBack: () => void;
  onSaved: (fileId: string) => void;
}

const InvoiceDetail: React.FC<InvoiceDetailProps> = ({ fileData, project, onBack, onSaved }) => {
  const [editedResult, setEditedResult] = useState<ExtractionResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (fileData.extractionResult) {
      setEditedResult(fileData.extractionResult);
    }
  }, [fileData]);

  if (!editedResult) return <div>Loading data...</div>;

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      if (!project) throw new Error("No project selected.");
      await saveExtractionResult(editedResult, project.id);
      setSaveStatus('success');
      setTimeout(() => onSaved(fileData.id), 1500);
    } catch (err: any) {
      setSaveStatus('error');
      setErrorMessage(err.message || "Failed to save");
    }
  };

  const handleInputChange = (field: keyof ExtractionResult, value: string | number) => {
    setEditedResult(prev => prev ? ({ ...prev, [field]: value }) : null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-140px)]">
      {/* LEFT: PREVIEW */}
      <div className="bg-slate-800 rounded-xl overflow-hidden flex flex-col">
        <div className="bg-slate-900 p-3 text-slate-300 text-sm flex justify-between items-center">
             <span className="font-mono">{fileData.file.name}</span>
             <span className="text-xs uppercase bg-slate-700 px-2 py-0.5 rounded">{fileData.type}</span>
        </div>
        <div className="flex-1 bg-slate-100 overflow-auto relative flex items-center justify-center">
           {fileData.type === 'image' && fileData.preview && (
               <img src={fileData.preview} alt="Invoice Preview" className="max-w-full max-h-full object-contain" />
           )}
           {fileData.type === 'pdf' && (
               <iframe 
                 src={fileData.preview || (fileData.base64 ? `data:application/pdf;base64,${fileData.base64}` : '')} 
                 className="w-full h-full" 
                 title="PDF Preview"
               />
           )}
           {fileData.type === 'excel' && (
               <div className="p-8 text-center text-slate-500">
                   <p>Excel Preview not available.</p>
                   <pre className="mt-4 text-xs text-left bg-white p-4 rounded border overflow-auto max-h-96">
                       {fileData.textContent}
                   </pre>
               </div>
           )}
        </div>
      </div>

      {/* RIGHT: DATA ENTRY */}
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-xl">
           <button onClick={onBack} className="text-slate-500 hover:text-indigo-600 text-sm flex items-center gap-1 font-medium">
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
             </svg>
             Back to Invoicing
           </button>
           <h2 className="text-lg font-bold text-slate-800">Invoice Details</h2>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
            {/* Status Bar */}
            <div className="flex items-center gap-4 text-sm bg-indigo-50 p-3 rounded-lg text-indigo-800">
                <span className="font-semibold">Project:</span> {project?.name}
                <span className="mx-2 text-indigo-300">|</span>
                <span className="font-semibold">Next Invoice ID:</span> # Auto-assigned on Save
            </div>

            {/* Form */}
            <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Supplier / Company Name</label>
                    <input 
                      type="text" 
                      value={editedResult.companyName || ''} 
                      onChange={e => handleInputChange('companyName', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none" 
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">IČO (Reg. No)</label>
                    <input 
                      type="text" 
                      value={editedResult.ico || ''} 
                      onChange={e => handleInputChange('ico', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded font-mono" 
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Variable Symbol</label>
                    <input 
                      type="text" 
                      value={editedResult.variableSymbol || ''} 
                      onChange={e => handleInputChange('variableSymbol', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded font-mono" 
                    />
                </div>
                <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description (Service/Goods)</label>
                    <textarea 
                      value={editedResult.description || ''} 
                      onChange={e => handleInputChange('description', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded h-20" 
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount (Excl. VAT)</label>
                    <input 
                      type="number" 
                      value={editedResult.amountWithoutVat || ''} 
                      onChange={e => handleInputChange('amountWithoutVat', parseFloat(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-right" 
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Total (Incl. VAT)</label>
                    <input 
                      type="number" 
                      value={editedResult.amountWithVat || ''} 
                      onChange={e => handleInputChange('amountWithVat', parseFloat(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-right bg-slate-50" 
                    />
                </div>
                <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bank Account / IBAN</label>
                    <input 
                      type="text" 
                      value={editedResult.bankAccount || ''} 
                      onChange={e => handleInputChange('bankAccount', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-sm mb-2" 
                      placeholder="Account Number"
                    />
                    <input 
                      type="text" 
                      value={editedResult.iban || ''} 
                      onChange={e => handleInputChange('iban', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-sm" 
                      placeholder="IBAN"
                    />
                </div>
            </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-between items-center">
            <span className="text-xs text-slate-400">Confidence: {Math.round(editedResult.confidence * 100)}%</span>
            <div className="flex gap-3 items-center">
                {errorMessage && <span className="text-red-500 text-sm font-medium">{errorMessage}</span>}
                <button 
                   onClick={handleSave}
                   disabled={saveStatus === 'saving' || saveStatus === 'success'}
                   className={`px-6 py-2.5 rounded-lg text-white font-medium shadow-md transition-all
                     ${saveStatus === 'success' ? 'bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-700'}
                     disabled:opacity-75 disabled:cursor-not-allowed
                   `}
                >
                    {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : 'Save & Assign ID'}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceDetail;
