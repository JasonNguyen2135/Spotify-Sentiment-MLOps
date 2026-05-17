'use client';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  ArrowLeftRight, Loader2, Target, Zap, 
  Database, Activity, TrendingUp, ShieldCheck,
  Search, Filter, ChevronRight
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';

export default function ComparePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [model1, setModel1] = useState('Production');
  const [model2, setModel2] = useState('BERT');
  const [models, setModels] = useState<any[]>([]);
  const [compData, setCompData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchComparison = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/models/compare', { 
        params: { v1: model1, v2: model2 },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setCompData(res.data);
    } catch (err) { 
      console.error(err); 
      alert("Failed to fetch model metrics from MLflow.");
    } finally { setLoading(false); }
  }, [model1, model2]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    const fetchModels = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/models', { headers: { 'Authorization': `Bearer ${token}` }});
        setModels(res.data || []);
      } catch (err) { console.error(err); }
    };
    if (user) {
      fetchModels();
      // Don't auto-run comparison on load, wait for user click
      setLoading(false);
    }
  }, [user, authLoading, router]);

  const MetricCard = ({ label, m1, m2, unit = "" }: any) => {
    const val1 = parseFloat(m1) || 0;
    const val2 = parseFloat(m2) || 0;
    const improvement = val1 !== 0 ? ((val2 - val1) / val1 * 100) : 0;

    return (
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:shadow-xl group">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 text-center">{label}</p>
        <div className="flex items-center justify-between gap-4">
          <div className="text-center flex-1">
             <p className="text-3xl font-black text-slate-900">{m1}{unit}</p>
             <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Model A</p>
          </div>
          <div className="h-10 w-px bg-slate-100" />
          <div className="text-center flex-1">
             <p className="text-3xl font-black text-brand">{m2}{unit}</p>
             <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Model B</p>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-slate-50 flex justify-center">
           <div className={clsx(
             "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
             improvement >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
           )}>
             {improvement >= 0 ? `+${improvement.toFixed(1)}% Improvement` : `${improvement.toFixed(1)}% Variance`}
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 animate-in fade-in duration-500 pb-20">
      <div className="mb-12 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tight flex items-center gap-4">
            <ArrowLeftRight className="w-10 h-10 text-brand" /> Model Benchmarking
          </h1>
          <p className="text-slate-500 font-medium">Compare production metrics vs. experimental candidates side-by-side.</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-[2rem] border border-slate-200">
           <select value={model1} onChange={(e) => setModel1(e.target.value)} className="bg-white px-4 py-2 rounded-xl text-[10px] font-black uppercase outline-none shadow-sm cursor-pointer">
              <option value="Production">Prod (Current)</option>
              {models.map(m => <option key={m.version} value={m.version}>v{m.version}</option>)}
           </select>
           <div className="text-[10px] font-black text-slate-400 px-2 uppercase">VS</div>
           <select value={model2} onChange={(e) => setModel2(e.target.value)} className="bg-white px-4 py-2 rounded-xl text-[10px] font-black uppercase outline-none shadow-sm border-2 border-brand/20 cursor-pointer">
              <option value="BERT">BERT-base</option>
              <option value="LSTM">Bi-LSTM</option>
              {models.map(m => <option key={m.version} value={m.version}>v{m.version}</option>)}
           </select>
           <button 
             onClick={fetchComparison}
             className="ml-4 bg-brand text-white px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-brand/20 flex items-center gap-2"
           >
             <ArrowLeftRight className="w-3 h-3" /> Run Comparison
           </button>
        </div>
      </div>

      {loading ? (
        <div className="py-40 text-center"><Loader2 className="w-12 h-12 animate-spin mx-auto text-brand mb-4" /><p className="text-slate-400 italic font-medium">Benchmarking model performance...</p></div>
      ) : compData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <MetricCard label="Accuracy Score" m1={compData.model1.accuracy} m2={compData.model2.accuracy} />
          <MetricCard label="F1 Weighted" m1={compData.model1.f1} m2={compData.model2.f1} />
          <MetricCard label="Precision" m1={compData.model1.precision} m2={compData.model2.precision} />
          <MetricCard label="Avg Latency" m1={compData.model1.latency} m2={compData.model2.latency} unit="" />
        </div>
      )}
    </div>
  );
}
