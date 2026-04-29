import { Activity, Users, Database, Zap } from 'lucide-react';

export default function Home() {
  const stats = [
    { name: 'Model Version', value: 'v1.2.0', icon: Zap, color: 'text-yellow-500' },
    { name: 'Total Predictions', value: '14,205', icon: Activity, color: 'text-blue-500' },
    { name: 'Dataset Size', value: '1.2 GB', icon: Database, color: 'text-spotify' },
    { name: 'Active Users', value: '24', icon: Users, color: 'text-purple-500' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">MLOps System Overview</h1>
        <p className="text-gray-500">Welcome back, Admin. Here is what's happening today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((item) => (
          <div key={item.name} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className={item.color}>
                <item.icon className="w-6 h-6" />
              </div>
              <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">+12%</span>
            </div>
            <h3 className="text-gray-500 text-sm font-medium">{item.name}</h3>
            <p className="text-2xl font-bold text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 bg-spotify/10 p-8 rounded-2xl border border-spotify/20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold text-spotify mb-4">🚀 New Training Pipeline</h2>
          <p className="text-gray-700 mb-6">
            Our sentiment analysis model has been improved with a new dataset of 50k Vietnamese reviews. 
            You can trigger a manual retraining in the Pipeline section.
          </p>
          <button className="bg-spotify text-white px-6 py-2 rounded-lg font-semibold hover:bg-opacity-90 transition-all">
            View Release Notes
          </button>
        </div>
      </div>
    </div>
  )
}
