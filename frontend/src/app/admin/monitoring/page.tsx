'use client';
import { useAuth } from '@/context/AuthContext';
import { redirect } from 'next/navigation';
import { LayoutPanelLeft, ExternalLink, RefreshCcw } from 'lucide-react';

export default function MonitoringPage() {
  const { user, loading } = useAuth();

  // Bảo vệ route: Chỉ Admin mới được vào
  if (!loading && user?.role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <LayoutPanelLeft className="text-spotify" />
            Evidently AI Monitoring
          </h1>
          <p className="text-gray-500">Giám sát Data Drift và hiệu năng Model theo thời gian thực.</p>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all"
          >
            <RefreshCcw className="w-4 h-4" /> Làm mới
          </button>
          <a 
            href="/evidently/" 
            target="_blank" 
            className="flex items-center gap-2 bg-spotify text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-all"
          >
            <ExternalLink className="w-4 h-4" /> Mở tab mới
          </a>
        </div>
      </div>
      
      {/* Container chứa Iframe báo cáo */}
      <div className="flex-1 bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden relative">
        <iframe 
          src="/evidently/" 
          className="absolute inset-0 w-full h-full border-0"
          title="Evidently Dashboard"
          allowFullScreen
        />
      </div>
      
      <div className="mt-4 text-center">
        <p className="text-xs text-slate-400 uppercase font-bold tracking-widest">
          Powered by Evidently AI & Kubernetes GitOps
        </p>
      </div>
    </div>
  );
}
