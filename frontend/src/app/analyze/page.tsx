'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  FileText, Search, Download, Filter, 
  CheckCircle2, ShieldAlert, Info, Loader2,
  BarChart3, PieChart as PieChartIcon, TrendingUp,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';

export default function AnalyzePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);

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
      const res = await axios.post('/api/analyze-csv', formData, {
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
        }
      });
      setResults(res.data);
    } catch (err) {
      alert("Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 animate-in fade-in duration-500">
      <div className="mb-12">
        <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Bulk Analysis</h1>
        <p className="text-slate-500 font-medium">Large-scale dataset processing for enterprise-wide sentiment mapping.</p>
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
              <div className="grid grid-cols-3 gap-6">
                 {[
                  { label: 'Positive', count: results.summary.positive, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                  { label: 'Negative', count: results.summary.negative, color: 'text-red-500', bg: 'bg-red-50' },
                  { label: 'Neutral', count: results.summary.neutral, color: 'text-blue-500', bg: 'bg-blue-50' },
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {results.results.map((r: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-4 text-xs font-medium text-slate-600 truncate max-w-[400px]">{r.text}</td>
                        <td className="px-8 py-4">
                           <span className={clsx(
                             "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider",
                             r.sentiment === 'positive' ? 'bg-emerald-50 text-emerald-600' :
                             r.sentiment === 'negative' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                           )}>
                             {r.sentiment}
                           </span>
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
