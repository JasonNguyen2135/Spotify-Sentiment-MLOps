'use client';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';
import { 
  Settings, ExternalLink, CheckCircle2, 
  AlertCircle, Layers, Zap, LayoutGrid,
  ShieldCheck, Loader2, List, Github, Activity,
  Info, ShieldAlert, ChevronRight
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
      
      const deployWorkflows = ['ci.yml', 'manual_build_deploy_model_service.yml', 'manual_deploy_model.yml'];
      const githubRuns = (githubRunsRes.data || [])
        .filter((r: any) => deployWorkflows.includes(r.path?.split('/').pop() || ''))
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
    if (!projectId) return alert("Please select a workspace first.");
    
    setDeploying(version);
    setStatus(null);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/deploy-model', null, {
        params: { version, model_name: modelName },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const buildRes = await axios.post('/api/build-deploy', null, {
        params: { version, model_name: modelName },
        headers: { 'Authorization': `Bearer ${token}` }
      });

      setStatus({ type: 'success', msg: `Model v${version} promoted to Production!` });
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
    <div className="max-w-[1400px] mx-auto animate-in fade-in duration-500 pb-20 px-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
        <div>
          <h1 className="text-4xl font-black text-gray-900 flex items-center gap-3">
            <Layers className="text-brand w-10 h-10" />
            Model <span className="text-brand">Registry</span>
          </h1>
          <p className="text-gray-500 mt-2 font-medium">Manage model versions, stages, and production deployments.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center justify-end">
          <div className="flex items-center gap-3 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm">
            <LayoutGrid className="w-4 h-4 text-brand" />
            <select 
              value={activeProject?.id || ''} 
              onChange={(e) => {
                const p = projects.find(p => p.id === parseInt(e.target.value));
                setActiveProject(p || null);
              }}
              className="text-xs font-bold bg-transparent outline-none cursor-pointer min-w-[150px]"
            >
              <option value="">Select Workspace...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <a href="http://localhost:31453/" target="_blank" rel="noopener noreferrer" className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
            <Activity className="w-4 h-4 text-emerald-500" /> Evidently
          </a>
          <a href="https://github.com/JasonNguyen2135/Spotify-Sentiment-MLOps/actions" target="_blank" rel="noopener noreferrer" className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200">
            <Zap className="w-4 h-4 text-brand" /> CI/CD Actions
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        <section className="lg:col-span-3 space-y-6">
          <div className="flex items-center gap-2 px-2">
            <ShieldCheck className="w-5 h-5 text-brand" />
            <h2 className="text-xl font-bold text-gray-800 uppercase">Version Control</h2>
          </div>
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden h-[650px] flex flex-col">
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest z-10">
                  <tr>
                    <th className="px-8 py-4">Version</th>
                    <th className="px-8 py-4">Intelligence Metrics</th>
                    <th className="px-8 py-4">Stage</th>
                    <th className="px-8 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {models.map((model) => (
                    <tr key={`${model.name}-${model.version}`} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-[10px] font-black text-brand shadow-lg">
                             {model.name.includes('Basic') ? 'CNB' : 
                              model.name.includes('Standard') ? 'LR' : 
                              model.name.includes('Pro') ? 'LGBM' : 
                              model.name.includes('Premium') ? 'MLP' : 
                              model.name.includes('Vip') ? 'DBT' : 'DEF'}
                          </div>
                          <div>
                            <p className="text-base font-black text-slate-900 tracking-tight">
                              {model.name.replace('Sentiment_', '').replace('_Model', '')} Tier
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                              {model.name.includes('Basic') ? 'Complement Naive Bayes' : 
                               model.name.includes('Standard') ? 'Logistic Regression' : 
                               model.name.includes('Pro') ? 'LightGBM Tree' : 
                               model.name.includes('Premium') ? 'Neural Network (MLP)' : 
                               model.name.includes('Vip') ? 'DistilBERT Transformer' : 'Unknown Model'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex gap-8 text-xs">
                          {model.metrics ? (
                            <>
                              <div className="flex flex-col">
                                <span className="text-slate-400 text-[9px] uppercase font-black mb-1">Accuracy</span>
                                <span className="font-black text-slate-900 text-sm">
                                  {(model.metrics.accuracy * (model.metrics.accuracy > 1 ? 1 : 100)).toFixed(1)}%
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-slate-400 text-[9px] uppercase font-black mb-1">F1 Score</span>
                                <span className="font-black text-slate-900 text-sm">
                                  {(model.metrics.f1 * (model.metrics.f1 > 1 ? 1 : 100)).toFixed(1)}%
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-slate-400 text-[9px] uppercase font-black mb-1">Latency</span>
                                <span className="font-black text-slate-900 text-sm">
                                  {model.name.includes('Basic') ? '0.7ms' : 
                                   model.name.includes('Standard') ? '0.9ms' : 
                                   model.name.includes('Pro') ? '1.5ms' : 
                                   model.name.includes('Premium') ? '5.2ms' : '62ms'}
                                </span>
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-400 italic">No metrics</span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className={clsx("px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border", model.current_stage === "Production" ? "bg-teal-50 text-teal-600 border-teal-100" : model.current_stage === "Staging" ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-slate-50 text-slate-500 border-slate-100")}>
                          {model.current_stage || 'None'}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        {model.current_stage === "Production" ? (
                          <div className="bg-teal-500 text-white p-2 rounded-xl inline-flex shadow-lg shadow-teal-100"><ShieldCheck className="w-5 h-5" /></div>
                        ) : (
                          <button onClick={() => handleDeploy(model.version, model.name)} disabled={!!deploying} className="bg-brand text-slate-900 p-3 rounded-xl hover:scale-110 transition-all disabled:bg-slate-100 disabled:text-slate-300 shadow-xl shadow-brand/20">
                            {deploying === model.version ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 fill-slate-900" />}
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

        <section className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2 px-2">
            <Activity className="w-5 h-5 text-brand" />
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Deploy History</h2>
          </div>
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden h-[650px] flex flex-col">
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
                        <p className="text-[10px] text-slate-400 mt-1 uppercase font-black">{new Date(run.time).toLocaleString()}</p>
                      </td>
                      <td className="px-8 py-5">
                        <span className={clsx("px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border", (run.status === "success" || run.status === "completed") ? "bg-teal-50 text-teal-600 border-teal-100" : run.status === "failed" ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-amber-50 text-amber-600 border-amber-100")}>
                          {run.status}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <a href={run.raw?.html_url} target="_blank" className="bg-slate-50 text-slate-400 p-2 rounded-lg hover:bg-brand hover:text-white transition-all inline-flex">
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
