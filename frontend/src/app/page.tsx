'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { 
  Activity, Users, Database, Zap, Loader2, Send, 
  CheckCircle2, ShieldAlert, Target, TrendingUp, 
  BarChart3, PieChart as PieChartIcon, ArrowUpRight, 
  ArrowDownRight, Info, Download, Calendar, Sparkles,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { clsx } from 'clsx';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar, 
  Cell, PieChart, Pie, Legend, AreaChart, Area
} from 'recharts';

export default function Home() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [comparison, setComparison] = useState<any>(null);
  const [keywords, setKeywords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState('');
  const [prediction, setPrediction] = useState<any>(null);
  const [predicting, setPredicting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        
        const [statsRes, analyticsRes, compRes, keywordsRes] = await Promise.all([
          axios.get('/api/stats', { headers }),
          axios.get('/api/monthly-analytics', { headers }),
          axios.get('/api/comparison', { headers }),
          axios.get('/api/word-cloud', { headers })
        ]);
        
        setStats(statsRes.data);
        setMonthlyData(analyticsRes.data);
        setComparison(compRes.data);
        setKeywords(keywordsRes.data);
      } catch (err) {
        console.error("Failed to fetch dashboard data", err);
      } finally {
        setLoading(false);
      }
    };
    
    if (user) {
      fetchData();
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

  const handlePrintReport = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-gray-500 font-medium italic">Assembling intelligence dashboard...</p>
      </div>
    );
  }

  const sentimentData = [
    { name: 'Positive', value: monthlyData.reduce((acc, curr) => acc + (curr.positive || 0), 0), color: '#10b981' },
    { name: 'Negative', value: monthlyData.reduce((acc, curr) => acc + (curr.negative || 0), 0), color: '#ef4444' },
    { name: 'Neutral', value: monthlyData.reduce((acc, curr) => acc + (curr.neutral || 0), 0), color: '#6366f1' },
  ].filter(d => d.value > 0);

  return (
    <div className="animate-in fade-in duration-700 pb-20 print:p-0">
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">
            Intelligence<span className="text-brand">Center</span>
          </h1>
          <p className="text-slate-500 text-lg">Real-time user sentiment analysis & behavioral insights.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handlePrintReport}
            className="bg-white px-5 py-2.5 rounded-xl border border-slate-200 font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
          >
            <Download className="w-4 h-4" /> Export Report
          </button>
          <div className="bg-slate-900 px-5 py-2.5 rounded-xl font-bold text-sm text-white flex items-center gap-2 shadow-lg shadow-slate-200">
            <Calendar className="w-4 h-4" /> Last 30 Days
          </div>
        </div>
      </div>

      {/* MoM Performance Banner */}
      {comparison && (
        <div className="mb-10 bg-gradient-to-r from-slate-900 to-slate-800 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-brand opacity-10 blur-[120px] group-hover:opacity-20 transition-opacity"></div>
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
                <Sparkles className="w-8 h-8 text-brand" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white">Monthly Comparison</h2>
                <p className="text-slate-400 font-medium">Performance vs. previous 30-day window</p>
              </div>
            </div>
            
            <div className="flex gap-10">
              <div className="text-center">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Total Volume</p>
                <p className="text-3xl font-black text-white flex items-center justify-center gap-2">
                  {comparison.total_growth >= 0 ? <ArrowUpRight className="text-emerald-400 w-6 h-6" /> : <ArrowDownRight className="text-red-400 w-6 h-6" />}
                  {Math.abs(comparison.total_growth).toFixed(1)}%
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Positivity Shift</p>
                <p className={clsx(
                  "text-3xl font-black flex items-center justify-center gap-2",
                  comparison.delta_positive >= 0 ? "text-emerald-400" : "text-red-400"
                )}>
                  {comparison.delta_positive >= 0 ? "+" : ""}{comparison.delta_positive}
                </p>
              </div>
            </div>

            <div className="max-w-xs bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
              <p className="text-xs text-slate-300 leading-relaxed italic">
                "User sentiment is trending <strong>{comparison.delta_positive >= 0 ? 'upwards' : 'downwards'}</strong> this month. Primary drivers include increased engagement in key features."
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          { name: 'Model Accuracy', value: stats?.accuracy || '94.2%', icon: Target, trend: '+0.5%', up: true, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { name: 'Total Predictions', value: stats?.total_predictions?.toLocaleString() || '0', icon: Activity, trend: '+12%', up: true, color: 'text-blue-600', bg: 'bg-blue-50' },
          { name: 'System Drift', value: stats?.drift_score || '0.2%', icon: Zap, trend: '-0.1%', up: false, color: 'text-amber-600', bg: 'bg-amber-50' },
          { name: 'Active Analysts', value: stats?.active_users || '1', icon: Users, trend: '+2', up: true, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((item) => (
          <div key={item.name} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md group">
            <div className="flex justify-between items-start mb-4">
              <div className={`${item.bg} ${item.color} p-3 rounded-2xl`}>
                <item.icon className="w-6 h-6" />
              </div>
              <div className={clsx(
                "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg",
                item.up ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
              )}>
                {item.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {item.trend}
              </div>
            </div>
            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">{item.name}</h3>
            <p className="text-3xl font-black text-slate-900 mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Historical Trends</h2>
              <p className="text-sm text-slate-400">Longitudinal sentiment distribution</p>
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Positive</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> Negative</div>
              </div>
            </div>
          </div>
          
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 11}}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 11}}
                />
                <Tooltip 
                  contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}}
                />
                <Area type="monotone" dataKey="positive" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorPos)" />
                <Area type="monotone" dataKey="negative" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorNeg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Aspect Analysis (Keywords) */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Topic Analysis</h2>
          <p className="text-sm text-slate-400 mb-8">Frequent keywords in user feedback</p>
          
          <div className="flex-1 flex flex-wrap gap-2 content-start">
            {keywords.length > 0 ? keywords.map((word, i) => (
              <span 
                key={i} 
                className="px-3 py-1.5 bg-slate-50 text-slate-600 rounded-xl text-xs font-bold hover:bg-brand hover:text-white transition-all cursor-default"
                style={{ fontSize: Math.max(10, Math.min(20, 10 + word.value / 2)) }}
              >
                {word.text}
              </span>
            )) : (
              <div className="w-full h-full flex items-center justify-center text-slate-300 italic text-sm">
                Insufficient data for topic mapping
              </div>
            )}
          </div>

          <div className="mt-8 pt-8 border-t border-slate-50">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Sentiment Split</h4>
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
              {sentimentData.map((item, i) => (
                <div 
                  key={i} 
                  style={{ 
                    width: `${(item.value / sentimentData.reduce((a,b) => a+b.value, 0)) * 100}%`,
                    backgroundColor: item.color 
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-3 text-[10px] font-bold text-slate-500 uppercase">
              <span>Pos: {((sentimentData.find(d => d.name === 'Positive')?.value || 0) / sentimentData.reduce((a,b) => a+b.value, 0) * 100).toFixed(0)}%</span>
              <span>Neg: {((sentimentData.find(d => d.name === 'Negative')?.value || 0) / sentimentData.reduce((a,b) => a+b.value, 0) * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Instant Analysis */}
        <div className="bg-slate-900 p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-brand opacity-20 blur-[100px]"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-brand/20 p-2 rounded-lg text-brand">
                <Send className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-bold text-white">Ad-hoc Analysis</h2>
            </div>
            
            <form onSubmit={handlePredict} className="relative mb-8">
              <input 
                type="text"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="Paste user comment for instant scoring..."
                className="w-full pl-6 pr-32 py-5 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-brand text-white transition-all placeholder:text-slate-500"
              />
              <button 
                type="submit"
                disabled={predicting || !review.trim()}
                className="absolute right-2 top-2 bottom-2 bg-brand text-white px-6 rounded-xl font-bold hover:opacity-90 disabled:bg-slate-700 transition-all flex items-center gap-2"
              >
                {predicting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Score"}
              </button>
            </form>

            {prediction && (
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10 animate-in slide-in-from-top duration-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={clsx(
                      "p-3 rounded-full",
                      prediction.sentiment === "positive" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                    )}>
                      {prediction.sentiment === "positive" ? <CheckCircle2 className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Predicted Sentiment</p>
                      <p className="text-2xl font-black text-white mt-1 uppercase tracking-tight">
                        {prediction.sentiment}
                      </p>
                    </div>
                  </div>
                  <button className="text-[10px] font-black text-slate-500 uppercase border border-white/10 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                    Report Error
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actionable Intelligence */}
        <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-brand/10 p-2 rounded-lg text-brand">
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Smart Recommendations</h2>
          </div>
          
          <div className="space-y-6">
            <div className="flex gap-4 p-5 bg-slate-50 rounded-3xl border border-slate-100">
              <div className="w-10 h-10 bg-white rounded-2xl flex-shrink-0 flex items-center justify-center shadow-sm">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Optimization Opportunity</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Negative sentiment around "performance" decreased by 15%. Recommend highlighting speed improvements in next update.
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-5 bg-slate-50 rounded-3xl border border-slate-100">
              <div className="w-10 h-10 bg-white rounded-2xl flex-shrink-0 flex items-center justify-center shadow-sm">
                <MessageSquare className="w-5 h-5 text-brand" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Feedback Loop Active</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  24 corrections were submitted this week. Model retraining is advised to align with evolving user vocabulary.
                </p>
              </div>
            </div>

            <button className="w-full py-5 bg-brand text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-brand/20">
              Generate Detailed AI Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
