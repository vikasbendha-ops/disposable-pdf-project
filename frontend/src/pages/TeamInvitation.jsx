import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, Mail, Users } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { api, useAuth, useBranding } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';

const TeamInvitation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, refreshWorkspaces, switchWorkspace } = useAuth();
  const { branding } = useBranding();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [acceptedWorkspace, setAcceptedWorkspace] = useState(null);
  const [error, setError] = useState('');

  const token = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('token') || '').trim();
  }, [location.search]);

  useEffect(() => {
    if (!user || !token || acceptedWorkspace || loading) return;

    let active = true;
    const acceptInvitation = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.post('/team/invitations/accept', { token });
        if (!active) return;
        await refreshWorkspaces(user);
        if (response.data?.workspace?.workspace_id) {
          switchWorkspace(response.data.workspace.workspace_id);
          setAcceptedWorkspace(response.data.workspace);
        } else {
          setAcceptedWorkspace(null);
        }
        toast.success(response.data?.message || t('teamInvite.acceptedToast'));
      } catch (err) {
        if (!active) return;
        const detail = err.response?.data?.detail || t('teamInvite.acceptFailed');
        setError(detail);
        toast.error(detail);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    acceptInvitation();
    return () => {
      active = false;
    };
  }, [acceptedWorkspace, loading, refreshWorkspaces, switchWorkspace, token, user]);

  const brandName = branding?.app_name || 'Autodestroy';

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-xl border-stone-200">
        <CardHeader className="space-y-3">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-900 text-white flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-2xl">{t('teamInvite.title')}</CardTitle>
              <CardDescription>{t('teamInvite.description', { appName: brandName })}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!token ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              {t('teamInvite.invalidToken')}
            </div>
          ) : !user ? (
            <>
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-stone-700">
                {t('teamInvite.signInFirst')}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="bg-emerald-900 hover:bg-emerald-800"
                  onClick={() => navigate('/login', { state: { from: location } })}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {t('teamInvite.signIn')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/register', { state: { from: location } })}
                >
                  {t('teamInvite.createAccount')}
                </Button>
              </div>
            </>
          ) : loading ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center space-x-3 text-emerald-800">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t('teamInvite.accepting')}</span>
            </div>
          ) : error ? (
            <>
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
                {error}
              </div>
              <div className="flex gap-3">
                <Link to="/settings">
                  <Button variant="outline">{t('teamInvite.openSettings')}</Button>
                </Link>
                <Link to="/dashboard">
                  <Button className="bg-emerald-900 hover:bg-emerald-800">{t('teamInvite.goToDashboard')}</Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center space-x-3 text-emerald-900">
                  <CheckCircle2 className="w-5 h-5" />
                  <div>
                    <p className="font-semibold">{t('teamInvite.acceptedTitle')}</p>
                    <p className="text-sm text-emerald-800">
                      {acceptedWorkspace?.label
                        ? t('teamInvite.acceptedWithWorkspace', { label: acceptedWorkspace.label })
                        : t('teamInvite.acceptedGeneric')}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <Link to="/dashboard">
                  <Button className="bg-emerald-900 hover:bg-emerald-800">{t('teamInvite.openDashboard')}</Button>
                </Link>
                <Link to="/settings">
                  <Button variant="outline">{t('teamInvite.openSettings')}</Button>
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamInvitation;
