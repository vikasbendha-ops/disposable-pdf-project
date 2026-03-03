import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, FileText, Link2, Settings, LogOut, Shield, 
  ChevronRight, Users, BarChart3, Menu, X 
} from 'lucide-react';
import { useAuth } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';

const DashboardLayout = ({ children, title, subtitle }) => {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const isAdmin = user?.role === 'admin';

  const mainNavItems = [
    { icon: LayoutDashboard, label: t('dashboard.title'), path: '/dashboard' },
    { icon: FileText, label: t('common.myPdfs'), path: '/pdfs' },
    { icon: Link2, label: t('common.myLinks'), path: '/links' },
    { icon: Settings, label: t('settings.title'), path: '/settings' },
  ];

  const adminNavItems = [
    { icon: BarChart3, label: t('admin.dashboard'), path: '/admin' },
    { icon: Users, label: t('admin.manageUsers'), path: '/admin/users' },
    { icon: Link2, label: t('admin.allLinks'), path: '/admin/links' },
    { icon: Settings, label: t('admin.stripeSettings') || 'Stripe Settings', path: '/admin/settings' },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const NavItem = ({ item }) => {
    const isActive = location.pathname === item.path;
    return (
      <Link
        to={item.path}
        className={cn(
          "flex items-center space-x-3 px-4 py-3 rounded-lg transition-all",
          isActive 
            ? "bg-emerald-900 text-white" 
            : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
        )}
        onClick={() => setSidebarOpen(false)}
        data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
      >
        <item.icon className="w-5 h-5" />
        <span className="font-medium">{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-stone-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-emerald-900 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="font-heading font-bold text-lg">Autodestroy</span>
          </Link>
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-stone-100"
          >
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-stone-200 transform transition-transform duration-300 lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-stone-200">
            <Link to="/dashboard" className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-emerald-900 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="font-heading font-bold text-xl text-stone-900">Autodestroy</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            <div className="mb-6">
              <span className="px-4 text-xs font-semibold text-stone-400 uppercase tracking-wider">Main</span>
              <div className="mt-2 space-y-1">
                {mainNavItems.map((item) => (
                  <NavItem key={item.path} item={item} />
                ))}
              </div>
            </div>

            {isAdmin && (
              <div className="mb-6">
                <span className="px-4 text-xs font-semibold text-stone-400 uppercase tracking-wider">Admin</span>
                <div className="mt-2 space-y-1">
                  {adminNavItems.map((item) => (
                    <NavItem key={item.path} item={item} />
                  ))}
                </div>
              </div>
            )}
          </nav>

          {/* User Section */}
          <div className="p-4 border-t border-stone-200">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <span className="text-emerald-900 font-semibold">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-900 truncate">{user?.name}</p>
                <p className="text-xs text-stone-500 truncate">{user?.email}</p>
              </div>
            </div>
            
            {/* Subscription Status */}
            <div className="mb-4 p-3 bg-stone-50 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-stone-500">Plan</span>
                <span className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded-full",
                  user?.subscription_status === 'active' 
                    ? "bg-emerald-100 text-emerald-800" 
                    : "bg-stone-200 text-stone-600"
                )}>
                  {user?.plan?.toUpperCase() || 'FREE'}
                </span>
              </div>
              {user?.subscription_status !== 'active' && (
                <Link to="/pricing">
                  <Button size="sm" className="w-full mt-2 bg-emerald-900 hover:bg-emerald-800 h-8 text-xs">
                    Upgrade
                    <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center space-x-3 w-full px-4 py-3 text-stone-600 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors"
              data-testid="logout-btn"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">{t('common.signOut')}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="lg:pl-64 pt-16 lg:pt-0">
        {/* Page Header */}
        <header className="bg-white border-b border-stone-200 px-6 py-6">
          <div className="max-w-7xl mx-auto">
            {subtitle && (
              <span className="text-sm font-semibold text-emerald-700 uppercase tracking-wider mb-1 block">
                {subtitle}
              </span>
            )}
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-stone-900">{title}</h1>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
