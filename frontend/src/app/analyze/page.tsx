'use client';
import { useState } from 'react';
import axios from 'axios';
import { 
  UploadCloud, FileText, CheckCircle2, AlertCircle, 
  Loader2, Download, Table, BarChart3, PieChart,
  ArrowRight, ShieldCheck, Zap
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Cell, PieChart as RePieChart, Pie
} from 'recharts';

export default function AnalyzePage() {
  const { user } = useAuth();
  const { activeProject } = useProject();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProject) router.push('/');
  }, [activeProject, router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !activeProject) return;
    setAnalyzing(true);
    setResults(null);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/analyze-csv', formData, {
        params: { project_id: activeProject.id },
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setResults(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to process file');
    } finally {
      setAnalyzing(false);
    }
  };

  const sentimentData = results ? [
    { name: 'Positive', value: results.summary.positive, color: '#10b981' },
    { name: 'Negative', value: results.summary.negative, color: '#ef4444' },
    { name: 'Neutral', value: results.summary.neutral, color: '#6366f1' },
  ] : [];

  const handleExportCSV = () => {
    if (!results) return;
    const headers = ['text', 'sentiment', 'timestamp'];
    const csvContent = [
      headers.join(','),
      ...results.results.map((r: any) => [
        `"${r.text.replace(/"/g, '""')}"`,
        r.sentiment,
        r.timestamp
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `analysis_report_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-700 pb-20">
      <div className="mb-10">
        <h1 className="text-4xl font-black text-slate-900 flex items-center gap-3">
          <UploadCloud className="text-brand w-10 h-10" />
          Bulk <span className="text-brand">Analysis</span>
        </h1>
        <p className="text-slate-500 mt-2 text-lg">Upload your datasets for massive-scale sentiment intelligence.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Upload Section */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className={clsx(
              "relative border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center text-center transition-all",
              file ? "border-brand bg-brand/5" : "border-slate-200 hover:border-brand/50 bg-slate-50"
            )}>
              <div className={clsx(
                "w-16 h-16 rounded-2xl flex items-center justify-center mb-4",
                file ? "bg-brand text-white" : "bg-white text-slate-400 shadow-sm"
              )}>
                {file ? <FileText className="w-8 h-8" /> : <UploadCloud className="w-8 h-8" />}
              </div>
              
              {file ? (
                <div>
                  <p className="font-bold text-slate-900 truncate max-w-[200px]">{file.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="font-bold text-slate-900">Choose CSV File</p>
                  <p className="text-xs text-slate-400 mt-1">Drag and drop or click to browse</p>
                </div>
              )}
              
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={analyzing}
              />
            </div>

            <button 
              onClick={handleUpload}
              disabled={!file || analyzing}
              className="w-full mt-6 bg-slate-900 text-white py-5 rounded-2xl font-black text-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
            >
              {analyzing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Zap className="w-6 h-6 fill-amber-400 text-amber-400" />}
              START ANALYSIS
            </button>
            
            {error && (
              <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
          </div>

          <div className="bg-brand/5 p-6 rounded-3xl border border-brand/10">
            <h3 className="text-sm font-black text-brand uppercase tracking-widest mb-2">Instructions</h3>
            <ul className="text-xs text-brand-700 space-y-2 leading-relaxed font-medium">
              <li className="flex gap-2"><span>•</span> File must be in CSV format.</li>
              <li className="flex gap-2"><span>•</span> Column "text" or "review" is required.</li>
              <li className="flex gap-2"><span>•</span> Max 1000 rows per analysis.</li>
            </ul>
          </div>
        </div>

        {/* Results Section */}
        <div className="lg:col-span-2 space-y-8">
          {!results && !analyzing && (
            <div className="h-full min-h-[400px] bg-slate-50 border border-slate-100 rounded-[2.5rem] flex flex-col items-center justify-center text-center p-10">
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-sm text-slate-300">
                <BarChart3 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-slate-400">Analysis Results</h2>
              <p className="text-slate-400 mt-2 max-w-sm">Upload a dataset to see deep sentiment insights and visualizations here.</p>
            </div>
          )}

          {analyzing && (
            <div className="h-full min-h-[400px] bg-white border border-slate-100 rounded-[2.5rem] flex flex-col items-center justify-center text-center p-10 animate-pulse">
              <Loader2 className="w-12 h-12 text-brand animate-spin mb-6" />
              <h2 className="text-2xl font-bold text-slate-900">Processing Intelligence...</h2>
              <p className="text-slate-500 mt-2">Our AI is analyzing every row for emotional patterns.</p>
            </div>
          )}

          {results && (
            <div className="space-y-8 animate-in slide-in-from-bottom duration-500">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { label: 'Positive', value: results.summary.positive, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Negative', value: results.summary.negative, color: 'text-red-600', bg: 'bg-red-50' },
                  { label: 'Neutral', value: results.summary.neutral, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                ].map((item) => (
                  <div key={item.label} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                    <div className="flex items-end justify-between mt-2">
                      <p className="text-3xl font-black text-slate-900">{item.value}</p>
                      <span className={`${item.bg} ${item.color} px-2 py-1 rounded-lg text-[10px] font-black`}>
                        {((item.value / results.total_processed) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Visualization */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-xl font-bold text-slate-800">Sentiment Distribution</h2>
                  <button 
                    onClick={handleExportCSV}
                    className="flex items-center gap-2 text-xs font-black text-brand uppercase tracking-widest hover:bg-brand/5 px-4 py-2 rounded-xl transition-all"
                  >
                    <Download className="w-4 h-4" /> Export Report
                  </button>
                </div>
                
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sentimentData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                      <Tooltip 
                        cursor={{fill: '#f8fafc'}}
                        contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                      />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={60}>
                        {sentimentData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Table Preview */}
              <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                  <h2 className="font-bold text-slate-800 flex items-center gap-2">
                    <Table className="w-4 h-4 text-brand" />
                    Data Preview <span className="text-slate-400 font-medium text-xs">(First 100 records)</span>
                  </h2>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-slate-50 z-10">
                      <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="px-6 py-4">Sentiment</th>
                        <th className="px-6 py-4">Feedback Content</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {results.results.map((r: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <span className={clsx(
                              "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider",
                              r.sentiment === 'positive' ? 'bg-emerald-100 text-emerald-700' :
                              r.sentiment === 'negative' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                            )}>
                              {r.sentiment}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600 line-clamp-2 max-w-md">
                            {r.text}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
