'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { 
  Activity, Users, Database, Zap, Loader2, Send, 
  CheckCircle2, ShieldAlert, Target, TrendingUp, 
  BarChart3, PieChart as PieChartIcon, ArrowUpRight, 
  ArrowDownRight, Info, Download, Calendar, Sparkles,
  MessageSquare, LayoutGrid, Plus, FolderPlus, ArrowRight,
  FileText, ArrowLeftRight, ChevronRight, BellRing, Ticket as TicketIcon, Settings
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
  const [monitorType, setMonitorType] = useState<'api' | 'google_play'>('api');
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

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const fetchData = async () => {
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
    };
    
    fetchData();
  }, [user, authLoading, activeProject, router]);

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
      link.setAttribute('download', `Project_${activeProject.name}_Report.${type === 'excel' ? 'xlsx' : 'pdf'}`);
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
        params: { name, description: desc },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const project = res.data;
      if (monitorType === 'google_play' && appId) {
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
      // Refresh history
      const res = await axios.get('/api/history', { 
        headers: { 'Authorization': `Bearer ${token}` },
        params: { project_id: activeProject.id }
      });
      setFullHistory(res.data);
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
      setStats({ ...stats, type: 'success', msg: 'Harvest complete! 1000 items exported.' });
    } catch (err) {
      console.error("Harvest failed", err);
      alert("Harvesting failed. Ensure the ID is correct.");
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
    { name: 'Positive', value: monthlyData.reduce((acc, curr) => acc + (curr.positive || 0), 0), color: '#10b981' },
    { name: 'Negative', value: monthlyData.reduce((acc, curr) => acc + (curr.negative || 0), 0), color: '#ef4444' },
    { name: 'Neutral', value: monthlyData.reduce((acc, curr) => acc + (curr.neutral || 0), 0), color: '#6366f1' },
  ].filter(d => d.value > 0);

  return (
    <div className="animate-in fade-in duration-700 pb-20 print:p-0 max-w-7xl mx-auto">
      {/* Header & Navigation */}
      <div className="mb-12 print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
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
          <div className="flex flex-wrap items-center gap-2 bg-slate-100/50 p-1.5 rounded-[2rem] border border-slate-200 shadow-inner">
            {[
              { label: 'Dashboard', active: !activeProject, onClick: () => setActiveProject(null), icon: LayoutGrid },
              { label: 'Analysis', icon: Activity },
              { label: 'Compare', icon: ArrowLeftRight },
              { label: 'History', icon: FileText },
            ].map((item) => (
              <button 
                key={item.label}
                onClick={item.onClick}
                className={clsx(
                  "px-6 py-2.5 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2",
                  item.active ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"
                )}
              >
                <item.icon className="w-3.5 h-3.5" /> {item.label}
              </button>
            ))}
            {['admin', 'ai_engineer'].includes(user?.role) && (
              <>
                <div className="w-px h-6 bg-slate-200 mx-2" />
                <Link href="/admin/registry" className="px-6 py-2.5 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest text-slate-500 hover:text-brand transition-all flex items-center gap-2">
                  <Settings className="w-3.5 h-3.5" /> Model Hub
                </Link>
                <Link href="/admin/training" className="px-6 py-2.5 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest text-slate-500 hover:text-emerald-500 transition-all flex items-center gap-2">
                  <Database className="w-3.5 h-3.5" /> Training
                </Link>
              </>
            )}
            {user?.role === 'analyst' && (
               <div className="px-6 py-2.5 text-slate-400 font-black text-[9px] uppercase tracking-widest bg-white rounded-full shadow-sm">Analyst Mode</div>
            )}
          </div>
        </div>
      </div>

      {/* Toolkit Sections - HIDDEN WHEN IN PROJECT */}
      {!activeProject && (
        <>
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12 no-print">
            {[
              { name: 'Model Health', value: stats?.accuracy || '94.2%', icon: Target, trend: '+0.5%', up: true, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { name: 'Total Insights', value: stats?.total_predictions?.toLocaleString() || '0', icon: Activity, trend: '+12%', up: true, color: 'text-blue-600', bg: 'bg-blue-50' },
              { name: 'Data Drift', value: stats?.drift_score || '0.2%', icon: Zap, trend: '-0.1%', up: false, color: 'text-amber-600', bg: 'bg-amber-50' },
              { name: 'Dataset Scale', value: stats?.dataset_size || '0 records', icon: Database, trend: 'Updated', up: true, color: 'text-purple-600', bg: 'bg-purple-50' },
            ].map((item) => (
              <div key={item.name} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:shadow-xl group">
                <div className="flex justify-between items-start mb-6">
                  <div className={`${item.bg} ${item.color} p-4 rounded-2xl group-hover:scale-110 transition-transform`}>
                    <item.icon className="w-6 h-6" />
                  </div>
                  <div className={clsx(
                    "flex items-center gap-1 text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest",
                    item.up ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-700"
                  )}>
                    {item.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {item.trend}
                  </div>
                </div>
                <h3 className="text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] mb-1">{item.name}</h3>
                <p className="text-3xl font-black text-slate-900 tracking-tight">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Ad-hoc Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
            <div className="lg:col-span-1 bg-slate-900 p-10 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col group">
              <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-emerald-500 opacity-10 blur-[100px] group-hover:opacity-20 transition-opacity"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="bg-emerald-500/20 p-2.5 rounded-xl text-emerald-400"><Database className="w-5 h-5" /></div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Harvester</h2>
                </div>
                <form onSubmit={handleHarvest} className="space-y-4">
                  <select 
                    value={harvestPlatform}
                    onChange={(e) => setHarvestPlatform(e.target.value)}
                    className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 text-white transition-all font-bold text-sm appearance-none"
                  >
                    <option className="bg-slate-900">Google Play</option>
                    <option className="bg-slate-900">App Store</option>
                  </select>
                  <input 
                    type="text"
                    value={harvestId}
                    onChange={(e) => setHarvestId(e.target.value)}
                    placeholder="Application ID (e.g. com.spotify.music)"
                    className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 text-white transition-all placeholder:text-slate-500 font-medium text-sm"
                  />
                  <button type="submit" disabled={harvesting || !harvestId.trim()} className="w-full bg-emerald-500 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 disabled:bg-slate-800 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2">
                    {harvesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Scrape 1K Samples
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
                  {user?.role === 'admin' && (
                    <select 
                      value={selectedVersion}
                      onChange={(e) => setSelectedVersion(e.target.value)}
                      className="ml-auto bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest text-brand outline-none focus:ring-1 focus:ring-brand"
                    >
                      <option className="bg-slate-900" value="Production">Prod (v1.2)</option>
                      {modelOptions.map((m: any) => (
                        <option key={m.version} className="bg-slate-900" value={m.version}>v{m.version}</option>
                      ))}
                      <option className="bg-slate-900" value="BERT">BERT Transformer</option>
                      <option className="bg-slate-900" value="LSTM">Bi-LSTM</option>
                    </select>
                  )}
                </div>
                <form onSubmit={handlePredict} className="relative mb-8">
                  <input 
                    type="text"
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    placeholder="Enter customer feedback for deep sentiment extraction..."
                    className="w-full pl-8 pr-40 py-6 bg-white/5 border border-white/10 rounded-[2rem] outline-none focus:ring-2 focus:ring-brand text-white transition-all placeholder:text-slate-500 font-medium"
                  />
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

          {/* NEW: Audit Logs Section for Admins */}
          {user?.role === 'admin' && (
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm mb-16">
              <div className="flex items-center gap-4 mb-10">
                <div className="bg-slate-900 p-3 rounded-2xl text-brand"><ShieldAlert className="w-6 h-6" /></div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">System Audit Logs</h2>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Traceability of all system-critical actions</p>
                </div>
              </div>
              <div className="overflow-auto max-h-[400px]">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Timestamp</th>
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">User</th>
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {auditLogs.length > 0 ? auditLogs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-all">
                        <td className="py-4 text-xs font-medium text-slate-500">{new Date(log.timestamp).toLocaleString()}</td>
                        <td className="py-4 text-xs font-black text-slate-700 uppercase tracking-tighter">{log.username}</td>
                        <td className="py-4">
                          <span className="bg-slate-100 px-2 py-1 rounded text-[9px] font-black text-slate-600 uppercase tracking-widest">{log.action}</span>
                        </td>
                        <td className="py-4 text-xs font-medium text-slate-600">{log.details}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4} className="py-10 text-center text-slate-400 italic">No logs found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Workspace View */}
      <div className="pt-8">
        {activeProject ? (
          <div className="animate-in fade-in slide-in-from-bottom duration-700">
            {/* Header for Workspace inside Hub */}
            <div className="flex justify-between items-center mb-12">
              <h2 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-5">
                 <div className="bg-brand p-3 rounded-2xl text-white shadow-lg shadow-brand/20"><LayoutGrid className="w-7 h-7" /></div>
                 Workspace Monitoring
              </h2>
              <div className="flex gap-4">
                <button onClick={() => handleExport('excel')} className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl border border-emerald-100 font-black text-[10px] uppercase tracking-widest flex items-center gap-3 hover:bg-emerald-100 transition-all shadow-sm">
                  <FileText className="w-4 h-4" /> Excel Report
                </button>
                <button onClick={() => handleExport('pdf')} className="bg-rose-50 text-rose-600 px-6 py-3 rounded-2xl border border-rose-100 font-black text-[10px] uppercase tracking-widest flex items-center gap-3 hover:bg-rose-100 transition-all shadow-sm">
                  <FileText className="w-4 h-4" /> PDF Report
                </button>
                <div className="bg-slate-900 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white flex items-center gap-3 shadow-xl shadow-slate-200">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /> Live Stream
                </div>
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
                      <Tooltip 
                        contentStyle={{borderRadius: '2rem', border: 'none', padding: '1.5rem', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)'}}
                        itemStyle={{fontWeight: 900, textTransform: 'uppercase', fontSize: '10px'}}
                      />
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
              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm group">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-10">Volume Dynamics</h2>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 800}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 800}} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '1.5rem', border: 'none', boxShadow: '0 20px 40px -10px rgb(0 0 0 / 0.1)'}} />
                      <Bar dataKey="positive" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="negative" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="neutral" stackId="a" fill="#6366f1" radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-10">Keyword Intelligence</h2>
                <div className="flex-1 flex flex-wrap gap-3 content-start overflow-auto max-h-[280px] p-4 bg-slate-50/50 rounded-3xl border border-slate-100 shadow-inner">
                  {keywords.length > 0 ? keywords.map((word, i) => (
                    <span 
                      key={i} 
                      className="px-5 py-2.5 bg-white text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand hover:text-white transition-all cursor-default border border-slate-200 shadow-sm hover:scale-110" 
                      style={{ fontSize: Math.max(9, Math.min(22, 10 + word.value / 1.5)) }}
                    >
                      {word.text}
                    </span>
                  )) : <div className="w-full h-full flex items-center justify-center text-slate-300 italic text-sm text-center">Harvesting intelligence...</div>}
                </div>
              </div>
            </div>

            {/* NEW: Smart Alerts & Ticket System Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
              {/* Smart Alerts Configuration */}
              <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl text-white">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-xl font-black tracking-tight flex items-center gap-3">
                    <BellRing className="w-6 h-6 text-brand" /> Smart Alerts
                  </h2>
                  <button className="bg-brand text-slate-900 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider">Add Rule</button>
                </div>
                <div className="space-y-4">
                  <div className="p-5 bg-white/5 rounded-2xl border border-white/10 flex justify-between items-center">
                    <div>
                      <p className="font-black text-sm mb-1">Negative Storm Alert</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Trigger: {">"}25% Negative Reviews</p>
                    </div>
                    <div className="flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black">Telegram</div>
                  </div>
                  <div className="p-5 bg-white/5 rounded-2xl border border-white/10 flex justify-between items-center">
                    <div>
                      <p className="font-black text-sm mb-1">Sentiment Drop Alert</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Trigger: Avg Score drop 15%</p>
                    </div>
                    <div className="flex items-center gap-2 bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-[10px] font-black">Email</div>
                  </div>
                </div>
              </div>

              {/* Ticket System Overview */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                    <TicketIcon className="w-6 h-6 text-brand" /> CSKH Ticket System
                  </h2>
                  <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-[10px] font-black">3 Open</span>
                </div>
                <div className="space-y-4 overflow-auto max-h-[300px] pr-2">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex justify-between mb-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase">#TK-8821</span>
                      <span className="text-[10px] font-black text-rose-500 uppercase">High Priority</span>
                    </div>
                    <p className="text-xs font-bold text-slate-700 mb-3 line-clamp-2">"The latest update is crashing constantly on my iPhone. Very frustrated."</p>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">2h ago</span>
                      <button className="text-[9px] font-black text-brand uppercase tracking-widest hover:underline">Assign Staff</button>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex justify-between mb-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase">#TK-8819</span>
                      <span className="text-[10px] font-black text-amber-500 uppercase">Medium</span>
                    </div>
                    <p className="text-xs font-bold text-slate-700 mb-3 line-clamp-2">"Can't find the lyrics feature anymore. Why was it moved?"</p>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">5h ago</span>
                      <button className="text-[9px] font-black text-brand uppercase tracking-widest hover:underline">Assign Staff</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* NEW: Human-in-the-loop (HITL) Correction Section */}
            <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm mb-16">
              <div className="flex items-center gap-4 mb-10">
                <div className="bg-slate-900 p-3 rounded-2xl text-brand"><Users className="w-6 h-6" /></div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Human-in-the-Loop Correction</h2>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Audit AI predictions and improve model accuracy</p>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Feedback Text</th>
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">AI Sentiment</th>
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Correct Sentiment?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {fullHistory.length > 0 ? fullHistory.map((item) => (
                      <tr key={item.id} className="group hover:bg-slate-50/50 transition-all">
                        <td className="py-6 pr-8">
                          <p className="text-sm font-bold text-slate-700 leading-relaxed">{item.text}</p>
                          <p className="text-[9px] font-black text-slate-400 mt-2 uppercase tracking-tighter">Model: {item.model_version} • {new Date(item.timestamp).toLocaleString()}</p>
                        </td>
                        <td className="py-6">
                          <span className={clsx(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                            item.sentiment === "positive" ? "bg-emerald-50 text-emerald-600" : (item.sentiment === "negative" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600")
                          )}>{item.sentiment}</span>
                          {item.sentiment_corrected && (
                            <div className="mt-2 flex items-center gap-1 text-[9px] font-black text-brand uppercase tracking-widest">
                              <CheckCircle2 className="w-3 h-3" /> Fixed to {item.sentiment_corrected}
                            </div>
                          )}
                        </td>
                        <td className="py-6">
                          {!item.sentiment_corrected && (
                            <div className="flex justify-center gap-2">
                              <button onClick={() => handleCorrection(item.id, item.text, 'positive')} className="p-2 hover:bg-emerald-50 text-slate-300 hover:text-emerald-500 rounded-xl transition-all border border-transparent hover:border-emerald-100" title="Correct to Positive"><TrendingUp className="w-4 h-4" /></button>
                              <button onClick={() => handleCorrection(item.id, item.text, 'negative')} className="p-2 hover:bg-rose-50 text-slate-300 hover:text-rose-500 rounded-xl transition-all border border-transparent hover:border-rose-100" title="Correct to Negative"><TrendingUp className="w-4 h-4 rotate-180" /></button>
                              <button onClick={() => handleCorrection(item.id, item.text, 'neutral')} className="p-2 hover:bg-slate-100 text-slate-300 hover:text-slate-600 rounded-xl transition-all border border-transparent hover:border-slate-200" title="Correct to Neutral"><Activity className="w-4 h-4" /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={3} className="py-10 text-center text-slate-400 italic font-medium">No recent predictions found for this workspace.</td></tr>
                    )}
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
                <div key={p.id} onClick={() => enterProject(p)} className={clsx("group p-8 rounded-[3rem] border transition-all cursor-pointer relative overflow-hidden", activeProject?.id === p.id ? "bg-brand/5 border-brand shadow-lg" : "bg-white border-slate-100 shadow-sm hover:shadow-2xl hover:scale-[1.02]")}>
                  <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-brand opacity-0 group-hover:opacity-10 blur-[60px] transition-opacity"></div>
                  <div className={clsx("w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-colors", activeProject?.id === p.id ? "bg-brand text-white" : "bg-brand/5 text-brand group-hover:bg-brand group-hover:text-white")}><FolderPlus className="w-7 h-7" /></div>
                  <h3 className="text-2xl font-black text-slate-900 mb-2">{p.name}</h3>
                  <p className="text-slate-500 text-sm mb-10 line-clamp-2 font-medium leading-relaxed">{p.description || "Active workspace."}</p>
                  <div className="flex items-center justify-between pt-8 border-t border-slate-50">
                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest"><Calendar className="w-4 h-4" />{new Date(p.created_at).toLocaleDateString()}</div>
                    <div className="flex items-center gap-2 text-brand font-black text-[10px] uppercase tracking-widest group-hover:gap-3 transition-all">Enter <ArrowRight className="w-4 h-4" /></div>
                  </div>
                </div>
              ))}

              {projects.length === 0 && (
                <div className="col-span-full py-20 text-center bg-slate-50 rounded-[3.5rem] border-2 border-dashed border-slate-200">
                  <p className="text-slate-400 font-medium italic">No workspaces detected. Create your first project to begin monitoring.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] p-12 shadow-2xl relative overflow-hidden">
            {!createdProject ? (
              <>
                <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">New Workspace</h2>
                <form onSubmit={handleCreate} className="space-y-8 mt-10">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Project Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-brand font-bold text-sm" required />
                  </div>
                  <div className="flex gap-4 pt-4">
                    <button type="button" onClick={() => setShowCreate(false)} className="flex-1 font-black text-xs uppercase tracking-widest text-slate-400">Cancel</button>
                    <button type="submit" disabled={creating} className="flex-[2] bg-slate-900 text-white px-6 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200">{creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />}Create</button>
                  </div>
                </form>
              </>
            ) : (
              <div className="animate-in zoom-in duration-300 py-6 text-center">
                <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-[2.5rem] flex items-center justify-center mb-8 mx-auto"><CheckCircle2 className="w-12 h-12" /></div>
                <h2 className="text-4xl font-black text-slate-900 mb-8 tracking-tight">Workspace Ready!</h2>
                <button onClick={() => { setShowCreate(false); setCreatedProject(null); enterProject(createdProject); }} className="w-full bg-slate-900 text-white px-6 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all">Enter workspace</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
