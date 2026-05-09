'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { History as HistoryIcon, Search, Calendar, Filter, Loader2, MessageSquare, Clock } from 'lucide-react';
import { clsx } from 'clsx';

export default function HistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('/api/user-history', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setHistory(response.data);
      } catch (err) {
        console.error("Failed to fetch history", err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  const filteredHistory = history.filter(item => 
    item.text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-gray-500 font-medium italic">Retrieving your analysis archive...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-20 px-4 animate-in fade-in duration-700">
      <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">
            Analysis <span className="text-brand">History</span>
          </h1>
          <p className="text-gray-500 mt-2">Access and search your previously analyzed feedback records.</p>
        </div>
        
        <div className="relative group min-w-[300px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-brand transition-colors" />
          <input 
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search through records..."
            className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-brand shadow-sm transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredHistory.map((item, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4 flex-1">
              <div className={clsx(
                "p-3 rounded-2xl flex-shrink-0",
                item.sentiment === 'positive' ? 'bg-emerald-50 text-emerald-600' : 
                item.sentiment === 'negative' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
              )}>
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-800 font-medium leading-relaxed mb-2">"{item.text}"</p>
                <div className="flex items-center gap-4">
                  <span className={clsx(
                    "px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                    item.sentiment === 'positive' ? 'bg-emerald-100 text-emerald-700' : 
                    item.sentiment === 'negative' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                  )}>
                    {item.sentiment}
                  </span>
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase">
                    <Clock className="w-3 h-3" />
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
            <div className="md:opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="text-brand font-black text-xs uppercase tracking-widest hover:underline">Re-analyze</button>
            </div>
          </div>
        ))}
        
        {filteredHistory.length === 0 && (
          <div className="text-center py-20 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
            <HistoryIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-bold">No matching records found in your history.</p>
          </div>
        )}
      </div>
    </div>
  );
}
