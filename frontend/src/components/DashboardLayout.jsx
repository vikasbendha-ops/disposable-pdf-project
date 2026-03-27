import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Link2, Settings, LogOut, Shield,
  ChevronRight, Users, BarChart3, Menu, X, ClipboardList
} from 'lucide-react';
import { useAuth, useBranding, useSubscriptionPlans } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { cn } from '../lib/utils';

const DashboardNavLink = React.memo(function DashboardNavLink({
  icon: Icon,
  label,
  path,
  isActive,
  onNavigate,
}) {
  return (
    <Link
      to={path}
      className={cn(
        "flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors",
        isActive
          ? "bg-emerald-900 text-white"
          : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
      )}
      onClick={onNavigate}
      data-testid={`nav-${String(label || '').toLowerCase().replace(/\s/g, '-')}`}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
    </Link>
  );
});

const DashboardLayout = ({ children, title, subtitle }) => {
  const { user, logout, workspaces, activeWorkspace, activeWorkspaceId, switchWorkspace } = useAuth();
  const { branding } = useBranding();
  const { plans } = useSubscriptionPlans();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isAdminRoute = location.pathname.startsWith('/admin');
  const brandName = branding?.app_name || 'Autodestroy';
  const effectivePlanId =
    !isAdminRoute && activeWorkspace?.plan
      ? activeWorkspace.plan
      : user?.plan;
  const effectiveSubscriptionStatus =
    !isAdminRoute && activeWorkspace?.subscription_status
      ? activeWorkspace.subscription_status
      : user?.subscription_status;
  const currentPlanLabel =
    effectivePlanId && plans?.[effectivePlanId]?.name
      ? plans[effectivePlanId].name
      : (effectivePlanId?.toUpperCase() || 'FREE');
  const currentPlanBadgeLabel = String(currentPlanLabel || 'FREE').trim();
  const accountDisplayName = user?.name?.trim() || user?.email || t('common.na');
  const translateWorkspaceRole = React.useCallback((role, fallbackLabel) => {
    if (role === 'owner') return t('workspaceTeam.roleOwner');
    if (role === 'admin') return t('workspaceTeam.roleAdmin');
    if (role === 'member') return t('workspaceTeam.roleMember');
    return fallbackLabel || t('workspaceTeam.roleMember');
  }, [t]);

  const mainNavItems = React.useMemo(() => [
    { icon: LayoutDashboard, label: t('dashboard.title'), path: '/dashboard' },
    { icon: FileText, label: t('common.myPdfs'), path: '/pdfs' },
    { icon: Settings, label: t('settings.title'), path: '/settings' },
  ], [t]);

  const adminNavItems = React.useMemo(() => [
    { icon: BarChart3, label: t('admin.dashboard'), path: '/admin' },
    { icon: Users, label: t('admin.manageUsers'), path: '/admin/users' },
    { icon: Link2, label: t('admin.allLinks'), path: '/admin/links' },
    { icon: ClipboardList, label: t('adminAudit.title'), path: '/admin/audit-events' },
    { icon: Settings, label: t('admin.platformSettings'), path: '/admin/settings' },
  ], [t]);

  const handleLogout = React.useCallback(async () => {
    await logout();
    navigate('/');
  }, [logout, navigate]);

  const handleNavClick = React.useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-stone-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--brand-primary-color)' }}>
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="font-heading font-bold text-lg">{brandName}</span>
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
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--brand-primary-color)' }}>
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="font-heading font-bold text-xl text-stone-900">{brandName}</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            <div className="mb-6">
              <span className="px-4 text-xs font-semibold text-stone-400 uppercase tracking-wider">{t('dashboardLayout.mainSection')}</span>
              <div className="mt-2 space-y-1">
                {mainNavItems.map((item) => (
                  <DashboardNavLink
                    key={item.path}
                    icon={item.icon}
                    label={item.label}
                    path={item.path}
                    isActive={location.pathname === item.path}
                    onNavigate={handleNavClick}
                  />
                ))}
              </div>
            </div>

            {isAdmin && (
              <div className="mb-6">
                <span className="px-4 text-xs font-semibold text-stone-400 uppercase tracking-wider">{t('dashboardLayout.adminSection')}</span>
                <div className="mt-2 space-y-1">
                  {adminNavItems.map((item) => (
                    <DashboardNavLink
                      key={item.path}
                      icon={item.icon}
                      label={item.label}
                      path={item.path}
                      isActive={location.pathname === item.path}
                      onNavigate={handleNavClick}
                    />
                  ))}
                </div>
              </div>
            )}
          </nav>

          {/* User Section */}
          <div className="p-4 border-t border-stone-200">
            <div className="mb-4 rounded-2xl border border-stone-200 bg-stone-50/80 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <span className="text-sm font-semibold text-emerald-900">
                    {accountDisplayName.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-stone-900">
                    {accountDisplayName}
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    {user?.email}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-2 border-t border-stone-200 pt-3">
                {!isAdminRoute && activeWorkspace && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                        {t('dashboardLayout.workspaceLabel')}
                      </p>
                      <span className="text-[11px] text-stone-500">
                        {translateWorkspaceRole(activeWorkspace.role, activeWorkspace.role_label)}
                      </span>
                    </div>
                    {workspaces.length > 1 ? (
                      <Select value={activeWorkspaceId || activeWorkspace.workspace_id} onValueChange={switchWorkspace}>
                        <SelectTrigger className="h-9 rounded-xl border-stone-200 bg-white text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {workspaces.map((workspace) => (
                            <SelectItem key={workspace.workspace_id} value={workspace.workspace_id}>
                              {workspace.label} ({translateWorkspaceRole(workspace.role, workspace.role_label)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="truncate text-sm font-medium text-stone-900">
                        {activeWorkspace.label}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                      {t('settings.plan')}
                    </p>
                    <p className="truncate text-sm font-medium text-stone-900">
                      {currentPlanBadgeLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-stone-500">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        effectiveSubscriptionStatus === 'active' ? "bg-emerald-500" : "bg-stone-400",
                      )}
                    />
                    <span>
                      {effectiveSubscriptionStatus === 'active' ? t('settings.statusActive') : t('settings.statusInactive')}
                    </span>
                  </div>
                </div>

                {effectiveSubscriptionStatus !== 'active' && (
                  <Link to="/pricing" className="block pt-1">
                    <Button size="sm" className="h-8 w-full rounded-xl bg-emerald-900 text-xs hover:bg-emerald-800">
                      {t('settings.upgrade')}
                      <ChevronRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="flex w-full items-center space-x-3 rounded-xl px-4 py-3 text-sm text-stone-600 transition-colors hover:bg-red-50 hover:text-red-700"
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
