import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, FileText, Link2, HardDrive, TrendingUp, Activity } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { api } from '../App';
import { toast } from 'sonner';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/admin/stats');
      setStats(response.data);
    } catch (error) {
      toast.error('Failed to load admin stats');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const statCards = [
    { 
      icon: Users, 
      label: 'Total Users', 
      value: stats?.total_users || 0,
      color: 'bg-blue-100 text-blue-700',
      description: 'Registered accounts'
    },
    { 
      icon: Activity, 
      label: 'Active Subscribers', 
      value: stats?.active_subscribers || 0,
      color: 'bg-emerald-100 text-emerald-700',
      description: 'Paying customers'
    },
    { 
      icon: FileText, 
      label: 'Total PDFs', 
      value: stats?.total_pdfs || 0,
      color: 'bg-purple-100 text-purple-700',
      description: 'Documents uploaded'
    },
    { 
      icon: Link2, 
      label: 'Total Links', 
      value: stats?.total_links || 0,
      color: 'bg-orange-100 text-orange-700',
      description: 'Secure links created'
    },
    { 
      icon: TrendingUp, 
      label: 'Active Links', 
      value: stats?.active_links || 0,
      color: 'bg-cyan-100 text-cyan-700',
      description: 'Currently accessible'
    },
    { 
      icon: HardDrive, 
      label: 'Total Storage', 
      value: formatBytes(stats?.total_storage_bytes || 0),
      color: 'bg-rose-100 text-rose-700',
      description: 'Storage used by users'
    },
  ];

  if (loading) {
    return (
      <DashboardLayout title="Admin Dashboard" subtitle="Platform Overview">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-900"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Admin Dashboard" subtitle="Platform Overview">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
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
                    <p className="text-xs text-stone-400 mt-1">{stat.description}</p>
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

      {/* Conversion Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle>Conversion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-5xl font-bold text-emerald-700 mb-2">
                {stats?.total_users > 0 
                  ? ((stats.active_subscribers / stats.total_users) * 100).toFixed(1)
                  : 0}%
              </p>
              <p className="text-stone-500">Users to Subscribers</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle>Link Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-5xl font-bold text-blue-700 mb-2">
                {stats?.total_links > 0 
                  ? ((stats.active_links / stats.total_links) * 100).toFixed(1)
                  : 0}%
              </p>
              <p className="text-stone-500">Active vs Total Links</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminDashboard;
