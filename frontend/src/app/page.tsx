'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { 
  Activity, Users, Database, Zap, Loader2, Send, 
  CheckCircle2, ShieldAlert, Target, TrendingUp, 
  BarChart3, PieChart as PieChartIcon, ArrowUpRight, 
  ArrowDownRight, Info, Download, Calendar, Sparkles,
  MessageSquare, LayoutGrid, Plus, FolderPlus, ArrowRight,
  FileText, ArrowLeftRight, ChevronRight
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

export default function GlobalDashboard() {
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

  // Instant Score States
  const [review, setReview] = useState('');
  const [prediction, setPrediction] = useState<any>(null);
  const [predicting, setPredicting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        const params = { project_id: activeProject?.id || null };
        
        const [statsRes, analyticsRes, compRes, keywordsRes, projectsRes] = await Promise.all([
          axios.get('/api/stats', { headers, params }),
          axios.get('/api/monthly-analytics', { headers, params }),
          axios.get('/api/comparison', { headers, params }),
          axios.get('/api/word-cloud', { headers, params }),
          axios.get('/api/projects', { headers })
        ]);
        
        setStats(statsRes.data);
        setMonthlyData(analyticsRes.data);
        setComparison(compRes.data);
        setKeywords(keywordsRes.data);
        setProjects(projectsRes.data);
      } catch (err) {
        console.error("Failed to fetch dashboard data", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDashboardData();
  }, [user, authLoading, activeProject, router]);

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
        axios.post(`/api/connectors/sync/${project.id}`, null, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(e => console.error("Initial sync failed", e));
      }

      setProjects([...projects, project]);
      setCreatedProject(project);
      
      if (monitorType === 'google_play') {
          setShowCreate(false);
          setName(''); setDesc(''); setAppId('');
          setCreatedProject(null);
      }
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
          params: { review_text: review, project_id: activeProject?.id || projects[0]?.id },
          headers: { 'Authorization': `Bearer ${token}` }
      });
      setPrediction(response.data);
    } catch (err) {
      console.error("Prediction failed", err);
    } finally {
      setPredicting(false);
    }
  };

  const enterProject = (project: any) => {
    setActiveProject(project);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrintReport = () => {
    window.print();
  };

  if (loading && !projects.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-slate-500 font-medium italic">Assembling intelligence hub...</p>
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
      {/* Header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tight mb-2">
            {activeProject ? activeProject.name : (user?.role === 'admin' ? 'Universal Hub' : 'Personal Workspace')}
          </h1>
          <p className="text-slate-500 text-lg font-medium">
            {activeProject 
              ? `Real-time intelligence for ${activeProject.name}` 
              : 'Global sentiment analysis & platform-wide insights.'}
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handlePrintReport}
            className="bg-white px-5 py-2.5 rounded-xl border border-slate-200 font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
          >
            <Download className="w-4 h-4" /> Export Report
          </button>
          <div className="bg-slate-900 px-5 py-2.5 rounded-xl font-bold text-sm text-white flex items-center gap-2 shadow-lg shadow-slate-200">
            <Activity className="w-4 h-4 text-emerald-400" /> System Active
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10 no-print">
        {[
          { name: 'Model Health', value: stats?.accuracy || '94.2%', icon: Target, trend: '+0.5%', up: true, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { name: 'Total Insights', value: stats?.total_predictions?.toLocaleString() || '0', icon: Activity, trend: '+12%', up: true, color: 'text-blue-600', bg: 'bg-blue-50' },
          { name: 'Data Drift', value: stats?.drift_score || '0.2%', icon: Zap, trend: '-0.1%', up: false, color: 'text-amber-600', bg: 'bg-amber-50' },
          { name: 'Dataset Scale', value: stats?.dataset_size || '0 records', icon: Database, trend: 'Updated', up: true, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((item) => (
          <div key={item.name} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md group">
            <div className="flex justify-between items-start mb-4">
              <div className={`${item.bg} ${item.color} p-3 rounded-2xl`}>
                <item.icon className="w-6 h-6" />
              </div>
              <div className={clsx(
                "flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest",
                item.up ? "bg-green-50 text-green-600" : "bg-red-50 text-red-700"
              )}>
                {item.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {item.trend}
              </div>
            </div>
            <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">{item.name}</h3>
            <p className="text-3xl font-black text-slate-900 mt-1 tracking-tight">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Comparison & Instant Score Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {/* Instant Score */}
        <div className="lg:col-span-2 bg-slate-900 p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col justify-center group">
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-brand opacity-20 blur-[100px] group-hover:opacity-30 transition-opacity"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-brand/20 p-2 rounded-lg text-brand">
                <Sparkles className="w-5 h-5 fill-brand" />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">Instant Intelligence</h2>
            </div>
            <form onSubmit={handlePredict} className="relative mb-6">
              <input 
                type="text"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="Paste any feedback for immediate sentiment scoring..."
                className="w-full pl-6 pr-32 py-5 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-brand text-white transition-all placeholder:text-slate-500 font-medium"
              />
              <button 
                type="submit"
                disabled={predicting || !review.trim()}
                className="absolute right-2 top-2 bottom-2 bg-brand text-white px-8 rounded-xl font-black text-xs uppercase tracking-widest hover:opacity-90 disabled:bg-slate-700 transition-all shadow-lg shadow-brand/20"
              >
                {predicting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Score"}
              </button>
            </form>

            {prediction && (
              <div className="p-5 bg-white/5 rounded-2xl border border-white/10 animate-in slide-in-from-top flex items-center gap-6">
                <div className={clsx(
                  "p-4 rounded-2xl",
                  prediction.sentiment === "positive" ? "bg-emerald-500/20 text-emerald-400" : 
                  prediction.sentiment === "negative" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"
                )}>
                  {prediction.sentiment === "positive" ? <CheckCircle2 className="w-8 h-8" /> : 
                   prediction.sentiment === "negative" ? <ShieldAlert className="w-8 h-8" /> : <Info className="w-8 h-8" />}
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-1">AI Classification</p>
                  <p className="text-3xl font-black text-white uppercase tracking-tight">{prediction.sentiment}</p>
                </div>
                <div className="ml-auto border-l border-white/10 pl-8">
                   <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-1">Confidence</p>
                   <p className="text-2xl font-black text-white">{(prediction.confidence * 100).toFixed(1)}%</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Tools */}
        <div className="flex flex-col gap-4">
           <Link href="/analyze" className="flex-1 group">
            <div className="h-full bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-brand/20 transition-all flex flex-col justify-center">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Bulk Analysis</h3>
              <p className="text-xs text-slate-400 mt-1 font-medium">Large-scale dataset processing.</p>
            </div>
          </Link>
          <Link href="/compare" className="flex-1 group">
            <div className="h-full bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-brand/20 transition-all flex flex-col justify-center">
              <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <ArrowLeftRight className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Model Compare</h3>
              <p className="text-xs text-slate-400 mt-1 font-medium">Cross-benchmark performance.</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {/* Trends Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Historical Intelligence</h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Timeline Distribution</p>
            </div>
            <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Positive</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500"></div> Negative</div>
            </div>
          </div>
          
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                <Tooltip contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)'}} />
                <Area type="monotone" dataKey="positive" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorPos)" />
                <Area type="monotone" dataKey="negative" stroke="#ef4444" strokeWidth={4} fillOpacity={1} fill="url(#colorNeg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sentiment Pie */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col">
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Sentiment Split</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1 mb-8">Overall Proportions</p>
          
          <div className="flex-1 h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sentimentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={90}
                  paddingAngle={8}
                  dataKey="value"
                >
                  {sentimentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-50 text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Verified Samples</p>
            <p className="text-3xl font-black text-brand tracking-tighter">
              {sentimentData.reduce((acc, curr) => acc + curr.value, 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
        {/* Volume Bar */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
           <h2 className="text-xl font-black text-slate-800 tracking-tight">Review Dynamics</h2>
           <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1 mb-8">Daily Engagement Volume</p>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                <Tooltip />
                <Bar dataKey="positive" stackId="a" fill="#10b981" />
                <Bar dataKey="negative" stackId="a" fill="#ef4444" />
                <Bar dataKey="neutral" stackId="a" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Topics Cloud */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col">
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Topic Intelligence</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1 mb-8">Emerging Feedback Patterns</p>
          
          <div className="flex-1 flex flex-wrap gap-2 content-start overflow-auto max-h-[250px] p-2">
            {keywords.length > 0 ? keywords.map((word, i) => (
              <span 
                key={i} 
                className="px-4 py-2 bg-slate-50 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-wider hover:bg-brand hover:text-white transition-all cursor-default border border-slate-100"
                style={{ fontSize: Math.max(9, Math.min(18, 9 + word.value / 2)) }}
              >
                {word.text}
              </span>
            )) : (
              <div className="w-full h-full flex items-center justify-center text-slate-300 italic text-sm text-center">
                Insufficient data for mapping. Connect a source to populate.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="border-t border-slate-100 pt-16 mb-20">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-4">
              <LayoutGrid className="text-brand w-10 h-10" /> Contextual <span className="text-brand">Workspaces</span>
            </h2>
            <p className="text-slate-500 font-medium mt-1">Deep-dive into specific project monitoring and automation.</p>
          </div>
          <button 
            onClick={() => setShowCreate(true)}
            className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
          >
            <Plus className="w-5 h-5" /> New Workspace
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map((p) => (
            <div 
              key={p.id}
              onClick={() => enterProject(p)}
              className={clsx(
                "group p-8 rounded-[3rem] border transition-all cursor-pointer relative overflow-hidden",
                activeProject?.id === p.id ? "bg-brand/5 border-brand shadow-lg" : "bg-white border-slate-100 shadow-sm hover:shadow-2xl hover:scale-[1.02]"
              )}
            >
              <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-brand opacity-0 group-hover:opacity-10 blur-[60px] transition-opacity"></div>
              <div className={clsx(
                "w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-colors",
                activeProject?.id === p.id ? "bg-brand text-white" : "bg-brand/5 text-brand group-hover:bg-brand group-hover:text-white"
              )}>
                <FolderPlus className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2">{p.name}</h3>
              <p className="text-slate-500 text-sm mb-10 line-clamp-2 font-medium leading-relaxed">
                {p.description || "Active workspace for real-time application sentiment intelligence."}
              </p>
              <div className="flex items-center justify-between pt-8 border-t border-slate-50">
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <Calendar className="w-4 h-4" />
                  {new Date(p.created_at).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2 text-brand font-black text-[10px] uppercase tracking-widest group-hover:gap-3 transition-all">
                  {activeProject?.id === p.id ? 'Viewing' : 'Enter'} <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))}
          
          {projects.length === 0 && (
            <div className="col-span-full py-20 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200 text-center">
              <Database className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-400 font-bold italic">No workspaces detected. Create your first monitoring project to begin deep analysis.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] p-12 shadow-2xl relative overflow-hidden">
            {!createdProject ? (
              <>
                <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">New Workspace</h2>
                <p className="text-slate-500 mb-10 font-medium">Configure a dedicated workspace for live app tracking.</p>
                <form onSubmit={handleCreate} className="space-y-8">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Project Name</label>
                    <input 
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Spotify Mobile Feedback"
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-brand font-bold text-sm"
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Monitoring Mode</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        type="button"
                        onClick={() => setMonitorType('api')}
                        className={clsx(
                          "p-5 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3",
                          monitorType === 'api' ? "border-brand bg-brand/5" : "border-slate-50 hover:border-slate-200"
                        )}
                      >
                        <Zap className={clsx("w-7 h-7", monitorType === 'api' ? "text-brand" : "text-slate-400")} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Push API</span>
                      </button>
                      <button 
                        type="button"
                        onClick={() => setMonitorType('google_play')}
                        className={clsx(
                          "p-5 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3",
                          monitorType === 'google_play' ? "border-brand bg-brand/5" : "border-slate-50 hover:border-slate-200"
                        )}
                      >
                        <LayoutGrid className={clsx("w-7 h-7", monitorType === 'google_play' ? "text-brand" : "text-slate-400")} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Google Play</span>
                      </button>
                    </div>
                  </div>

                  {monitorType === 'google_play' && (
                    <div className="animate-in slide-in-from-top duration-300">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Application ID</label>
                      <input 
                        type="text"
                        value={appId}
                        onChange={(e) => setAppId(e.target.value)}
                        placeholder="com.spotify.music"
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-brand font-bold text-sm"
                        required
                      />
                    </div>
                  )}

                  <div className="flex gap-4 pt-4">
                    <button type="button" onClick={() => setShowCreate(false)} className="flex-1 font-black text-xs uppercase tracking-widest text-slate-400">Cancel</button>
                    <button type="submit" disabled={creating} className="flex-[2] bg-slate-900 text-white px-6 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200">
                      {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
                      Create Hub
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="animate-in zoom-in duration-300 py-6">
                <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-[2.5rem] flex items-center justify-center mb-8 mx-auto shadow-lg shadow-emerald-50">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <h2 className="text-4xl font-black text-slate-900 mb-2 text-center tracking-tight">Workspace Ready!</h2>
                <p className="text-slate-500 mb-10 font-medium text-center">Your specialized monitoring hub has been initialized.</p>
                
                <button 
                  onClick={() => { setShowCreate(false); setCreatedProject(null); setName(''); setDesc(''); setAppId(''); enterProject(createdProject); }}
                  className="w-full bg-slate-900 text-white px-6 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                >
                  Enter workspace
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
