'use client';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Database, Zap, Plus, Trash2, Bell, 
  Smartphone, Globe, Mail, MessageCircle,
  CheckCircle2, AlertCircle, Loader2, RefreshCw,
  Code, Copy, Terminal, Link as LinkIcon, Info,
  Send, Download, ArrowRight
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';

export default function ConnectorsPage() {
  const { user, loading: authLoading } = useAuth();
  const { activeProject } = useProject();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<'crawlers' | 'webhooks' | 'alerts' | 'extension'>('crawlers');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStats] = useState<{type: 'success' | 'error', msg: string} | null>(null);
  const [syncing, setSyncing] = useState<number | null>(null);

  const [sources, setSources] = useState<any[]>([]);
  const [newAppId, setNewAppId] = useState('');
  const [newPlatform, setNewPlatform] = useState('Google Play');

  // Monitoring Strategy Lock
  const isCrawlerMode = sources.length > 0;
  const [forceApiMode, setForceApiMode] = useState(false); 
  const currentMode = isCrawlerMode ? 'CRAWLER' : (forceApiMode ? 'API' : 'NONE');

  const [alerts, setAlerts] = useState<any[]>([]);
  const [ruleName, setRuleName] = useState('');
  const [threshold, setThreshold] = useState(25);
  const [channel, setChannel] = useState('Telegram');
  const [destination, setDestination] = useState('');

  const webhookUrl = activeProject ? `${window.location.protocol}//${window.location.host}/api/collect/${activeProject.id}` : '';
  const extensionCode = `// Manifest v3 snippet
{
  "name": "SentimentAI Scraper",
  "version": "1.0",
  "permissions": ["activeTab", "storage"],
  "host_permissions": ["*://*.shopee.vn/*", "*://*.google.com/*"],
  "action": { "default_popup": "popup.html" }
}`;

  const webhookExample = JSON.stringify({
    "review_text": "Sản phẩm tuyệt vời, giao hàng nhanh!",
    "user_id": "customer_123",
    "timestamp": new Date().toISOString()
  }, null, 2);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setStats({ type: 'success', msg: 'Copied to clipboard!' });
    setTimeout(() => setStats(null), 3000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const params = { project_id: activeProject?.id || null };
      const [sourcesRes, alertsRes] = await Promise.all([
        axios.get('/api/connectors', { headers, params }),
        axios.get('/api/alerts', { headers, params })
      ]);
      setSources(sourcesRes.data);
      setAlerts(alertsRes.data || []);
    } catch (err) {
      console.error("Failed to fetch settings", err);
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push('/login');
      return;
    }

    fetchData();
  }, [user, authLoading, fetchData]);

  const handleSync = async (connectorId: number) => {
    setSyncing(connectorId);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/connectors/sync/${connectorId}`, null, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setStats({ type: 'success', msg: `Successfully synced ${res.data.synced_count} records!` });
      fetchData();
    } catch (err: any) {
      setStats({ type: 'error', msg: err.response?.data?.detail || 'Sync failed' });
    } finally {
      setSyncing(null);
    }
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;

    if (sources.length > 0) {
      const confirmChange = window.confirm("Important: Each project can only track one application at a time. Registering a new app will PERMANENTLY DELETE all current history for this project. Continue?");
      if (!confirmChange) return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/connectors', null, {
        params: { platform: newPlatform, app_id: newAppId, project_id: activeProject.id },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNewAppId('');
      setStats({ type: 'success', msg: 'Application updated!' });
      fetchData();
    } catch (err: any) {
      setStats({ type: 'error', msg: 'Failed to update' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/alerts', null, {
        params: { name: ruleName, threshold, channel, destination, project_id: activeProject.id },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setRuleName(''); setDestination('');
      setStats({ type: 'success', msg: 'Alert rule active.' });
      fetchData();
    } catch (err: any) {
      setStats({ type: 'error', msg: 'Failed to create alert' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (type: 'connectors' | 'alerts', id: number) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/${type}/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchData();
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  if (authLoading || (loading && !sources.length && !alerts.length)) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-gray-500 font-medium italic">Loading framework settings...</p>
      </div>
    );
  }

  // If No Mode Selected Yet
  if (currentMode === 'NONE') {
    return (
      <div className="max-w-4xl mx-auto py-20 px-4 animate-in fade-in duration-700">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-black text-slate-900 mb-4 tracking-tight">Select Monitoring Strategy</h1>
          <p className="text-slate-500 text-lg font-medium">How should we collect intelligence for <span className="text-brand font-bold">"{activeProject?.name}"</span>?</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <button 
            onClick={() => { setActiveTab('crawlers'); }}
            className="group p-10 bg-white border-2 border-slate-100 rounded-[3.5rem] text-left hover:border-brand transition-all hover:shadow-2xl hover:scale-[1.02]"
          >
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-brand group-hover:text-white transition-colors">
              <Smartphone className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-3">Public App</h3>
            <p className="text-slate-500 text-sm leading-relaxed mb-8">
              Automatic monitoring for apps on <strong>Google Play, App Store, or Shopee</strong>. No code required.
            </p>
            <div className="flex items-center gap-2 text-brand font-black text-[10px] uppercase tracking-widest">
              Setup Crawler <ArrowRight className="w-4 h-4" />
            </div>
          </button>

          <button 
            onClick={() => { setForceApiMode(true); setActiveTab('webhooks'); }}
            className="group p-10 bg-white border-2 border-slate-100 rounded-[3.5rem] text-left hover:border-brand transition-all hover:shadow-2xl hover:scale-[1.02]"
          >
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-brand group-hover:text-white transition-colors">
              <Code className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-3">Custom / API</h3>
            <p className="text-slate-500 text-sm leading-relaxed mb-8">
              For <strong>private apps or unique websites</strong>. We provide a webhook API for you to send comments.
            </p>
            <div className="flex items-center gap-2 text-brand font-black text-[10px] uppercase tracking-widest">
              Setup Webhook <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-20 px-4">
      <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
             <span className={clsx(
               "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
               currentMode === 'CRAWLER' ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
             )}>
               {currentMode} MODE ACTIVE
             </span>
             <button onClick={() => { if(confirm("Reset monitoring strategy? This won't delete data but will let you choose a new mode.")) { setForceApiMode(false); if(sources.length) sources.forEach(s => handleDelete('connectors', s.id)); } }} className="text-[9px] font-black text-slate-400 hover:text-red-500 uppercase tracking-widest">Change Mode</button>
          </div>
          <h1 className="text-4xl font-black text-gray-900 flex items-center gap-3">
            <RefreshCw className="text-brand w-10 h-10" />
            Automation <span className="text-brand">Hub</span>
          </h1>
        </div>
        
        <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1">
          {[
            ...(currentMode === 'CRAWLER' ? [{ id: 'crawlers', label: 'Auto-Crawlers', icon: Smartphone }] : []),
            ...(!activeProject ? [{ id: 'alerts', label: 'Smart Alerts', icon: Zap }] : []),
            ...(currentMode === 'API' ? [
              { id: 'webhooks', label: 'Webhooks', icon: Code },
              { id: 'extension', label: 'Browser Ext', icon: Globe }
            ] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={clsx(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all",
                activeTab === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
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
          <button onClick={() => setStats(null)} className="text-sm opacity-50 hover:opacity-100 uppercase font-black">Dismiss</button>
        </div>
      )}

      {activeTab === 'crawlers' && currentMode === 'CRAWLER' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-1">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                <Plus className="w-5 h-5 text-brand" /> {sources.length > 0 ? 'Replace App' : 'Register App'}
              </h2>
              <p className="text-[10px] text-red-500 font-bold uppercase mb-6 italic">Note: Only 1 app per project allowed.</p>
              
              <form onSubmit={handleAddSource} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Store Platform</label>
                  <select 
                    value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand text-sm font-bold"
                  >
                    <option>Google Play</option>
                    <option>App Store</option>
                    <option>Shopee</option>
                    <option>Lazada</option>
                    <option>Tiki</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Application/Shop ID</label>
                  <input 
                    type="text"
                    value={newAppId}
                    onChange={(e) => setNewAppId(e.target.value)}
                    placeholder="e.g. com.spotify.music or shop_123"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand text-sm font-bold"
                    required
                  />
                </div>
                <button 
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                  {sources.length > 0 ? 'Update App' : 'Register App'}
                </button>
              </form>
            </div>
          </div>
          
          <div className="lg:col-span-2">
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden h-full">
              <div className="p-8 border-b border-slate-50">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Database className="w-5 h-5 text-brand" /> Tracked Application
                </h2>
              </div>
              <div className="p-8">
                {sources.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {sources.map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 group hover:border-brand/30 transition-all">
                        <div className="flex items-center gap-6">
                          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100">
                            {s.platform === 'Google Play' ? <Smartphone className="w-7 h-7 text-emerald-500" /> : s.platform === 'Shopee' ? <Globe className="w-7 h-7 text-orange-500" /> : <Globe className="w-7 h-7 text-blue-500" />}
                          </div>
                          <div>
                            <p className="text-lg font-black text-slate-900">{s.app_id}</p>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{s.platform}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => handleSync(s.id)}
                            disabled={syncing === s.id}
                            className="p-3 text-brand hover:bg-white rounded-2xl transition-all shadow-sm bg-white/50"
                            title="Sync Now"
                          >
                            {syncing === s.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                          </button>
                          <button 
                            onClick={() => handleDelete('connectors', s.id)}
                            className="p-3 text-slate-300 hover:text-red-500 hover:bg-white rounded-2xl transition-all shadow-sm"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center text-slate-400 font-medium italic">No application registered for this project yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'alerts' && !activeProject && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-1">
             <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Zap className="w-5 h-5 text-brand" /> Monitor Condition
              </h2>
              <form onSubmit={handleAddAlert} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Rule Name</label>
                  <input 
                    type="text"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    placeholder="Crisis Alert"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand text-sm font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Negative Threshold (%)</label>
                  <input 
                    type="number"
                    value={threshold}
                    onChange={(e) => setThreshold(parseInt(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand text-sm font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Notification Channel</label>
                  <select 
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand text-sm font-bold"
                  >
                    <option>Telegram</option>
                    <option>Email</option>
                    <option>Slack</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Destination Address</label>
                  <input 
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Chat ID or Email"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand text-sm font-bold"
                    required
                  />
                </div>
                <button 
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-brand text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-xl shadow-brand/20"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                  Activate Rule
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden h-full">
               <div className="p-8 border-b border-slate-50">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-brand" /> Active Monitoring Rules
                </h2>
              </div>
              <div className="p-8">
                {alerts.length > 0 ? (
                  <div className="space-y-4">
                    {alerts.map((a) => (
                      <div key={a.id} className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center justify-between group">
                        <div className="flex gap-6">
                          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm text-brand border border-slate-100">
                            {a.channel === 'Telegram' ? <MessageCircle className="w-7 h-7" /> : a.channel === 'Email' ? <Mail className="w-7 h-7" /> : <Zap className="w-7 h-7" />}
                          </div>
                          <div>
                            <p className="text-lg font-black text-slate-900">{a.name}</p>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Send to: <span className="text-brand">{a.destination}</span></p>
                            <div className="mt-3 flex items-center gap-2">
                              <span className="px-3 py-1 bg-red-100 text-red-700 text-[10px] font-black rounded-lg uppercase tracking-tighter">
                                Trigger: Negative {'>'} {a.threshold}%
                              </span>
                              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-lg uppercase tracking-tighter">
                                Live
                              </span>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDelete('alerts', a.id)}
                          className="p-3 text-slate-300 hover:text-red-500 hover:bg-white rounded-2xl transition-all shadow-sm"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center text-slate-400 font-medium italic">No alert rules configured for this project.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'webhooks' && currentMode === 'API' && (
        <div className="space-y-8">
          <div className="bg-slate-900 p-12 rounded-[3rem] text-white relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-brand opacity-10 blur-[120px]"></div>
            
            <div className="relative z-10 max-w-3xl">
              <div className="bg-brand/20 text-brand px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] w-fit mb-6">Real-time Integration</div>
              <h2 className="text-4xl font-black mb-4">Ingest from any application.</h2>
              <p className="text-slate-400 text-lg mb-10 leading-relaxed">
                Use your unique Webhook URL to push user feedback directly into **{activeProject?.name}**. 
              </p>

              <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Your Unique Webhook Endpoint</label>
                <div className="flex items-center gap-4">
                  <div className="flex-1 bg-black/40 px-6 py-4 rounded-2xl font-mono text-sm text-emerald-400 border border-white/5 overflow-x-auto whitespace-nowrap">
                    {webhookUrl}
                  </div>
                  <button 
                    onClick={() => copyToClipboard(webhookUrl)}
                    className="p-4 bg-brand text-white rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-brand/20"
                  >
                    <Copy className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-brand" /> Payload Specification
              </h3>
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 relative group">
                <button onClick={() => copyToClipboard(webhookExample)} className="absolute top-4 right-4 p-2 bg-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"><Copy className="w-4 h-4 text-slate-400" /></button>
                <pre className="text-xs font-mono text-slate-600 overflow-x-auto">
                  {webhookExample}
                </pre>
              </div>
              <div className="mt-6 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 font-black text-[10px]">1</div>
                  <p className="text-xs text-slate-500 font-medium">`review_text` (String, Required): The content to analyze.</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 font-black text-[10px]">2</div>
                  <p className="text-xs text-slate-500 font-medium">`user_id` (String, Optional): Identifier for the customer.</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
               <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Zap className="w-5 h-5 text-brand" /> Live Testing
              </h3>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">Send a test packet to verify your integration is functioning correctly.</p>
              <button 
                onClick={async () => {
                   try {
                     const token = localStorage.getItem('token');
                     await axios.post(webhookUrl, JSON.parse(webhookExample), {
                       headers: { 'Authorization': `Bearer ${token}` }
                     });
                     setStats({ type: 'success', msg: 'Test packet delivered!' });
                   } catch (err) {
                     setStats({ type: 'error', msg: 'Delivery failed.' });
                   }
                }}
                className="w-full py-4 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-500 hover:border-brand hover:text-brand transition-all flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" /> Send Test Request
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'extension' && currentMode === 'API' && (
        <div className="animate-in slide-in-from-right duration-500">
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
             <div className="lg:col-span-2 space-y-8">
                <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-[1.5rem] flex items-center justify-center"><Globe className="w-8 h-8" /></div>
                    <div>
                      <h2 className="text-3xl font-black text-slate-900">Chrome Extension</h2>
                      <p className="text-slate-400 font-medium italic">Collect feedback directly from your browser.</p>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <p className="text-slate-600 leading-relaxed font-medium">
                      The **SentimentAI Scraper** extension allows you to analyze comments on any website (Shopee, YouTube, Google Maps) with a single click. It automatically detects text blocks and sends them to this workspace.
                    </p>

                    <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">Quick Setup Guide</h4>
                      <div className="space-y-4">
                        {[
                          "Download the extension source package below.",
                          "Open Chrome and navigate to `chrome://extensions`.",
                          "Enable 'Developer mode' in the top right.",
                          "Click 'Load unpacked' and select the downloaded folder."
                        ].map((step, i) => (
                          <div key={i} className="flex items-start gap-4">
                            <div className="w-6 h-6 bg-white border border-slate-100 rounded-lg flex items-center justify-center text-[10px] font-black text-brand flex-shrink-0 mt-0.5">{i+1}</div>
                            <p className="text-sm text-slate-500 font-medium">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-10 pt-10 border-t border-slate-50 flex gap-4">
                    <button className="flex-1 bg-slate-900 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2">
                      <Download className="w-5 h-5" /> Download Package
                    </button>
                    <button 
                      onClick={() => copyToClipboard(activeProject?.id?.toString() || '')}
                      className="px-8 bg-white border border-slate-200 text-slate-900 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                    >
                      <Copy className="w-5 h-5" /> Copy Project Key
                    </button>
                  </div>
                </div>
             </div>

             <div className="lg:col-span-1">
                <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl sticky top-24">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Code className="w-5 h-5 text-brand" /> Manifest config
                  </h3>
                  <div className="bg-black/40 p-6 rounded-2xl font-mono text-[10px] text-emerald-400 border border-white/5 overflow-x-auto mb-6">
                    {extensionCode}
                  </div>
                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                     <div className="flex items-center gap-2 mb-2 text-brand">
                        <Info className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Extension Status</span>
                     </div>
                     <p className="text-xs text-slate-400 leading-relaxed">
                       Currently optimized for Chromium-based browsers. Safari support coming soon.
                     </p>
                  </div>
                </div>
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
