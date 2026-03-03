import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, Link2, Eye, HardDrive, Plus, ChevronRight, ArrowUpRight } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { api, useAuth } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [recentLinks, setRecentLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, refreshUser } = useAuth();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    fetchData();
    
    // Check for payment callback
    const paymentStatus = searchParams.get('payment');
    const sessionId = searchParams.get('session_id');
    
    if (paymentStatus === 'success' && sessionId) {
      checkPaymentStatus(sessionId);
    }
  }, [searchParams]);

  const checkPaymentStatus = async (sessionId) => {
    try {
      const response = await api.get(`/subscription/status/${sessionId}`);
      if (response.data.payment_status === 'paid') {
        toast.success('Subscription activated successfully!');
        await refreshUser();
        fetchData();
      }
    } catch (error) {
      console.error('Payment status check failed:', error);
    }
  };

  const fetchData = async () => {
    try {
      const [statsRes, linksRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/links')
      ]);
      setStats(statsRes.data);
      setRecentLinks(linksRes.data.slice(0, 5));
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStoragePercentage = () => {
    if (!stats) return 0;
    return Math.min((stats.storage_used / stats.storage_limit) * 100, 100);
  };

  const statCards = [
    { 
      icon: FileText, 
      label: t('dashboard.totalPdfs'), 
      value: stats?.pdf_count || 0,
      color: 'bg-blue-100 text-blue-700'
    },
    { 
      icon: Link2, 
      label: t('dashboard.activeLinks'), 
      value: stats?.active_links || 0,
      color: 'bg-emerald-100 text-emerald-700'
    },
    { 
      icon: Eye, 
      label: t('dashboard.totalViews'), 
      value: stats?.total_views || 0,
      color: 'bg-purple-100 text-purple-700'
    },
  ];

  if (loading) {
    return (
      <DashboardLayout title={t('dashboard.title')}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-900"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={t('dashboard.title')} subtitle={`${t('dashboard.welcomeBack')}, ${user?.name?.split(' ')[0]}`}>
      {/* Subscription Alert */}
      {user?.subscription_status !== 'active' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between"
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <p className="font-semibold text-amber-900">{t('dashboard.activateSubscription')}</p>
              <p className="text-sm text-amber-700">{t('dashboard.subscribeToUpload')}</p>
            </div>
          </div>
          <Link to="/pricing">
            <Button className="bg-amber-600 hover:bg-amber-700" data-testid="activate-subscription-btn">
              {t('dashboard.viewPlans')}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </motion.div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {statCards.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="border-stone-200 hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-stone-500 mb-1">{stat.label}</p>
                    <p className="text-3xl font-bold text-stone-900">{stat.value}</p>
                  </div>
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${stat.color}`}>
                    <stat.icon className="w-7 h-7" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Storage & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Storage Card */}
        <Card className="border-stone-200 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <HardDrive className="w-5 h-5 text-emerald-700" />
              <span>{t('dashboard.storageUsage')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-3xl font-bold text-stone-900">
                    {formatBytes(stats?.storage_used || 0)}
                  </span>
                  <span className="text-stone-500 ml-2">
                    / {formatBytes(stats?.storage_limit || 0)}
                  </span>
                </div>
                <span className="text-sm font-medium text-stone-500">
                  {getStoragePercentage().toFixed(1)}% {t('dashboard.used')}
                </span>
              </div>
              <Progress value={getStoragePercentage()} className="h-3 bg-stone-100" />
              <p className="text-sm text-stone-500">
                {stats?.plan === 'none' ? t('dashboard.subscribeToUpload') : `${stats?.plan?.charAt(0).toUpperCase() + stats?.plan?.slice(1)} plan storage`}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle>{t('dashboard.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link to="/pdfs" className="block">
              <Button variant="outline" className="w-full justify-start h-12" data-testid="quick-upload-btn">
                <Plus className="w-4 h-4 mr-2" />
                {t('dashboard.uploadNewPdf')}
              </Button>
            </Link>
            <Link to="/links/create" className="block">
              <Button variant="outline" className="w-full justify-start h-12" data-testid="quick-create-link-btn">
                <Link2 className="w-4 h-4 mr-2" />
                {t('dashboard.createSecureLink')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Links */}
      <Card className="border-stone-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('dashboard.recentLinks')}</CardTitle>
          <Link to="/links">
            <Button variant="ghost" size="sm">
              {t('dashboard.viewAll')}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentLinks.length === 0 ? (
            <div className="text-center py-12">
              <Link2 className="w-12 h-12 text-stone-300 mx-auto mb-4" />
              <p className="text-stone-500 mb-4">{t('dashboard.noLinks')}</p>
              <Link to="/links/create">
                <Button className="bg-emerald-900 hover:bg-emerald-800">
                  {t('dashboard.createFirst')}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentLinks.map((link) => (
                <div 
                  key={link.link_id}
                  className="flex items-center justify-between p-4 bg-stone-50 rounded-lg hover:bg-stone-100 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className={`w-3 h-3 rounded-full ${
                      link.status === 'active' ? 'bg-emerald-500 status-active' : 
                      link.status === 'expired' ? 'bg-stone-400' : 'bg-red-500'
                    }`} />
                    <div>
                      <p className="font-medium text-stone-900">{link.token.substring(0, 20)}...</p>
                      <p className="text-sm text-stone-500">
                        {link.expiry_mode === 'countdown' ? t('dashboard.countdown') : 
                         link.expiry_mode === 'fixed' ? t('dashboard.fixedDate') : t('dashboard.manual')} 
                        • {link.open_count} {t('links.views')}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    link.status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                    link.status === 'expired' ? 'bg-stone-100 text-stone-600' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {link.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default Dashboard;
