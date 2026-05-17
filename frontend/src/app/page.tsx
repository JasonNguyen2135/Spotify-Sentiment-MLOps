'use client';
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { 
  Activity, Users, Database, Zap, Loader2, Send, 
  CheckCircle2, ShieldAlert, Target, TrendingUp, 
  PieChart as PieChartIcon, ArrowUpRight, 
  ArrowDownRight, Info, Download, Calendar, Sparkles,
  LayoutGrid, Plus, FolderPlus, ArrowRight,
  FileText, ArrowLeftRight, ChevronRight, BellRing, Ticket as TicketIcon, Settings, RefreshCw, Trash2, X
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
  const [loading, setLoading] = useState(true);

  // Project Management
  const [projects, setProjects] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [monitorType, setMonitorType] = useState<'webhook' | 'crawler'>('crawler');
  const [appId, setAppId] = useState('');
  const [creating, setCreating] = useState(false);

  // HITL & Logs
  const [fullHistory, setFullHistory] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Harvester
  const [harvestId, setHarvestId] = useState('');
  const [harvestPlatform, setHarvestPlatform] = useState('Google Play');
  const [harvesting, setHarvesting] = useState(false);

  // Configuration States
  const [slackUrl, setSlackUrl] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [alertRules, setAlertRules] = useState<any[]>([]);
  const [newRule, setNewRule] = useState({ name: '', threshold: 10 });
  const [tickets, setTickets] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const params = { project_id: activeProject?.id || null };
      
      const [statsRes, analyticsRes, projectsRes, historyRes, auditRes] = await Promise.all([
        axios.get('/api/stats', { headers, params }),
        axios.get('/api/monthly-analytics', { headers, params }),
        axios.get('/api/projects', { headers }),
        axios.get('/api/history', { headers, params }),
        user?.role === 'admin' ? axios.get('/api/audit-logs', { headers }) : Promise.resolve({ data: [] })
      ]);
      
      setStats(statsRes.data);
      setMonthlyData(analyticsRes.data);
      setProjects(projectsRes.data);
      setFullHistory(historyRes.data);
      setAuditLogs(auditRes.data);

      if (activeProject) {
        const [alertsRes, ticketsRes, detailsRes] = await Promise.all([
          axios.get('/api/alerts', { headers, params }),
          axios.get('/api/tickets', { headers, params }),
          axios.get(`/api/projects/${activeProject.id}`, { headers })
        ]);
        setAlertRules(alertsRes.data);
        setTickets(ticketsRes.data);
        setSlackUrl(detailsRes.data.slack_webhook || '');
        setSupportEmail(detailsRes.data.support_email || '');
      }
    } catch (err) {
      console.error("Fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, [activeProject, user]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    if (user) fetchData();
  }, [user, authLoading, activeProject, fetchData, router]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/projects', null, {
        params: { name, description: desc, monitor_type: monitorType },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (monitorType === 'crawler' && appId) {
        await axios.post('/api/connectors', null, {
          params: { platform: 'Google Play', app_id: appId, project_id: res.data.id },
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
      setProjects([...projects, res.data]);
      setShowCreate(false);
      setName(''); setDesc(''); setAppId('');
      setActiveProject(res.data);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to create project");
    } finally { setCreating(false); }
  };

  const handleDeleteProject = async (id: number) => {
    if (!confirm("Delete workspace? This is irreversible.")) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/projects/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      setProjects(projects.filter(p => p.id !== id));
      if (activeProject?.id === id) setActiveProject(null);
    } catch (err) { alert("Delete failed"); }
  };

  const handleSaveConfig = async () => {
    if (!activeProject) return;
    setSavingConfig(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/projects/${activeProject.id}/config`, null, {
        params: { slack_webhook: slackUrl, support_email: supportEmail },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      alert("Configuration saved!");
      fetchData();
    } catch (err) { alert("Save failed"); }
    finally { setSavingConfig(false); }
  };

  const handleAddRule = async () => {
    if (!activeProject || !newRule.name) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/alerts', null, {
        params: { project_id: activeProject.id, name: newRule.name, threshold: newRule.threshold, channel: 'Slack' },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNewRule({ name: '', threshold: 10 });
      fetchData();
    } catch (err) { alert("Failed to add rule"); }
  };

  const handleDeleteRule = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/alerts/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      fetchData();
    } catch (err) { alert("Delete failed"); }
  };

  const handleCorrection = async (id: string, corrected: string) => {
    if (!activeProject) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/correction', null, {
        params: { prediction_id: id, corrected_sentiment: corrected, project_id: activeProject.id },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchData(); // This will refresh charts and list
    } catch (err) { alert("Correction failed"); }
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
      link.setAttribute('download', `${harvestPlatform}_harvest.csv`);
      document.body.appendChild(link); link.click(); link.remove();
    } catch (err) { alert("Harvest failed"); }
    finally { setHarvesting(false); }
  };

  if (loading && !projects.length) return (
    <div className="flex flex-col items-center justify-center h-[80vh]">
      <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
      <p className="text-gray-500 font-medium italic">Synchronizing neural hub...</p>
    </div>
  );

  const sentimentData = [
    { name: 'Positive', value: (monthlyData || []).reduce((acc, curr) => acc + (curr?.positive || 0), 0), color: '#10b981' },
    { name: 'Negative', value: (monthlyData || []).reduce((acc, curr) => acc + (curr?.negative || 0), 0), color: '#ef4444' },
    { name: 'Neutral', value: (monthlyData || []).reduce((acc, curr) => acc + (curr?.neutral || 0), 0), color: '#6366f1' },
  ].filter(d => d.value > 0);

  return (
    <div className="animate-in fade-in duration-700 pb-20 max-w-7xl mx-auto px-4">
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tight mb-2">
            {activeProject ? activeProject.name : 'Universal Hub'}
          </h1>
          <p className="text-slate-500 text-lg font-medium">
            {activeProject ? `Project-specific intelligence & correction.` : 'Global sentiment toolkit.'}
          </p>
        </div>
        {activeProject && (
          <button onClick={() => handleDeleteProject(activeProject.id)} className="bg-rose-50 text-rose-600 p-4 rounded-2xl hover:bg-rose-100 transition-all border border-rose-100 shadow-sm">
            <Trash2 className="w-6 h-6" />
          </button>
        )}
      </div>

      {!activeProject ? (
        <div className="space-y-16">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 bg-slate-900 p-10 rounded-[3rem] shadow-2xl relative overflow-hidden group">
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="bg-emerald-500/20 p-2.5 rounded-xl text-emerald-400"><Database className="w-5 h-5" /></div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Harvester</h2>
                </div>
                <form onSubmit={handleHarvest} className="space-y-4">
                  <select value={harvestPlatform} onChange={(e) => setHarvestPlatform(e.target.value)} className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm">
                    <option className="bg-slate-900">Google Play</option>
                    <option className="bg-slate-900">App Store</option>
                  </select>
                  <input type="text" value={harvestId} onChange={(e) => setHarvestId(e.target.value)} placeholder="App ID (e.g. com.spotify.music)" className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white outline-none" />
                  <button type="submit" disabled={harvesting || !harvestId.trim()} className="w-full bg-emerald-500 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-600 transition-all flex items-center justify-center gap-2">
                    {harvesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Scrape Data
                  </button>
                </form>
              </div>
            </div>
            
            <div className="lg:col-span-2 bg-slate-900 p-10 rounded-[3rem] shadow-2xl relative overflow-hidden group border border-white/5 flex flex-col justify-center">
              <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-brand opacity-20 blur-[120px]"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="bg-brand/20 p-2.5 rounded-xl text-brand"><Sparkles className="w-5 h-5 fill-brand" /></div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Instant Analysis</h2>
                </div>
                <p className="text-slate-400 mb-6 font-medium">Test our core AI engine with direct input. Results here are platform-wide.</p>
                <Link href="/analyze" className="inline-flex items-center gap-2 bg-brand text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:opacity-90 shadow-xl shadow-brand/20 transition-all">
                  Open Laboratory <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-4"><LayoutGrid className="text-brand w-10 h-10" /> Workspaces</h2>
              <button onClick={() => setShowCreate(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200">
                <Plus className="w-5 h-5" /> New Workspace
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {projects.map((p) => (
                <div key={p.id} onClick={() => setActiveProject(p)} className="group p-8 rounded-[3rem] border bg-white border-slate-100 shadow-sm hover:shadow-2xl transition-all cursor-pointer relative overflow-hidden hover:scale-[1.02]">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-brand/5 text-brand group-hover:bg-brand group-hover:text-white transition-colors"><FolderPlus className="w-7 h-7" /></div>
                  <h3 className="text-2xl font-black text-slate-900 mb-2">{p.name}</h3>
                  <div className="flex items-center justify-between pt-8 border-t border-slate-50 mt-10">
                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest"><Calendar className="w-4 h-4" />{new Date(p.created_at).toLocaleDateString()}</div>
                    <div className="flex items-center gap-2 text-brand font-black text-[10px] uppercase tracking-widest">Enter <ArrowRight className="w-4 h-4" /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-in slide-in-from-bottom duration-700 space-y-16">
          <div className="flex justify-between items-center">
            <h2 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-5">
               <div className="bg-brand p-3 rounded-2xl text-white shadow-lg shadow-brand/20"><LayoutGrid className="w-7 h-7" /></div> Workspace Monitoring
            </h2>
            <div className="flex gap-4">
              <Link href="/admin/connectors" className="bg-white px-6 py-3 rounded-2xl border border-slate-200 font-black text-[10px] uppercase tracking-widest flex items-center gap-3 hover:bg-slate-50 shadow-sm text-slate-600">
                <RefreshCw className="w-4 h-4 text-brand" /> Change Strategy
              </Link>
              <button onClick={() => handleExport('excel')} className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl border border-emerald-100 font-black text-[10px] uppercase tracking-widest flex items-center gap-3 hover:bg-emerald-100 shadow-sm">
                <FileText className="w-4 h-4" /> Download CSV
              </button>
              <button onClick={() => window.print()} className="bg-rose-50 text-rose-600 px-6 py-3 rounded-2xl border border-rose-100 font-black text-[10px] uppercase tracking-widest flex items-center gap-3 hover:bg-rose-100 shadow-sm">
                <PieChartIcon className="w-4 h-4" /> Export Charts
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden group">
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Intelligence Trends</h2>
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
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 800}} />
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
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl text-white">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-black tracking-tight flex items-center gap-3"><BellRing className="w-6 h-6 text-brand" /> Smart Alerts</h2>
                <button onClick={handleSaveConfig} disabled={savingConfig} className="bg-brand text-slate-900 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider hover:opacity-90 disabled:opacity-50 transition-all">
                  {savingConfig ? 'Saving...' : 'Save Config'}
                </button>
              </div>
              <div className="space-y-6">
                <div className="p-5 bg-white/5 rounded-2xl border border-white/10">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Slack Webhook URL</label>
                  <input type="text" value={slackUrl} onChange={(e) => setSlackUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-xs text-slate-300 outline-none focus:ring-1 focus:ring-brand" />
                </div>
                {slackUrl && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top duration-500 pt-4 border-t border-white/5">
                    <div className="flex gap-3">
                      <input type="text" value={newRule.name} onChange={(e) => setNewRule({...newRule, name: e.target.value})} placeholder="Rule Name (e.g. Negative Spike)" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs" />
                      <input type="number" value={newRule.threshold} onChange={(e) => setNewRule({...newRule, threshold: parseInt(e.target.value)})} placeholder="Threshold %" className="w-24 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs" />
                      <button onClick={handleAddRule} className="bg-white text-slate-900 p-2 rounded-xl hover:bg-slate-100 transition-all"><Plus className="w-5 h-5" /></button>
                    </div>
                    <div className="space-y-2">
                      {alertRules.map(rule => (
                        <div key={rule.id} className="p-3 bg-white/5 rounded-xl border border-white/5 flex justify-between items-center group">
                          <div><p className="text-xs font-bold">{rule.name}</p><p className="text-[9px] text-slate-500 uppercase">Trigger: {">"}{rule.threshold}% Negative</p></div>
                          <button onClick={() => handleDeleteRule(rule.id)} className="opacity-0 group-hover:opacity-100 text-rose-500 transition-all p-1 hover:bg-rose-500/10 rounded-lg"><X className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3"><TicketIcon className="w-6 h-6 text-brand" /> CSKH Ticket System</h2>
                <button onClick={handleSaveConfig} className="text-brand font-black text-[10px] uppercase hover:underline">Update Email</button>
              </div>
              <div className="space-y-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Support Destination Email</label>
                  <input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="support@company.com" className="w-full bg-white border border-slate-100 rounded-xl px-4 py-2 text-xs font-bold" />
                </div>
                {supportEmail && (
                  <div className="space-y-3 max-h-[250px] overflow-auto pr-2 animate-in fade-in duration-500">
                    {tickets.length > 0 ? tickets.map(ticket => (
                      <div key={ticket.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                        <p className="text-xs font-bold text-slate-700 mb-3 leading-relaxed">"{ticket.review_text}"</p>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-rose-500 uppercase">Negative Sentiment</span>
                          <button onClick={() => alert(`Ticket for "${ticket.review_text.substring(0, 20)}..." sent to ${supportEmail}`)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 flex items-center gap-2">
                            <Send className="w-3 h-3" /> Send to Email
                          </button>
                        </div>
                      </div>
                    )) : (
                      <div className="py-10 text-center text-slate-300 italic text-sm">No pending tickets for this project.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm mb-16">
            <div className="flex items-center gap-4 mb-10">
              <div className="bg-slate-900 p-3 rounded-2xl text-brand"><Users className="w-6 h-6" /></div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase tracking-tight">Human-in-the-Loop Correction</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-50">
                    <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Feedback Text</th>
                    <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">AI Status</th>
                    <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Audit Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {fullHistory.map((item) => (
                    <tr key={item.id} className="group hover:bg-slate-50/50 transition-all">
                      <td className="py-8 pr-10">
                        <p className="text-sm font-bold text-slate-700 leading-relaxed mb-1">{item.text}</p>
                        <p className="text-[9px] text-slate-400 font-black uppercase">{new Date(item.timestamp).toLocaleString()} • {item.model_version}</p>
                      </td>
                      <td className="py-8">
                        <span className={clsx("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest", item.sentiment === "positive" ? "bg-emerald-50 text-emerald-600" : (item.sentiment === "negative" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"))}>{item.sentiment}</span>
                        {item.sentiment_corrected && (
                          <div className="mt-2 flex items-center gap-1.5 text-[9px] font-black text-brand uppercase"><CheckCircle2 className="w-3 h-3" /> Overridden: {item.sentiment_corrected}</div>
                        )}
                      </td>
                      <td className="py-8">
                         <div className="flex justify-center gap-3">
                            <button onClick={() => handleCorrection(item.id, 'positive')} className="p-3 bg-white border border-slate-100 rounded-2xl hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-100 transition-all shadow-sm text-slate-300" title="Correct to Positive"><TrendingUp className="w-5 h-5" /></button>
                            <button onClick={() => handleCorrection(item.id, 'negative')} className="p-3 bg-white border border-slate-100 rounded-2xl hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 transition-all shadow-sm text-slate-300" title="Correct to Negative"><TrendingUp className="w-5 h-5 rotate-180" /></button>
                            <button onClick={() => handleCorrection(item.id, 'neutral')} className="p-3 bg-white border border-slate-100 rounded-2xl hover:bg-blue-50 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm text-slate-300" title="Correct to Neutral"><Activity className="w-5 h-5" /></button>
                         </div>
                      </td>
                    </tr>
                  ))}
                  {fullHistory.length === 0 && (
                    <tr><td colSpan={3} className="py-20 text-center text-slate-300 italic font-medium">No workspace predictions to audit yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-[100] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] p-12 shadow-2xl">
            <h2 className="text-4xl font-black text-slate-900 mb-8 tracking-tight">New Workspace</h2>
            <form onSubmit={handleCreate} className="space-y-8">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 pl-1">Project Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-brand font-bold text-sm" placeholder="e.g. Spotify Main" required />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 pl-1">Monitoring Strategy</label>
                <div className="grid grid-cols-2 gap-4">
                  <div onClick={() => setMonitorType('crawler')} className={clsx("p-5 rounded-[1.5rem] border-2 cursor-pointer transition-all", monitorType === 'crawler' ? "border-brand bg-brand/5" : "border-slate-50 bg-slate-50 hover:border-slate-200")}>
                    <p className="font-black text-xs mb-1">Public App</p>
                    <p className="text-[9px] text-slate-400 uppercase font-bold">Crawler Mode</p>
                  </div>
                  <div onClick={() => setMonitorType('webhook')} className={clsx("p-5 rounded-[1.5rem] border-2 cursor-pointer transition-all", monitorType === 'webhook' ? "border-brand bg-brand/5" : "border-slate-50 bg-slate-50 hover:border-slate-200")}>
                    <p className="font-black text-xs mb-1">Custom API</p>
                    <p className="text-[9px] text-slate-400 uppercase font-bold">Webhook Mode</p>
                  </div>
                </div>
              </div>
              {monitorType === 'crawler' && (
                <div className="animate-in slide-in-from-top duration-300">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 pl-1">Application ID</label>
                  <input type="text" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="e.g. com.spotify.music" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm" />
                </div>
              )}
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 font-black text-xs uppercase tracking-widest text-slate-400">Cancel</button>
                <button type="submit" disabled={creating} className="flex-[2] bg-slate-900 text-white px-6 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200">
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
