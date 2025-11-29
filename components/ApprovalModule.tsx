import React, { useState, useEffect } from 'react';
import { Project, SavedInvoice } from '../types';
import { fetchInvoices } from '../services/supabaseService';
import InvoiceDetail from './InvoiceDetail';

interface ApprovalModuleProps {
  currentProject: Project;
}

const ApprovalModule: React.FC<ApprovalModuleProps> = ({ currentProject }) => {
  const [invoices, setInvoices] = useState<SavedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'internal_id', direction: 'asc' });

  useEffect(() => {
    loadData();
  }, [currentProject.id]);

  const loadData = async () => {
    setLoading(true);
    try {
        const data = await fetchInvoices(currentProject.id);
        setInvoices(data);
    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  const handleInvoiceUpdated = (nextId?: number | null) => {
      loadData();
      if (nextId) {
          setViewingInvoiceId(nextId);
      } else {
          setViewingInvoiceId(null);
      }
  };

  const pendingInvoices = invoices.filter(i => i.status === 'approved'); // Ready for Producer Review
  const approvedInvoices = invoices.filter(i => i.status === 'final_approved');
  const rejectedInvoices = invoices.filter(i => i.status === 'rejected');

  const getFilteredList = () => {
      if (activeTab === 'pending') return pendingInvoices;
      if (activeTab === 'approved') return approvedInvoices;
      return rejectedInvoices;
  };

  const getActiveList = () => {
      const filtered = getFilteredList();
      return [...filtered].sort((a, b) => {
          const aVal = a[sortConfig.key as keyof SavedInvoice];
          const bVal = b[sortConfig.key as keyof SavedInvoice];

          if (aVal === null || aVal === undefined) return 1;
          if (bVal === null || bVal === undefined) return -1;

          if (typeof aVal === 'string' && typeof bVal === 'string') {
              return sortConfig.direction === 'asc' 
                  ? aVal.localeCompare(bVal) 
                  : bVal.localeCompare(aVal);
          }
          if (typeof aVal === 'number' && typeof bVal === 'number') {
              return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
          }
          return 0;
      });
  };

  const activeInvoice = invoices.find(i => i.id === viewingInvoiceId);

  // Calculate next invoice ID for auto-advance in Pending tab
  let nextReviewId: number | null = null;
  if (activeTab === 'pending' && viewingInvoiceId) {
      const activeList = getActiveList(); // Use sorted list for consistent order
      const currentIndex = activeList.findIndex(i => i.id === viewingInvoiceId);
      if (currentIndex !== -1 && currentIndex < activeList.length - 1) {
          nextReviewId = activeList[currentIndex + 1].id;
      }
  }

  if (viewingInvoiceId && activeInvoice) {
      // Map to FileData for detail view compatibility
      const fileData = {
          id: activeInvoice.id.toString(),
          file: new File([], "Stored"),
          type: 'pdf' as const,
          status: 'saved' as const,
          base64: activeInvoice.file_content || undefined,
          extractionResult: {
              ico: activeInvoice.ico,
              companyName: activeInvoice.company_name,
              amountWithVat: activeInvoice.amount_with_vat,
              amountWithoutVat: activeInvoice.amount_without_vat,
              currency: activeInvoice.currency,
              confidence: activeInvoice.confidence,
              // Map full details for Producer View
              variableSymbol: activeInvoice.variable_symbol,
              description: activeInvoice.description,
              bankAccount: activeInvoice.bank_account,
              iban: activeInvoice.iban,
              rawText: activeInvoice.raw_text || undefined
          }
      };

      return (
          <InvoiceDetail 
              invoice={activeInvoice}
              fileData={fileData}
              project={currentProject}
              nextDraftId={nextReviewId}
              onBack={() => setViewingInvoiceId(null)}
              onSaved={handleInvoiceUpdated}
              userRole="producer" // Explicitly pass role to enable approval controls
          />
      );
  }

  const formatAmount = (amount: number | null | undefined, currency: string | null) => {
      if (!amount) return '-';
      return new Intl.NumberFormat('cs-CZ').format(amount).replace(/\s/g, ' ') + ' ' + (currency || 'CZK');
  };

  const handleSortChange = (key: string) => {
      setSortConfig(prev => ({
          key,
          direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
      }));
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 flex flex-col h-[calc(100vh-120px)]">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <div>
                <h2 className="text-xl font-bold text-slate-800">Invoice Approvals</h2>
                <p className="text-xs text-slate-500">{currentProject.name}</p>
            </div>
            <div className="flex bg-white rounded-lg p-1 border border-slate-200">
                <button 
                    onClick={() => setActiveTab('pending')}
                    className={`px-3 py-1 text-xs font-bold rounded ${activeTab === 'pending' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500'}`}
                >
                    Ready for Review ({pendingInvoices.length})
                </button>
                <button 
                    onClick={() => setActiveTab('approved')}
                    className={`px-3 py-1 text-xs font-bold rounded ${activeTab === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500'}`}
                >
                    Approved ({approvedInvoices.length})
                </button>
                <button 
                    onClick={() => setActiveTab('rejected')}
                    className={`px-3 py-1 text-xs font-bold rounded ${activeTab === 'rejected' ? 'bg-red-100 text-red-700' : 'text-slate-500'}`}
                >
                    Rejected ({rejectedInvoices.length})
                </button>
            </div>
        </div>
        
        {/* Sort Controls */}
        <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-3 text-xs">
            <span className="text-slate-400 font-bold uppercase">Sort By:</span>
            <button onClick={() => handleSortChange('internal_id')} className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 ${sortConfig.key === 'internal_id' ? 'text-indigo-600 font-bold' : 'text-slate-600'}`}>
                ID {sortConfig.key === 'internal_id' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
            </button>
            <button onClick={() => handleSortChange('company_name')} className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 ${sortConfig.key === 'company_name' ? 'text-indigo-600 font-bold' : 'text-slate-600'}`}>
                Supplier {sortConfig.key === 'company_name' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
            </button>
            <button onClick={() => handleSortChange('amount_without_vat')} className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 ${sortConfig.key === 'amount_without_vat' ? 'text-indigo-600 font-bold' : 'text-slate-600'}`}>
                Amount {sortConfig.key === 'amount_without_vat' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
            </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
            {loading ? <div className="text-center p-10">Loading...</div> : (
                <div className="grid gap-2">
                    {getActiveList().map(inv => (
                        <div 
                            key={inv.id}
                            onClick={() => setViewingInvoiceId(inv.id)}
                            className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 cursor-pointer shadow-sm transition-all"
                        >
                            <div className="flex items-center gap-4">
                                <div className="font-mono text-indigo-600 font-bold">#{inv.internal_id}</div>
                                <div>
                                    <div className="font-bold text-slate-800">{inv.company_name}</div>
                                    <div className="text-xs text-slate-500">{inv.description || 'No description'}</div>
                                    {inv.rejection_reason && (
                                        <div className="text-xs text-red-600 mt-1 font-medium bg-red-50 px-2 py-0.5 rounded inline-block">
                                            Reason: {inv.rejection_reason}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-mono font-bold text-slate-900">{formatAmount(inv.amount_without_vat, inv.currency)}</div>
                                <div className="text-xs text-slate-400">Base Amount</div>
                            </div>
                        </div>
                    ))}
                    {getActiveList().length === 0 && (
                        <div className="text-center py-20 text-slate-400 italic">No invoices in this category.</div>
                    )}
                </div>
            )}
        </div>
    </div>
  );
};

export default ApprovalModule;