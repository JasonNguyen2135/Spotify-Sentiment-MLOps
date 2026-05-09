'use client';
import { useAuth } from '@/context/AuthContext';
import { redirect } from 'next/navigation';
import { 
  Settings, Play, ExternalLink, Clock, CheckCircle2, 
  AlertCircle, Database, Cpu, Layers, Zap, 
  ArrowRight, ShieldCheck, Loader2, RefreshCw,
  Terminal, BarChart3, List, X, Link as LinkIcon
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { clsx } from 'clsx';

export default function PipelinePage() {
  const { user, loading: authLoading } = useAuth();
  const [datasets, setDatasets] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [customDataset, setCustomDataset] = useState<string>('');
  const [triggering, setTriggering] = useState(false);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [status, setStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingLogs, setViewingLogs] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [fetchingLogs, setFetchingLogs] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [datasetsRes, modelsRes, runsRes] = await Promise.all([
        axios.get('/api/datasets', { headers }),
        axios.get('/api/models', { headers }),
        axios.get('/api/airflow/runs', { headers })
      ]);
      
      setDatasets(datasetsRes.data);
      setModels(modelsRes.data);
      setRuns(runsRes.data);
      
      if (!selectedDataset && datasetsRes.data.length > 0) {
        setSelectedDataset(datasetsRes.data[0].source);
      }
    } catch (err) {
      console.error("Failed to fetch orchestration data", err);
    } finally {
      setLoading(false);
    }
  }, [selectedDataset]);

  useEffect(() => {
    if (!authLoading && user?.role !== 'admin') {
      redirect('/');
    }
    
    if (user?.role === 'admin') {
      fetchData();
      const interval = setInterval(fetchData, 10000); // Poll every 10s
      return () => clearInterval(interval);
    }
  }, [user, authLoading, fetchData]);

  const handleTrain = async () => {
    setTriggering(true);
    setStatus(null);
    try {
      const token = localStorage.getItem('token');
      const source = customDataset || selectedDataset;
      await axios.post('/api/train', null, {
        params: { dataset_source: source },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setStatus({ type: 'success', msg: 'Training pipeline triggered successfully!' });
      fetchData();
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.response?.data?.detail || 'Failed to trigger pipeline' });
    } finally {
      setTriggering(false);
    }
  };

  const handleFetchLogs = async (runId: string) => {
    setViewingLogs(runId);
    setFetchingLogs(true);
    setLogs('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/airflow/logs/${runId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setLogs(res.data.logs);
    } catch (err) {
      setLogs('Failed to fetch logs. Check if task has started.');
    } finally {
      setFetchingLogs(false);
    }
  };

  const handleDeploy = async (version: string) => {
    setDeploying(version);
    setStatus(null);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/deploy-model', null, {
        params: { version },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setStatus({ type: 'success', msg: `Model version ${version} deployed to Production!` });
      fetchData();
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.response?.data?.detail || 'Deployment failed' });
    } finally {
      setDeploying(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-gray-500 font-medium italic">Synchronizing with orchestration engine...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4">
        <div>
          <h1 className="text-4xl font-black text-gray-900 flex items-center gap-3">
            <Cpu className="text-brand w-10 h-10" />
            Control <span className="text-brand">Center</span>
          </h1>
          <p className="text-gray-500 mt-2">Centralized MLOps framework for model training, monitoring, and deployment.</p>
        </div>
        
        <div className="flex gap-3">
          <a 
            href="http://localhost:31190" 
            target="_blank" 
            className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
          >
            <ExternalLink className="w-4 h-4" /> Airflow UI
          </a>
          <a 
            href="http://18.140.71.49:5000" 
            target="_blank" 
            className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
          >
            <Layers className="w-4 h-4" /> MLflow UI
          </a>
        </div>
      </div>

      {status && (
        <div className={clsx(
          "mb-10 p-6 rounded-2xl flex items-center justify-between border animate-in slide-in-from-top",
          status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
        )}>
          <div className="flex items-center gap-4">
            {status.type === 'success' ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
            <span className="font-bold">{status.msg}</span>
          </div>
          <button onClick={() => setStatus(null)} className="text-sm opacity-50 hover:opacity-100 uppercase font-black">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left Column: Training Initiation */}
        <div className="lg:col-span-1 space-y-8">
          <section className="space-y-6">
            <div className="flex items-center gap-2 px-2">
              <Database className="w-5 h-5 text-brand" />
              <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Train Model</h2>
            </div>
            
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div className="mb-6">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Custom Dataset URL</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <LinkIcon className="w-4 h-4" />
                  </div>
                  <input 
                    type="text"
                    value={customDataset}
                    onChange={(e) => setCustomDataset(e.target.value)}
                    placeholder="https://dagshub.com/.../data.csv"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand text-sm transition-all"
                  />
                </div>
              </div>

              <div className="mb-8">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Or Select Registry Baseline</label>
                <div className="space-y-2">
                  {datasets.map((ds) => (
                    <div 
                      key={ds.source}
                      onClick={() => { setSelectedDataset(ds.source); setCustomDataset(''); }}
                      className={clsx(
                        "p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between group",
                        (selectedDataset === ds.source && !customDataset) ? "border-brand bg-brand/5" : "border-slate-50 hover:border-slate-200 bg-slate-50/50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Database className={clsx("w-4 h-4", selectedDataset === ds.source && !customDataset ? "text-brand" : "text-slate-400")} />
                        <div>
                          <p className="text-xs font-bold text-slate-900">{ds.name}</p>
                          <p className="text-[10px] text-slate-400 font-medium truncate max-w-[120px]">{ds.source}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button 
                onClick={handleTrain}
                disabled={triggering || (!selectedDataset && !customDataset)}
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-md hover:bg-slate-800 transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
              >
                {triggering ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-white" />}
                RUN PIPELINE
              </button>
            </div>
          </section>

          <div className="bg-brand/5 p-6 rounded-3xl border border-brand/10">
            <p className="text-xs text-brand-700 leading-relaxed">
              <span className="font-bold">Framework Notice:</span> Triggering a run will spin up a transient Kubernetes pod. Execution status and logs will be synced to this dashboard automatically.
            </p>
          </div>
        </div>

        {/* Right Column: Monitoring & Registry */}
        <div className="lg:col-span-2 space-y-10">
          {/* Recent Runs Table */}
          <section className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <List className="w-5 h-5 text-brand" />
                <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Active & Recent Runs</h2>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                Live Sync
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-8 py-4">Run ID / Execution Date</th>
                    <th className="px-8 py-4">Status</th>
                    <th className="px-8 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {runs.map((run) => (
                    <tr key={run.dag_run_id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-8 py-5">
                        <p className="text-sm font-bold text-slate-900 truncate max-w-[200px]">{run.dag_run_id}</p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {new Date(run.execution_date).toLocaleString()}
                        </p>
                      </td>
                      <td className="px-8 py-5">
                        <span className={clsx(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-2 w-fit",
                          run.state === 'success' ? "bg-emerald-100 text-emerald-700" :
                          run.state === 'running' ? "bg-blue-100 text-blue-700" :
                          run.state === 'failed' ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"
                        )}>
                          {run.state === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
                          {run.state}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <button 
                          onClick={() => handleFetchLogs(run.dag_run_id)}
                          className="text-xs font-black text-slate-400 hover:text-brand flex items-center gap-2 ml-auto uppercase tracking-widest"
                        >
                          <Terminal className="w-4 h-4" /> View Logs
                        </button>
                      </td>
                    </tr>
                  ))}
                  {runs.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-8 py-10 text-center text-slate-400 text-sm italic font-medium">
                        No recent training activity detected.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Model Registry */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 px-2">
              <RefreshCw className="w-5 h-5 text-brand" />
              <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Deployment Registry</h2>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-8 py-4">Version</th>
                    <th className="px-8 py-4">Current Stage</th>
                    <th className="px-8 py-4 text-right">Management</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {models.map((model) => (
                    <tr key={model.version} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-xs font-black text-slate-500">
                            v{model.version}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">Run #{model.run_id.slice(0, 8)}</p>
                            <p className="text-[10px] text-slate-400 font-medium">
                              Created: {new Date(model.creation_timestamp).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className={clsx(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                          model.current_stage === "Production" ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                          model.current_stage === "Staging" ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-slate-100 text-slate-500"
                        )}>
                          {model.current_stage}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        {model.current_stage === "Production" ? (
                          <div className="flex items-center justify-end gap-2 text-emerald-600 font-bold text-[10px] tracking-widest">
                            <ShieldCheck className="w-4 h-4" /> SERVING TRAFFIC
                          </div>
                        ) : (
                          <button 
                            onClick={() => handleDeploy(model.version)}
                            disabled={!!deploying}
                            className="bg-brand text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all flex items-center gap-2 ml-auto disabled:bg-slate-100 disabled:text-slate-300"
                          >
                            {deploying === model.version ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                            Promote
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {/* Log Viewer Overlay */}
      {viewingLogs && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6 md:p-12 animate-in fade-in duration-300">
          <div className="bg-slate-900 w-full max-w-5xl h-full max-h-[800px] rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-brand/20 p-2 rounded-xl text-brand">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-white font-bold">Execution Logs</h3>
                  <p className="text-slate-500 text-xs">Run ID: {viewingLogs}</p>
                </div>
              </div>
              <button 
                onClick={() => setViewingLogs(null)}
                className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-8 font-mono text-sm">
              {fetchingLogs ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4">
                  <Loader2 className="w-8 h-8 animate-spin text-brand" />
                  <p className="animate-pulse">Retrieving logs from cluster...</p>
                </div>
              ) : (
                <pre className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {logs || "No logs available for this task execution."}
                </pre>
              )}
            </div>

            <div className="p-6 border-t border-white/10 bg-black/20 flex justify-between items-center">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                Source: Airflow Kubernetes Worker
              </p>
              <button 
                onClick={() => handleFetchLogs(viewingLogs)}
                className="flex items-center gap-2 text-xs font-black text-brand uppercase tracking-widest hover:bg-brand/10 px-4 py-2 rounded-xl transition-all"
              >
                <RefreshCw className="w-4 h-4" /> Refresh Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
