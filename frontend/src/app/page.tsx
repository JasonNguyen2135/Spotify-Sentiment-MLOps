'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { 
  Activity, Users, Database, Zap, Loader2, Send, 
  CheckCircle2, ShieldAlert, Target, TrendingUp, 
  PieChart as PieChartIcon, ArrowUpRight, 
  ArrowDownRight, Info, Download, Calendar, Sparkles,
  LayoutGrid, Plus, FolderPlus, ArrowRight, MessageSquare,
  FileText, ArrowLeftRight, ChevronRight, BellRing, Ticket as TicketIcon, Settings, RefreshCw, Trash2, X, ShieldCheck
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import Link from 'next/link';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar, 
  Cell, PieChart, Pie, Legend, AreaChart, Area,
  ScatterChart, Scatter, ZAxis
} from 'recharts';

export default function UniversalHub() {
  const { user, loading: authLoading } = useAuth();
  const { activeProject, setActiveProject } = useProject();
  const router = useRouter();
  
  // Dashboard States
  const [stats, setStats] = useState<any>(null);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [topIssues, setTopIssues] = useState<any[]>([]);
  const [topPositiveIssues, setTopPositiveIssues] = useState<any[]>([]);
  const [versionData, setVersionData] = useState<any[]>([]);
  const [versionNegativeData, setVersionNegativeData] = useState<any[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [ratingDist, setRatingDist] = useState<any[]>([]);
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
  const [pendingCorrections, setPendingCorrections] = useState<Record<string, string>>({});
  const [submittingChanges, setSubmittingChanges] = useState(false);
  const [forwarding, setForwarding] = useState(false);

  const alertTemplates = [
    { name: "Critical Negativity (>30%)", threshold: 30 },
    { name: "High Volume Alert (>50%)", threshold: 50 },
    { name: "App Crash Warning", threshold: 15 }
  ];

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

  // Global Model State
  const [globalModel, setGlobalModel] = useState('basic');
  const [applyMode, setApplyMode] = useState<'manual' | 'auto'>('manual');
  const [savingGlobalModel, setSavingGlobalModel] = useState(false);

  // Per-workspace Model State
  const [savingWsModel, setSavingWsModel] = useState(false);

  // Ad-hoc Analysis States
  const [review, setReview] = useState('');
  const [prediction, setPrediction] = useState<any>(null);
  const [predicting, setPredicting] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState('Production');
  const [modelOptions, setModelOptions] = useState<any[]>([]);

  // Real MLflow Metrics — follow the tier actually selected (Global Gateway tier,
  // or the active workspace's tier), not the version dropdown. Accuracy is a
  // per-model metric so it changes by TIER (Basic 80.9% -> VIP 91.5%), not per comment.
  const selectedModelMetrics = useMemo(() => {
    const tier = (activeProject?.model_key || globalModel || 'basic').toUpperCase();
    const model = modelOptions.find(m => m.tier_label === tier) ||
                  modelOptions.find(m => m.version === selectedVersion) ||
                  modelOptions.find(m => m.current_stage === 'Production') ||
                  (modelOptions.length > 0 ? modelOptions[0] : null);

    if (model?.metrics) return {
      acc: (model.metrics.accuracy * 100).toFixed(1) + '%',
      lat: model.metrics.latency + 'ms'
    };
    return { acc: '94.2%', lat: '42ms' }; // Fallback
  }, [modelOptions, selectedVersion, globalModel, activeProject]);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const params = { project_id: activeProject?.id || null };
      
      const [statsRes, analyticsRes, projectsRes, historyRes, auditRes, modelsRes, configRes] = await Promise.all([
        axios.get('/api/stats', { headers, params }),
        axios.get('/api/monthly-analytics', { headers, params }),
        axios.get('/api/projects', { headers }),
        axios.get('/api/history', { headers, params }),
        user?.role === 'admin' ? axios.get('/api/audit-logs', { headers }) : Promise.resolve({ data: [] }),
        axios.get('/api/models', { headers }).catch(() => ({ data: [] })),
        user?.role === 'admin' ? axios.get('/api/system/config', { headers }).catch(() => ({ data: { current_model_key: 'basic' } })) : Promise.resolve({ data: { current_model_key: 'basic' } })
      ]);
      
      setStats(statsRes.data);
      setMonthlyData(analyticsRes.data || []);
      setProjects(projectsRes.data || []);
      setFullHistory(historyRes.data || []);
      setAuditLogs(auditRes.data || []);
      setModelOptions(modelsRes.data || []);
      if (configRes.data?.current_model_key) setGlobalModel(configRes.data.current_model_key);
      if (configRes.data?.apply_mode) setApplyMode(configRes.data.apply_mode);

      if (activeProject) {
        const [alertsRes, ticketsRes, detailsRes, issuesRes, posIssuesRes, versionRes, versionNegRes, heatmapRes, ratingRes] = await Promise.all([
          axios.get('/api/alerts', { headers, params }),
          axios.get('/api/tickets', { headers, params }),
          axios.get(`/api/projects/${activeProject.id}`, { headers }),
          axios.get('/api/analytics/top-issues', { headers, params }),
          axios.get('/api/analytics/top-positive-issues', { headers, params }),
          axios.get('/api/analytics/version-sentiment', { headers, params }),
          axios.get('/api/analytics/version-negative-sentiment', { headers, params }),
          axios.get('/api/analytics/heatmap', { headers, params }),
          axios.get('/api/analytics/rating-distribution', { headers, params })
        ]);
        setAlertRules(alertsRes.data || []);
        setTickets(ticketsRes.data || []);
        setSlackUrl(detailsRes.data.slack_webhook || '');
        setSupportEmail(detailsRes.data.support_email || '');
        setTopIssues(issuesRes.data || []);
        setTopPositiveIssues(posIssuesRes.data || []);
        setVersionData(versionRes.data || []);
        setVersionNegativeData(versionNegRes.data || []);
        setHeatmapData(heatmapRes.data || []);
        setRatingDist(ratingRes.data || []);
      }
    } catch (err) {
      console.error("Fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, [activeProject, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    fetchData();
  }, [user, authLoading, activeProject, fetchData, router]);

  const handlePredict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!review.trim()) return;
    setPredicting(true);
    setPrediction(null);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`/api/predict`, null, {
          params: { review_text: review, project_id: activeProject?.id || 0, model_version: selectedVersion },
          headers: { 'Authorization': `Bearer ${token}` }
      });
      setPrediction(response.data);
      fetchData();
    } catch (err) {
      console.error("Prediction failed", err);
    } finally {
      setPredicting(false);
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
          params: { platform: 'Google Play', app_id: appId, project_id: project.id },
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
      setProjects([...projects, project]);
      setShowCreate(false);
      setName(''); setDesc(''); setAppId('');
      setActiveProject(project);
      router.push(`/admin/connectors?mode=${monitorType}&id=${project.id}`);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to create project");
    } finally { setCreating(false); }
  };

  const handleDeleteProject = async (id: number) => {
    if (!confirm("Delete this project? All data will be lost.")) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/projects/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      setProjects(projects.filter(p => p.id !== id));
      setActiveProject(null);
    } catch (err) { alert("Delete failed"); }
  };

  const handleSaveGlobalModel = async () => {
    setSavingGlobalModel(true);
    try {
      const token = localStorage.getItem('token');
      // Auto mode -> let the gateway route+escalate per comment; Manual -> pin one tier
      const params = applyMode === 'auto' ? { apply_mode: 'auto' } : { model_key: globalModel };
      await axios.post('/api/system/config', null, {
        params,
        headers: { 'Authorization': `Bearer ${token}` }
      });
      alert(applyMode === 'auto'
        ? 'Auto Apply enabled: each comment is routed to the cheapest capable tier, escalating to a stronger tier when confidence is low.'
        : `Successfully routed all future predictions to ${globalModel.toUpperCase()} model.`);
      fetchData();
    } catch (err) {
      alert("Failed to apply global model. You might not have admin permission.");
    } finally {
      setSavingGlobalModel(false);
    }
  };

  // Per-workspace model routing: set this project's apply_mode (manual/auto) or tier.
  const saveWorkspaceModel = async (params: { apply_mode?: string; model_key?: string }) => {
    if (!activeProject) return;
    setSavingWsModel(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/projects/${activeProject.id}/model-config`, null, {
        params,
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const updated = { ...activeProject, apply_mode: res.data.apply_mode, model_key: res.data.model_key };
      setActiveProject(updated);
      setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, apply_mode: updated.apply_mode, model_key: updated.model_key } : p));
    } catch (err) {
      alert("Failed to update this workspace's model. You might not have access.");
    } finally {
      setSavingWsModel(false);
    }
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

  const handleCorrection = (id: string, corrected: string) => {
    setPendingCorrections(prev => ({ ...prev, [id]: corrected }));
  };

  const [auditBatchName, setAuditBatchName] = useState('');
  const [showAuditModal, setShowAuditModal] = useState(false);

  const submitChanges = async () => {
    setShowAuditModal(true);
  };

  const submitAuditBatch = async () => {
    const ids = Object.keys(pendingCorrections);
    if (ids.length === 0 || !activeProject || !auditBatchName) return;
    
    setSubmittingChanges(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/correction/submit-audit', ids, {
        params: { dataset_name: auditBatchName, project_id: activeProject.id },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      setPendingCorrections({});
      setAuditBatchName('');
      setShowAuditModal(false);
      fetchData();
      alert(`Successfully consolidated ${ids.length} records into dataset: ${auditBatchName}`);
    } catch (err) {
      alert("Failed to submit audit batch.");
    } finally {
      setSubmittingChanges(false);
    }
  };

  // Export & Reporting States
  const [exportLimit, setExportLimit] = useState<number>(0);
  const [exportSentiment, setExportSentiment] = useState<string>('all');
  const [exportingReport, setExportingReport] = useState(false);

  // ... rest of state ...

  const handleExport = async (type: 'excel' | 'pdf') => {
    try {
      const token = localStorage.getItem('token');
      // Fix: If no activeProject, use global export endpoint
      const url = activeProject 
        ? `/api/export/excel/${activeProject.id}` 
        : `/api/export/global/excel`;
      
      const response = await axios.get(url, {
        params: { sentiment: exportSentiment, limit: exportLimit },
        headers: { 'Authorization': `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = downloadUrl;
      const filename = activeProject 
        ? `Project_${activeProject.name}_Logs.csv` 
        : `Global_Intelligence_Logs.csv`;
      link.setAttribute('download', filename);
      document.body.appendChild(link); link.click(); link.remove();
    } catch (err) { 
      console.error("Export failed", err);
      alert("Export failed. Please ensure you are authorized."); 
    }
  };

  const handleForwardTickets = async () => {
    if (!activeProject || !supportEmail) return alert("Please save a support email first.");
    setForwarding(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/tickets/forward', null, {
        params: { project_id: activeProject.id },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      alert(`Successfully forwarded ${res.data.forwarded_count} critical comments to ${supportEmail}`);
    } catch (err) {
      alert("Forwarding failed. Check if SMTP is configured.");
    } finally {
      setForwarding(false);
    }
  };

  const handleDownloadReport = () => {
    setExportingReport(true);
    // Simple delay to show loading state before print dialog
    setTimeout(() => {
      window.print();
      setExportingReport(false);
    }, 1000);
  };

  const [showHarvestModal, setShowHarvestModal] = useState(false);
  const [harvestLimit, setHarvestLimit] = useState(500);

  const handleHarvest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!harvestId.trim()) return;
    setHarvesting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/connectors/harvest`, {
        params: { platform: harvestPlatform, app_id: harvestId, limit: harvestLimit },
        headers: { 'Authorization': `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${harvestPlatform}_${harvestId}_harvest.csv`);
      document.body.appendChild(link); link.click(); link.remove();
      setShowHarvestModal(false);
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

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="animate-in fade-in duration-700 pb-20 max-w-7xl mx-auto px-4">
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 1cm; }
          body { background: white !important; }
          .print-break-inside-avoid { break-inside: avoid; }
          .animate-in { animation: none !important; }
        }
      `}</style>
      <div className="mb-12 flex justify-between items-end print:hidden">
        <div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tight mb-2">
            {activeProject ? activeProject.name : 'Universal Hub'}
          </h1>
          <p className="text-slate-500 text-lg font-medium">
            {activeProject ? `Project-specific intelligence & correction.` : 'Global sentiment toolkit.'}
          </p>
        </div>
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
                <form onSubmit={(e) => { e.preventDefault(); setShowHarvestModal(true); }} className="space-y-4">
                  <select value={harvestPlatform} onChange={(e) => setHarvestPlatform(e.target.value)} className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm appearance-none">
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
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-center gap-3">
                    <div className="bg-brand/20 p-2.5 rounded-xl text-brand"><Sparkles className="w-5 h-5 fill-brand" /></div>
                    <h2 className="text-2xl font-black text-white tracking-tight">Instant Analysis</h2>
                  </div>
                  <select 
                    value={selectedVersion} 
                    onChange={(e) => setSelectedVersion(e.target.value)}
                    className="bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black uppercase text-slate-300 outline-none focus:ring-1 focus:ring-brand cursor-pointer"
                  >
                    <option value="Production" className="bg-slate-900">Current Production</option>
                    {modelOptions.map(m => (
                      <option key={m.version} value={m.version} className="bg-slate-900">Version {m.version} ({m.current_stage})</option>
                    ))}
                  </select>
                </div>

                <form onSubmit={handlePredict} className="relative mb-10">
                  <input type="text" value={review} onChange={(e) => setReview(e.target.value)} placeholder="Enter feedback for deep sentiment extraction..." className="w-full pl-8 pr-44 py-6 bg-white/5 border border-white/10 rounded-[2rem] outline-none focus:ring-2 focus:ring-brand text-white transition-all font-medium" />
                  <button type="submit" disabled={predicting || !review.trim()} className="absolute right-3 top-3 bottom-3 bg-brand text-white px-8 rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-2">
                    {predicting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-white" />} Extract
                  </button>
                </form>

                {prediction ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top duration-500">
                    <div className="md:col-span-2 p-6 bg-white/5 rounded-[2rem] border border-white/10 flex items-center gap-8">
                      <div className={clsx("p-5 rounded-[1.5rem] shadow-xl", prediction.sentiment === "positive" ? "bg-emerald-500/20 text-emerald-400" : (prediction.sentiment === "negative" ? "bg-rose-500/20 text-rose-400" : "bg-blue-500/20 text-blue-400"))}>
                         {prediction.sentiment === "positive" ? <CheckCircle2 className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />}
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">AI Classification</p>
                        <p className="text-4xl font-black text-white uppercase tracking-tighter">{prediction.sentiment}</p>
                        {prediction.auto_routing && (
                          <div className="flex items-center gap-2 mt-3">
                            <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-brand/15 text-brand flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> {prediction.auto_routing.final_tier}
                            </span>
                            {prediction.auto_routing.escalations > 0 && (
                              <span className="text-[9px] font-bold text-slate-400">
                                escalated {prediction.auto_routing.escalations}× from {prediction.auto_routing.router_start}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="p-6 bg-white/5 rounded-[2rem] border border-white/10 flex flex-col justify-center">
                       <p className="text-[10px] text-slate-500 font-black uppercase mb-3">Real MLflow Metrics</p>
                       <div className="space-y-2">
                          <div className="flex justify-between text-xs"><span className="text-slate-400">Accuracy:</span> <span className="text-white font-bold">{selectedModelMetrics.acc}</span></div>
                          <div className="flex justify-between text-xs"><span className="text-slate-400">Latency:</span> <span className="text-white font-bold">{selectedModelMetrics.lat}</span></div>
                          <div className="flex justify-between text-xs"><span className="text-brand">v{selectedVersion}</span></div>
                       </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 text-xs font-medium italic pl-4 border-l-2 border-brand/50">Results here are platform-wide.</p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[3rem] shadow-xl shadow-slate-100/50 border border-slate-50 mb-10">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-4">
                <div className="bg-slate-900 p-3 rounded-2xl text-brand shadow-lg shadow-brand/10"><Settings className="w-6 h-6" /></div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Global AI Gateway</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {applyMode === 'auto'
                      ? 'Auto routing: cheapest capable tier per comment, escalate on low confidence'
                      : 'Route all project predictions to a specific model tier'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleSaveGlobalModel}
                disabled={savingGlobalModel}
                className="bg-brand text-slate-900 px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-brand/20 hover:scale-105 transition-all flex items-center gap-2"
              >
                {savingGlobalModel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-slate-900" />}
                Apply Globally
              </button>
            </div>

            {/* Mode toggle: Manual (pin one tier) vs Auto (router + confidence cascade) */}
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => setApplyMode('manual')}
                className={clsx(
                  "flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest border-2 transition-all",
                  applyMode === 'manual' ? "border-brand bg-brand/5 text-slate-900" : "border-slate-200 text-slate-400 hover:border-slate-300"
                )}
              >
                <Settings className="w-3.5 h-3.5" /> Manual
              </button>
              <button
                onClick={() => setApplyMode('auto')}
                className={clsx(
                  "flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest border-2 transition-all",
                  applyMode === 'auto' ? "border-brand bg-brand/5 text-slate-900" : "border-slate-200 text-slate-400 hover:border-slate-300"
                )}
              >
                <Sparkles className="w-3.5 h-3.5" /> Auto Apply
              </button>
              {applyMode === 'auto' && (
                <span className="text-[10px] font-bold text-slate-400 italic ml-1">Tier is chosen per comment — manual selection is disabled.</span>
              )}
            </div>

            <div className={clsx("grid grid-cols-5 gap-4 transition-opacity", applyMode === 'auto' && "opacity-40 pointer-events-none")}>
              {[
                { id: 'basic', name: 'Basic', desc: 'Logistic Regression. Extremely fast, low RAM.', color: 'border-slate-200 hover:border-slate-400' },
                { id: 'standard', name: 'Standard', desc: 'LightGBM. Good balance of speed and accuracy.', color: 'border-blue-200 hover:border-blue-400' },
                { id: 'pro', name: 'Pro', desc: 'FastText. Handles slang and misspellings.', color: 'border-indigo-200 hover:border-indigo-400' },
                { id: 'premium', name: 'Premium', desc: 'Bi-LSTM Deep Learning. Deep context understanding.', color: 'border-rose-200 hover:border-rose-400' },
                { id: 'vip', name: 'Enterprise VIP', desc: 'DistilBERT Transformer. State-of-the-art accuracy.', color: 'border-amber-200 hover:border-amber-400 bg-gradient-to-br from-amber-50 to-transparent' }
              ].map(tier => (
                <div 
                  key={tier.id}
                  onClick={() => setGlobalModel(tier.id)}
                  className={clsx(
                    "p-6 rounded-[2rem] border-2 cursor-pointer transition-all relative overflow-hidden",
                    globalModel === tier.id ? "border-brand bg-brand/5 shadow-lg shadow-brand/10 scale-105 z-10" : tier.color
                  )}
                >
                  {globalModel === tier.id && <div className="absolute top-4 right-4 text-brand"><CheckCircle2 className="w-4 h-4" /></div>}
                  <p className="font-black text-sm text-slate-900 mb-2 uppercase">{tier.name}</p>
                  <p className="text-[9px] font-bold text-slate-500 leading-relaxed">{tier.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-4"><LayoutGrid className="text-brand w-10 h-10" /> Workspaces</h2>
              <button onClick={() => setShowCreate(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200">
                <Plus className="w-5 h-5" /> New Workspace
              </button>
            </div>
            {/* Ultra-Compact Workspace Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {projects.map((p) => (
                <div key={p.id} onClick={() => setActiveProject(p)} className="group p-4 rounded-2xl border bg-white border-slate-100 shadow-sm hover:shadow-lg transition-all cursor-pointer relative overflow-hidden hover:scale-[1.05]">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 bg-brand/5 text-brand group-hover:bg-brand group-hover:text-white transition-colors"><FolderPlus className="w-5 h-5" /></div>
                  <h3 className="text-sm font-black text-slate-900 mb-0.5 truncate">{p.name}</h3>
                  <p className="text-[8px] text-slate-400 font-bold uppercase mb-4">{p.monitor_strategy || 'No Strategy'}</p>
                  <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                    <div className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{new Date(p.created_at).toLocaleDateString()}</div>
                    <div className="text-brand opacity-0 group-hover:opacity-100 transition-opacity"><ArrowRight className="w-3 h-3" /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-in slide-in-from-bottom duration-700 space-y-16">
          <div className="flex justify-between items-center print:hidden">
            <h2 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-5">
               <div className="bg-brand p-3 rounded-2xl text-white shadow-lg shadow-brand/20"><LayoutGrid className="w-7 h-7" /></div> Monitoring
            </h2>
            <div className="flex items-center gap-3 bg-white p-2 rounded-[1.5rem] border border-slate-100 shadow-sm">
              {/* Per-workspace model routing: Manual (fixed tier) vs Auto (router + cascade) */}
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100" title="Model routing for this workspace">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Model</span>
                <button
                  onClick={() => saveWorkspaceModel({ apply_mode: activeProject?.apply_mode === 'auto' ? 'manual' : 'auto' })}
                  disabled={savingWsModel}
                  className={clsx("px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all",
                    activeProject?.apply_mode === 'auto' ? "bg-brand text-white shadow-sm" : "bg-white text-slate-600 border border-slate-200")}
                >
                  {activeProject?.apply_mode === 'auto'
                    ? <><Sparkles className="w-3 h-3" /> Auto</>
                    : <><Settings className="w-3 h-3" /> Manual</>}
                </button>
                {activeProject?.apply_mode !== 'auto' && (
                  <select
                    value={activeProject?.model_key || 'basic'}
                    onChange={(e) => saveWorkspaceModel({ model_key: e.target.value })}
                    disabled={savingWsModel}
                    className="bg-white text-[10px] font-black uppercase px-2 py-1 rounded-lg border border-slate-200 outline-none cursor-pointer"
                  >
                    <option value="basic">Basic</option>
                    <option value="standard">Standard</option>
                    <option value="pro">Pro</option>
                    <option value="premium">Premium</option>
                    <option value="vip">VIP</option>
                  </select>
                )}
                {savingWsModel && <Loader2 className="w-3 h-3 animate-spin text-brand" />}
              </div>
              <Link href="/admin/connectors" className="bg-white px-6 py-2 rounded-xl border border-slate-200 font-black text-[10px] uppercase tracking-widest flex items-center gap-3 hover:bg-slate-50 shadow-sm text-slate-600">
                <RefreshCw className="w-4 h-4 text-brand" /> Change Strategy
              </Link>
              <select 
                value={exportSentiment} 
                onChange={(e) => setExportSentiment(e.target.value)}
                className="bg-slate-50 text-[10px] font-black uppercase px-3 py-2 rounded-xl outline-none"
              >
                <option value="all">All Sentiments</option>
                <option value="positive">Teal (Positive)</option>
                <option value="negative">Coral (Negative)</option>
              </select>
              <select 
                value={exportLimit} 
                onChange={(e) => setExportLimit(parseInt(e.target.value))}
                className="bg-slate-50 text-[10px] font-black uppercase px-3 py-2 rounded-xl outline-none"
              >
                <option value={0}>Download All</option>
                <option value={100}>Last 100</option>
                <option value={500}>Last 500</option>
                <option value={1000}>Last 1000</option>
              </select>
              <button 
                onClick={() => handleExport('excel')} 
                className="bg-teal-50 text-teal-600 px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-teal-100 transition-all flex items-center gap-2"
              >
                <FileText className="w-4 h-4" /> CSV
              </button>
              <button 
                onClick={async () => {
                   if(!activeProject) return;
                   setExportingReport(true);
                   try {
                     const token = localStorage.getItem('token');
                     const res = await axios.get(`/api/export/report/${activeProject.id}`, {
                       headers: { 'Authorization': `Bearer ${token}` },
                       responseType: 'blob'
                     });
                     const url = window.URL.createObjectURL(new Blob([res.data]));
                     const link = document.createElement('a');
                     link.href = url;
                     link.setAttribute('download', `SaaS_Report_${activeProject.name}.html`);
                     document.body.appendChild(link); link.click(); link.remove();
                   } catch { alert("Backend Report failed"); }
                   finally { setExportingReport(false); }
                }}
                disabled={exportingReport}
                className="bg-slate-900 text-white px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
              >
                {exportingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {exportingReport ? 'Building...' : 'Download Report'}
              </button>
            </div>
          </div>

          <div className="hidden print:block mb-10 border-b-2 border-slate-100 pb-8 text-center">
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2">Spotify Sentiment Analysis Report</h1>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Generated on {new Date().toLocaleDateString('vi-VN')} • Project: {activeProject?.name || 'Platform-Wide'}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:grid-cols-2 print:gap-4">
            <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-50 relative overflow-hidden group print:shadow-none print:border-slate-100">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-black text-slate-800 tracking-tight">Intelligence Trends</h2>
                <div className="flex gap-4">
                  <span className="flex items-center gap-1.5 text-[10px] font-black text-teal-500 uppercase tracking-widest"><div className="w-2 h-2 bg-teal-500 rounded-full" /> Positive</span>
                  <span className="flex items-center gap-1.5 text-[10px] font-black text-coral-500 uppercase tracking-widest"><div className="w-2 h-2 bg-coral-500 rounded-full" /> Negative</span>
                </div>
              </div>
              <div className="h-[350px] w-full print:h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData}>
                    <defs>
                      <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3}/><stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/></linearGradient>
                      <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/><stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                    <Tooltip contentStyle={{borderRadius: '1.5rem', border: 'none', padding: '1rem', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} />
                    <Area type="monotone" dataKey="positive" stroke="#14b8a6" strokeWidth={4} fillOpacity={1} fill="url(#colorPos)" animationDuration={1200} />
                    <Area type="monotone" dataKey="negative" stroke="#f43f5e" strokeWidth={4} fillOpacity={1} fill="url(#colorNeg)" animationDuration={1200} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-50 flex flex-col items-center justify-center print:shadow-none print:border-slate-100">
              <h2 className="text-xl font-black text-slate-800 tracking-tight mb-10 w-full text-left">Sentiment Split</h2>
              <div className="flex-1 h-[280px] w-full relative print:h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={80} outerRadius={105} paddingAngle={8} dataKey="value" stroke="none">
                      {sentimentData.map((entry, index) => (<Cell key={`cell-${index}`} fill={['#14b8a6', '#f43f5e', '#6366f1'][index % 3]} />))}
                    </Pie>
                    <Tooltip contentStyle={{borderRadius: '1rem', border: 'none'}} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Analyzed</p>
                  <p className="text-4xl font-black text-slate-900 tracking-tighter tabular-nums print:text-2xl">{sentimentData.reduce((acc, curr) => acc + curr.value, 0).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 print:grid-cols-2 print:gap-4">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-50 relative overflow-hidden group print:shadow-none print:border-slate-100">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-black text-slate-800 tracking-tight">Rating Trend</h2>
                <div className="flex gap-4">
                  <span className="flex items-center gap-1.5 text-[10px] font-black text-amber-500 uppercase tracking-widest"><div className="w-1.5 h-1.5 bg-amber-500 rounded-full" /> Avg Star Rating</span>
                </div>
              </div>
              <div className="h-[300px] w-full print:h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="5 5" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                    <YAxis domain={[0, 5]} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                    <Tooltip contentStyle={{borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                    <Line type="monotone" dataKey="avg_rating" stroke="#f59e0b" strokeWidth={4} dot={{r: 4, fill: '#f59e0b', strokeWidth: 2, stroke: '#fff'}} animationDuration={1800} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-50 print:shadow-none print:border-slate-100">
              <h2 className="text-xl font-black text-slate-800 tracking-tight mb-2">Rating Distribution</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-10">Spread of star ratings (1-5)</p>
              <div className="h-[300px] w-full print:h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ratingDist}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="rating" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                    <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '1rem', border: 'none'}} />
                    <Bar dataKey="count" fill="#fbbf24" radius={[6, 6, 0, 0]} barSize={24} animationDuration={1500} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 print:grid-cols-2 print:gap-4">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-50 relative group print:shadow-none print:border-slate-100">
              <h2 className="text-xl font-black text-teal-600 tracking-tight mb-2">Top Positive Keywords</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-10">Common praises from users</p>
              <div className="h-[300px] w-full print:h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={topPositiveIssues} margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="word" type="category" axisLine={false} tickLine={false} tick={{fill: '#0d9488', fontSize: 11, fontWeight: 800}} />
                    <Tooltip contentStyle={{borderRadius: '1rem', border: 'none'}} />
                    <Bar dataKey="count" fill="#14b8a6" radius={[0, 6, 6, 0]} barSize={16} animationDuration={2000} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-50 relative group print:shadow-none print:border-slate-100">
              <h2 className="text-xl font-black text-coral-600 tracking-tight mb-2">Top Negative Keywords</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-10">AI-identified common complaints</p>
              <div className="h-[300px] w-full print:h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={topIssues} margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="word" type="category" axisLine={false} tickLine={false} tick={{fill: '#e11d48', fontSize: 11, fontWeight: 800}} />
                    <Tooltip contentStyle={{borderRadius: '1rem', border: 'none'}} />
                    <Bar dataKey="count" fill="#f43f5e" radius={[0, 6, 6, 0]} barSize={16} animationDuration={2000} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 print:grid-cols-2 print:gap-4">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-50 relative group print:shadow-none print:border-slate-100">
              <h2 className="text-xl font-black text-slate-800 tracking-tight mb-2">Version Intelligence</h2>
              <div className="flex gap-4 mb-10">
                 <span className="flex items-center gap-1.5 text-[9px] font-black text-teal-500 uppercase tracking-widest"><div className="w-1.5 h-1.5 bg-teal-500 rounded-full" /> Positivity %</span>
                 <span className="flex items-center gap-1.5 text-[9px] font-black text-coral-500 uppercase tracking-widest"><div className="w-1.5 h-1.5 bg-coral-500 rounded-full" /> Negativity %</span>
              </div>
              <div className="h-[300px] w-full print:h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={versionData.map(v => ({...v, negative_rate: versionNegativeData.find(nv => nv.version === v.version)?.negative_rate || 0}))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="version" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} unit="%" />
                    <Tooltip contentStyle={{borderRadius: '1rem', border: 'none'}} />
                    <Bar dataKey="positive_rate" fill="#14b8a6" radius={[4, 4, 0, 0]} name="Positive %" barSize={12} animationDuration={1000} />
                    <Bar dataKey="negative_rate" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Negative %" barSize={12} animationDuration={1000} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-50 relative group print:shadow-none print:border-slate-100">
              <h2 className="text-xl font-black text-slate-800 tracking-tight mb-2">Hourly Engagement</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-10">Stacked activity by day of week</p>
              <div className="h-[300px] w-full print:h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={Array.from({length: 24}, (_, i) => ({
                    hour: `${i}h`,
                    ...days.reduce((acc, day, di) => ({
                      ...acc,
                      [day]: heatmapData.find(d => d.hour === i && d.day === di)?.value || 0
                    }), {})
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 9}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 9}} />
                    <Tooltip contentStyle={{borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px', fontSize: '8px', fontWeight: '800', textTransform: 'uppercase' }} />
                    {days.map((day, i) => (
                      <Bar key={day} dataKey={day} stackId="a" fill={[ '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#ef4444' ][i]} animationDuration={1500} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl text-white">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-black tracking-tight flex items-center gap-3"><BellRing className="w-6 h-6 text-brand" /> Smart Alerts</h2>
                <button onClick={handleSaveConfig} disabled={savingConfig} className="bg-brand text-slate-900 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all">{savingConfig ? 'Saving...' : 'Save Config'}</button>
              </div>
              <div className="space-y-6">
                <div className="p-5 bg-white/5 rounded-2xl border border-white/10">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 pl-1">Slack Webhook URL</label>
                  <input type="text" value={slackUrl} onChange={(e) => setSlackUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-xs text-slate-300 outline-none focus:ring-1 focus:ring-brand" />
                </div>
                {slackUrl && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top duration-500 pt-4 border-t border-white/5">
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 mb-4">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Quick Templates</p>
                      <div className="flex flex-wrap gap-2">
                        {alertTemplates.map(t => (
                          <button key={t.name} onClick={() => setNewRule({name: t.name, threshold: t.threshold})} className="px-3 py-1.5 bg-white/10 hover:bg-brand hover:text-slate-900 rounded-lg text-[9px] font-black uppercase transition-all">
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <input type="text" value={newRule.name} onChange={(e) => setNewRule({...newRule, name: e.target.value})} placeholder="Rule Name" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs" />
                      <input type="number" value={newRule.threshold} onChange={(e) => setNewRule({...newRule, threshold: parseInt(e.target.value)})} placeholder="Threshold %" className="w-24 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs" />
                      <button onClick={handleAddRule} className="bg-white text-slate-900 p-2 rounded-xl hover:bg-slate-100"><Plus className="w-5 h-5" /></button>
                    </div>
                    <div className="space-y-2">
                      {alertRules.map(rule => (
                        <div key={rule.id} className="p-3 bg-white/5 rounded-xl border border-white/5 flex justify-between items-center group">
                          <div>
                            <p className="text-xs font-bold">{rule.name}</p>
                            <p className="text-[9px] text-slate-500 uppercase">Trigger: {">"}{rule.threshold}% Negative</p>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={async () => {
                                try {
                                  const token = localStorage.getItem('token');
                                  const res = await axios.post(`/api/alerts/test/${rule.id}`, null, { headers: { 'Authorization': `Bearer ${token}` }});
                                  alert(`Test success! Slack: ${res.data.slack_notified}, Email: ${res.data.email_notified}`);
                                } catch { alert("Test failed. Check your config."); }
                              }}
                              className="opacity-0 group-hover:opacity-100 text-brand p-1 hover:bg-brand/10 rounded-lg transition-all"
                              title="Test Rule"
                            >
                              <Zap className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteRule(rule.id)} className="opacity-0 group-hover:opacity-100 text-rose-500 p-1 hover:bg-rose-500/10 rounded-lg"><X className="w-4 h-4" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3"><TicketIcon className="w-6 h-6 text-brand" /> Ticket System</h2>
                <button onClick={handleSaveConfig} className="text-brand font-black text-[10px] uppercase hover:underline">Update Email</button>
              </div>
              <div className="space-y-6 flex-1 flex flex-col">
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Support Destination Email</label>
                  <input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="support@company.com" className="w-full bg-white border border-slate-100 rounded-xl px-4 py-2 text-xs font-bold outline-none" />
                </div>
                {supportEmail && (
                  <div className="space-y-4 max-h-[400px] overflow-auto pr-2 animate-in fade-in duration-500 flex-1">
                    <button 
                      onClick={handleForwardTickets}
                      disabled={forwarding}
                      className="w-full bg-rose-500 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-rose-600 transition-all flex items-center justify-center gap-2 mb-4 shadow-lg shadow-rose-200"
                    >
                      {forwarding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {forwarding ? 'Forwarding...' : 'Forward 100 Negative to Support'}
                    </button>
                    {tickets.length > 0 ? tickets.map(t => (
                      <div key={t.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 group transition-all hover:bg-white hover:shadow-lg">
                        <p className="text-xs font-bold text-slate-700 mb-4 leading-relaxed italic">"{t.review_text}"</p>
                        <div className="flex justify-between items-center pt-4 border-t border-slate-100/50">
                          <span className="text-[10px] font-black text-rose-500 uppercase flex items-center gap-1.5"><ShieldAlert className="w-3 h-3" /> Critical Feedback</span>
                          <button onClick={() => alert(`Forwarded to ${supportEmail}`)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2"><Send className="w-3 h-3" /> Notify Support</button>
                        </div>
                      </div>
                    )) : (
                      <div className="py-20 text-center text-slate-300 italic text-sm font-medium border-2 border-dashed border-slate-50 rounded-[2.5rem]">No pending tickets for this project.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[3rem] shadow-xl shadow-slate-100/50 border border-slate-50">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-4">
                <div className="bg-slate-900 p-3 rounded-2xl text-brand shadow-lg shadow-brand/10"><Users className="w-6 h-6" /></div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Human-in-the-Loop Audit</h2>
              </div>
              {Object.keys(pendingCorrections).length > 0 && (
                <button 
                  onClick={submitChanges}
                  disabled={submittingChanges}
                  className="bg-brand text-slate-900 px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-brand/20 hover:scale-105 transition-all flex items-center gap-2"
                >
                  {submittingChanges ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-slate-900" />}
                  Submit {Object.keys(pendingCorrections).length} Corrections
                </button>
              )}
            </div>
            
            <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar border border-slate-50 rounded-[2rem]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-50 sticky top-0 bg-white z-10">
                    <th className="pb-6 pt-6 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-6">Feedback Intelligence</th>
                    <th className="pb-6 pt-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">AI Status</th>
                    <th className="pb-6 pt-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Confidence</th>
                    <th className="pb-6 pt-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Correct Sentiment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {fullHistory.map((item) => (
                    <tr key={item.id} className={clsx("group transition-all", pendingCorrections[item.id] ? "bg-brand/5" : "hover:bg-slate-50/50")}>
                      <td className="py-8 pr-10 pl-6">
                        <p className="text-sm font-bold text-slate-700 leading-relaxed mb-1 italic">"{item.text}"</p>
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{new Date(item.timestamp).toLocaleString()} • {item.model_version}</p>
                      </td>
                      <td className="py-8">
                        <div className="flex flex-col gap-2">
                          <span className={clsx("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border w-fit", 
                            item.sentiment === "positive" ? "bg-teal-50 text-teal-600 border-teal-100" : 
                            (item.sentiment === "negative" ? "bg-coral-50 text-coral-600 border-coral-100" : "bg-indigo-50 text-indigo-600 border-indigo-100")
                          )}>
                            {item.sentiment}
                          </span>
                          {item.sentiment_corrected && (
                            <div className="flex items-center gap-1.5 text-[9px] font-black text-brand uppercase"><CheckCircle2 className="w-3 h-3" /> Audit: {item.sentiment_corrected}</div>
                          )}
                          {pendingCorrections[item.id] && (
                            <div className="flex items-center gap-1.5 text-[9px] font-black text-amber-500 uppercase animate-pulse"><Zap className="w-3 h-3" /> Pending: {pendingCorrections[item.id]}</div>
                          )}
                        </div>
                      </td>
                      <td className="py-8 text-[10px] font-bold text-slate-500">
                        {item.confidence ? `${(item.confidence * 100).toFixed(1)}%` : 'N/A'}
                      </td>
                      <td className="py-8">
                         <div className="flex justify-center gap-2">
                            <button 
                              onClick={() => handleCorrection(item.id, 'positive')} 
                              className={clsx("p-3 rounded-2xl transition-all shadow-sm border", 
                                pendingCorrections[item.id] === 'positive' ? "bg-teal-500 text-white border-teal-500 shadow-teal-200" : "bg-white border-slate-100 text-slate-300 hover:border-teal-200 hover:text-teal-500"
                              )}
                            >
                              <TrendingUp className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => handleCorrection(item.id, 'negative')} 
                              className={clsx("p-3 rounded-2xl transition-all shadow-sm border", 
                                pendingCorrections[item.id] === 'negative' ? "bg-coral-500 text-white border-coral-500 shadow-coral-200" : "bg-white border-slate-100 text-slate-300 hover:border-coral-200 hover:text-coral-500"
                              )}
                            >
                              <TrendingUp className="w-5 h-5 rotate-180" />
                            </button>
                            <button 
                              onClick={() => handleCorrection(item.id, 'neutral')} 
                              className={clsx("p-3 rounded-2xl transition-all shadow-sm border", 
                                pendingCorrections[item.id] === 'neutral' ? "bg-indigo-500 text-white border-indigo-500 shadow-indigo-200" : "bg-white border-slate-100 text-slate-300 hover:border-indigo-200 hover:text-indigo-500"
                              )}
                            >
                              <Activity className="w-5 h-5" />
                            </button>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {fullHistory.length === 0 && (
                <div className="py-20 text-center text-slate-300 italic font-medium">No workspace predictions to audit yet.</div>
              )}
            </div>
          </div>
          
          <div className="flex justify-center pt-16 border-t border-slate-100">
             <button onClick={() => handleDeleteProject(activeProject.id)} className="flex items-center gap-2 text-rose-500 font-black text-xs uppercase tracking-[0.2em] hover:text-rose-600 transition-colors group">
               <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" /> Delete Workspace
             </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-[100] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] p-12 shadow-2xl relative">
            <button onClick={() => setShowCreate(false)} className="absolute top-8 right-8 text-slate-300 hover:text-slate-900"><X /></button>
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
              <div className="pt-6">
                <button type="submit" disabled={creating} className="w-full bg-slate-900 text-white px-6 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200">
                  {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />} Create Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW: Harvest Options Modal */}
      {showHarvestModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[110] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 bg-emerald-500 rounded-bl-[3rem]"><Database className="w-20 h-20" /></div>
            <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Harvest Options</h2>
            <p className="text-xs font-medium text-slate-500 mb-8 italic">Choose how deep the scraper should dive.</p>
            
            <div className="space-y-6 relative z-10">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Application ID (Target)</label>
                <input 
                  type="text" 
                  value={harvestId} 
                  onChange={(e) => setHarvestId(e.target.value)} 
                  placeholder="e.g. com.spotify.music" 
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm mb-2"
                />
                <p className="text-[9px] text-slate-400 font-bold px-2 italic">Tip: Use "com.spotify.music" for Spotify or similar IDs from Google Play.</p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Target Volume</label>
                <div className="grid grid-cols-2 gap-3">
                  {[100, 500, 1000, 5000].map(val => (
                    <button key={val} onClick={() => setHarvestLimit(val)} className={clsx("py-3 rounded-xl border-2 font-black text-xs transition-all", harvestLimit === val ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-100")}>
                      {val} Reviews
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button onClick={() => setShowHarvestModal(false)} className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase text-slate-400 hover:bg-slate-50 transition-all">Cancel</button>
                <button onClick={() => handleHarvest()} disabled={harvesting} className="flex-[2] bg-emerald-500 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2">
                   {harvesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Start Extraction
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Audit Batch Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[110] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden border border-slate-100">
            <div className="absolute top-0 right-0 p-4 opacity-5 bg-brand rounded-bl-[3rem]"><Sparkles className="w-20 h-20" /></div>
            <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight uppercase">Consolidate Audit</h2>
            <p className="text-xs font-medium text-slate-500 mb-8">Save {Object.keys(pendingCorrections).length} corrections as a new training batch.</p>
            
            <div className="space-y-6 relative z-10">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Dataset Name (Tag)</label>
                <input 
                  type="text" 
                  value={auditBatchName} 
                  onChange={(e) => setAuditBatchName(e.target.value)} 
                  placeholder="e.g. Q2_Feedback_Audited" 
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm focus:ring-2 focus:ring-brand"
                />
              </div>
              
              <div className="pt-4 flex gap-3">
                <button onClick={() => setShowAuditModal(false)} className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase text-slate-400 hover:bg-slate-50 transition-all">Discard</button>
                <button 
                  onClick={submitAuditBatch} 
                  disabled={submittingChanges || !auditBatchName.trim()} 
                  className="flex-[2] bg-brand text-slate-900 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-brand/20 flex items-center justify-center gap-2"
                >
                   {submittingChanges ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Commit to Training
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
