'use client';
import { useAuth } from '@/context/AuthContext';
import { redirect } from 'next/navigation';
import { Settings, Play, ExternalLink, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import axios from 'axios';

export default function PipelinePage() {
  const { user, loading } = useAuth();
  const [triggering, setTriggering] = useState(false);
  const [status, setStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);

  if (!loading && user?.role !== 'admin') {
    redirect('/');
  }

  const handleTriggerPipeline = async () => {
    setTriggering(true);
    setStatus(null);
    try {
      // Gọi trực tiếp tới Airflow NodePort
      // Lưu ý: admin:admin là auth mặc định. Trình duyệt có thể hỏi login nếu chưa login Airflow.
      const auth = btoa('admin:admin'); 
      await axios.post(
        'http://localhost:31190/api/v1/dags/spotify_sentiment_train_k8s_native/dagRuns',
        {},
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          }
        }
      );
      setStatus({ type: 'success', msg: 'Kích hoạt Pipeline thành công!' });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', msg: 'Không thể kết nối tới Airflow. Hãy đảm bảo bạn đã đăng nhập Airflow ở tab bên cạnh.' });
    } finally {
      setTriggering(false);
    }
  };

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
          href="http://localhost:31190" 
          target="_blank" 
          className="bg-white border border-slate-200 px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
        >
          <ExternalLink className="w-4 h-4" /> Open Airflow UI
        </a>
      </div>

      {status && (
        <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 animate-in slide-in-from-top ${
          status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
        }`}>
          {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="font-medium">{status.msg}</span>
        </div>
      )}

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
          <p className="text-lg font-bold text-slate-800 italic">spotify_sentiment_train_k8s_native</p>
        </div>
      </div>

      <div className="bg-slate-900 rounded-3xl p-10 text-white relative overflow-hidden shadow-2xl">
         <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-spotify opacity-20 blur-3xl"></div>
         <h2 className="text-2xl font-bold mb-4">Manual Retraining</h2>
         <p className="text-slate-400 mb-8 max-w-lg text-sm leading-relaxed">
            Bạn có thể kích hoạt quy trình cào dữ liệu mới, tiền xử lý và đào tạo lại mô hình 
            ngay lập tức bằng cách nhấn vào nút bên dưới. Dữ liệu sẽ được lấy từ MongoDB.
         </p>
         <button 
          onClick={handleTriggerPipeline}
          disabled={triggering}
          className="bg-spotify text-white px-10 py-4 rounded-2xl font-black text-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-3 shadow-lg shadow-spotify/20 disabled:opacity-50 disabled:scale-100"
         >
            {triggering ? (
              <>Đang kích hoạt...</>
            ) : (
              <>
                <Play className="w-6 h-6 fill-current" /> TRIGGER PIPELINE NOW
              </>
            )}
         </button>
      </div>
    </div>
  );
}
