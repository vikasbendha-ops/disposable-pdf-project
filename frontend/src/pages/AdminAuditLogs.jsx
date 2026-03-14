import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { api } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const AdminAuditLogs = () => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [eventType, setEventType] = useState('');
  const [successFilter, setSuccessFilter] = useState('all');
  const [actorUserId, setActorUserId] = useState('');

  const knownEventTypes = useMemo(() => {
    const set = new Set(events.map((item) => item.event_type).filter(Boolean));
    return Array.from(set).sort();
  }, [events]);

  const fetchEvents = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const params = { limit: 200 };
      if (eventType) params.event_type = eventType;
      if (actorUserId.trim()) params.actor_user_id = actorUserId.trim();
      if (successFilter === 'success') params.success = true;
      if (successFilter === 'failed') params.success = false;

      const response = await api.get('/admin/audit/events', { params });
      setEvents(response.data?.events || []);
      setTotal(Number(response.data?.total || 0));
    } catch (err) {
      toast.error(err.response?.data?.detail || t('adminAudit.loadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEvents(false);
  }, []);

  return (
    <DashboardLayout title={t('adminAudit.title')} subtitle={t('adminAudit.subtitle')}>
      <div className="space-y-6">
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle>{t('adminAudit.filters')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Select value={successFilter} onValueChange={setSuccessFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('adminAudit.statusPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('adminAudit.allStatus')}</SelectItem>
                <SelectItem value="success">{t('adminAudit.success')}</SelectItem>
                <SelectItem value="failed">{t('adminAudit.failed')}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={eventType || '__all__'} onValueChange={(value) => setEventType(value === '__all__' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder={t('adminAudit.eventTypePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('adminAudit.allEventTypes')}</SelectItem>
                {knownEventTypes.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              placeholder={t('adminAudit.actorUserId')}
              value={actorUserId}
              onChange={(e) => setActorUserId(e.target.value)}
            />

            <div className="flex space-x-2">
              <Button className="flex-1 bg-emerald-900 hover:bg-emerald-800" onClick={() => fetchEvents(true)}>
                {t('adminAudit.apply')}
              </Button>
              <Button variant="outline" onClick={() => fetchEvents(true)} disabled={refreshing}>
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle>{t('adminAudit.events')} ({total})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-36 flex items-center justify-center text-stone-500">{t('adminAudit.loadingLogs')}</div>
            ) : events.length === 0 ? (
              <div className="h-24 flex items-center justify-center text-stone-500">{t('adminAudit.noEvents')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-left text-stone-600">
                      <th className="py-2 pr-4">{t('adminAudit.time')}</th>
                      <th className="py-2 pr-4">{t('adminAudit.event')}</th>
                      <th className="py-2 pr-4">{t('adminAudit.actor')}</th>
                      <th className="py-2 pr-4">{t('adminAudit.target')}</th>
                      <th className="py-2 pr-4">{t('adminAudit.resource')}</th>
                      <th className="py-2 pr-4">{t('common.status')}</th>
                      <th className="py-2 pr-0">{t('adminAudit.message')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.event_id} className="border-b border-stone-100 align-top">
                        <td className="py-3 pr-4 whitespace-nowrap text-stone-600">{formatDateTime(event.created_at)}</td>
                        <td className="py-3 pr-4 font-medium text-stone-900">{event.event_type || '-'}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-stone-600">{event.actor_user_id || '-'}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-stone-600">{event.target_user_id || '-'}</td>
                        <td className="py-3 pr-4 text-stone-700">
                          {event.resource_type || '-'}
                          {event.resource_id ? `:${event.resource_id}` : ''}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge className={event.success ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                            {event.success ? t('adminAudit.success') : t('adminAudit.failed')}
                          </Badge>
                        </td>
                        <td className="py-3 pr-0 text-stone-600">{event.message || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminAuditLogs;
