'use client';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Database, Zap, Plus, Trash2, Bell, 
  Smartphone, Globe, Mail, MessageCircle,
  CheckCircle2, AlertCircle, Loader2, RefreshCw
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { redirect } from 'next/navigation';
import { clsx } from 'clsx';

export default function ConnectorsPage() {
  const { user, loading: authLoading } = useAuth();
  
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

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const [sourcesRes, alertsRes] = await Promise.all([
        axios.get('/api/connectors', { headers }),
        axios.get('/api/alerts', { headers })
      ]);
      setSources(sourcesRes.data);
      setAlerts(alertsRes.data);
    } catch (err) {
      console.error("Failed to fetch settings", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user?.role !== 'admin') {
      redirect('/');
    }
    if (user?.role === 'admin') {
      fetchData();
    }
  }, [user, authLoading, fetchData]);

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/connectors', null, {
        params: { platform: newPlatform, app_id: newAppId },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNewAppId('');
      setStatus({ type: 'success', msg: 'Connector added! Data will be fetched periodically.' });
      fetchData();
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.response?.data?.detail || 'Failed to add connector' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/alerts', null, {
        params: { name: ruleName, threshold, channel, destination },
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
      <div className="mb-10">
        <h1 className="text-4xl font-black text-gray-900 flex items-center gap-3">
          <RefreshCw className="text-brand w-10 h-10" />
          Automation <span className="text-brand">Hub</span>
        </h1>
        <p className="text-gray-500 mt-2">Manage auto-crawler connectors and proactive sentiment alerting.</p>
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
        {/* Connectors Management */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 px-2">
            <Database className="w-5 h-5 text-brand" />
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Data Connectors</h2>
          </div>
          
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <form onSubmit={handleAddSource} className="space-y-4 mb-8">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Platform</label>
                  <select 
                    value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand text-sm"
                  >
                    <option>Google Play</option>
                    <option>App Store</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">App ID / Package Name</label>
                  <input 
                    type="text"
                    value={newAppId}
                    onChange={(e) => setNewAppId(e.target.value)}
                    placeholder="com.example.app"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand text-sm"
                    required
                  />
                </div>
              </div>
              <button 
                type="submit"
                disabled={submitting}
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                ADD CONNECTOR
              </button>
            </form>

            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Active Connectors</label>
              {sources.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      {s.platform === 'Google Play' ? <Smartphone className="w-5 h-5 text-emerald-500" /> : <Globe className="w-5 h-5 text-blue-500" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{s.app_id}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{s.platform} • {s.schedule}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDelete('connectors', s.id)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {sources.length === 0 && (
                <p className="text-center py-10 text-slate-400 text-sm italic font-medium">No connectors configured.</p>
              )}
            </div>
          </div>
        </section>

        {/* Alert Rules Management */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 px-2">
            <Zap className="w-5 h-5 text-brand" />
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Smart Alerts</h2>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <form onSubmit={handleAddAlert} className="space-y-4 mb-8">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Rule Name</label>
                  <input 
                    type="text"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    placeholder="e.g. Crisis Alert"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Threshold (% Neg)</label>
                  <input 
                    type="number"
                    value={threshold}
                    onChange={(e) => setThreshold(parseInt(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand text-sm"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Channel</label>
                  <select 
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand text-sm"
                  >
                    <option>Telegram</option>
                    <option>Email</option>
                    <option>Slack</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Destination ID/Email</label>
                  <input 
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Chat ID or Email"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand text-sm"
                    required
                  />
                </div>
              </div>
              <button 
                type="submit"
                disabled={submitting}
                className="w-full bg-brand text-white py-4 rounded-2xl font-black text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-xl shadow-brand/10"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                CREATE ALERT RULE
              </button>
            </form>

            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Active Monitoring Rules</label>
              {alerts.map((a) => (
                <div key={a.id} className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-start justify-between group">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm text-brand">
                      {a.channel === 'Telegram' ? <MessageCircle className="w-6 h-6" /> : a.channel === 'Email' ? <Mail className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{a.name}</p>
                      <p className="text-xs text-slate-500 font-medium">Notify <span className="text-brand font-bold">{a.destination}</span></p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[9px] font-black rounded-lg uppercase">
                          Negative {'>'} {a.threshold}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDelete('alerts', a.id)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {alerts.length === 0 && (
                <p className="text-center py-10 text-slate-400 text-sm italic font-medium">No rules defined.</p>
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="mt-10 bg-slate-900 p-8 rounded-[2.5rem] text-white flex flex-col md:flex-row items-center justify-between gap-8 overflow-hidden relative">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-brand opacity-20 blur-[100px]"></div>
        <div className="relative z-10">
          <h3 className="text-xl font-bold mb-2">Automated Lifecycle</h3>
          <p className="text-slate-400 text-sm max-w-lg">
            The platform's orchestration engine will now automatically cycle through your connectors, fetch the latest user feedback, run predictions, and trigger alerts if anomalies are detected.
          </p>
        </div>
        <div className="flex items-center gap-4 relative z-10">
          <div className="px-5 py-3 bg-white/10 rounded-2xl border border-white/10 text-xs font-black uppercase tracking-widest">
            Engine: Active
          </div>
        </div>
      </div>
    </div>
  );
}
