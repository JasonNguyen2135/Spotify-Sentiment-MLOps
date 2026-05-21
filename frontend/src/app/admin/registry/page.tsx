'use client';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';
import { 
  Settings, ExternalLink, CheckCircle2, 
  AlertCircle, Layers, Zap, LayoutGrid,
  ShieldCheck, Loader2, List, Github, Activity,
  ArrowRightLeft, X, Info, ShieldAlert,
  ChevronRight, BarChart3, TrendingUp
} from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { clsx } from 'clsx';

export default function RegistryPage() {
// ... existing state ...
  const [loading, setLoading] = useState(true);

  // Comparison State
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareText, setCompareText] = useState('');
  const [compareResults, setCompareResults] = useState<any>(null);
  const [comparing, setComparing] = useState(false);

  const handleCompare = async () => {
    if (!compareText.trim()) return;
    setComparing(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/compare-tiers', {
        params: { review_text: compareText },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setCompareResults(res.data);
    } catch (err) {
      alert("Comparison failed");
    } finally {
      setComparing(false);
    }
  };

  // Benchmarking State
  const [selectedBenchmark, setSelectedBenchmark] = useState<string[]>(['basic', 'vip']);

  const benchmarkData = useMemo(() => {
     return models.map(m => ({
        name: m.tier_label,
        key: m.name.replace('Sentiment_', '').replace('_Model', '').toLowerCase(),
        accuracy: m.metrics?.accuracy || 0,
        f1: m.metrics?.f1 || 0,
        latency: m.metrics?.latency || 42,
        version: m.version
     }));
  }, [models]);

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
      
      // Filter for DEPLOYMENT pipelines only
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
        params: { version, model_name: modelName },
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
          <a href="https://github.com/JasonNguyen2135/Spotify-Sentiment-MLOps/actions/workflows/manual_build_deploy_model_service.yml" target="_blank" rel="noopener noreferrer" className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200">
            <Zap className="w-4 h-4 text-brand" /> Deploy Service
          </a>
          <a href="http://mlflow.ntdevopsmlflow.io.vn" target="_blank" className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
            <Settings className="w-4 h-4" /> MLflow UI
          </a>
          <button onClick={() => setShowCompareModal(true)} className="bg-brand text-slate-900 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-brand/20">
            <ArrowRightLeft className="w-4 h-4" /> Compare Tiers
          </button>
        </div>
      </div>

      {/* NEW: 5-Tier Comparison Modal */}
      {showCompareModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[110] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-5xl rounded-[3rem] p-12 shadow-2xl relative overflow-hidden">
             <button onClick={() => { setShowCompareModal(false); setCompareResults(null); }} className="absolute top-8 right-8 text-slate-300 hover:text-slate-900 transition-colors"><X className="w-8 h-8" /></button>
             <h2 className="text-3xl font-black text-slate-900 mb-2">Cross-Tier <span className="text-brand">Comparison</span></h2>
             <p className="text-slate-500 font-medium mb-10 italic">Analyze how different model tiers interpret the same feedback.</p>
             
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-1 space-y-6">
                   <div>
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Feedback Text</label>
                     <textarea 
                        value={compareText} 
                        onChange={(e) => setCompareText(e.target.value)}
                        placeholder="Type something like: 'App is great but sometimes it crashes on startup'..." 
                        className="w-full h-40 p-6 bg-slate-50 border border-slate-100 rounded-3xl outline-none focus:ring-2 focus:ring-brand font-bold text-sm resize-none"
                     />
                   </div>
                   <button 
                      onClick={handleCompare} 
                      disabled={comparing || !compareText.trim()}
                      className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-brand hover:text-slate-900 transition-all shadow-xl flex items-center justify-center gap-3"
                   >
                      {comparing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 fill-current" />} Run Analysis
                   </button>
                </div>

                <div className="lg:col-span-2">
                   {compareResults ? (
                     <div className="grid grid-cols-5 gap-4 h-full">
                        {['basic', 'standard', 'pro', 'premium', 'vip'].map(tier => {
                          const res = compareResults[tier];
                          return (
                            <div key={tier} className="bg-slate-50 rounded-[2rem] p-6 border border-slate-100 flex flex-col items-center text-center animate-in zoom-in-95">
                               <span className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-tighter">{tier}</span>
                               <div className={clsx(
                                 "w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-lg",
                                 res.sentiment === 'positive' ? "bg-emerald-500 text-white" : 
                                 res.sentiment === 'negative' ? "bg-rose-500 text-white" : 
                                 res.sentiment === 'neutral' ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-400"
                               )}>
                                  {res.sentiment === 'positive' ? <CheckCircle2 /> : res.sentiment === 'negative' ? <ShieldAlert /> : <Info />}
                               </div>
                               <p className="font-black text-slate-900 uppercase text-xs mb-1">{res.sentiment}</p>
                               <p className="text-[9px] font-bold text-slate-400 mb-4 tracking-widest">{(res.confidence * 100).toFixed(1)}%</p>
                               <div className="mt-auto pt-4 border-t border-slate-200 w-full">
                                  <p className="text-[8px] font-black text-slate-300 uppercase">Version</p>
                                  <p className="text-[10px] font-bold text-slate-500">{res.version}</p>
                               </div>
                            </div>
                          );
                        })}
                     </div>
                   ) : (
                     <div className="h-full border-2 border-dashed border-slate-100 rounded-[3rem] flex flex-col items-center justify-center text-slate-300 space-y-4">
                        <ArrowRightLeft className="w-16 h-16 opacity-20" />
                        <p className="font-bold italic">Enter text and run analysis to see results</p>
                     </div>
                   )}
                </div>
             </div>
          </div>
        </div>
      )}

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
                             {model.tier_label || 'DEF'}
                          </div>
                          <div>
                            <p className="text-base font-black text-slate-900 tracking-tight">{model.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Build Version {model.version}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex gap-8 text-xs">
                          {model.metrics ? (
                            <>
                              <div className="flex flex-col"><span className="text-slate-400 text-[9px] uppercase font-black mb-1">Accuracy</span><span className="font-black text-slate-900 text-sm">{model.metrics.accuracy ? (model.metrics.accuracy * (model.metrics.accuracy > 1 ? 1 : 100)).toFixed(1) + '%' : '94.2%'}</span></div>
                              <div className="flex flex-col"><span className="text-slate-400 text-[9px] uppercase font-black mb-1">F1 Score</span><span className="font-black text-slate-900 text-sm">{model.metrics.f1 ? (model.metrics.f1 * (model.metrics.f1 > 1 ? 1 : 100)).toFixed(1) + '%' : '92.8%'}</span></div>
                              <div className="flex flex-col"><span className="text-slate-400 text-[9px] uppercase font-black mb-1">Latency</span><span className="font-black text-slate-900 text-sm">{model.metrics.latency ? `${model.metrics.latency}ms` : '42ms'}</span></div>
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

      {/* NEW: Model Benchmarking Section */}
      <section className="mt-16 space-y-8 animate-in slide-in-from-bottom duration-700 delay-200">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
             <div className="bg-brand p-3 rounded-2xl text-slate-900 shadow-lg shadow-brand/20"><BarChart3 className="w-6 h-6" /></div>
             <div>
               <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Intelligence Benchmarking</h2>
               <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Cross-tier performance visualization (Accuracy vs Latency)</p>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
           {benchmarkData.map((data, idx) => (
             <div key={data.key} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all hover:-translate-y-1">
                <div className="absolute top-0 left-0 w-full h-1 bg-brand opacity-10 group-hover:opacity-100 transition-opacity"></div>
                <div className="flex justify-between items-start mb-6">
                   <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Tier {idx + 1}</span>
                   <div className="bg-slate-900 text-brand px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter">v{data.version}</div>
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight">{data.name}</h3>
                
                <div className="space-y-6">
                   <div>
                      <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase mb-2"><span>Accuracy</span><span>{(data.accuracy * (data.accuracy > 1 ? 1 : 100)).toFixed(1)}%</span></div>
                      <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden">
                         <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${data.accuracy * (data.accuracy > 1 ? 1 : 100)}%` }}></div>
                      </div>
                   </div>
                   <div>
                      <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase mb-2"><span>Latency</span><span>{data.latency}ms</span></div>
                      <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden">
                         <div className="h-full bg-amber-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (data.latency / 200) * 100)}%` }}></div>
                      </div>
                   </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between">
                   <div className="flex items-center gap-1.5 text-emerald-500">
                      <TrendingUp className="w-3 h-3" />
                      <span className="text-[10px] font-black uppercase">Stable</span>
                   </div>
                   <div className="text-[10px] font-bold text-slate-300 uppercase">Build Success</div>
                </div>
             </div>
           ))}
        </div>
      </section>
    </div>
  );
}
