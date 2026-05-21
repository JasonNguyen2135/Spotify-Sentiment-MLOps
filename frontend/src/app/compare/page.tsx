'use client';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  ArrowLeftRight, Loader2, Target, Zap, 
  Database, Activity, TrendingUp, ShieldCheck,
  Search, Filter, ChevronRight, X, Info, ShieldAlert,
  BarChart3, MessageSquare, Sparkles
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';

export default function ComparePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  // Comparison State
  const [compareText, setCompareText] = useState('');
  const [results, setResults] = useState<any>(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

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
        "bg-white p-8 rounded-[3rem] border shadow-sm transition-all hover:shadow-xl group relative overflow-hidden flex flex-col items-center text-center",
        isError ? "border-slate-100 opacity-50" : "border-slate-50"
      )}>
        <div className="absolute top-0 left-0 w-full h-1 bg-brand opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-8">{tier}</span>
        
        <div className={clsx(
          "w-20 h-20 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl transition-transform group-hover:scale-110",
          data.sentiment === 'positive' ? "bg-emerald-500 text-white shadow-emerald-200" : 
          data.sentiment === 'negative' ? "bg-rose-500 text-white shadow-rose-200" : 
          data.sentiment === 'neutral' ? "bg-indigo-500 text-white shadow-indigo-200" : "bg-slate-100 text-slate-400 shadow-none"
        )}>
          {data.sentiment === 'positive' ? <CheckCircle2 className="w-8 h-8" /> : data.sentiment === 'negative' ? <ShieldAlert className="w-8 h-8" /> : <Info className="w-8 h-8" />}
        </div>

        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1">
           {isError ? 'OFFLINE' : data.sentiment}
        </h3>
        <p className="text-xs font-bold text-slate-400 mb-8 uppercase tracking-widest">
           {isError ? 'Service Unavailable' : `${(data.confidence * 100).toFixed(1)}% Confidence`}
        </p>

        <div className="mt-auto w-full pt-6 border-t border-slate-50 space-y-4">
           <div className="flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-300 uppercase">Version</span>
              <span className="text-[10px] font-bold text-slate-500">{data.version}</span>
           </div>
           <div className="flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-300 uppercase">Status</span>
              <div className="flex items-center gap-1">
                 <div className={clsx("w-1.5 h-1.5 rounded-full", isError ? "bg-rose-400" : "bg-emerald-400 animate-pulse")} />
                 <span className="text-[9px] font-black uppercase text-slate-400">{isError ? 'Down' : 'Active'}</span>
              </div>
           </div>
        </div>
      </div>
    );
  };

  const CheckCircle2 = ({ className }: any) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>;

  return (
    <div className="max-w-[1600px] mx-auto py-12 px-6 animate-in fade-in duration-700 pb-20">
      <div className="mb-16 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-3 bg-brand/10 text-brand px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-widest mb-6">
           <Sparkles className="w-4 h-4 fill-brand" /> AI Neural Comparison
        </div>
        <h1 className="text-6xl font-black text-slate-900 mb-4 tracking-tight">
          Cross-Tier <span className="text-brand">Benchmarking</span>
        </h1>
        <p className="text-slate-500 text-lg font-medium italic">Enter live customer feedback to see how all 5 model tiers interpret the sentiment side-by-side.</p>
      </div>

      <div className="bg-slate-900 p-12 rounded-[4rem] shadow-2xl shadow-slate-200 border border-white/5 mb-20 relative overflow-hidden group">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-brand opacity-10 blur-[150px] transition-all group-hover:opacity-20"></div>
        <form onSubmit={handleCompare} className="relative z-10 space-y-8">
           <div className="flex items-center gap-4 text-white mb-2">
              <MessageSquare className="w-6 h-6 text-brand" />
              <label className="text-xl font-black uppercase tracking-tight">Input Live Feedback</label>
           </div>
           <div className="relative group/input">
              <textarea 
                value={compareText}
                onChange={(e) => setCompareText(e.target.value)}
                placeholder="Example: 'The Spotify update is amazing, I love the new dark theme and smoother transitions!'"
                className="w-full h-48 p-10 bg-white/5 border border-white/10 rounded-[3rem] outline-none focus:ring-4 focus:ring-brand/30 text-white text-xl font-medium transition-all placeholder:text-slate-600 resize-none"
              />
              <button 
                type="submit" 
                disabled={comparing || !compareText.trim()}
                className="absolute right-6 bottom-6 bg-brand text-slate-900 px-12 py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest hover:scale-105 transition-all shadow-2xl shadow-brand/40 flex items-center gap-3 disabled:bg-slate-800 disabled:text-slate-500"
              >
                {comparing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Zap className="w-6 h-6 fill-slate-900" />}
                {comparing ? 'Neural Processing...' : 'Run Benchmarking'}
              </button>
           </div>
           <p className="text-slate-500 text-xs font-bold uppercase tracking-widest text-center px-4">
              This will broadcast a real-time request to 5 independent Kubernetes pods and aggregate metrics.
           </p>
        </form>
      </div>

      {results ? (
        <div className="animate-in slide-in-from-bottom duration-700">
           <div className="flex items-center gap-4 mb-10">
              <div className="bg-slate-900 p-3 rounded-2xl text-brand shadow-lg"><BarChart3 className="w-6 h-6" /></div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Aggregation Results</h2>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
              {['basic', 'standard', 'pro', 'premium', 'vip'].map(tier => (
                <TierResultCard key={tier} tier={tier} data={results[tier]} />
              ))}
           </div>
        </div>
      ) : (
        <div className="py-40 flex flex-col items-center justify-center border-4 border-dashed border-slate-100 rounded-[5rem] animate-pulse">
           <ArrowLeftRight className="w-24 h-24 text-slate-200 mb-8" />
           <p className="text-2xl font-black text-slate-300 uppercase tracking-widest">Waiting for Neural Input...</p>
        </div>
      )}
    </div>
  );
}
