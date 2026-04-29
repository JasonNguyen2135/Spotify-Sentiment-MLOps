'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Activity, Users, Database, Zap, Loader2 } from 'lucide-react';

export default function Home() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await axios.get('/api/stats');
        setStats(response.data);
      } catch (err) {
        console.error("Failed to fetch stats", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statItems = stats ? [
    { name: 'Model Version', value: stats.model_version, icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-50' },
    { name: 'Total Predictions', value: stats.total_predictions.toLocaleString(), icon: Activity, color: 'text-blue-500', bg: 'bg-blue-50' },
    { name: 'Dataset Size', value: stats.dataset_size, icon: Database, color: 'text-green-500', bg: 'bg-green-50' },
    { name: 'Active Users', value: stats.active_users, icon: Users, color: 'text-purple-500', bg: 'bg-purple-50' },
  ] : [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 className="w-12 h-12 text-spotify animate-spin mb-4" />
        <p className="text-gray-500 font-medium italic">Đang tải dữ liệu hệ thống...</p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-700">
      <div className="mb-10 text-center md:text-left">
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
          Spotify <span className="text-spotify">MLOps</span> GitOps Dashboard
        </h1>
        <p className="text-slate-500 text-lg">Hệ thống phân tích cảm xúc bình luận thời gian thực.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statItems.map((item) => (
          <div key={item.name} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div className={`${item.bg} ${item.color} p-3 rounded-xl`}>
                <item.icon className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg uppercase">Realtime</span>
            </div>
            <h3 className="text-slate-500 text-sm font-semibold uppercase tracking-wider">{item.name}</h3>
            <p className="text-3xl font-bold text-slate-900 mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 overflow-hidden bg-slate-900 rounded-3xl relative">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-spotify opacity-20 blur-[100px]"></div>
        <div className="p-10 md:p-16 relative z-10">
          <h2 className="text-3xl font-bold text-white mb-4">🚀 Sẵn sàng cho Training?</h2>
          <p className="text-slate-300 text-lg mb-8 max-w-2xl">
            Mô hình Sentiment đang được theo dõi liên tục. Nếu phát hiện Data Drift, 
            hệ thống sẽ tự động kích hoạt Airflow Pipeline để cập nhật tri thức mới.
          </p>
          <div className="flex flex-wrap gap-4">
            <button className="bg-spotify text-white px-8 py-3 rounded-full font-bold hover:scale-105 transition-all">
              Bắt đầu Retrain
            </button>
            <button className="bg-white/10 text-white border border-white/20 px-8 py-3 rounded-full font-bold hover:bg-white/20 transition-all">
              Xem báo cáo Drift
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
