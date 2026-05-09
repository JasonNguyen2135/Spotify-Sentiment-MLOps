'use client';
import { useAuth } from '@/context/AuthContext';
import { redirect } from 'next/navigation';
import { 
  Settings, Play, ExternalLink, Clock, CheckCircle2, 
  AlertCircle, Database, Cpu, Layers, Zap, 
  ArrowRight, ShieldCheck, Loader2, RefreshCw
} from 'lucide-react';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { clsx } from 'clsx';

export default function PipelinePage() {
  const { user, loading: authLoading } = useAuth();
  const [datasets, setDatasets] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [triggering, setTriggering] = useState(false);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [status, setStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && user?.role !== 'admin') {
      redirect('/');
    }
    
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        
        const [datasetsRes, modelsRes] = await Promise.all([
          axios.get('/api/datasets', { headers }),
          axios.get('/api/models', { headers })
        ]);
        
        setDatasets(datasetsRes.data);
        setModels(modelsRes.data);
        if (datasetsRes.data.length > 0) {
          setSelectedDataset(datasetsRes.data[0].source);
        }
      } catch (err) {
        console.error("Failed to fetch orchestration data", err);
      } finally {
        setLoading(false);
      }
    };

    if (user?.role === 'admin') {
      fetchData();
    }
  }, [user, authLoading]);

  const handleTrain = async () => {
    setTriggering(true);
    setStatus(null);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/train', null, {
        params: { dataset_source: selectedDataset },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setStatus({ type: 'success', msg: 'Training pipeline triggered successfully!' });
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.response?.data?.detail || 'Failed to trigger pipeline' });
    } finally {
      setTriggering(false);
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
      // Refresh models list
      const modelsRes = await axios.get('/api/models', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setModels(modelsRes.data);
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
        <p className="text-gray-500 font-medium italic">Loading orchestration framework...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4">
        <div>
          <h1 className="text-4xl font-black text-gray-900 flex items-center gap-3">
            <Cpu className="text-brand w-10 h-10" />
            Orchestration <span className="text-brand">Framework</span>
          </h1>
          <p className="text-gray-500 mt-2">Centralized control for ML lifecycle, training, and deployment.</p>
        </div>
        
        <div className="flex gap-3">
          <a 
            href="http://localhost:31190" 
            target="_blank" 
            className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
          >
            <ExternalLink className="w-4 h-4" /> Airflow
          </a>
          <a 
            href="http://18.140.71.49:5000" 
            target="_blank" 
            className="bg-white border border-slate-200 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
          >
            <Layers className="w-4 h-4" /> MLflow
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Training Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 px-2">
            <Database className="w-5 h-5 text-brand" />
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Model Training</h2>
          </div>
          
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <label className="block text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Select Source Dataset</label>
            <div className="space-y-3 mb-8">
              {datasets.map((ds) => (
                <div 
                  key={ds.source}
                  onClick={() => setSelectedDataset(ds.source)}
                  className={clsx(
                    "p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between group",
                    selectedDataset === ds.source ? "border-brand bg-brand/5" : "border-slate-50 hover:border-slate-200 bg-slate-50/50"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={clsx(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                      selectedDataset === ds.source ? "bg-brand text-white" : "bg-white text-slate-400 group-hover:text-brand"
                    )}>
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{ds.name}</p>
                      <p className="text-xs text-slate-500 font-medium truncate max-w-[200px]">{ds.source}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-slate-900">{ds.count.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Records</p>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={handleTrain}
              disabled={triggering || !selectedDataset}
              className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
            >
              {triggering ? <Loader2 className="w-6 h-6 animate-spin" /> : <Zap className="w-6 h-6 fill-amber-400 text-amber-400" />}
              INITIATE TRAINING RUN
            </button>
            <p className="text-center text-[10px] text-slate-400 mt-4 font-bold uppercase tracking-widest">
              Triggers Airflow DAG: <span className="text-slate-600">sentiment_train_k8s</span>
            </p>
          </div>
        </section>

        {/* Model Management Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 px-2">
            <RefreshCw className="w-5 h-5 text-brand" />
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Model Registry</h2>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-8 py-5">Version</th>
                    <th className="px-8 py-5">Stage</th>
                    <th className="px-8 py-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {models.map((model) => (
                    <tr key={model.version} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-xs font-black text-slate-500">
                            v{model.version}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">Build #{model.run_id.slice(0, 8)}</p>
                            <p className="text-[10px] text-slate-400 font-medium">
                              Created: {new Date(model.creation_timestamp).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className={clsx(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                          model.current_stage === "Production" ? "bg-emerald-100 text-emerald-700" :
                          model.current_stage === "Staging" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                        )}>
                          {model.current_stage}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        {model.current_stage === "Production" ? (
                          <div className="flex items-center justify-end gap-2 text-emerald-600 font-bold text-xs">
                            <ShieldCheck className="w-4 h-4" /> ACTIVE
                          </div>
                        ) : (
                          <button 
                            onClick={() => handleDeploy(model.version)}
                            disabled={!!deploying}
                            className="bg-brand text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all flex items-center gap-2 ml-auto disabled:bg-slate-100 disabled:text-slate-300"
                          >
                            {deploying === model.version ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                            Deploy
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {models.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-8 py-20 text-center text-slate-400 font-medium italic">
                        No registered models found in MLflow.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-brand/5 p-6 rounded-3xl border border-brand/10">
            <p className="text-xs text-brand-700 leading-relaxed">
              <span className="font-bold">Pro-tip:</span> Deploying a model version will automatically transition it to the "Production" stage in MLflow. The model service will refresh its internal reference to serve the new version.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
