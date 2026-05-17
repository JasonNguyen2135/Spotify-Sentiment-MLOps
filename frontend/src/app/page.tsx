'use client';
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { 
  Activity, Users, Database, Zap, Loader2, Send, 
  CheckCircle2, ShieldAlert, Target, TrendingUp, 
  BarChart3, PieChart as PieChartIcon, ArrowUpRight, 
  ArrowDownRight, Info, Download, Calendar, Sparkles,
  MessageSquare, LayoutGrid, Plus, FolderPlus, ArrowRight,
  FileText, ArrowLeftRight, ChevronRight, BellRing, Ticket as TicketIcon, Settings, RefreshCw, Trash2
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import Link from 'next/link';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar, 
  Cell, PieChart, Pie, Legend, AreaChart, Area
} from 'recharts';

export default function UniversalHub() {
  const { user, loading: authLoading } = useAuth();
  const { activeProject, setActiveProject } = useProject();
  const router = useRouter();
  
  // Dashboard States
  const [stats, setStats] = useState<any>(null);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [comparison, setComparison] = useState<any>(null);
  const [keywords, setKeywords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Project States
  const [projects, setProjects] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [monitorType, setMonitorType] = useState<'webhook' | 'crawler'>('crawler');
  const [appId, setAppId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdProject, setCreatedProject] = useState<any>(null);

  // Ad-hoc Analysis States
  const [review, setReview] = useState('');
  const [prediction, setPrediction] = useState<any>(null);
  const [predicting, setPredicting] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState('Production');
  const [modelOptions, setModelOptions] = useState<any[]>([]);

  // HITL States
  const [fullHistory, setFullHistory] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Global Harvester States
  const [harvestId, setHarvestId] = useState('');
  const [harvestPlatform, setHarvestPlatform] = useState('Google Play');
  const [harvesting, setHarvesting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const params = { project_id: activeProject?.id || null };
      
      const [statsRes, analyticsRes, compRes, keywordsRes, projectsRes, modelsRes, historyRes, auditRes] = await Promise.all([
        axios.get('/api/stats', { headers, params }),
        axios.get('/api/monthly-analytics', { headers, params }),
        axios.get('/api/comparison', { headers, params }),
        axios.get('/api/word-cloud', { headers, params }),
        axios.get('/api/projects', { headers }),
        axios.get('/api/models', { headers }).catch(() => ({ data: [] })),
        activeProject ? axios.get('/api/history', { headers, params }) : Promise.resolve({ data: [] }),
        user?.role === 'admin' ? axios.get('/api/audit-logs', { headers, params }) : Promise.resolve({ data: [] })
      ]);
      
      setStats(statsRes.data);
      setMonthlyData(analyticsRes.data);
      setComparison(compRes.data);
      setKeywords(keywordsRes.data);
      setProjects(projectsRes.data);
      setModelOptions(modelsRes.data);
      setFullHistory(historyRes.data);
      setAuditLogs(auditRes.data);
    } catch (err) {
      console.error("Failed to fetch hub data", err);
    } finally {
      setLoading(false);
    }
  }, [activeProject, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    fetchData();
  }, [user, authLoading, activeProject, router, fetchData]);

  const handleExport = async (type: 'excel' | 'pdf') => {
    if (!activeProject) return;
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/export/${type}/${activeProject.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Project_${activeProject.name}_Report.${type === 'excel' ? 'csv' : 'pdf'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert("Export failed");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/projects', null, {
        params: { name, description: desc, monitor_type: monitorType },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const project = res.data;
      if (monitorType === 'crawler' && appId) {
        await axios.post('/api/connectors', null, {
          params: { platform: 'Google Play', app_id: appId, project_id: project.id, schedule: 'daily' },
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }

      setProjects([...projects, project]);
      setCreatedProject(project);
    } catch (err) {
      alert("Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (id: number) => {
    if (!confirm("Are you sure you want to delete this workspace and all its history?")) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/projects/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setProjects(projects.filter(p => p.id !== id));
      if (activeProject?.id === id) setActiveProject(null);
    } catch (err) {
      alert("Delete failed");
    }
  };

  const handlePredict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!review.trim()) return;
    setPredicting(true);
    setPrediction(null);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`/api/predict`, null, {
          params: { review_text: review, project_id: activeProject?.id || projects[0]?.id, model_version: selectedVersion },
          headers: { 'Authorization': `Bearer ${token}` }
      });
      setPrediction(response.data);
      if (activeProject) fetchData();
    } catch (err) {
      console.error("Prediction failed", err);
    } finally {
      setPredicting(false);
    }
  };

  const handleCorrection = async (id: string, text: string, corrected: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/correction', null, {
        params: { prediction_id: id, text, corrected_sentiment: corrected, project_id: activeProject.id },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchData();
    } catch (err) {
      alert("Failed to submit correction");
    }
  };

  const handleHarvest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!harvestId.trim()) return;
    setHarvesting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/connectors/harvest`, {
        params: { platform: harvestPlatform, app_id: harvestId, limit: 1000 },
        headers: { 'Authorization': `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${harvestPlatform}_${harvestId}_harvest.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert("Harvesting failed.");
    } finally {
      setHarvesting(false);
    }
  };

  const enterProject = (project: any) => {
    setActiveProject(project);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading && !projects.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-gray-500 font-medium italic">Assembling intelligence hub...</p>
      </div>
    );
  }

  const sentimentData = [
    { name: 'Positive', value: (monthlyData || []).reduce((acc, curr) => acc + (curr?.positive || 0), 0), color: '#10b981' },
    { name: 'Negative', value: (monthlyData || []).reduce((acc, curr) => acc + (curr?.negative || 0), 0), color: '#ef4444' },
    { name: 'Neutral', value: (monthlyData || []).reduce((acc, curr) => acc + (curr?.neutral || 0), 0), color: '#6366f1' },
  ].filter(d => d.value > 0);

  return (
    <div className="animate-in fade-in duration-700 pb-20 print:p-0 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-12 print:hidden flex justify-between items-end">
        <div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tight mb-2">
            {activeProject ? activeProject.name : 'Universal Hub'}
          </h1>
          <p className="text-slate-500 text-lg font-medium">
            {activeProject 
              ? `Enterprise sentiment intelligence monitoring.` 
              : 'Global sentiment analysis & platform-wide toolkit.'}
          </p>
        </div>
        {activeProject && (
          <button onClick={() => handleDeleteProject(activeProject.id)} className="bg-rose-50 text-rose-600 p-4 rounded-2xl hover:bg-rose-100 transition-all shadow-sm border border-rose-100">
             <Trash2 className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Toolkit Sections - HIDDEN WHEN IN PROJECT */}
      {!activeProject && (
        <>
          {/* Metrics Grid */}
          {['admin', 'ai_engineer'].includes(user?.role) && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12 no-print">
              {[
                { name: 'Model Health', value: stats?.accuracy || '94.2%', icon: Target, up: true, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { name: 'Total Insights', value: stats?.total_predictions?.toLocaleString() || '0', icon: Activity, up: true, color: 'text-blue-600', bg: 'bg-blue-50' },
                { name: 'Data Drift', value: stats?.drift_score || '0.2%', icon: Zap, up: false, color: 'text-amber-600', bg: 'bg-amber-50' },
                { name: 'Dataset Scale', value: stats?.dataset_size || '0 records', icon: Database, up: true, color: 'text-purple-600', bg: 'bg-purple-50' },
              ].map((item) => (
                <div key={item.name} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:shadow-xl group">
                  <div className="flex justify-between items-start mb-6">
                    <div className={`${item.bg} ${item.color} p-4 rounded-2xl group-hover:scale-110 transition-transform`}>
                      <item.icon className="w-6 h-6" />
                    </div>
                  </div>
                  <h3 className="text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] mb-1">{item.name}</h3>
                  <p className="text-3xl font-black text-slate-900 tracking-tight">{item.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
            {/* Harvester */}
            <div className="lg:col-span-1 bg-slate-900 p-10 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col group">
              <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-emerald-500 opacity-10 blur-[100px] group-hover:opacity-20 transition-opacity"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="bg-emerald-500/20 p-2.5 rounded-xl text-emerald-400"><Database className="w-5 h-5" /></div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Harvester</h2>
                </div>
                <form onSubmit={handleHarvest} className="space-y-4">
                  <select value={harvestPlatform} onChange={(e) => setHarvestPlatform(e.target.value)} className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 text-white transition-all font-bold text-sm appearance-none">
                    <option className="bg-slate-900">Google Play</option>
                    <option className="bg-slate-900">App Store</option>
                  </select>
                  <input type="text" value={harvestId} onChange={(e) => setHarvestId(e.target.value)} placeholder="Application ID" className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 text-white transition-all font-medium text-sm" />
                  <button type="submit" disabled={harvesting || !harvestId.trim()} className="w-full bg-emerald-500 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 disabled:bg-slate-800 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2">
                    {harvesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Scrape 1K Samples
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-2 bg-slate-900 p-10 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col justify-center group border border-white/5">
              <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-brand opacity-20 blur-[120px] group-hover:opacity-30 transition-opacity"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="bg-brand/20 p-2.5 rounded-xl text-brand"><Sparkles className="w-5 h-5 fill-brand" /></div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Instant Analysis</h2>
                </div>
                <form onSubmit={handlePredict} className="relative mb-8">
                  <input type="text" value={review} onChange={(e) => setReview(e.target.value)} placeholder="Enter feedback for deep sentiment extraction..." className="w-full pl-8 pr-40 py-6 bg-white/5 border border-white/10 rounded-[2rem] outline-none focus:ring-2 focus:ring-brand text-white transition-all font-medium" />
                  <button type="submit" disabled={predicting || !review.trim()} className="absolute right-3 top-3 bottom-3 bg-brand text-white px-10 rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:opacity-90 disabled:bg-slate-800 transition-all shadow-lg shadow-brand/20">
                    {predicting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Extract Sentiment"}
                  </button>
                </form>
                {prediction && (
                  <div className="p-6 bg-white/5 rounded-[2rem] border border-white/10 animate-in slide-in-from-top flex items-center gap-8">
                    <div className={clsx("p-6 rounded-[1.5rem] shadow-xl", prediction.sentiment === "positive" ? "bg-emerald-500/20 text-emerald-400 shadow-emerald-500/10" : "bg-rose-500/20 text-rose-400 shadow-rose-500/10")}>
                      {prediction.sentiment === "positive" ? <CheckCircle2 className="w-10 h-10" /> : <ShieldAlert className="w-10 h-10" />}
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mb-1">AI Classification Result</p>
                      <p className="text-4xl font-black text-white uppercase tracking-tighter">{prediction.sentiment}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Workspace View */}
      <div className="pt-8">
        {activeProject ? (
          <div className="animate-in fade-in slide-in-from-bottom duration-700">
            <div className="flex justify-between items-center mb-12">
              <h2 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-5">
                 <div className="bg-brand p-3 rounded-2xl text-white shadow-lg shadow-brand/20"><LayoutGrid className="w-7 h-7" /></div> Workspace Monitoring
              </h2>
              <div className="flex gap-4">
                <Link href="/admin/connectors" className="bg-white px-6 py-3 rounded-2xl border border-slate-200 font-black text-[10px] uppercase tracking-widest flex items-center gap-3 hover:bg-slate-50 transition-all shadow-sm text-slate-600">
                  <RefreshCw className="w-4 h-4 text-brand" /> Change Strategy
                </Link>
                <button onClick={() => handleExport('excel')} className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl border border-emerald-100 font-black text-[10px] uppercase tracking-widest flex items-center gap-3 hover:bg-emerald-100 transition-all shadow-sm">
                  <FileText className="w-4 h-4" /> Download CSV
                </button>
                <button onClick={() => { window.print(); }} className="bg-rose-50 text-rose-600 px-6 py-3 rounded-2xl border border-rose-100 font-black text-[10px] uppercase tracking-widest flex items-center gap-3 hover:bg-rose-100 transition-all shadow-sm">
                  <PieChartIcon className="w-4 h-4" /> Export Charts
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
              <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden group">
                <div className="flex justify-between items-center mb-10">
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight">Historical Intelligence</h2>
                  <div className="flex gap-2">
                    <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-500 uppercase tracking-widest"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Positive</span>
                    <span className="flex items-center gap-1.5 text-[9px] font-black text-rose-500 uppercase tracking-widest"><div className="w-1.5 h-1.5 bg-rose-500 rounded-full" /> Negative</span>
                  </div>
                </div>
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyData}>
                      <defs>
                        <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                        <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="5 5" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 800}} dy={15} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 800}} />
                      <Tooltip contentStyle={{borderRadius: '2rem', border: 'none', padding: '1.5rem', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)'}} itemStyle={{fontWeight: 900, textTransform: 'uppercase', fontSize: '10px'}} />
                      <Area type="monotone" dataKey="positive" stroke="#10b981" strokeWidth={5} fillOpacity={1} fill="url(#colorPos)" />
                      <Area type="monotone" dataKey="negative" stroke="#ef4444" strokeWidth={5} fillOpacity={1} fill="url(#colorNeg)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col items-center">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-10 w-full">Sentiment Split</h2>
                <div className="flex-1 h-[280px] w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={85} outerRadius={110} paddingAngle={10} dataKey="value" stroke="none">
                        {sentimentData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aggregate</p>
                    <p className="text-4xl font-black text-slate-900 tracking-tighter">{sentimentData.reduce((acc, curr) => acc + curr.value, 0).toLocaleString()}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-6 w-full mt-8 border-t border-slate-50 pt-8">
                  {sentimentData.map(s => (
                    <div key={s.name} className="text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.name}</p>
                      <p className="text-lg font-black text-slate-900" style={{color: s.color}}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
              <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl text-white">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-xl font-black tracking-tight flex items-center gap-3">
                    <BellRing className="w-6 h-6 text-brand" /> Smart Alerts
                  </h2>
                  <button className="bg-brand text-slate-900 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider">Save Config</button>
                </div>
                <div className="space-y-4">
                  <div className="p-5 bg-white/5 rounded-2xl border border-white/10">
                    <div className="flex justify-between items-center mb-3">
                      <p className="font-black text-sm">Slack Notification</p>
                      <div className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black uppercase">Active</div>
                    </div>
                    <input type="text" placeholder="Slack Webhook URL" className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-xs text-slate-300 outline-none focus:ring-1 focus:ring-brand" />
                  </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                    <TicketIcon className="w-6 h-6 text-brand" /> CSKH Ticket System
                  </h2>
                  <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-[10px] font-black">3 Open</span>
                </div>
                <div className="mb-6">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Support Email</label>
                  <input type="email" placeholder="support@company.com" className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-brand/20 transition-all" />
                </div>
                <div className="space-y-4 overflow-auto max-h-[200px] pr-2">
                  {[1, 2].map(i => (
                    <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-xs font-bold text-slate-700 mb-3">"Sample customer complaint about system performance."</p>
                      <button onClick={() => alert("Forwarded!")} className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase flex items-center gap-2">
                        <Send className="w-3 h-3" /> Send to Email
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm mb-16">
              <div className="flex items-center gap-4 mb-10">
                <div className="bg-slate-900 p-3 rounded-2xl text-brand"><Users className="w-6 h-6" /></div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Human-in-the-Loop Correction</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Feedback</th>
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Correct?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {fullHistory.map((item) => (
                      <tr key={item.id} className="group hover:bg-slate-50/50 transition-all">
                        <td className="py-6 pr-8">
                          <p className="text-sm font-bold text-slate-700">{item.text}</p>
                          <span className={clsx("mt-2 px-2 py-0.5 rounded text-[9px] font-black uppercase", item.sentiment === "positive" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600")}>{item.sentiment}</span>
                        </td>
                        <td className="py-6">
                           <div className="flex justify-center gap-2">
                              <button onClick={() => handleCorrection(item.id, item.text, 'positive')} className="p-2 hover:bg-emerald-50 text-slate-300 hover:text-emerald-500 rounded-xl"><TrendingUp className="w-4 h-4" /></button>
                              <button onClick={() => handleCorrection(item.id, item.text, 'negative')} className="p-2 hover:bg-rose-50 text-slate-300 hover:text-rose-500 rounded-xl"><TrendingUp className="w-4 h-4 rotate-180" /></button>
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-4"><LayoutGrid className="text-brand w-10 h-10" /> Workspaces</h2>
              <button onClick={() => setShowCreate(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"><Plus className="w-5 h-5" /> New Workspace</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {projects.map((p) => (
                <div key={p.id} onClick={() => enterProject(p)} className="group p-8 rounded-[3rem] border bg-white border-slate-100 shadow-sm hover:shadow-2xl transition-all cursor-pointer relative overflow-hidden">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-brand/5 text-brand group-hover:bg-brand group-hover:text-white transition-colors"><FolderPlus className="w-7 h-7" /></div>
                  <h3 className="text-2xl font-black text-slate-900 mb-2">{p.name}</h3>
                  <div className="flex items-center justify-between pt-8 border-t border-slate-50 mt-10">
                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest"><Calendar className="w-4 h-4" />{new Date(p.created_at).toLocaleDateString()}</div>
                    <div className="flex items-center gap-2 text-brand font-black text-[10px] uppercase tracking-widest">Enter <ArrowRight className="w-4 h-4" /></div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-[100] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] p-12 shadow-2xl">
            <h2 className="text-4xl font-black text-slate-900 mb-8 tracking-tight">New Workspace</h2>
            <form onSubmit={handleCreate} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Project Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-brand font-bold text-sm" required />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Monitoring Strategy</label>
                <div className="grid grid-cols-2 gap-4">
                  <div onClick={() => setMonitorType('crawler')} className={clsx("p-4 rounded-xl border-2 cursor-pointer text-center", monitorType === 'crawler' ? "border-brand bg-brand/5" : "border-slate-50 bg-slate-50")}>
                    <p className="font-bold text-xs">Public App</p>
                    <p className="text-[9px] text-slate-400 uppercase">Crawler</p>
                  </div>
                  <div onClick={() => setMonitorType('webhook')} className={clsx("p-4 rounded-xl border-2 cursor-pointer text-center", monitorType === 'webhook' ? "border-brand bg-brand/5" : "border-slate-50 bg-slate-50")}>
                    <p className="font-bold text-xs">Custom API</p>
                    <p className="text-[9px] text-slate-400 uppercase">Webhook</p>
                  </div>
                </div>
              </div>
              {monitorType === 'crawler' && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Application ID</label>
                  <input type="text" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="e.g. com.spotify.music" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-medium text-sm" />
                </div>
              )}
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 font-black text-xs uppercase tracking-widest text-slate-400">Cancel</button>
                <button type="submit" disabled={creating} className="flex-[2] bg-slate-900 text-white px-6 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                  {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />} Create Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
