import { Activity, Users, Database, Zap } from 'lucide-react';

export default function Home() {
  const stats = [
    { name: 'Model Version', value: 'v1.2.0', icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-50' },
    { name: 'Total Predictions', value: '14,205', icon: Activity, color: 'text-blue-500', bg: 'bg-blue-50' },
    { name: 'Dataset Size', value: '1.2 GB', icon: Database, color: 'text-green-500', bg: 'bg-green-50' },
    { name: 'Active Users', value: '24', icon: Users, color: 'text-purple-500', bg: 'bg-purple-50' },
  ];

  return (
    <div className="animate-in fade-in duration-700">
      <div className="mb-10 text-center md:text-left">
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
          Spotify <span className="text-spotify">MLOps</span> Dashboard
        </h1>
        <p className="text-slate-500 text-lg">Hệ thống phân tích cảm xúc bình luận thời gian thực.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((item) => (
          <div key={item.name} className="bg-white p-6 rounded-2xl border border-slate-100 hover-card">
            <div className="flex items-center justify-between mb-4">
              <div className={`${item.bg} ${item.color} p-3 rounded-xl`}>
                <item.icon className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-lg">LIVE</span>
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
  )
}
