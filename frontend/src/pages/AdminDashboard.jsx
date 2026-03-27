import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import DashboardLayout from '../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { api } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';

const AdminDashboard = () => {
  const { t } = useLanguage();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const loadFailedRef = useRef('Failed to load dashboard');

  useEffect(() => {
    loadFailedRef.current = t('common.error');
  }, [t]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get('/admin/stats');
      setStats(response.data);
    } catch (error) {
      toast.error(loadFailedRef.current);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const platformCards = [
    {
      icon: Users,
      label: t('admin.totalUsers'),
      value: stats?.total_users || 0,
      color: 'bg-blue-100 text-blue-700',
      description: t('admin.registeredAccounts'),
    },
    {
      icon: Activity,
      label: t('admin.activeSubscribers'),
      value: stats?.active_subscribers || 0,
      color: 'bg-emerald-100 text-emerald-700',
      description: t('admin.payingCustomers'),
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
  ];

  const billingCards = [
    {
      icon: CircleDollarSign,
      label: t('adminReports.grossRevenue'),
      value: formatAmount(stats?.gross_revenue || 0, stats?.reporting_currency || 'eur'),
      color: 'bg-emerald-100 text-emerald-700',
      description: t('adminReports.successfulPayments'),
      secondary: stats?.successful_payments || 0,
    },
    {
      icon: RefreshCcw,
      label: t('adminReports.refundedAmount'),
      value: formatAmount(stats?.refunded_amount || 0, stats?.reporting_currency || 'eur'),
      color: 'bg-amber-100 text-amber-700',
      description: t('adminReports.refundCount'),
      secondary: stats?.refund_count || 0,
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
    },
  ];

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

  return (
    <DashboardLayout title={t('admin.dashboard')} subtitle={t('admin.platformOverview')}>
      <div className="space-y-8">
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {platformCards.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="border-stone-200 hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm text-stone-500 mb-1">{stat.label}</p>
                        <p className="text-3xl font-bold text-stone-900">{stat.value}</p>
                        <p className="text-xs text-stone-400 mt-1">{stat.description}</p>
                        {stat.secondary !== undefined && (
                          <p className="text-xs text-stone-500 mt-2">
                            {stat.secondary} {t('adminReports.uniqueViewers').toLowerCase()}
                          </p>
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
        </section>

        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {billingCards.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.05 }}
              >
                <Card className="border-stone-200 hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm text-stone-500 mb-1">{stat.label}</p>
                        <p className="text-3xl font-bold text-stone-900">{stat.value}</p>
                        <p className="text-xs text-stone-400 mt-1">{stat.description}</p>
                        <p className="text-xs text-stone-600 mt-2 font-medium">{stat.secondary}</p>
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
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="border-stone-200 lg:col-span-1">
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

          <Card className="border-stone-200 lg:col-span-1">
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

          <Card className="border-stone-200 lg:col-span-1">
            <CardHeader>
              <CardTitle>{t('adminReports.subscriptionHealth')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {subscriptionItems.map((item) => (
                  <div key={item.key} className="rounded-2xl border border-stone-200 p-3">
                    <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.tone}`}>
                      {item.label}
                    </div>
                    <p className="mt-3 text-2xl font-semibold text-stone-900">{item.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

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
                    <div key={refund.refund_id} className="rounded-2xl border border-stone-200 p-4">
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
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </DashboardLayout>
  );
};

export default AdminDashboard;
