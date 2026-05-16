'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  ArrowLeftRight, Loader2, Target, Zap, 
  Database, Activity, TrendingUp, ShieldCheck,
  Search, Filter, ChevronRight
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Cell, Legend
} from 'recharts';

export default function ComparePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    
    const fetchComparison = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/comparison', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setData(res.data);
      } catch (err) {
        console.error("Comparison failed", err);
      } finally {
        setLoading(false);
      }
    };
    fetchComparison();
  }, [user, authLoading, router]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh]">
      <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
      <p className="text-slate-500 font-medium italic">Benchmarking system performance...</p>
    </div>
  );

  const chartData = [
    { name: 'Current Period', positive: data?.current?.positive || 0, negative: data?.current?.negative || 0, neutral: data?.current?.neutral || 0 },
    { name: 'Previous Period', positive: data?.previous?.positive || 0, negative: data?.previous?.negative || 0, neutral: data?.previous?.neutral || 0 },
  ];

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 animate-in fade-in duration-500">
      <div className="mb-12">
        <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Model Compare</h1>
        <p className="text-slate-500 font-medium">Cross-benchmark performance and historical delta analysis.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-12">
        {[
          { label: 'Growth', value: `${(data?.total_growth || 0).toFixed(1)}%`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Positive Delta', value: data?.delta_positive || 0, icon: Zap, color: 'text-brand', bg: 'bg-brand/5' },
          { label: 'Negative Delta', value: data?.delta_negative || 0, icon: ShieldCheck, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Accuracy', value: '94.2%', icon: Target, color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map((item, i) => (
          <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm transition-all hover:shadow-md">
            <div className={clsx("w-12 h-12 rounded-2xl flex items-center justify-center mb-4", item.bg, item.color)}>
              <item.icon className="w-6 h-6" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
            <p className="text-3xl font-black text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-brand/5 blur-[80px]"></div>
        <div className="relative z-10 h-[400px] w-full">
           <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 700}} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 700}} />
              <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 40px -10px rgb(0 0 0 / 0.1)'}} />
              <Legend iconType="circle" />
              <Bar dataKey="positive" fill="#10b981" radius={[8, 8, 0, 0]} />
              <Bar dataKey="negative" fill="#ef4444" radius={[8, 8, 0, 0]} />
              <Bar dataKey="neutral" fill="#6366f1" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
