'use client';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { redirect, useRouter } from 'next/navigation';
import { 
  Settings, Play, ExternalLink, Clock, CheckCircle2, 
  AlertCircle, Database, Cpu, Layers, Zap, 
  ArrowRight, ShieldCheck, Loader2, RefreshCw,
  Terminal, BarChart3, List, X, Link as LinkIcon,
  Github
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { clsx } from 'clsx';

export default function PipelinePage() {
  const { user, loading: authLoading } = useAuth();
  const { activeProject } = useProject();
  const router = useRouter();
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
    if (!activeProject && user?.role !== 'admin') return;
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const params = { project_id: activeProject?.id || null };
      
      const [datasetsRes, modelsRes, airflowRunsRes, githubRunsRes] = await Promise.all([
        axios.get('/api/datasets', { headers, params }),
        axios.get('/api/models', { headers, params }),
        axios.get('/api/airflow/runs', { headers }),
        axios.get('/api/github/runs', { headers })
      ]);
      
      setDatasets(datasetsRes.data);
      setModels(modelsRes.data);
      
      // Merge and sort runs
      const airflowRuns = (airflowRunsRes.data || []).map((r: any) => ({
        id: r.dag_run_id,
        type: 'Airflow (Training)',
        status: r.state,
        time: r.execution_date,
        details: r.conf?.data_source ? `Source: ${r.conf.data_source.split('/').pop()}` : 'Spotify Sentiment Pipeline',
        raw: r
      }));
      
      const githubRuns = (githubRunsRes.data || []).map((r: any) => ({
        id: r.id,
        type: r.workflow_filename === 'manual_train.yml' ? 'GitHub (Training)' : 'GitHub (Build/Deploy)',
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
      console.error("Failed to fetch orchestration data", err);
    } finally {
      setLoading(false);
    }
  }, [activeProject, selectedDataset, user]);

  useEffect(() => {
    if (!authLoading && user?.role !== 'admin') {
      router.push('/');
    }
    
    if (user?.role === 'admin') {
      fetchData();
      const interval = setInterval(fetchData, 15000); // Poll every 15s
      return () => clearInterval(interval);
    }
  }, [user, authLoading, fetchData, activeProject, router]);

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
        setLogs('Failed to fetch logs. Check if task has started.');
      } finally {
        setFetchingLogs(false);
      }
    } else {
      // For GitHub runs, redirect to GitHub actions page
      window.open(run.raw.html_url, '_blank');
    }
  };

  const handleDeploy = async (version: string, modelName: string) => {
    if (!activeProject) return;
    setDeploying(version);
    setStatus(null);
    try {
      const token = localStorage.getItem('token');
      // 1. Transition stage in MLflow
      await axios.post('/api/deploy-model', null, {
        params: { version, model_name: modelName, project_id: activeProject.id },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      // 2. Trigger build and deploy CI/CD (Removed model_name as GitHub action doesn't support it)
      const buildRes = await axios.post('/api/build-deploy', null, {
        params: { version, project_id: activeProject.id },
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (buildRes.data.status === 'success') {
        setStatus({ type: 'success', msg: `Model v${version} promoted to Production and CI/CD build triggered!` });
      } else {
        setStatus({ type: 'success', msg: `Model v${version} promoted to Production (CI/CD: ${buildRes.data.message})` });
      }
      
      fetchData();
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.response?.data?.detail || 'Error deploying model' });
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
            Orchestration <span className="text-brand">Hub</span>
          </h1>
          <p className="text-gray-500 mt-2">MLOps Management: automated training, monitoring, and deployment.</p>
        </div>
        
        <div className="flex gap-3">
          <a 
            href="https://github.com/JasonNguyen2135/Spotify-Sentiment-MLOps/actions" 
            target="_blank" 
            className="bg-slate-900 text-white border border-slate-800 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-800 transition-all shadow-sm"
          >
            <Github className="w-4 h-4" /> GitHub Actions
          </a>
          <a 
            href="http://localhost:31190" 
            target="_blank" 
            className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
          >
            <ExternalLink className="w-4 h-4" /> Airflow UI
          </a>
          <a 
            href="http://mlflow.ntdevopsmlflow.io.vn" 
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
          <button onClick={() => setStatus(null)} className="text-sm opacity-50 hover:opacity-100 uppercase font-black">Close</button>
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
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Or choose from Registry/MongoDB</label>
                <div className="space-y-2">
                  {datasets.map((ds) => (
                    <div 
                      key={ds.source}
                      onClick={() => { setSelectedDataset(ds.source); setCustomDataset(''); }}
                      className={clsx(
                        "p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between group",
                        (selectedDataset === ds.source && !customDataset) ? "border-brand bg-brand/5" : "border-slate-50 hover:border-slate-200 bg-slate-50/50"
                      )}
                    >
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

              <button 
                onClick={handleTrain}
                disabled={triggering || (!selectedDataset && !customDataset)}
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-md hover:bg-slate-800 transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
              >
                {triggering ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-white" />}
                TRIGGER TRAINING
              </button>
            </div>
          </section>

          <div className="bg-brand/5 p-6 rounded-3xl border border-brand/10">
            <p className="text-xs text-brand-700 leading-relaxed">
              <span className="font-bold">Note:</span> Triggering training will initialize a temporary Kubernetes pod. Execution state and logs will update automatically.
            </p>
          </div>
        </div>

        {/* Right Column: Registry */}
        <div className="lg:col-span-2 space-y-10">
          {/* Model Registry */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 px-2">
              <Layers className="w-5 h-5 text-brand" />
              <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Model Registry (MLflow)</h2>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="max-h-[700px] overflow-y-auto scrollbar-hide">
                <table className="w-full text-left">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                      <th className="px-8 py-4">Version / Model Name</th>
                      <th className="px-8 py-4">Stage</th>
                      <th className="px-8 py-4 text-right">Deployment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {models.map((model) => (
                      <tr key={`${model.name}-${model.version}`} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-xs font-black text-slate-500">
                              v{model.version}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900">{model.name}</p>
                              <a 
                                href={model.mlflow_url} 
                                target="_blank" 
                                className="text-[10px] text-brand hover:underline font-black flex items-center gap-1 mt-1 uppercase"
                              >
                                <ExternalLink className="w-2.5 h-2.5" /> MLflow Details
                              </a>
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
                              <ShieldCheck className="w-4 h-4" /> SERVING (PROD)
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleDeploy(model.version, model.name)}
                              disabled={!!deploying}
                              className="bg-brand text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all flex items-center gap-2 ml-auto disabled:bg-slate-100 disabled:text-slate-300"
                            >
                              {deploying === model.version ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 fill-white" />}
                              PROMPT & DEPLOY
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {models.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-8 py-10 text-center text-slate-400 italic">No models found in registry.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
