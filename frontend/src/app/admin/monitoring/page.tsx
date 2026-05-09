'use client';
import { useAuth } from '@/context/AuthContext';
import { redirect } from 'next/navigation';
import { LayoutPanelLeft, ExternalLink, RefreshCcw, ShieldCheck, Activity } from 'lucide-react';

export default function MonitoringPage() {
  const { user, loading } = useAuth();

  if (!loading && user?.role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
            <Activity className="text-brand w-8 h-8" />
            Model <span className="text-brand">Observability</span>
          </h1>
          <p className="text-gray-500 mt-1">Real-time Data Drift and Model Performance monitoring via Evidently AI.</p>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 bg-white border border-slate-200 px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
          >
            <RefreshCcw className="w-4 h-4" /> Refresh
          </button>
          <a 
            href="/evidently/" 
            target="_blank" 
            className="flex items-center gap-2 bg-brand text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-all shadow-lg shadow-brand/20"
          >
            <ExternalLink className="w-4 h-4" /> Full View
          </a>
        </div>
      </div>
      
      {/* Iframe Container */}
      <div className="flex-1 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden relative min-h-[500px]">
        <div className="absolute inset-0 bg-slate-50 flex items-center justify-center -z-10">
          <Loader2 className="w-8 h-8 text-brand animate-spin" />
        </div>
        <iframe 
          src="/evidently/" 
          className="absolute inset-0 w-full h-full border-0 z-10"
          title="Evidently Dashboard"
          allowFullScreen
        />
      </div>

      <div className="mt-6 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 text-emerald-600">
          <ShieldCheck className="w-4 h-4" />
          <span className="text-[10px] font-black uppercase tracking-widest">Monitoring Agent Active</span>
        </div>
        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">
          Enterprise Observability Stack • Kubernetes Native
        </p>
      </div>
    </div>
  );
}

import { Loader2 } from 'lucide-react';
