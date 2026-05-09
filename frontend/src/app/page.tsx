'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  FolderPlus, LayoutGrid, ArrowRight, Plus, 
  Loader2, Search, Calendar, ChevronRight,
  Database, Activity, Zap, FileText, ArrowLeftRight,
  Send, CheckCircle2, ShieldAlert
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import Link from 'next/link';

export default function ProjectsLanding() {
  const { user, loading: authLoading } = useAuth();
  const { setActiveProject } = useProject();
  const router = useRouter();
  
  // Project States
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [creating, setSubmitting] = useState(false);

  // Ad-hoc Analysis States
  const [review, setReview] = useState('');
  const [prediction, setPrediction] = useState<any>(null);
  const [predicting, setPredicting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    const fetchProjects = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/projects', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setProjects(res.data);
      } catch (err) {
        console.error("Failed to fetch projects", err);
      } finally {
        setLoading(false);
      }
    };

    if (user) fetchProjects();
  }, [user, authLoading, router]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/projects', null, {
        params: { name, description: desc },
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setProjects([...projects, res.data]);
      setShowCreate(false);
      setName(''); setDesc('');
    } catch (err) {
      alert("Failed to create project");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePredict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!review.trim()) return;
    setPredicting(true);
    setPrediction(null);
    try {
      const token = localStorage.getItem('token');
      // Ad-hoc on landing page doesn't save to project
      const response = await axios.post(`/api/predict`, null, {
          params: { review_text: review, project_id: projects[0]?.id }, // Default to first project if available
          headers: { 'Authorization': `Bearer ${token}` }
      });
      setPrediction(response.data);
    } catch (err) {
      console.error("Prediction failed", err);
    } finally {
      setPredicting(false);
    }
  };

  const enterProject = (project: any) => {
    setActiveProject(project);
    router.push('/dashboard');
  };

  if (authLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-slate-500 font-medium italic">Preparing your workspace...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-12 animate-in fade-in duration-700">
      {/* Welcome Header */}
      <div className="mb-12">
        <h1 className="text-5xl font-black text-slate-900 tracking-tight mb-3">
          Universal <span className="text-brand">Toolkit</span>
        </h1>
        <p className="text-slate-500 text-xl font-medium">Access powerful sentiment intelligence tools or enter a workspace.</p>
      </div>

      {/* Global Tools Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
        {/* Ad-hoc Analysis */}
        <div className="lg:col-span-2 bg-slate-900 p-10 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col justify-center">
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-brand opacity-20 blur-[100px]"></div>
          <div className="relative z-10">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <Zap className="text-brand w-6 h-6 fill-brand" /> Instant Intelligence
            </h2>
            <form onSubmit={handlePredict} className="relative mb-6">
              <input 
                type="text"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="Paste any feedback for immediate scoring..."
                className="w-full pl-6 pr-32 py-5 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-brand text-white transition-all placeholder:text-slate-500"
              />
              <button 
                type="submit"
                disabled={predicting || !review.trim()}
                className="absolute right-2 top-2 bottom-2 bg-brand text-white px-6 rounded-xl font-bold hover:opacity-90 disabled:bg-slate-700 transition-all"
              >
                {predicting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Score"}
              </button>
            </form>

            {prediction && (
              <div className="p-5 bg-white/5 rounded-2xl border border-white/10 animate-in slide-in-from-top flex items-center gap-4">
                <div className={clsx(
                  "p-3 rounded-full",
                  prediction.sentiment === "positive" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                )}>
                  {prediction.sentiment === "positive" ? <CheckCircle2 className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Sentiment Result</p>
                  <p className="text-2xl font-black text-white uppercase tracking-tight">{prediction.sentiment}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <Link href="/analyze" className="block group">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-brand/20 transition-all">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900">Bulk Analysis</h3>
              <p className="text-xs text-slate-500 mt-1">Upload CSV for massive-scale labeling.</p>
            </div>
          </Link>
          <Link href="/compare" className="block group">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-brand/20 transition-all">
              <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <ArrowLeftRight className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900">Model Compare</h3>
              <p className="text-xs text-slate-500 mt-1">Benchmark datasets side-by-side.</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Projects Section */}
      <div className="flex justify-between items-center mb-8 px-2">
        <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
          <LayoutGrid className="text-brand w-8 h-8" /> Active Workspaces
        </h2>
        <button 
          onClick={() => setShowCreate(true)}
          className="text-brand font-black text-sm uppercase tracking-widest flex items-center gap-2 hover:underline"
        >
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {projects.map((p) => (
          <div 
            key={p.id}
            onClick={() => enterProject(p)}
            className="group bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:scale-[1.02] transition-all cursor-pointer relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-brand opacity-0 group-hover:opacity-5 blur-[60px] transition-opacity"></div>
            <div className="w-14 h-14 bg-brand/5 rounded-2xl flex items-center justify-center text-brand mb-6 group-hover:bg-brand group-hover:text-white transition-colors">
              <FolderPlus className="w-7 h-7" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">{p.name}</h3>
            <p className="text-slate-500 text-sm mb-8 line-clamp-2 font-medium">
              {p.description || "Monitoring workspace for live application sentiment tracking."}
            </p>
            <div className="flex items-center justify-between pt-6 border-t border-slate-50">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(p.created_at).toLocaleDateString()}
              </div>
              <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                <ArrowRight className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {projects.length === 0 && (
        <div className="text-center py-20 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
          <p className="text-slate-400 italic">Create a project to start live application monitoring.</p>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl relative overflow-hidden">
            <h2 className="text-3xl font-black text-slate-900 mb-2">New Workspace</h2>
            <p className="text-slate-500 mb-8 font-medium">Create a dedicated project for live app tracking.</p>
            <form onSubmit={handleCreate} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Project Name</label>
                <input 
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Mobile App Monitoring"
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-brand font-bold"
                  required
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 font-black text-xs uppercase tracking-widest text-slate-400">Cancel</button>
                <button type="submit" disabled={creating} className="flex-[2] bg-slate-900 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
