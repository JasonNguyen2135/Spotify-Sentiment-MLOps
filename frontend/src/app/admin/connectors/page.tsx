'use client';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Database, Zap, Plus, Trash2, Bell, 
  Smartphone, Globe, Mail, MessageCircle,
  CheckCircle2, AlertCircle, Loader2, RefreshCw,
  Code, Copy, Terminal, Link as LinkIcon, Info
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { redirect, useRouter } from 'next/navigation';
import { clsx } from 'clsx';

export default function ConnectorsPage() {
  const { user, loading: authLoading } = useAuth();
  const { activeProject } = useProject();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<'crawlers' | 'alerts' | 'webhooks'>('crawlers');
  
  // States for Data Sources
  const [sources, setSources] = useState<any[]>([]);
  const [newAppId, setNewAppId] = useState('');
  const [newPlatform, setNewPlatform] = useState('Google Play');
  
  // States for Alert Rules
  const [alerts, setAlerts] = useState<any[]>([]);
  const [ruleName, setRuleName] = useState('');
  const [threshold, setThreshold] = useState(25);
  const [channel, setChannel] = useState('Telegram');
  const [destination, setDestination] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);
  const [syncing, setSyncing] = useState<number | null>(null);

  const webhookUrl = activeProject ? `${window.location.protocol}//${window.location.host}/api/collect/${activeProject.id}` : '';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setStatus({ type: 'success', msg: 'Copied to clipboard!' });
    setTimeout(() => setStatus(null), 3000);
  };

  const handleSync = async (connectorId: number) => {
    setSyncing(connectorId);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/connectors/sync/${connectorId}`, null, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setStatus({ type: 'success', msg: `Successfully synced ${res.data.synced_count} records!` });
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.response?.data?.detail || 'Sync failed' });
    } finally {
      setSyncing(null);
    }
  };

  const fetchData = useCallback(async () => {
    if (!activeProject) return;
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const params = { project_id: activeProject.id };
      const [sourcesRes, alertsRes] = await Promise.all([
        axios.get('/api/connectors', { headers, params }),
        axios.get('/api/alerts', { headers, params })
      ]);
      setSources(sourcesRes.data);
      setAlerts(alertsRes.data);
    } catch (err) {
      console.error("Failed to fetch settings", err);
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    if (!authLoading && user?.role !== 'admin') {
      redirect('/');
    }
    if (!authLoading && !activeProject) {
      router.push('/');
      return;
    }
    if (user?.role === 'admin') {
      fetchData();
    }
  }, [user, authLoading, fetchData, activeProject, router]);

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;

    // Enforce 1 app per project: Show confirmation if already tracking
    if (sources.length > 0) {
      const confirmChange = window.confirm("Important: Each project can only track one application at a time. Registering a new app will PERMANENTLY DELETE all current history and reports for this project. Continue?");
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
      setStatus({ type: 'success', msg: 'Application updated! Current workspace data has been reset.' });
      fetchData();
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.response?.data?.detail || 'Failed to update connector' });
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
      setRuleName('');
      setDestination('');
      setStatus({ type: 'success', msg: 'Alert rule active. Monitoring started.' });
      fetchData();
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.response?.data?.detail || 'Failed to create alert' });
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

  if (authLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-gray-500 font-medium italic">Loading framework settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-20">
      <div className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-gray-900 flex items-center gap-3">
            <RefreshCw className="text-brand w-10 h-10" />
            Automation <span className="text-brand">Hub</span>
          </h1>
          <p className="text-gray-500 mt-2 text-lg">Configure dynamic data ingestion and real-time monitoring rules.</p>
        </div>
        
        <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1">
          {[
            { id: 'crawlers', label: 'Auto-Crawlers', icon: Smartphone },
            { id: 'alerts', label: 'Smart Alerts', icon: Zap },
            { id: 'webhooks', label: 'Webhooks', icon: Code },
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
          <button onClick={() => setStatus(null)} className="text-sm opacity-50 hover:opacity-100 uppercase font-black">Dismiss</button>
        </div>
      )}

      {activeTab === 'crawlers' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-1">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Plus className="w-5 h-5 text-brand" /> Add Source
              </h2>
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
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Application ID</label>
                  <input 
                    type="text"
                    value={newAppId}
                    onChange={(e) => setNewAppId(e.target.value)}
                    placeholder="e.g. com.spotify.music"
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
                  Register App
                </button>
              </form>
            </div>
          </div>
          
          <div className="lg:col-span-2">
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden h-full">
              <div className="p-8 border-b border-slate-50">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Database className="w-5 h-5 text-brand" /> Tracked Applications
                </h2>
              </div>
              <div className="p-4">
                {sources.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sources.map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-5 bg-slate-50 rounded-[2rem] border border-slate-100 group hover:border-brand/30 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                            {s.platform === 'Google Play' ? <Smartphone className="w-6 h-6 text-emerald-500" /> : <Globe className="w-6 h-6 text-blue-500" />}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 truncate max-w-[150px]">{s.app_id}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{s.platform}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleSync(s.id)}
                            disabled={syncing === s.id}
                            className="p-2 text-brand hover:bg-brand/5 rounded-xl transition-all"
                            title="Sync Now"
                          >
                            {syncing === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          </button>
                          <button 
                            onClick={() => handleDelete('connectors', s.id)}
                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center text-slate-400 font-medium italic">No applications registered for this project yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
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

      {activeTab === 'webhooks' && (
        <div className="space-y-8">
          <div className="bg-slate-900 p-12 rounded-[3rem] text-white relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-brand opacity-10 blur-[120px]"></div>
            
            <div className="relative z-10 max-w-3xl">
              <div className="bg-brand/20 text-brand px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] w-fit mb-6">Real-time Integration</div>
              <h2 className="text-4xl font-black mb-4">Ingest from any application.</h2>
              <p className="text-slate-400 text-lg mb-10 leading-relaxed">
                Use your unique Webhook URL to push user feedback directly into **{activeProject?.name}**. 
                Ideal for custom web apps, internal CRM systems, or microservices that aren't on public stores.
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Implementation Guide */}
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
              <h3 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-3">
                <Terminal className="w-6 h-6 text-brand" /> Implementation Guide
              </h3>
              
              <div className="space-y-8">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest">
                    <div className="w-1.5 h-1.5 bg-brand rounded-full"></div> cURL Example
                  </div>
                  <div className="bg-slate-900 p-5 rounded-2xl relative group">
                    <pre className="text-slate-300 text-xs font-mono leading-relaxed">
                      {`curl -X POST "${webhookUrl}" \\
-H "Content-Type: application/json" \\
-d '{
  "text": "The app interface is very intuitive!",
  "source": "my_web_app"
}'`}
                    </pre>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest">
                    <div className="w-1.5 h-1.5 bg-brand rounded-full"></div> Python (Requests)
                  </div>
                  <div className="bg-slate-900 p-5 rounded-2xl relative group">
                    <pre className="text-slate-300 text-xs font-mono leading-relaxed">
                      {`import requests

url = "${webhookUrl}"
data = {
    "text": "I really love the new update!",
    "source": "backend_service"
}

response = requests.post(url, json=data)`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            {/* Ingestion Specs */}
            <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-200">
               <h3 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-3">
                <Info className="w-6 h-6 text-slate-400" /> API Specification
              </h3>
              
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Allowed Methods</p>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 font-bold text-xs rounded-lg">POST</span>
                    <span className="text-slate-400 text-xs">application/json</span>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">JSON Body Fields</p>
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <div className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-brand font-bold">text</div>
                      <div className="text-xs text-slate-500 leading-relaxed">
                        <span className="font-bold text-slate-700">Required.</span> The actual user feedback or comment string to analyze.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-bold">source</div>
                      <div className="text-xs text-slate-500 leading-relaxed">
                        <span className="font-bold text-slate-400 italic">Optional.</span> Identifier for where the data originated (e.g., "ios_v2").
                      </div>
                    </li>
                  </ul>
                </div>

                <div className="p-6 bg-brand/5 rounded-2xl border border-brand/10">
                   <p className="text-xs text-brand-700 leading-relaxed">
                    <span className="font-bold">Security Note:</span> In this version, URLs are project-specific and public. Avoid exposing them in frontend code; ideally, call them from your own backend.
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
