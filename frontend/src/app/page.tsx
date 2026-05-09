'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  FolderPlus, LayoutGrid, ArrowRight, Plus, 
  Loader2, Search, Calendar, ChevronRight,
  Database, Activity
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';

export default function ProjectsLanding() {
  const { user, loading: authLoading } = useAuth();
  const { setActiveProject } = useProject();
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [creating, setSubmitting] = useState(false);

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
      <div className="flex justify-between items-end mb-12">
        <div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tight mb-3">
            Welcome back, <span className="text-brand">{user?.username}</span>
          </h1>
          <p className="text-slate-500 text-xl font-medium">Select a project to start analyzing sentiment patterns.</p>
        </div>
        <button 
          onClick={() => setShowCreate(true)}
          className="bg-brand text-white px-6 py-4 rounded-[1.5rem] font-black text-sm uppercase tracking-widest hover:opacity-90 transition-all flex items-center gap-3 shadow-xl shadow-brand/20"
        >
          <Plus className="w-5 h-5" /> New Project
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
              {p.description || "No description provided for this workspace."}
            </p>

            <div className="flex items-center justify-between pt-6 border-t border-slate-50">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(p.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                <ArrowRight className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {projects.length === 0 && (
        <div className="text-center py-32 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm text-slate-300">
            <LayoutGrid className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-slate-400 mb-2">No Projects Found</h2>
          <p className="text-slate-400 max-w-xs mx-auto italic">Get started by creating your first analysis project above.</p>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-brand opacity-5 blur-[80px]"></div>
            
            <h2 className="text-3xl font-black text-slate-900 mb-2 relative z-10">New Project</h2>
            <p className="text-slate-500 mb-8 font-medium relative z-10">Define your workspace for targeted intelligence.</p>
            
            <form onSubmit={handleCreate} className="space-y-6 relative z-10">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Project Name</label>
                <input 
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Spotify Feedback Analysis"
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-brand font-bold text-slate-900 transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Description (Optional)</label>
                <textarea 
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="What is this project focusing on?"
                  rows={3}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-brand font-bold text-slate-900 transition-all resize-none"
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={creating}
                  className="flex-[2] bg-slate-900 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                  Create Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
