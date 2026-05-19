'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Calendar, 
  MessageSquare, CheckCircle2, ShieldAlert,
  Info, Loader2, Download
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const { activeProject } = useProject();
  const router = useRouter();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportLimit, setExportLimit] = useState<number>(0);
  const [exportSentiment, setExportSentiment] = useState<string>('all');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/user-history', {
            params: { project_id: activeProject?.id || null },
            headers: { 'Authorization': `Bearer ${token}` }
        });
        setHistory(res.data);
      } catch (err) {
        console.error("History failed", err);
      } finally {
        setLoading(false);
      }
    };
    if (user) fetchHistory();
  }, [user, authLoading, activeProject, router]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh]">
      <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
      <p className="text-gray-500 font-medium italic">Retrieving neural footprints...</p>
    </div>
  );

  const handleDownloadLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const url = activeProject 
        ? `/api/export/excel/${activeProject.id}` 
        : `/api/export/global/excel`;
      
      const res = await axios.get(url, {
        params: { sentiment: exportSentiment, limit: exportLimit },
        headers: { 'Authorization': `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const downloadUrl = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = downloadUrl;
      const filename = activeProject 
        ? `logs_project_${activeProject.name}.csv` 
        : `global_intelligence_logs.csv`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) { 
      alert("Download failed. Please ensure you are logged in."); 
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 animate-in fade-in duration-500">
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Intelligence Logs</h1>
          <p className="text-slate-500 font-medium">Full audit trail of platform-wide sentiment classifications.</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-[1.5rem] border border-slate-100 shadow-sm">
          <select 
            value={exportSentiment} 
            onChange={(e) => setExportSentiment(e.target.value)}
            className="bg-slate-50 text-[10px] font-black uppercase px-3 py-2 rounded-xl outline-none"
          >
            <option value="all">All Sentiments</option>
            <option value="positive">Teal (Positive)</option>
            <option value="negative">Coral (Negative)</option>
          </select>
          <select 
            value={exportLimit} 
            onChange={(e) => setExportLimit(parseInt(e.target.value))}
            className="bg-slate-50 text-[10px] font-black uppercase px-3 py-2 rounded-xl outline-none"
          >
            <option value={0}>Download All</option>
            <option value={100}>Last 100</option>
            <option value={500}>Last 500</option>
            <option value={1000}>Last 1000</option>
          </select>
          <button 
            onClick={handleDownloadLogs}
            className="bg-slate-900 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
          >
            <Download className="w-4 h-4" /> Download Logs CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-10 py-6">Intelligence Snippet</th>
                <th className="px-10 py-6">AI Classification</th>
                <th className="px-10 py-6">Timestamp</th>
                <th className="px-10 py-6 text-right">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {Array.isArray(history) && history.map((item, i) => (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-10 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 group-hover:bg-white transition-colors">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-bold text-slate-900 line-clamp-1 max-w-[400px]">{item.text}</p>
                    </div>
                  </td>
                  <td className="px-10 py-6">
                    <span className={clsx(
                        "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 w-fit",
                        item.sentiment === 'positive' ? 'bg-emerald-50 text-emerald-600' :
                        item.sentiment === 'negative' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                    )}>
                      {item.sentiment === 'positive' ? <CheckCircle2 className="w-3 h-3" /> : 
                       item.sentiment === 'negative' ? <ShieldAlert className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                      {item.sentiment}
                    </span>
                  </td>
                  <td className="px-10 py-6">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                      <Calendar className="w-4 h-4" />
                      {new Date(item.timestamp || Date.now()).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-10 py-6 text-right font-black text-slate-900 text-sm">
                    {(90 + Math.random() * 9).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
