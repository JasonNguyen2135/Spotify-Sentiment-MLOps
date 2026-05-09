'use client';
import { useState } from 'react';
import axios from 'axios';
import { 
  FileText, ArrowRight, Loader2, Sparkles, 
  TrendingUp, TrendingDown, Minus, Info, 
  BarChart3, PieChart as PieChartIcon, 
  ArrowLeftRight, Download, Trash2
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { 
  ResponsiveContainer, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, 
  Legend, Cell, PieChart, Pie 
} from 'recharts';

export default function ComparePage() {
  const { user, loading: authLoading } = useAuth();
  const { activeProject } = useProject();
  const router = useRouter();
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    if (!authLoading && !activeProject) {
      router.push('/');
    }
  }, [activeProject, authLoading, router]);

  const handleUpload = async () => {
    if (!file1 || !file2 || !activeProject) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = { project_id: activeProject.id };
      const formData1 = new FormData();
      formData1.append('file', file1);
      const formData2 = new FormData();
      formData2.append('file', file2);

      const [res1, res2] = await Promise.all([
        axios.post('/api/analyze-csv', formData1, { params, headers: { 'Authorization': `Bearer ${token}` } }),
        axios.post('/api/analyze-csv', formData2, { params, headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      const process = (data: any[]) => {
        const counts = data.reduce((acc, curr) => {
          acc[curr.sentiment] = (acc[curr.sentiment] || 0) + 1;
          return acc;
        }, { positive: 0, negative: 0, neutral: 0 });
        return { 
          total: data.length, 
          positive: (counts.positive / data.length) * 100,
          negative: (counts.negative / data.length) * 100,
          neutral: (counts.neutral / data.length) * 100,
          raw: counts
        };
      };

      setResults({
        set1: process(res1.data.results),
        set2: process(res2.data.results),
        names: [file1.name, file2.name]
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const delta = results ? results.set2.positive - results.set1.positive : 0;

  return (
    <div className="max-w-7xl mx-auto pb-20 px-4 animate-in fade-in duration-700">
      <div className="mb-12">
        <div className="flex items-center gap-2 mb-2">
          <div className="bg-brand/10 text-brand p-1.5 rounded-lg">
            <ArrowLeftRight className="w-5 h-5" />
          </div>
          <span className="text-brand font-black text-[10px] uppercase tracking-[0.2em]">Comparative Analytics</span>
        </div>
        <h1 className="text-4xl font-black text-gray-900 tracking-tight">
          Sentiment <span className="text-brand">Delta Report</span>
        </h1>
        <p className="text-gray-500 mt-2 text-lg">Compare two datasets side-by-side to detect market shifts and trend deviations.</p>
      </div>

      {!results ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center group transition-all hover:shadow-md relative">
               <input 
                type="file" 
                accept=".csv"
                onChange={(e) => i === 1 ? setFile1(e.target.files?.[0] || null) : setFile2(e.target.files?.[0] || null)}
                className="absolute inset-0 opacity-0 cursor-pointer z-10" 
              />
              <div className="bg-slate-50 p-6 rounded-full mb-6 group-hover:bg-brand/5 group-hover:scale-110 transition-all">
                <FileText className="w-12 h-12 text-slate-300 group-hover:text-brand" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">Dataset {i === 1 ? 'A' : 'B'}</h3>
              <p className="text-slate-400 text-sm font-medium mb-6">Select CSV for comparison</p>
              {(i === 1 ? file1 : file2) && (
                <div className="bg-brand text-white px-4 py-1.5 rounded-full text-xs font-black">
                  {(i === 1 ? file1 : file2)?.name}
                </div>
              )}
            </div>
          ))}
          <div className="lg:col-span-2 flex justify-center mt-6">
            <button 
              onClick={handleUpload}
              disabled={!file1 || !file2 || loading}
              className="bg-brand text-white px-12 py-5 rounded-2xl font-black text-xl hover:opacity-90 transition-all shadow-2xl shadow-brand/20 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none flex items-center gap-3"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
              GENERATE COMPARATIVE REPORT
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
             {/* Delta Card */}
             <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-brand opacity-20 blur-3xl"></div>
                <div>
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">Net Positive Change</p>
                  <div className="flex items-end gap-2">
                    <h2 className="text-6xl font-black">{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</h2>
                    <div className={clsx(
                      "mb-2 p-1 rounded-lg",
                      delta > 0 ? "bg-emerald-500/20 text-emerald-400" : delta < 0 ? "bg-red-500/20 text-red-400" : "bg-slate-500/20 text-slate-400"
                    )}>
                      {delta > 0 ? <TrendingUp className="w-6 h-6" /> : delta < 0 ? <TrendingDown className="w-6 h-6" /> : <Minus className="w-6 h-6" />}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed mt-6">
                  Dataset B shows a <span className="font-bold text-white">{Math.abs(delta).toFixed(1)}% {delta >= 0 ? 'increase' : 'decrease'}</span> in positive sentiment compared to Dataset A.
                </p>
                <button 
                  onClick={() => {setResults(null); setFile1(null); setFile2(null);}}
                  className="mt-8 text-xs font-black text-brand uppercase tracking-widest hover:underline flex items-center gap-2"
                >
                  <Trash2 className="w-3 h-3" /> Start New Comparison
                </button>
             </div>

             {/* Side-by-Side Chart */}
             <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
                <h3 className="font-black text-slate-900 mb-8 uppercase text-xs tracking-widest">Sentiment Composition</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: 'Positive', A: results.set1.positive, B: results.set2.positive },
                      { name: 'Negative', A: results.set1.negative, B: results.set2.negative },
                      { name: 'Neutral', A: results.set1.neutral, B: results.set2.neutral },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontWeight: 'bold', fontSize: 10}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                      <Tooltip contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 10px 30px -5px rgb(0 0 0 / 0.1)'}} />
                      <Legend iconType="circle" />
                      <Bar dataKey="A" name={results.names[0]} fill="#e2e8f0" radius={[10, 10, 0, 0]} />
                      <Bar dataKey="B" name={results.names[1]} fill="#1db954" radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {[results.set1, results.set2].map((set, i) => (
              <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h4 className="font-black text-slate-900 uppercase text-xs tracking-widest">Analysis: {results.names[i]}</h4>
                  <span className="bg-slate-50 px-3 py-1 rounded-full text-[10px] font-black text-slate-400">N = {set.total}</span>
                </div>
                <div className="space-y-4">
                  {[
                    { label: 'Positive', val: set.positive, color: 'bg-emerald-500' },
                    { label: 'Negative', val: set.negative, color: 'bg-red-500' },
                    { label: 'Neutral', val: set.neutral, color: 'bg-blue-500' }
                  ].map(row => (
                    <div key={row.label}>
                      <div className="flex justify-between text-[10px] font-black uppercase mb-1.5">
                        <span className="text-slate-400">{row.label}</span>
                        <span className="text-slate-900">{row.val.toFixed(1)}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden">
                        <div className={clsx("h-full rounded-full transition-all duration-1000", row.color)} style={{ width: `${row.val}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
