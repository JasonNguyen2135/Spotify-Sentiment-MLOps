'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  FileText, Search, Download, Filter,
  CheckCircle2, ShieldAlert, Info, Loader2,
  BarChart3, PieChart as PieChartIcon, TrendingUp,
  MessageSquare, Settings, Sparkles
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';

const TIERS = [
  { id: 'basic', name: 'Basic' },
  { id: 'standard', name: 'Standard' },
  { id: 'pro', name: 'Pro' },
  { id: 'premium', name: 'Premium' },
  { id: 'vip', name: 'VIP' },
];

export default function AnalyzePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applyMode, setApplyMode] = useState<'manual' | 'auto'>('auto');
  const [tier, setTier] = useState('basic');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFile(e.target.files[0]);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setAnalyzing(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const token = localStorage.getItem('token');
      const params: any = { apply_mode: applyMode };
      if (applyMode === 'manual') params.model_key = tier;
      // Let axios set the multipart Content-Type (with boundary) automatically.
      const res = await axios.post('/api/analyze-csv', formData, {
        params,
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setResults(res.data);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        alert("Your session has expired. Please log in again.");
        localStorage.removeItem('token');
        router.push('/login');
      } else {
        alert(err?.response?.data?.detail || "Analysis failed. Please check the CSV and try again.");
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDownloadResults = () => {
    if (!results || !results.results) return;
    const headers = ["id", "time", "text", "sentiment", "tier", "escalations"];
    const csvContent = [
      headers.join(","),
      ...results.results.map((r: any) => [r.id, `"${r.time}"`, `"${r.text.replace(/"/g, '""')}"`, r.sentiment, r.tier ?? '', r.escalations ?? 0].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `analysis_results_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 animate-in fade-in duration-500">
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Bulk Analysis</h1>
          <p className="text-slate-500 font-medium">Large-scale dataset processing for enterprise-wide sentiment mapping.</p>
        </div>
        {results && (
          <button 
            onClick={handleDownloadResults}
            className="bg-emerald-500 text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
          >
            <Download className="w-4 h-4" /> Download CSV
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-1">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm sticky top-24">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand" /> Upload Dataset
            </h2>
            <form onSubmit={handleUpload} className="space-y-6">
              <div className="border-2 border-dashed border-slate-100 rounded-[2rem] p-8 text-center hover:border-brand/30 transition-all group">
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleFileChange}
                  className="hidden" 
                  id="csv-upload" 
                />
                <label htmlFor="csv-upload" className="cursor-pointer">
                  <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-brand/5 group-hover:text-brand transition-all">
                    <Download className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{file ? file.name : 'Choose CSV File'}</p>
                </label>
              </div>

              {/* Serving mode: Manual (one fixed tier) vs Auto (per-row router + cascade) */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Serving Mode</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setApplyMode('manual')}
                    className={clsx("flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all",
                      applyMode === 'manual' ? "border-brand bg-brand/5 text-slate-900" : "border-slate-100 text-slate-400 hover:border-slate-200")}>
                    <Settings className="w-3.5 h-3.5" /> Manual
                  </button>
                  <button type="button" onClick={() => setApplyMode('auto')}
                    className={clsx("flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all",
                      applyMode === 'auto' ? "border-brand bg-brand/5 text-slate-900" : "border-slate-100 text-slate-400 hover:border-slate-200")}>
                    <Sparkles className="w-3.5 h-3.5" /> Auto
                  </button>
                </div>
                {applyMode === 'manual' ? (
                  <select value={tier} onChange={e => setTier(e.target.value)}
                    className="mt-3 w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:border-brand outline-none">
                    {TIERS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                ) : (
                  <p className="mt-3 text-[10px] font-medium text-slate-400 italic leading-relaxed">
                    Each comment is routed to the cheapest capable tier and escalated to a stronger one when confidence is low.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!file || analyzing}
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200"
              >
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Analyze Dataset
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          {results ? (
            <div className="space-y-8 animate-in slide-in-from-bottom duration-500">
              {/* Processing summary: which model(s) served the dataset + routing stats */}
              <div className="bg-slate-900 p-6 rounded-[2rem] shadow-lg text-white">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    {results.apply_mode === 'auto'
                      ? <Sparkles className="w-5 h-5 text-brand" />
                      : <Settings className="w-5 h-5 text-brand" />}
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Served by</p>
                      <p className="text-sm font-black uppercase tracking-wide">
                        {results.apply_mode === 'auto'
                          ? `Auto routing · ${results.escalations_total || 0} escalations (${Math.round((results.escalation_rate || 0) * 100)}%)`
                          : `${(results.manual_tier || '').toUpperCase()} tier (fixed)`}
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400">{results.processed || (results.results || []).length} of {results.total} rows processed</p>
                </div>
                {/* Per-tier distribution (meaningful in auto mode; constant in manual) */}
                <div className="flex flex-wrap gap-2 mt-4">
                  {TIERS.map(t => (
                    <span key={t.id} className={clsx(
                      "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider",
                      (results.tier_distribution?.[t.id] || 0) > 0 ? "bg-brand/15 text-brand" : "bg-white/5 text-slate-500"
                    )}>
                      {t.name}: {results.tier_distribution?.[t.id] || 0}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6">
                 {[
                  { label: 'Positive', count: results?.summary?.positive || 0, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                  { label: 'Negative', count: results?.summary?.negative || 0, color: 'text-red-500', bg: 'bg-red-50' },
                  { label: 'Neutral', count: results?.summary?.neutral || 0, color: 'text-blue-500', bg: 'bg-blue-50' },
                ].map(item => (
                  <div key={item.label} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                    <p className={clsx("text-2xl font-black", item.color)}>{item.count}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                      <th className="px-8 py-4">Snippet</th>
                      <th className="px-8 py-4">Sentiment</th>
                      <th className="px-8 py-4">Tier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(results?.results || []).map((r: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-4 text-xs font-medium text-slate-600 truncate max-w-[360px]">{r?.text || 'No content'}</td>
                        <td className="px-8 py-4">
                           <span className={clsx(
                             "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider",
                             r.sentiment === 'positive' ? 'bg-emerald-50 text-emerald-600' :
                             r.sentiment === 'negative' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                           )}>
                             {r.sentiment}
                           </span>
                        </td>
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600">
                              {r.tier || '—'}
                            </span>
                            {r.escalations > 0 && (
                              <span className="text-[9px] font-bold text-amber-500" title="escalated to a stronger tier">↑{r.escalations}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[400px] bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 italic">
               <BarChart3 className="w-12 h-12 mb-4 opacity-20" />
               <p>Upload a CSV file to begin bulk sentiment extraction.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
