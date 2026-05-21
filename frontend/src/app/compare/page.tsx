'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { 
  ArrowLeftRight, Loader2, Zap, 
  Info, ShieldAlert, BarChart3, MessageSquare, Sparkles, TrendingUp
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';

export default function ComparePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  // Model Data for Benchmarking
  const [models, setModels] = useState<any[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);

  // Comparison State
  const [compareText, setCompareText] = useState('');
  const [results, setResults] = useState<any>(null);
  const [comparing, setComparing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/models', { 
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setModels(res.data || []);
    } catch (err) {
      console.error("Failed to fetch models for benchmarking", err);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    if (user) fetchData();
  }, [user, authLoading, router, fetchData]);

  const benchmarkData = useMemo(() => {
    return models.map(m => ({
       name: m.tier_label,
       key: m.name.replace('Sentiment_', '').replace('_Model', '').toLowerCase(),
       accuracy: m.metrics?.accuracy || 0,
       f1: m.metrics?.f1 || 0,
       latency: m.metrics?.latency || 42,
       version: m.version
    }));
 }, [models]);

  const handleCompare = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!compareText.trim()) return;
    setComparing(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/compare-tiers', {
        params: { review_text: compareText },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setResults(res.data);
    } catch (err) {
      alert("Cross-tier analysis failed. Ensure all model pods are running.");
    } finally {
      setComparing(false);
    }
  };

  const TierResultCard = ({ tier, data }: { tier: string, data: any }) => {
    const isError = data.sentiment === 'error';
    return (
      <div className={clsx(
        "bg-white p-6 rounded-[2.5rem] border shadow-sm transition-all hover:shadow-xl group relative overflow-hidden flex flex-col items-center text-center",
        isError ? "border-slate-100 opacity-50" : "border-slate-50"
      )}>
        <div className="absolute top-0 left-0 w-full h-1 bg-brand opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">{tier}</span>
        
        <div className={clsx(
          "w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-xl transition-transform group-hover:scale-110",
          data.sentiment === 'positive' ? "bg-emerald-500 text-white shadow-emerald-200" : 
          data.sentiment === 'negative' ? "bg-rose-500 text-white shadow-rose-200" : 
          data.sentiment === 'neutral' ? "bg-indigo-500 text-white shadow-indigo-200" : "bg-slate-100 text-slate-400 shadow-none"
        )}>
          {data.sentiment === 'positive' ? <CheckCircle2 className="w-6 h-6" /> : data.sentiment === 'negative' ? <ShieldAlert className="w-6 h-6" /> : <Info className="w-6 h-6" />}
        </div>

        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter mb-1">
           {isError ? 'OFFLINE' : data.sentiment}
        </h3>
        <p className="text-[10px] font-bold text-slate-400 mb-4 uppercase tracking-widest">
           {isError ? 'Service Unavailable' : `${(data.confidence * 100).toFixed(1)}% Confidence`}
        </p>

        <div className="mt-auto w-full pt-4 border-t border-slate-50 space-y-2">
           <div className="flex justify-between items-center">
              <span className="text-[8px] font-black text-slate-300 uppercase">Version</span>
              <span className="text-[9px] font-bold text-slate-500">{data.version}</span>
           </div>
        </div>
      </div>
    );
  };

  const CheckCircle2 = ({ className }: any) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>;

  return (
    <div className="max-w-[1600px] mx-auto py-10 px-8 animate-in fade-in duration-700 pb-20">
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16 items-stretch">
        {/* LEFT COLUMN: Header & Input */}
        <div className="flex flex-col h-full">
          <div className="mb-10">
            <div className="inline-flex items-center gap-3 bg-brand/10 text-brand px-5 py-1.5 rounded-full font-black text-[9px] uppercase tracking-widest mb-6">
              <Sparkles className="w-3.5 h-4 fill-brand" /> AI Neural Comparison
            </div>
            <h1 className="text-5xl font-black text-slate-900 mb-4 tracking-tight">
              Cross-Tier <span className="text-brand">Benchmarking</span>
            </h1>
            <p className="text-slate-500 text-base font-medium italic">Enter feedback to see how all 5 model tiers interpret sentiment side-by-side.</p>
          </div>

          <div className="bg-slate-900 p-10 rounded-[3.5rem] shadow-2xl shadow-slate-200 border border-white/5 relative overflow-hidden group flex-1 flex flex-col">
            <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-brand opacity-10 blur-[100px] transition-all group-hover:opacity-20"></div>
            <form onSubmit={handleCompare} className="relative z-10 flex flex-col h-full">
              <div className="flex items-center gap-4 text-white mb-6">
                  <MessageSquare className="w-5 h-5 text-brand" />
                  <label className="text-lg font-black uppercase tracking-tight">Input Live Feedback</label>
              </div>
              
              <textarea 
                value={compareText}
                onChange={(e) => setCompareText(e.target.value)}
                placeholder="Example: 'The Spotify update is amazing...'"
                className="w-full flex-1 min-h-[150px] p-8 bg-white/5 border border-white/10 rounded-[2.5rem] outline-none focus:ring-4 focus:ring-brand/30 text-white text-lg font-medium transition-all placeholder:text-slate-600 resize-none mb-8"
              />
              
              <div className="mt-auto space-y-4">
                <button 
                  type="submit" 
                  disabled={comparing || !compareText.trim()}
                  className="w-full bg-brand text-slate-900 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] transition-all shadow-2xl shadow-brand/40 flex items-center justify-center gap-3 disabled:bg-slate-800 disabled:text-slate-500"
                >
                  {comparing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 fill-slate-900" />}
                  {comparing ? 'Neural Processing...' : 'Run Benchmarking'}
                </button>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest text-center">
                    Broadcasts to 5 independent Kubernetes pods.
                </p>
              </div>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: Intelligence Benchmarking */}
        <div className="space-y-8 h-full">
          <div className="flex items-center gap-4 px-2">
             <div className="bg-brand p-3 rounded-2xl text-slate-900 shadow-lg shadow-brand/20"><BarChart3 className="w-6 h-6" /></div>
             <div>
               <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Intelligence Benchmarking</h2>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Performance visualization (Accuracy vs Latency)</p>
             </div>
          </div>

          {loadingModels ? (
            <div className="h-[400px] flex items-center justify-center bg-slate-50 rounded-[3rem] border border-dashed border-slate-200">
               <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {benchmarkData.map((data, idx) => (
                <div key={data.key} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="flex justify-between items-center mb-4">
                       <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">{data.name}</h3>
                       <div className="bg-slate-900 text-brand px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter">v{data.version}</div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-8">
                      <div>
                          <div className="flex justify-between text-[8px] font-black text-slate-400 uppercase mb-1.5"><span>Accuracy</span><span>{(data.accuracy * (data.accuracy > 1 ? 1 : 100)).toFixed(1)}%</span></div>
                          <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${data.accuracy * (data.accuracy > 1 ? 1 : 100)}%` }}></div>
                          </div>
                      </div>
                      <div>
                          <div className="flex justify-between text-[8px] font-black text-slate-400 uppercase mb-1.5"><span>Latency</span><span>{data.latency}ms</span></div>
                          <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (data.latency / 200) * 100)}%` }}></div>
                          </div>
                      </div>
                    </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM SECTION: Aggregation Results */}
      {results && (
        <div className="animate-in slide-in-from-bottom duration-700 mb-20">
           <div className="flex items-center gap-4 mb-10">
              <div className="bg-slate-900 p-3 rounded-2xl text-brand shadow-lg"><Sparkles className="w-6 h-6 fill-brand" /></div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Aggregation Results</h2>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
              {['basic', 'standard', 'pro', 'premium', 'vip'].map(tier => (
                <TierResultCard key={tier} tier={tier} data={results[tier]} />
              ))}
           </div>
        </div>
      )}
    </div>
  );
}
