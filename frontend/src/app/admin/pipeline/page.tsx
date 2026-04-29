'use client';
import { useAuth } from '@/context/AuthContext';
import { redirect } from 'next/navigation';
import { Settings, Play, ExternalLink, Clock } from 'lucide-react';

export default function PipelinePage() {
  const { user, loading } = useAuth();

  if (!loading && user?.role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="text-spotify" />
            ML Pipeline Management
          </h1>
          <p className="text-gray-500">Quản lý và kích hoạt quy trình tái đào tạo mô hình qua Airflow.</p>
        </div>
        
        <a 
          href="/airflow" 
          target="_blank" 
          className="bg-white border border-slate-200 px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
        >
          <ExternalLink className="w-4 h-4" /> Open Airflow UI
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 text-slate-400 mb-2 uppercase text-[10px] font-black tracking-widest">
            <Clock className="w-3 h-3" /> Last Run
          </div>
          <p className="text-lg font-bold text-slate-800">2 hours ago</p>
          <span className="text-xs text-green-500 font-bold bg-green-50 px-2 py-0.5 rounded-full mt-2 inline-block">SUCCESS</span>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 text-slate-400 mb-2 uppercase text-[10px] font-black tracking-widest">
            <Play className="w-3 h-3" /> DAG ID
          </div>
          <p className="text-lg font-bold text-slate-800 italic">spotify_training_dag</p>
        </div>
      </div>

      <div className="bg-slate-900 rounded-3xl p-10 text-white relative overflow-hidden shadow-2xl">
         <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-spotify opacity-20 blur-3xl"></div>
         <h2 className="text-2xl font-bold mb-4">Manual Retraining</h2>
         <p className="text-slate-400 mb-8 max-w-lg text-sm leading-relaxed">
            Bạn có thể kích hoạt quy trình cào dữ liệu mới, tiền xử lý và đào tạo lại mô hình 
            ngay lập tức bằng cách nhấn vào nút bên dưới. Dữ liệu sẽ được lấy từ MongoDB.
         </p>
         <button className="bg-spotify text-white px-10 py-4 rounded-2xl font-black text-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-3 shadow-lg shadow-spotify/20">
            <Play className="w-6 h-6 fill-current" /> TRIGGER PIPELINE NOW
         </button>
      </div>
    </div>
  );
}
