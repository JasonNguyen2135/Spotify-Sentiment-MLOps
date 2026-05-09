'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Activity, LayoutDashboard, BarChart3, Settings, 
  ShieldCheck, LogOut, User, History, ArrowLeftRight,
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

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Analysis', href: '/analyze', icon: BarChart3 },
    { name: 'Compare', href: '/compare', icon: ArrowLeftRight },
    { name: 'History', href: '/history', icon: History },
  ];

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
            
            {activeProject && (
              <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl">
                <div className="w-2 h-2 bg-brand rounded-full animate-pulse"></div>
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Project:</span>
                <span className="text-sm font-bold text-slate-700">{activeProject.name}</span>
                <button 
                  onClick={handleSwitchProject}
                  className="ml-2 text-[10px] font-black text-brand uppercase hover:underline"
                >
                  Switch
                </button>
              </div>
            )}
          </div>
          
          <div className="flex gap-6 items-center">
            {activeProject && navItems.map((item) => (
              <Link 
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-1.5 text-sm font-bold transition-all px-3 py-2 rounded-xl",
                  pathname === item.href ? "text-brand bg-brand/5" : "text-gray-500 hover:text-brand hover:bg-slate-50"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            ))}

            {user?.role === 'admin' && activeProject && (
              <div className="flex gap-4 border-l pl-4">
                <Link 
                  href="/admin/connectors"
                  className={clsx(
                    "flex items-center gap-1.5 text-sm font-bold transition-all px-3 py-2 rounded-xl",
                    pathname === '/admin/connectors' ? "text-brand bg-brand/5" : "text-gray-500 hover:text-brand hover:bg-slate-50"
                  )}
                >
                  <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                  Alerts
                </Link>

                <Link 
                  href="/admin/pipeline"
                  className={clsx(
                    "flex items-center gap-1.5 text-sm font-bold transition-all px-3 py-2 rounded-xl",
                    pathname === '/admin/pipeline' ? "text-brand bg-brand/5" : "text-gray-500 hover:text-brand hover:bg-slate-50"
                  )}
                >
                  <Settings className="w-4 h-4" />
                  Control
                </Link>
              </div>
            )}

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
