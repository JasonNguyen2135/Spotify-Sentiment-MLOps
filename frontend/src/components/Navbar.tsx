'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, LayoutDashboard, BarChart3, Settings, ShieldCheck, LogOut, User, History, ArrowLeftRight } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/context/AuthContext';

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Analysis', href: '/analyze', icon: BarChart3 },
    { name: 'Compare', href: '/compare', icon: ArrowLeftRight },
    { name: 'History', href: '/history', icon: History },
  ];

  if (pathname === '/login' || pathname === '/register') return null;

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-2">
            <Activity className="text-brand w-8 h-8" />
            <span className="font-bold text-xl tracking-tight text-gray-900">SentimentAI</span>
          </div>
          
          <div className="flex gap-6 items-center">
            {navItems.map((item) => (
              <Link 
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-1 text-sm font-medium transition-colors",
                  pathname === item.href ? "text-brand" : "text-gray-600 hover:text-brand"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            ))}

            {user?.role === 'admin' && (
              <div className="flex gap-6 border-l pl-6 ml-2">
                {/* Monitoring mở tab mới trỏ thẳng vào NodePort */}
                <a 
                  href="http://localhost:31247" 
                  target="_blank"
                  className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-red-500 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Monitoring
                </a>

                {/* Pipeline mở tab mới trỏ thẳng vào Airflow NodePort */}
                <a 
                  href="http://localhost:31190" 
                  target="_blank"
                  className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-green-500 transition-colors"
                >
                  <BarChart3 className="w-4 h-4" />
                  Pipeline
                </a>

                <Link 
                  href="/admin/connectors"
                  className={clsx(
                    "flex items-center gap-1 text-sm font-medium transition-colors",
                    pathname === '/admin/connectors' ? "text-brand" : "text-gray-600 hover:text-brand"
                  )}
                >
                  <Zap className="w-4 h-4" />
                  Alerts
                </Link>
              </div>
            )}

            <div className="flex items-center gap-4 ml-6 pl-6 border-l">
              {user ? (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <User className="w-4 h-4" />
                    {user.username} 
                    <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded uppercase">{user.role}</span>
                  </div>
                  <button 
                    onClick={logout}
                    className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-all"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <Link href="/login" className="text-sm font-bold text-brand hover:underline">
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
