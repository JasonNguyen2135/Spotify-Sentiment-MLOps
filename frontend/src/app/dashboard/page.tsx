'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { 
  Activity, Loader2, Download, TrendingUp, Sparkles, MessageSquare,
  ArrowUpRight, ArrowDownRight, Target, Zap, Database, Users
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { 
  XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar, 
  Cell, PieChart, Pie, Legend, AreaChart, Area,
  ScatterChart, Scatter, ZAxis
} from 'recharts';

export default function Home() {
  const { user } = useAuth();
  const { activeProject } = useProject();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [topIssues, setTopIssues] = useState<any[]>([]);
  const [versionData, setVersionData] = useState<any[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [ratingDist, setRatingDist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeProject) {
      router.push('/');
      return;
    }

    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        const params = { project_id: activeProject.id };
        
        const [statsRes, analyticsRes, issuesRes, versionRes, heatmapRes, ratingRes] = await Promise.all([
          axios.get('/api/stats', { headers, params }),
          axios.get('/api/monthly-analytics', { headers, params }),
          axios.get('/api/analytics/top-issues', { headers, params }),
          axios.get('/api/analytics/version-sentiment', { headers, params }),
          axios.get('/api/analytics/heatmap', { headers, params }),
          axios.get('/api/analytics/rating-distribution', { headers, params })
        ]);
        
        setStats(statsRes.data);
        setMonthlyData(analyticsRes.data);
        setTopIssues(issuesRes.data || []);
        setVersionData(versionRes.data || []);
        setHeatmapData(heatmapRes.data || []);
        setRatingDist(ratingRes.data || []);
      } catch (err) {
        console.error("Failed to fetch dashboard data", err);
      } finally {
        setLoading(false);
      }
    };
    
    if (user && activeProject) {
      fetchData();
    }
  }, [user, activeProject, router]);

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
    { name: 'Positive', value: (monthlyData || []).reduce((acc, curr) => acc + (curr?.positive || 0), 0), color: '#10b981' },
    { name: 'Negative', value: (monthlyData || []).reduce((acc, curr) => acc + (curr?.negative || 0), 0), color: '#ef4444' },
    { name: 'Neutral', value: (monthlyData || []).reduce((acc, curr) => acc + (curr?.neutral || 0), 0), color: '#6366f1' },
  ].filter(d => d.value > 0);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const formattedHeatmap = heatmapData.map(d => ({
    ...d,
    dayName: days[d.day]
  }));

  return (
    <div className="animate-in fade-in duration-700 pb-20 print:p-0">
      {/* Header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">
            Project Dashboard
          </h1>
          <p className="text-slate-500 text-lg">
            Deep sentiment analysis for {activeProject?.name}.
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handlePrintReport}
            className="bg-white px-5 py-2.5 rounded-xl border border-slate-200 font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
          >
            <Download className="w-4 h-4" /> Export Report
          </button>
          <div className="bg-slate-900 px-5 py-2.5 rounded-xl font-bold text-sm text-white flex items-center gap-2 shadow-lg shadow-slate-200">
            <Activity className="w-4 h-4 text-emerald-400" /> Live Feed
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
                  {(comparison?.total_growth || 0) >= 0 ? <ArrowUpRight className="text-emerald-400 w-6 h-6" /> : <ArrowDownRight className="text-red-400 w-6 h-6" />}
                  {Math.abs(comparison?.total_growth || 0).toFixed(1)}%
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Positivity Shift</p>
                <p className={clsx(
                  "text-3xl font-black flex items-center justify-center gap-2",
                  (comparison?.delta_positive || 0) >= 0 ? "text-emerald-400" : "text-red-400"
                )}>
                  {(comparison?.delta_positive || 0) >= 0 ? "+" : ""}{comparison?.delta_positive || 0}
                </p>
              </div>
            </div>

            <div className="max-w-xs bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
              <p className="text-xs text-slate-300 leading-relaxed italic italic">
                "User sentiment is trending <strong>{(comparison?.delta_positive || 0) >= 0 ? 'upwards' : 'downwards'}</strong> this month. Primary drivers include increased engagement in key features."
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {/* Main Chart: Historical Trends */}
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
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} />
                <Tooltip contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} />
                <Area type="monotone" dataKey="positive" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorPos)" />
                <Area type="monotone" dataKey="negative" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorNeg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sentiment Distribution Pie Chart */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Sentiment Split</h2>
          <p className="text-sm text-slate-400 mb-8">Overall proportion of user feelings</p>
          
          <div className="flex-1 h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sentimentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {sentimentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-50 text-center">
            <p className="text-sm font-bold text-slate-900">Total Analyzed</p>
            <p className="text-2xl font-black text-brand mt-1">
              {sentimentData.reduce((acc, curr) => acc + curr.value, 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {/* Rating Distribution */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Rating Distribution</h2>
          <p className="text-sm text-slate-400 mb-8">Spread of star ratings (1-5)</p>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ratingDist}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="rating" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} label={{ value: 'Stars', position: 'insideBottom', offset: -5 }} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                <Tooltip cursor={{fill: '#f8fafc'}} />
                <Bar dataKey="count" fill="#fbbf24" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Negative Issues */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Top Negative Issues</h2>
          <p className="text-sm text-slate-400 mb-8">AI-identified common complaints</p>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={topIssues} margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="word" type="category" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 11, fontWeight: 700}} />
                <Tooltip />
                <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {/* Sentiment by Version */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Sentiment by Version</h2>
          <p className="text-sm text-slate-400 mb-8">Positivity rate per app release</p>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={versionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="version" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} unit="%" />
                <Tooltip />
                <Bar dataKey="positive_rate" fill="#10b981" radius={[4, 4, 0, 0]} name="Positive %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Engagement Heatmap */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Comment Heatmap</h2>
          <p className="text-sm text-slate-400 mb-8">Activity density by day and hour</p>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" dataKey="hour" name="Hour" unit="h" domain={[0, 23]} axisLine={false} tickLine={false} />
                <YAxis type="number" dataKey="day" name="Day" domain={[0, 6]} ticks={[0, 1, 2, 3, 4, 5, 6]} tickFormatter={(val) => days[val]} axisLine={false} tickLine={false} />
                <ZAxis type="number" dataKey="value" range={[50, 400]} name="Comments" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="Activity" data={heatmapData} fill="#6366f1" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
