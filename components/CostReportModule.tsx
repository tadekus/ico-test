
import React, { useState, useEffect } from 'react';
import { Project, BudgetLine } from '../types';
import { fetchProjectCostReport } from '../services/supabaseService';

interface CostReportModuleProps {
  currentProject: Project;
}

const CostReportModule: React.FC<CostReportModuleProps> = ({ currentProject }) => {
  const [reportLines, setReportLines] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchProjectCostReport(currentProject.id)
      .then(setReportLines)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentProject.id]);

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
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 flex flex-col h-[calc(100vh-120px)]">
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
                              <tr key={line.id} className="hover:bg-slate-50">
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
    </div>
  );
};

export default CostReportModule;
