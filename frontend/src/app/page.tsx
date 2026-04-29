'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Activity, Users, Database, Zap, Loader2, Send, CheckCircle2, ShieldAlert, Target, Waves } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { clsx } from 'clsx';

export default function Home() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState('');
  const [prediction, setPrediction] = useState<any>(null);
  const [predicting, setPredicting] = useState(false);

  useEffect(() => {
    if (user?.role === 'admin') {
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
    } else {
      setLoading(false);
    }
  }, [user]);

  const handlePredict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!review.trim()) return;
    setPredicting(true);
    setPrediction(null);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`/api/predict`, null, {
          params: { review_text: review },
          headers: { 'Authorization': `Bearer ${token}` }
      });
      setPrediction(response.data);
    } catch (err) {
      console.error("Prediction failed", err);
    } finally {
      setPredicting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 className="w-12 h-12 text-spotify animate-spin mb-4" />
        <p className="text-gray-500 font-medium italic">Đang tải dữ liệu...</p>
      </div>
    );
  }

  const getDriftColor = (score: string) => {
    const val = parseFloat(score);
    if (val > 25) return { text: 'text-red-500', bg: 'bg-red-50' };
    if (val > 10) return { text: 'text-yellow-500', bg: 'bg-yellow-50' };
    return { text: 'text-green-500', bg: 'bg-green-50' };
  };

  const driftStyle = stats ? getDriftColor(stats.drift_score) : { text: '', bg: '' };

  return (
    <div className="animate-in fade-in duration-700">
      <div className="mb-10 text-center md:text-left">
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
          Spotify <span className="text-spotify">MLOps</span> GitOps Dashboard
        </h1>
        <p className="text-slate-500 text-lg">Hệ thống phân tích cảm xúc bình luận thời gian thực.</p>
      </div>

      {user?.role === 'admin' && stats && (
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <ShieldAlert className="text-red-500 w-5 h-5" />
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-wider">Hệ thống (Chỉ Admin)</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {[
              { name: 'Accuracy', value: stats.accuracy, icon: Target, color: 'text-red-500', bg: 'bg-red-50' },
              { name: 'Data Drift', value: stats.drift_score, icon: Waves, color: driftStyle.text, bg: driftStyle.bg },
              { name: 'Version', value: stats.model_version, icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-50' },
              { name: 'Predictions', value: stats.total_predictions.toLocaleString(), icon: Activity, color: 'text-blue-500', bg: 'bg-blue-50' },
              { name: 'Dataset', value: stats.dataset_size, icon: Database, color: 'text-green-500', bg: 'bg-green-50' },
              { name: 'Users', value: stats.active_users, icon: Users, color: 'text-purple-500', bg: 'bg-purple-50' },
            ].map((item) => (
              <div key={item.name} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
                <div className={`${item.bg} ${item.color} p-2 rounded-lg w-fit mb-3`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <h3 className="text-slate-400 text-[10px] font-bold uppercase">{item.name}</h3>
                <p className="text-lg font-black text-slate-900 mt-1">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 overflow-hidden bg-slate-900 rounded-3xl relative shadow-2xl">
            <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-spotify opacity-20 blur-[100px]"></div>
            <div className="p-8 md:p-12 relative z-10">
              <h2 className="text-2xl font-bold text-white mb-2 text-spotify">🚀 Training Pipeline</h2>
              <p className="text-slate-300 mb-6 max-w-xl text-sm leading-relaxed">
                Quản trị viên có quyền ép model học lại dữ liệu mới nhất từ MongoDB khi phát hiện Data Drift cao.
              </p>
              <div className="flex gap-4">
                <button className="bg-spotify text-white px-6 py-2 rounded-full font-bold text-sm hover:scale-105 transition-all">
                  Bắt đầu Retrain
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl">
        <div className="flex items-center gap-2 mb-6">
          <Send className="text-spotify w-5 h-5" />
          <h2 className="text-xl font-bold text-gray-800 uppercase tracking-wider">Dự đoán nhanh</h2>
        </div>
        
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <form onSubmit={handlePredict} className="relative">
            <input 
              type="text"
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Nhập một câu bình luận Spotify..."
              className="w-full pl-6 pr-32 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-spotify transition-all"
            />
            <button 
              type="submit"
              disabled={predicting || !review.trim()}
              className="absolute right-2 top-2 bottom-2 bg-spotify text-white px-6 rounded-xl font-bold hover:opacity-90 disabled:bg-slate-300 transition-all flex items-center gap-2"
            >
              {predicting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Phân tích"}
            </button>
          </form>

          {prediction && (
            <div className="mt-8 p-6 bg-slate-50 rounded-2xl border border-slate-100 animate-in slide-in-from-top duration-500">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    "p-3 rounded-full",
                    prediction.sentiment === "positive" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                  )}>
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 font-medium italic">"{review}"</p>
                    <p className="text-xl font-bold text-slate-900 mt-1 uppercase tracking-tight">
                      Kết quả: <span className={prediction.sentiment === "positive" ? "text-green-600" : "text-red-600"}>
                        {prediction.sentiment}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
