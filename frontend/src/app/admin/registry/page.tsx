'use client';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';
import { 
  Settings, ExternalLink, CheckCircle2, 
  AlertCircle, Layers, Zap, 
  ShieldCheck, Loader2, List, Github, Activity
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { clsx } from 'clsx';

export default function RegistryPage() {
  const { user, loading: authLoading } = useAuth();
  const { activeProject, setActiveProject } = useProject();
  const router = useRouter();
  const [models, setModels] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [status, setStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const params = { project_id: activeProject?.id || null };
      
      const [modelsRes, githubRunsRes, projectsRes] = await Promise.all([
        axios.get('/api/models', { headers, params }),
        axios.get('/api/github/runs', { headers }),
        axios.get('/api/projects', { headers })
      ]);
      
      setModels(modelsRes.data || []);
      setProjects(projectsRes.data || []);
      
      const githubRuns = (githubRunsRes.data || [])
        .filter((r: any) => r.workflow_filename !== 'manual_train.yml')
        .map((r: any) => ({
          id: r.id,
          type: 'GitHub (Build/Deploy)',
          status: r.conclusion || r.status,
          time: r.created_at,
          details: r.display_title || r.name,
          raw: r
        }));
      
      setRuns(githubRuns.sort((a, b) => 
        new Date(b.time).getTime() - new Date(a.time).getTime()
      ));
    } catch (err) {
      console.error("Failed to fetch registry data", err);
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    const allowedRoles = ['admin', 'ai_engineer', 'analyst'];
    if (!authLoading && !allowedRoles.includes(user?.role || '')) router.push('/');
    if (allowedRoles.includes(user?.role || '')) {
      fetchData();
      const interval = setInterval(fetchData, 15000);
      return () => clearInterval(interval);
    }
  }, [user, authLoading, fetchData, router]);

  const handleDeploy = async (version: string, modelName: string) => {
    const projectId = activeProject?.id;
    if (!projectId) return alert("Please select a workspace first using the selector above.");
    
    setDeploying(version);
    setStatus(null);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/deploy-model', null, {
        params: { version, model_name: modelName },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const buildRes = await axios.post('/api/build-deploy', null, {
        params: { version },
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (buildRes.data.status === 'success') {
        setStatus({ type: 'success', msg: `Model v${version} promoted to Production and CI/CD build triggered!` });
      } else {
        setStatus({ type: 'success', msg: `Model v${version} promoted (CI/CD: ${buildRes.data.message})` });
      }
      fetchData();
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.response?.data?.detail || 'Error deploying model' });
    } finally {
      setDeploying(null);
    }
  };

  if (authLoading || loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh]">
      <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
      <p className="text-gray-500 font-medium italic">Retrieving model registry...</p>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-20 px-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
        <div>
          <h1 className="text-4xl font-black text-gray-900 flex items-center gap-3">
            <Layers className="text-brand w-10 h-10" />
            Model <span className="text-brand">Registry</span>
          </h1>
          <p className="text-gray-500 mt-2 font-medium">Manage model versions, stages, and production deployments.</p>
        </div>
        <div className="flex gap-3">
          <a href="http://localhost:31453/" target="_blank" rel="noopener noreferrer" className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
            <Activity className="w-4 h-4 text-emerald-500" /> Evidently
          </a>
          <a href="https://github.com/JasonNguyen2135/Spotify-Sentiment-MLOps/actions/workflows/manual_build_deploy_model_service.yml" target="_blank" rel="noopener noreferrer" className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200">
            <Zap className="w-4 h-4 text-brand" /> Deploy Service
          </a>
          <a href="http://mlflow.ntdevopsmlflow.io.vn" target="_blank" className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
            <Settings className="w-4 h-4" /> MLflow UI
          </a>
        </div>
      </div>

      {status && (
        <div className={clsx("mb-10 p-6 rounded-2xl flex items-center justify-between border animate-in slide-in-from-top", status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100')}>
          <div className="flex items-center gap-4">
            {status.type === 'success' ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
            <span className="font-bold">{status.msg}</span>
          </div>
          <button onClick={() => setStatus(null)} className="text-sm opacity-50 font-black uppercase">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <section className="space-y-6">
          <div className="flex items-center gap-2 px-2">
            <ShieldCheck className="w-5 h-5 text-brand" />
            <h2 className="text-xl font-bold text-gray-800 uppercase">Version Control</h2>
          </div>
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden h-[600px] flex flex-col">
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest z-10">
                  <tr>
                    <th className="px-8 py-4">Version</th>
                    <th className="px-8 py-4">Stage</th>
                    <th className="px-8 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {models.map((model) => (
                    <tr key={`${model.name}-${model.version}`} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-xs font-black text-slate-500 shadow-inner">v{model.version}</div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{model.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className={clsx("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border", model.current_stage === "Production" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : model.current_stage === "Staging" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-500 border-slate-200")}>
                          {model.current_stage}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        {model.current_stage === "Production" ? (
                          <ShieldCheck className="w-5 h-5 text-emerald-600 ml-auto" />
                        ) : (
                          <button onClick={() => handleDeploy(model.version, model.name)} disabled={!!deploying} className="bg-brand text-white p-2 rounded-lg hover:opacity-90 transition-all disabled:bg-slate-100 disabled:text-slate-300 shadow-md">
                            {deploying === model.version ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-white" />}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center gap-2 px-2">
            <List className="w-5 h-5 text-brand" />
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Deployment History</h2>
          </div>
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden h-[600px] flex flex-col">
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest z-10">
                  <tr>
                    <th className="px-8 py-4">Pipeline</th>
                    <th className="px-8 py-4">Status</th>
                    <th className="px-8 py-4 text-right">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {runs.length > 0 ? runs.map((run) => (
                    <tr key={run.id} className="hover:bg-slate-50/30 transition-colors group">
                      <td className="px-8 py-5">
                        <p className="text-sm font-bold text-slate-900 line-clamp-1">{run.details}</p>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase font-black">{new Date(run.time).toLocaleDateString()}</p>
                      </td>
                      <td className="px-8 py-5">
                        <span className={clsx("px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter", run.status === "success" || run.status === "completed" ? "bg-emerald-50 text-emerald-600" : run.status === "failed" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600")}>
                          {run.status}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <a href={run.raw?.html_url} target="_blank" className="text-brand hover:underline font-black text-[10px] uppercase">
                           <ExternalLink className="w-4 h-4" />
                        </a>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={3} className="py-20 text-center text-slate-300 italic font-medium">No deployment history found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
