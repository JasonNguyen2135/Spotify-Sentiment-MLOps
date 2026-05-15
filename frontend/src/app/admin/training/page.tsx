'use client';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';
import { 
  Play, ExternalLink, Clock, CheckCircle2, 
  AlertCircle, Database, Cpu, Zap, 
  Loader2, Terminal, List, X, Link as LinkIcon,
  Github
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { clsx } from 'clsx';

export default function TrainingPage() {
  const { user, loading: authLoading } = useAuth();
  const { activeProject } = useProject();
  const router = useRouter();
  const [datasets, setDatasets] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [customDataset, setCustomDataset] = useState<string>('');
  const [triggering, setTriggering] = useState(false);
  const [status, setStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingLogs, setViewingLogs] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [fetchingLogs, setFetchingLogs] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const params = { project_id: activeProject?.id || null };
      
      const [datasetsRes, airflowRunsRes, githubRunsRes] = await Promise.all([
        axios.get('/api/datasets', { headers, params }),
        axios.get('/api/airflow/runs', { headers }),
        axios.get('/api/github/runs', { headers })
      ]);
      
      setDatasets(datasetsRes.data);
      
      const airflowRuns = (airflowRunsRes.data || []).map((r: any) => ({
        id: r.dag_run_id,
        type: 'Airflow (Training)',
        status: r.state,
        time: r.execution_date,
        details: r.conf?.data_source ? `Source: ${r.conf.data_source.split('/').pop()}` : 'Spotify Sentiment Pipeline',
        raw: r
      }));
      
      const githubRuns = (githubRunsRes.data || [])
        .filter((r: any) => r.workflow_filename === 'manual_train.yml')
        .map((r: any) => ({
          id: r.id,
          type: 'GitHub (Training)',
          status: r.conclusion || r.status,
          time: r.created_at,
          details: r.display_title || r.name,
          raw: r
        }));
      
      const combinedRuns = [...airflowRuns, ...githubRuns].sort((a, b) => 
        new Date(b.time).getTime() - new Date(a.time).getTime()
      );
      
      setRuns(combinedRuns);
      
      if (!selectedDataset && datasetsRes.data.length > 0) {
        setSelectedDataset(datasetsRes.data[0].source);
      }
    } catch (err) {
      console.error("Failed to fetch training data", err);
    } finally {
      setLoading(false);
    }
  }, [activeProject, selectedDataset]);

  useEffect(() => {
    if (!authLoading && user?.role !== 'admin') router.push('/');
    if (user?.role === 'admin') {
      fetchData();
      const interval = setInterval(fetchData, 15000);
      return () => clearInterval(interval);
    }
  }, [user, authLoading, fetchData, router]);

  const handleTrain = async () => {
    if (!activeProject) return;
    setTriggering(true);
    setStatus(null);
    try {
      const token = localStorage.getItem('token');
      const source = customDataset || selectedDataset;
      await axios.post('/api/train', null, {
        params: { dataset_source: source, project_id: activeProject.id },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setStatus({ type: 'success', msg: 'Training pipeline triggered successfully!' });
      await fetchData();
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.response?.data?.detail || 'Failed to trigger pipeline' });
    } finally {
      setTriggering(false);
    }
  };

  const handleFetchLogs = async (run: any) => {
    if (run.type.includes('Airflow')) {
      setViewingLogs(run.id);
      setFetchingLogs(true);
      setLogs('');
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/airflow/logs/${run.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setLogs(res.data.logs);
      } catch (err) {
        setLogs('Failed to fetch logs.');
      } finally {
        setFetchingLogs(false);
      }
    } else {
      window.open(run.raw.html_url, '_blank');
    }
  };

  if (authLoading || loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh]">
      <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
      <p className="text-gray-500 font-medium italic">Synchronizing training state...</p>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-20">
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-4xl font-black text-gray-900 flex items-center gap-3">
            <Cpu className="text-brand w-10 h-10" />
            Training <span className="text-brand">Management</span>
          </h1>
          <p className="text-gray-500 mt-2">Automated model training and pipeline monitoring.</p>
        </div>
        <div className="flex gap-3">
          <a href="https://github.com/JasonNguyen2135/Spotify-Sentiment-MLOps/actions" target="_blank" className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2">
            <Github className="w-4 h-4" /> GitHub Actions
          </a>
        </div>
      </div>

      {status && (
        <div className={clsx("mb-10 p-6 rounded-2xl flex items-center justify-between border", status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100')}>
          <div className="flex items-center gap-4">
            {status.type === 'success' ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
            <span className="font-bold">{status.msg}</span>
          </div>
          <button onClick={() => setStatus(null)} className="text-sm opacity-50 font-black">Close</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-1 space-y-6">
          <div className="flex items-center gap-2 px-2">
            <Database className="w-5 h-5 text-brand" />
            <h2 className="text-xl font-bold text-gray-800 uppercase">Train Model</h2>
          </div>
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="mb-6">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Custom Dataset URL</label>
              <input 
                type="text"
                value={customDataset}
                onChange={(e) => setCustomDataset(e.target.value)}
                placeholder="https://dagshub.com/.../data.csv"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand text-sm"
              />
            </div>
            <div className="mb-8">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Or choose from Registry/MongoDB</label>
              <div className="space-y-2">
                {datasets.map((ds) => (
                  <div key={ds.source} onClick={() => { setSelectedDataset(ds.source); setCustomDataset(''); }} className={clsx("p-4 rounded-xl border-2 cursor-pointer flex items-center justify-between", (selectedDataset === ds.source && !customDataset) ? "border-brand bg-brand/5" : "border-slate-50 hover:border-slate-200 bg-slate-50/50")}>
                    <div className="flex items-center gap-3">
                      <Database className={clsx("w-5 h-5", selectedDataset === ds.source && !customDataset ? "text-brand" : "text-slate-400")} />
                      <div>
                        <p className="text-xs font-bold text-slate-900">{ds.name}</p>
                        <p className="text-[10px] text-brand-600 font-black mt-0.5">{ds.count.toLocaleString()} records</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={handleTrain} disabled={triggering} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-md flex items-center justify-center gap-3">
              {triggering ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-white" />}
              TRIGGER TRAINING
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2 px-2">
            <List className="w-5 h-5 text-brand" />
            <h2 className="text-xl font-bold text-gray-800 uppercase">Training History</h2>
          </div>
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest z-10">
                  <tr>
                    <th className="px-8 py-4">Pipeline Run</th>
                    <th className="px-8 py-4">Status</th>
                    <th className="px-8 py-4">Timestamp</th>
                    <th className="px-8 py-4 text-right">Logs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-8 py-5">
                        <p className="text-sm font-bold text-slate-900">{run.type}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{run.details}</p>
                      </td>
                      <td className="px-8 py-5">
                        <span className={clsx("px-3 py-1 rounded-full text-[10px] font-black uppercase", run.status === "success" || run.status === "completed" ? "bg-emerald-100 text-emerald-700" : run.status === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>
                          {run.status}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-xs font-bold text-slate-400">
                        {new Date(run.time).toLocaleString()}
                      </td>
                      <td className="px-8 py-5 text-right">
                        <button onClick={() => handleFetchLogs(run)} className="text-brand hover:underline font-black text-[10px] uppercase">
                          {run.type.includes('GitHub') ? 'View on GitHub' : 'View Logs'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {viewingLogs && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] flex flex-col max-h-[80vh] overflow-hidden shadow-2xl">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Terminal className="text-brand w-6 h-6" />
                <h2 className="text-xl font-bold text-slate-800">Pipeline Execution Logs</h2>
              </div>
              <button onClick={() => setViewingLogs(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
            </div>
            <div className="flex-1 p-8 bg-slate-900 overflow-auto font-mono text-xs text-slate-300 leading-relaxed">
              {fetchingLogs ? <div className="flex items-center gap-3"><Loader2 className="w-4 h-4 animate-spin" /> Fetching latest logs from cluster...</div> : <pre className="whitespace-pre-wrap">{logs || 'No log data available for this run.'}</pre>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
