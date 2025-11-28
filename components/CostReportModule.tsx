
import React, { useState, useEffect } from 'react';
import { Project, BudgetLine } from '../types';
import { fetchProjectCostReport, fetchAllocationsForBudgetLine } from '../services/supabaseService';

interface CostReportModuleProps {
  currentProject: Project;
  onNavigateToInvoice?: (invoiceId: number) => void;
}

const CostReportModule: React.FC<CostReportModuleProps> = ({ currentProject, onNavigateToInvoice }) => {
  const [reportLines, setReportLines] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Drill-down State
  const [selectedLine, setSelectedLine] = useState<BudgetLine | null>(null);
  const [lineDetails, setLineDetails] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchProjectCostReport(currentProject.id)
      .then(setReportLines)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentProject.id]);

  const handleRowClick = async (line: BudgetLine) => {
      setSelectedLine(line);
      setLoadingDetails(true);
      try {
          const details = await fetchAllocationsForBudgetLine(line.id);
          setLineDetails(details);
      } catch (e) {
          console.error(e);
      } finally {
          setLoadingDetails(false);
      }
  };

  const handleDetailClick = (invoiceId: number) => {
      if (onNavigateToInvoice) {
          onNavigateToInvoice(invoiceId);
      }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('cs-CZ', { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
    }).format(amount).replace(/\s/g, ' '); // Ensure spaces
  };

  const filteredLines = reportLines.filter(line => 
      line.account_number.toLowerCase().includes(searchTerm.toLowerCase()) || 
      line.account_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      line.category_description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalBudget = reportLines.reduce((sum, l) => sum + l.original_amount, 0);
  const totalSpent = reportLines.reduce((sum, l) => sum + (l.spent_amount || 0), 0);
  const totalRemaining = totalBudget - totalSpent;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 flex flex-col h-[calc(100vh-120px)] relative">
      {/* Header & Totals */}
      <div className="p-6 border-b border-slate-200 bg-slate-50 shrink-0">
        <div className="flex justify-between items-start mb-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-800">Cost Report</h2>
                <p className="text-slate-500">{currentProject.name} — {currentProject.currency}</p>
            </div>
            <div className="flex gap-8 text-right">
                <div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Total Budget</p>
                    <p className="text-xl font-mono font-bold text-slate-800">{formatCurrency(totalBudget)}</p>
                </div>
                <div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Spent</p>
                    <p className="text-xl font-mono font-bold text-indigo-600">{formatCurrency(totalSpent)}</p>
                </div>
                <div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Remaining</p>
                    <p className={`text-xl font-mono font-bold ${totalRemaining < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        {formatCurrency(totalRemaining)}
                    </p>
                </div>
            </div>
        </div>
        
        <input 
            type="text" 
            placeholder="Search by account number or description..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
          {loading ? (
              <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
          ) : (
              <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-white text-slate-500 font-semibold sticky top-0 z-10 shadow-sm">
                      <tr>
                          <th className="px-6 py-3 border-b">Acct #</th>
                          <th className="px-6 py-3 border-b">Description</th>
                          <th className="px-6 py-3 border-b">Category</th>
                          <th className="px-6 py-3 border-b text-right">Budget</th>
                          <th className="px-6 py-3 border-b text-right">Spent</th>
                          <th className="px-6 py-3 border-b text-right">Remaining</th>
                          <th className="px-6 py-3 border-b text-center w-24">%</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {filteredLines.map(line => {
                          const spent = line.spent_amount || 0;
                          const remaining = line.remaining_amount || 0;
                          const percent = line.original_amount > 0 ? (spent / line.original_amount) * 100 : 0;
                          const isOver = remaining < 0;

                          return (
                              <tr 
                                  key={line.id} 
                                  className="hover:bg-indigo-50 cursor-pointer transition-colors"
                                  onClick={() => handleRowClick(line)}
                              >
                                  <td className="px-6 py-3 font-mono text-slate-600 font-medium">{line.account_number}</td>
                                  <td className="px-6 py-3 font-medium text-slate-800">{line.account_description}</td>
                                  <td className="px-6 py-3 text-slate-500 text-xs">{line.category_description}</td>
                                  <td className="px-6 py-3 text-right font-mono text-slate-600">{formatCurrency(line.original_amount)}</td>
                                  <td className="px-6 py-3 text-right font-mono text-indigo-600 font-medium">{spent > 0 ? formatCurrency(spent) : '-'}</td>
                                  <td className={`px-6 py-3 text-right font-mono font-bold ${isOver ? 'text-red-500' : 'text-emerald-600'}`}>
                                      {formatCurrency(remaining)}
                                  </td>
                                  <td className="px-6 py-3 align-middle">
                                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                          <div 
                                            className={`h-full rounded-full ${isOver ? 'bg-red-500' : 'bg-emerald-500'}`} 
                                            style={{ width: `${Math.min(percent, 100)}%` }}
                                          ></div>
                                      </div>
                                  </td>
                              </tr>
                          );
                      })}
                      {filteredLines.length === 0 && (
                          <tr><td colSpan={7} className="text-center py-10 text-slate-400 italic">No budget lines found.</td></tr>
                      )}
                  </tbody>
              </table>
          )}
      </div>

      {/* DRILL-DOWN MODAL */}
      {selectedLine && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                      <div>
                          <h3 className="font-bold text-slate-800 text-lg">{selectedLine.account_number} - {selectedLine.account_description}</h3>
                          <p className="text-xs text-slate-500">Allocated Invoices</p>
                      </div>
                      <button onClick={() => setSelectedLine(null)} className="text-slate-400 hover:text-slate-600">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                  </div>
                  
                  <div className="p-4 overflow-y-auto flex-1">
                      {loadingDetails ? (
                          <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div></div>
                      ) : lineDetails.length === 0 ? (
                          <p className="text-center text-slate-400 italic py-8">No invoices allocated to this line.</p>
                      ) : (
                          <table className="w-full text-sm text-left">
                              <thead className="text-slate-500 font-medium border-b border-slate-100">
                                  <tr>
                                      <th className="pb-2">Invoice #</th>
                                      <th className="pb-2">Supplier</th>
                                      <th className="pb-2">Description</th>
                                      <th className="pb-2 text-right">Amount</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                  {lineDetails.map((item, idx) => (
                                      <tr 
                                          key={idx} 
                                          className="hover:bg-indigo-50 cursor-pointer group"
                                          onClick={() => handleDetailClick(item.id)}
                                      >
                                          <td className="py-3 font-mono text-indigo-600 group-hover:underline">#{item.internal_id}</td>
                                          <td className="py-3">{item.company_name}</td>
                                          <td className="py-3 text-slate-500 truncate max-w-xs">{item.description}</td>
                                          <td className="py-3 text-right font-mono font-bold text-slate-700">{formatCurrency(item.amount)}</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      )}
                  </div>
                  <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl text-right">
                      <span className="text-xs font-bold text-slate-500 uppercase mr-4">Total Spent:</span>
                      <span className="font-mono font-bold text-indigo-600 text-lg">
                          {formatCurrency(lineDetails.reduce((sum, i) => sum + i.amount, 0))}
                      </span>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default CostReportModule;
