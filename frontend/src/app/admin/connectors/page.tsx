'use client';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Database, Zap, Plus, Trash2, Bell, 
  Smartphone, Globe, Mail, MessageCircle,
  CheckCircle2, AlertCircle, Loader2, RefreshCw,
  Code, Copy, Terminal, Link as LinkIcon, Info,
  Send, Download, ArrowRight, Eye, EyeOff, X
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';

export default function ConnectorsPage() {
  const { user, loading: authLoading } = useAuth();
  const { activeProject } = useProject();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [activeTab, setActiveTab] = useState<'crawlers' | 'webhooks' | 'alerts'>('crawlers');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStats] = useState<{type: 'success' | 'error', msg: string} | null>(null);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const [sources, setSources] = useState<any[]>([]);
  const [newAppId, setNewAppId] = useState('');
  const [newPlatform, setNewPlatform] = useState('Google Play');

  const [forceCrawlerMode, setForceCrawlerMode] = useState(false);
  const [forceApiMode, setForceApiMode] = useState(false); 
  const isCrawlerMode = sources.length > 0 || forceCrawlerMode;
  const currentMode = isCrawlerMode ? 'CRAWLER' : (forceApiMode ? 'API' : 'NONE');

  const [alerts, setAlerts] = useState<any[]>([]);
  const [fullProject, setFullProject] = useState<any>(null);

  const webhookUrl = fullProject?.uuid ? `${window.location.protocol}//${window.location.host}/api/collect/${fullProject.uuid}` : 'Loading...';

  const webhookExample = JSON.stringify({
    "api_key": fullProject?.api_key || "YOUR_API_KEY",
    "text": "Sản phẩm tuyệt vời, giao hàng nhanh!",
    "user_id": "customer_123",
    "timestamp": new Date().toISOString()
  }, null, 2);

  const copyToClipboard = (text: string) => {
    if(!text || text.includes('•')) return;
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
      
      const [sourcesRes, alertsRes, projectRes] = await Promise.all([
        axios.get('/api/connectors', { headers, params }),
        axios.get('/api/alerts', { headers, params }),
        activeProject ? axios.get(`/api/projects/${activeProject.id}`, { headers }) : Promise.resolve({ data: null })
      ]);
      
      setSources(sourcesRes.data);
      setAlerts(alertsRes.data || []);
      if (projectRes.data) setFullProject(projectRes.data);
    } catch (err) {
      console.error("Failed to fetch settings", err);
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    
    const mode = searchParams.get('mode');
    if (mode === 'webhook') {
      setForceApiMode(true);
      setActiveTab('webhooks');
    } else if (mode === 'crawler') {
      setForceCrawlerMode(true);
      setActiveTab('crawlers');
    }
    
    fetchData();
  }, [user, authLoading, fetchData, router, searchParams]);

  const handleSync = async (connectorId: number) => {
    setSyncing(connectorId);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/connectors/sync/${connectorId}`, null, { headers: { 'Authorization': `Bearer ${token}` } });
      setStats({ type: 'success', msg: `Synced ${res.data.synced_count} records!` });
      fetchData();
    } catch (err: any) {
      setStats({ type: 'error', msg: 'Sync failed' });
    } finally { setSyncing(null); }
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/connectors', null, { params: { platform: newPlatform, app_id: newAppId, project_id: activeProject.id }, headers: { 'Authorization': `Bearer ${token}` } });
      setNewAppId(''); setStats({ type: 'success', msg: 'Application registered!' }); fetchData();
    } catch (err: any) { setStats({ type: 'error', msg: 'Failed to update' }); } finally { setSubmitting(false); }
  };

  if (authLoading || (loading && !sources.length && !alerts.length)) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-gray-500 font-medium italic">Configuring hub...</p>
      </div>
    );
  }

  if (currentMode === 'NONE') {
    return (
      <div className="max-w-4xl mx-auto py-20 px-4 animate-in fade-in duration-700">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-black text-slate-900 mb-4 tracking-tight">Strategy Required</h1>
          <p className="text-slate-500 text-lg font-medium">Select how to monitor <span className="text-brand font-bold">{activeProject?.name}</span></p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <button onClick={() => { setForceCrawlerMode(true); setActiveTab('crawlers'); }} className="group p-10 bg-white border-2 border-slate-100 rounded-[3.5rem] text-left hover:border-brand transition-all hover:shadow-2xl">
            <Smartphone className="w-12 h-12 text-emerald-500 mb-6" />
            <h3 className="text-2xl font-black text-slate-900 mb-2">Public App</h3>
            <p className="text-slate-500 text-sm">Monitor Google Play or App Store reviews automatically.</p>
          </button>
          <button onClick={() => { setForceApiMode(true); setActiveTab('webhooks'); }} className="group p-10 bg-white border-2 border-slate-100 rounded-[3.5rem] text-left hover:border-brand transition-all hover:shadow-2xl">
            <Code className="w-12 h-12 text-blue-500 mb-6" />
            <h3 className="text-2xl font-black text-slate-900 mb-2">Custom / API</h3>
            <p className="text-slate-500 text-sm">Push data from your own systems via secure Webhook.</p>
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
             <span className={clsx("px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest", currentMode === 'CRAWLER' ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700")}>{currentMode} MODE ACTIVE</span>
             <button onClick={() => { if(confirm("Reset?")) { setForceApiMode(false); setForceCrawlerMode(false); } }} className="text-[9px] font-black text-slate-400 hover:text-red-500 uppercase">Change Mode</button>
          </div>
          <h1 className="text-4xl font-black text-gray-900 flex items-center gap-3">Automation Hub</h1>
        </div>
        <div className="flex items-center gap-4">
           <button onClick={() => router.push('/')} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl shadow-slate-200">Apply & Finish <ArrowRight className="w-4 h-4" /></button>
           <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1">
             {currentMode === 'CRAWLER' && <button onClick={() => setActiveTab('crawlers')} className={clsx("px-5 py-2 rounded-xl font-bold text-xs", activeTab === 'crawlers' ? "bg-white shadow-sm" : "text-slate-500")}>Crawler</button>}
             {currentMode === 'API' && <button onClick={() => setActiveTab('webhooks')} className={clsx("px-5 py-2 rounded-xl font-bold text-xs", activeTab === 'webhooks' ? "bg-white shadow-sm" : "text-slate-500")}>Webhook</button>}
             <button onClick={() => setActiveTab('alerts')} className={clsx("px-5 py-2 rounded-xl font-bold text-xs", activeTab === 'alerts' ? "bg-white shadow-sm" : "text-slate-500")}>Alerts</button>
           </div>
        </div>
      </div>

      {activeTab === 'crawlers' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-1">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h2 className="text-xl font-bold text-gray-800 mb-6">Register App</h2>
              <form onSubmit={handleAddSource} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Platform</label>
                  <select value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm">
                    <option>Google Play</option><option>App Store</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Application ID</label>
                  <input type="text" value={newAppId} onChange={(e) => setNewAppId(e.target.value)} placeholder="e.g. com.spotify.music" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm" required />
                </div>
                <button type="submit" disabled={submitting} className="w-full bg-brand text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-brand/20">{submitting ? 'Registering...' : 'Apply App'}</button>
              </form>
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 h-full">
              <h3 className="text-xl font-bold mb-6">Tracked Application</h3>
              {sources.map(s => (
                <div key={s.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                  <div><p className="font-black text-slate-900">{s.app_id}</p><p className="text-[10px] text-slate-400 font-bold uppercase">{s.platform}</p></div>
                  <button onClick={() => handleSync(s.id)} className="p-3 bg-white rounded-xl shadow-sm text-brand">{syncing === s.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'webhooks' && (
        <div className="space-y-8">
          <div className="bg-slate-900 p-12 rounded-[3rem] text-white relative overflow-hidden shadow-2xl">
            <div className="relative z-10">
              <h2 className="text-4xl font-black mb-4">API Credentials</h2>
              <p className="text-slate-400 text-lg mb-10">Unique UUID and Secret Key for **{activeProject?.name}**.</p>
              <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Webhook Endpoint</label>
                  <div className="flex gap-4">
                    <div className="flex-1 bg-black/40 px-6 py-4 rounded-xl font-mono text-sm text-emerald-400 border border-white/5 overflow-x-auto">{webhookUrl}</div>
                    <button onClick={() => copyToClipboard(webhookUrl)} className="p-4 bg-brand rounded-xl"><Copy className="w-5 h-5" /></button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Secret api_key</label>
                  <div className="flex gap-4">
                    <div className="flex-1 bg-black/40 px-6 py-4 rounded-xl font-mono text-sm text-brand border border-white/5 overflow-x-auto">
                       {showApiKey ? fullProject?.api_key : '••••••••••••••••••••••••••••••••'}
                    </div>
                    <button onClick={() => setShowApiKey(!showApiKey)} className="p-4 bg-white/5 rounded-xl">{showApiKey ? <EyeOff /> : <Eye />}</button>
                    <button onClick={() => copyToClipboard(fullProject?.api_key)} className="p-4 bg-white/5 rounded-xl"><Copy /></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
             <h3 className="text-xl font-bold mb-6">Payload Specification</h3>
             <pre className="bg-slate-50 p-6 rounded-2xl text-xs font-mono text-slate-600">{webhookExample}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
