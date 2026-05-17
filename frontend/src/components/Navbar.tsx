'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Activity, LayoutDashboard, BarChart3, Settings, 
  LogOut, History, ArrowLeftRight,
  Zap
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { activeProject, setActiveProject } = useProject();
  const router = useRouter();

  if (pathname === '/login' || pathname === '/register') return null;

  const handleSwitchProject = () => {
    setActiveProject(null);
    router.push('/');
  };

  return (
    <nav className="bg-white shadow-sm border-b sticky top-0 z-[50]">
      <div className="container mx-auto px-4">
        <div className="flex justify-between h-20 items-center">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 cursor-pointer" onClick={handleSwitchProject}>
              <Activity className="text-brand w-8 h-8" />
              <span className="font-bold text-xl tracking-tight text-gray-900">SentimentAI</span>
            </div>
            
            <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl">
              <div className={clsx("w-2 h-2 rounded-full", activeProject ? "bg-brand animate-pulse" : "bg-slate-300")}></div>
              <span className="text-sm font-bold text-slate-700">{activeProject ? activeProject.name : 'Global View'}</span>
              {activeProject && (
                <button 
                  onClick={handleSwitchProject}
                  className="ml-2 text-[10px] font-black text-brand uppercase hover:underline border-l pl-3 border-slate-200"
                >
                  Back to Hub
                </button>
              )}
            </div>
          </div>
          
          <div className="flex gap-4 items-center">
            {/* Unified Core Navigation */}
            <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-2xl border border-slate-100">
              <Link 
                href="/"
                onClick={() => setActiveProject(null)}
                className={clsx(
                  "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all",
                  pathname === '/' && !activeProject ? "bg-white text-slate-900 shadow-sm shadow-slate-200" : "text-slate-500 hover:text-slate-800"
                )}
              >
                <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
              </Link>

              <Link 
                href="/analyze"
                className={clsx(
                  "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all",
                  pathname === '/analyze' ? "bg-white text-slate-900 shadow-sm shadow-slate-200" : "text-slate-500 hover:text-slate-800"
                )}
              >
                <BarChart3 className="w-3.5 h-3.5" /> Analysis
              </Link>

              <Link 
                href="/compare"
                className={clsx(
                  "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all",
                  pathname === '/compare' ? "bg-white text-slate-900 shadow-sm shadow-slate-200" : "text-slate-500 hover:text-slate-800"
                )}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" /> Compare
              </Link>

              <Link 
                href="/history"
                className={clsx(
                  "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all",
                  pathname === '/history' ? "bg-white text-slate-900 shadow-sm shadow-slate-200" : "text-slate-500 hover:text-slate-800"
                )}
              >
                <History className="w-3.5 h-3.5" /> History
              </Link>

              {['admin', 'ai_engineer'].includes(user?.role || '') && (
                <>
                  <div className="w-px h-4 bg-slate-200 mx-1" />
                  <Link 
                    href="/admin/registry"
                    className={clsx(
                      "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all",
                      pathname === '/admin/registry' ? "bg-brand text-white shadow-lg shadow-brand/20" : "text-slate-500 hover:text-brand"
                    )}
                  >
                    <Settings className="w-3.5 h-3.5" /> Model Hub
                  </Link>
                  <Link 
                    href="/admin/training"
                    className={clsx(
                      "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all",
                      pathname === '/admin/training' ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-slate-500 hover:text-emerald-500"
                    )}
                  >
                    <Zap className="w-3.5 h-3.5" /> Training
                  </Link>
                </>
              )}
            </div>

            <div className="flex items-center gap-4 ml-4 pl-4 border-l">
              {user ? (
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end">
                    <p className="text-xs font-black text-gray-900 uppercase tracking-tight">{user.username}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{user.role}</p>
                  </div>
                  <button 
                    onClick={logout}
                    className="p-2.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all border border-slate-100"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <Link href="/login" className="bg-brand text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-brand/20 hover:opacity-90 transition-all">
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
