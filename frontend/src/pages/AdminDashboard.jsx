import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  CircleDollarSign,
  Eye,
  FileText,
  HardDrive,
  Link2,
  Receipt,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { api } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';

const REPORT_RANGE_OPTIONS = ['7d', '30d', '90d', '365d', 'all'];
const DASHBOARD_TABS = ['overview', 'revenue', 'subscriptions', 'refunds'];

const AdminDashboard = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const loadFailedRef = useRef('Failed to load dashboard');

  const reportRange = REPORT_RANGE_OPTIONS.includes(searchParams.get('range') || '')
    ? searchParams.get('range')
    : '30d';
  const activeTab = DASHBOARD_TABS.includes(searchParams.get('tab') || '')
    ? searchParams.get('tab')
    : 'overview';

  useEffect(() => {
    loadFailedRef.current = t('common.error');
  }, [t]);

  const updateDashboardSearchParams = useCallback((updates) => {
    const nextParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get(`/admin/stats?range=${encodeURIComponent(reportRange)}`);
      setStats(response.data);
    } catch (error) {
      toast.error(loadFailedRef.current);
    } finally {
      setLoading(false);
    }
  }, [reportRange]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatAmount = (amount, currency = 'eur') => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: String(currency || 'eur').toUpperCase(),
      }).format(Number(amount || 0));
    } catch {
      return `${Number(amount || 0).toFixed(2)} ${String(currency || 'eur').toUpperCase()}`;
    }
  };

  const formatDate = (value) => {
    if (!value) return t('common.na');
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return t('common.na');
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(parsed);
  };

  const navigateToUsers = (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    navigate(`/admin/users${query.toString() ? `?${query.toString()}` : ''}`);
  };

  const navigateToLinks = (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    navigate(`/admin/links${query.toString() ? `?${query.toString()}` : ''}`);
  };

  const platformCards = useMemo(() => ([
    {
      icon: Users,
      label: t('admin.totalUsers'),
      value: stats?.total_users || 0,
      color: 'bg-blue-100 text-blue-700',
      description: t('admin.registeredAccounts'),
      onClick: () => navigateToUsers(),
    },
    {
      icon: Activity,
      label: t('admin.activeSubscribers'),
      value: stats?.active_subscribers || 0,
      color: 'bg-emerald-100 text-emerald-700',
      description: t('admin.payingCustomers'),
      onClick: () => navigateToUsers({ subscription_status: 'active' }),
    },
    {
      icon: FileText,
      label: t('admin.totalPdfs'),
      value: stats?.total_pdfs || 0,
      color: 'bg-purple-100 text-purple-700',
      description: t('admin.documentsUploaded'),
    },
    {
      icon: Link2,
      label: t('admin.totalLinks'),
      value: stats?.total_links || 0,
      color: 'bg-orange-100 text-orange-700',
      description: t('admin.secureLinksCreated'),
      onClick: () => navigateToLinks(),
    },
    {
      icon: Eye,
      label: t('adminReports.totalViews'),
      value: stats?.total_views || 0,
      color: 'bg-cyan-100 text-cyan-700',
      description: t('adminReports.uniqueViewers'),
      secondary: stats?.total_unique_viewers || 0,
    },
    {
      icon: HardDrive,
      label: t('admin.totalStorage'),
      value: formatBytes(stats?.total_storage_bytes || 0),
      color: 'bg-rose-100 text-rose-700',
      description: t('admin.storageUsed'),
    },
  ]), [stats, t]);

  const billingCards = useMemo(() => ([
    {
      icon: CircleDollarSign,
      label: t('adminReports.grossRevenue'),
      value: formatAmount(stats?.gross_revenue || 0, stats?.reporting_currency || 'eur'),
      color: 'bg-emerald-100 text-emerald-700',
      description: t('adminReports.successfulPayments'),
      secondary: stats?.successful_payments || 0,
      onClick: () => navigateToUsers({ billing_status: 'paid' }),
    },
    {
      icon: RefreshCcw,
      label: t('adminReports.refundedAmount'),
      value: formatAmount(stats?.refunded_amount || 0, stats?.reporting_currency || 'eur'),
      color: 'bg-amber-100 text-amber-700',
      description: t('adminReports.refundCount'),
      secondary: stats?.refund_count || 0,
      onClick: () => navigateToUsers({ billing_status: 'refunded' }),
    },
    {
      icon: TrendingUp,
      label: t('adminReports.netRevenue'),
      value: formatAmount(stats?.net_revenue || 0, stats?.reporting_currency || 'eur'),
      color: 'bg-blue-100 text-blue-700',
      description: t('adminReports.pendingPayments'),
      secondary: stats?.pending_payments || 0,
    },
    {
      icon: TrendingDown,
      label: t('adminReports.failedPayments'),
      value: stats?.failed_payments || 0,
      color: 'bg-red-100 text-red-700',
      description: t('adminReports.paymentSuccessRate'),
      secondary: `${Number(stats?.successful_payment_rate || 0).toFixed(1)}%`,
      onClick: () => navigateToUsers({ billing_status: 'failed' }),
    },
  ]), [stats, t]);

  const subscriptionCounts = stats?.subscription_counts || {};
  const subscriptionItems = [
    { key: 'active', label: t('adminReports.active'), value: subscriptionCounts.active || 0, tone: 'bg-emerald-100 text-emerald-700' },
    { key: 'trialing', label: t('adminReports.trialing'), value: subscriptionCounts.trialing || 0, tone: 'bg-blue-100 text-blue-700' },
    { key: 'past_due', label: t('adminReports.pastDue'), value: subscriptionCounts.past_due || 0, tone: 'bg-amber-100 text-amber-700' },
    { key: 'canceled', label: t('adminReports.canceled'), value: subscriptionCounts.canceled || 0, tone: 'bg-stone-100 text-stone-700' },
    { key: 'incomplete', label: t('adminReports.incomplete'), value: subscriptionCounts.incomplete || 0, tone: 'bg-rose-100 text-rose-700' },
    { key: 'inactive', label: t('adminReports.inactive'), value: subscriptionCounts.inactive || 0, tone: 'bg-slate-100 text-slate-700' },
  ];

  if (loading) {
    return (
      <DashboardLayout title={t('admin.dashboard')} subtitle={t('admin.platformOverview')}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-900"></div>
        </div>
      </DashboardLayout>
    );
  }

  const conversionRate =
    stats?.total_users > 0 ? ((stats.active_subscribers / stats.total_users) * 100).toFixed(1) : '0.0';
  const linkActivityRate =
    stats?.total_links > 0 ? ((stats.active_links / stats.total_links) * 100).toFixed(1) : '0.0';

  const renderCards = (cards) => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {cards.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <Card
            className={`border-stone-200 transition-shadow ${stat.onClick ? 'cursor-pointer hover:shadow-md' : ''}`}
            onClick={stat.onClick}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-stone-500 mb-1">{stat.label}</p>
                  <p className="text-3xl font-bold text-stone-900">{stat.value}</p>
                  <p className="text-xs text-stone-400 mt-1">{stat.description}</p>
                  {stat.secondary !== undefined && (
                    <p className="text-xs text-stone-600 mt-2 font-medium">{stat.secondary}</p>
                  )}
                </div>
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${stat.color}`}>
                  <stat.icon className="w-7 h-7" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );

  return (
    <DashboardLayout title={t('admin.dashboard')} subtitle={t('admin.platformOverview')}>
      <Tabs value={activeTab} onValueChange={(value) => updateDashboardSearchParams({ tab: value })}>
        <div className="space-y-6">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-2xl bg-stone-100/80 p-1">
              <TabsTrigger value="overview">{t('adminReports.overviewTab')}</TabsTrigger>
              <TabsTrigger value="revenue">{t('adminReports.revenueTab')}</TabsTrigger>
              <TabsTrigger value="subscriptions">{t('adminReports.subscriptionsTab')}</TabsTrigger>
              <TabsTrigger value="refunds">{t('adminReports.refundsTab')}</TabsTrigger>
            </TabsList>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-stone-500">{t('adminReports.reportRange')}</span>
              {REPORT_RANGE_OPTIONS.map((range) => (
                <Button
                  key={range}
                  type="button"
                  variant={reportRange === range ? 'default' : 'outline'}
                  className={reportRange === range ? 'bg-emerald-900 hover:bg-emerald-800' : ''}
                  onClick={() => updateDashboardSearchParams({ range })}
                >
                  {t(`adminReports.range.${range}`)}
                </Button>
              ))}
            </div>
          </div>

          <p className="text-sm text-stone-500">
            {t('adminReports.reportRangeHelp')}
          </p>

          <TabsContent value="overview" className="space-y-8">
            <section>{renderCards(platformCards)}</section>
            <section>{renderCards(billingCards)}</section>
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-stone-200">
                <CardHeader>
                  <CardTitle>{t('admin.conversionRate')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4">
                    <p className="text-5xl font-bold text-emerald-700 mb-2">{conversionRate}%</p>
                    <p className="text-stone-500">{t('adminReports.subscribersVsUsers')}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-stone-200">
                <CardHeader>
                  <CardTitle>{t('admin.linkActivity')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4">
                    <p className="text-5xl font-bold text-blue-700 mb-2">{linkActivityRate}%</p>
                    <p className="text-stone-500">{t('adminReports.activeVsTotalLinks')}</p>
                  </div>
                </CardContent>
              </Card>
            </section>
          </TabsContent>

          <TabsContent value="revenue" className="space-y-8">
            <section>{renderCards(billingCards.slice(0, 3))}</section>
            <section className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6">
              <Card className="border-stone-200">
                <CardHeader>
                  <CardTitle>{t('adminReports.monthlyRevenue')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(stats?.monthly_revenue || []).map((row) => (
                    <div key={row.key} className="grid grid-cols-[0.9fr_1fr_1fr_1fr_0.8fr] gap-3 rounded-2xl border border-stone-200 p-3 text-sm">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-stone-400">{row.label}</p>
                      </div>
                      <div>
                        <p className="text-xs text-stone-400">{t('adminReports.gross')}</p>
                        <p className="font-semibold text-stone-900">{formatAmount(row.gross_revenue, stats?.reporting_currency || 'eur')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-stone-400">{t('adminReports.refunds')}</p>
                        <p className="font-semibold text-amber-700">{formatAmount(row.refunded_amount, stats?.reporting_currency || 'eur')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-stone-400">{t('adminReports.net')}</p>
                        <p className="font-semibold text-emerald-800">{formatAmount(row.net_revenue, stats?.reporting_currency || 'eur')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-stone-400">{t('adminReports.payments')}</p>
                        <p className="font-semibold text-stone-900">{row.payments}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-stone-200">
                <CardHeader>
                  <CardTitle>{t('adminReports.planPerformance')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(stats?.plan_performance || []).length === 0 ? (
                    <p className="text-sm text-stone-500">{t('common.na')}</p>
                  ) : (
                    (stats?.plan_performance || []).map((planRow) => (
                      <div key={planRow.plan_id} className="rounded-2xl border border-stone-200 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-stone-900 capitalize">{planRow.plan_id}</p>
                            <p className="text-xs text-stone-500">
                              {planRow.active_subscribers} {t('adminReports.activeSubscribers').toLowerCase()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-stone-900">
                              {formatAmount(planRow.net_revenue, stats?.reporting_currency || 'eur')}
                            </p>
                            <p className="text-xs text-stone-500">{planRow.payments} {t('adminReports.payments').toLowerCase()}</p>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-stone-500">
                          <div>
                            <p>{t('adminReports.gross')}</p>
                            <p className="text-sm font-medium text-stone-900">
                              {formatAmount(planRow.gross_revenue, stats?.reporting_currency || 'eur')}
                            </p>
                          </div>
                          <div>
                            <p>{t('adminReports.refunds')}</p>
                            <p className="text-sm font-medium text-amber-700">
                              {formatAmount(planRow.refunded_amount, stats?.reporting_currency || 'eur')}
                            </p>
                          </div>
                          <div>
                            <p>{t('adminReports.net')}</p>
                            <p className="text-sm font-medium text-emerald-800">
                              {formatAmount(planRow.net_revenue, stats?.reporting_currency || 'eur')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </section>
          </TabsContent>

          <TabsContent value="subscriptions" className="space-y-8">
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="border-stone-200 lg:col-span-2">
                <CardHeader>
                  <CardTitle>{t('adminReports.subscriptionHealth')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {subscriptionItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className="rounded-2xl border border-stone-200 p-3 text-left hover:shadow-sm transition-shadow"
                        onClick={() => navigateToUsers({ subscription_status: item.key })}
                      >
                        <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.tone}`}>
                          {item.label}
                        </div>
                        <p className="mt-3 text-2xl font-semibold text-stone-900">{item.value}</p>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-stone-200">
                <CardHeader>
                  <CardTitle>{t('admin.conversionRate')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4">
                    <p className="text-5xl font-bold text-emerald-700 mb-2">{conversionRate}%</p>
                    <p className="text-stone-500">{t('adminReports.subscribersVsUsers')}</p>
                  </div>
                </CardContent>
              </Card>
            </section>
          </TabsContent>

          <TabsContent value="refunds" className="space-y-8">
            <section>{renderCards([billingCards[1], billingCards[3]])}</section>
            <section>
              <Card className="border-stone-200">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{t('adminReports.recentRefunds')}</CardTitle>
                  <Receipt className="w-5 h-5 text-stone-400" />
                </CardHeader>
                <CardContent>
                  {(stats?.recent_refunds || []).length === 0 ? (
                    <p className="text-sm text-stone-500">{t('adminReports.noRefunds')}</p>
                  ) : (
                    <div className="space-y-3">
                      {(stats?.recent_refunds || []).map((refund) => (
                        <button
                          key={refund.refund_id}
                          type="button"
                          className="w-full rounded-2xl border border-stone-200 p-4 text-left hover:shadow-sm transition-shadow"
                          onClick={() => navigateToUsers({ search: refund.user_email || refund.user_name, billing_status: 'refunded' })}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                            <div>
                              <p className="font-semibold text-stone-900">{refund.user_name}</p>
                              <p className="text-sm text-stone-500">{refund.user_email}</p>
                              <p className="text-xs text-stone-500 mt-1 capitalize">
                                {refund.plan} • {refund.reason?.replaceAll('_', ' ') || t('common.na')}
                              </p>
                            </div>
                            <div className="text-left lg:text-right">
                              <p className="font-semibold text-amber-700">
                                {formatAmount(refund.amount, refund.currency || stats?.reporting_currency || 'eur')}
                              </p>
                              <p className="text-xs text-stone-500">{formatDate(refund.created_at)}</p>
                              <p className="text-xs text-stone-500 capitalize mt-1">{refund.status}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          </TabsContent>
        </div>
      </Tabs>
    </DashboardLayout>
  );
};

export default AdminDashboard;
