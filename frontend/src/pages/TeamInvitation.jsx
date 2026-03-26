import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const { user, logout, refreshWorkspaces, switchWorkspace } = useAuth();
  const { branding } = useBranding();
  const { t } = useLanguage();
  const [previewLoading, setPreviewLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [acceptedWorkspace, setAcceptedWorkspace] = useState(null);
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState('');
  const loadedPreviewTokenRef = useRef('');

  const token = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('token') || '').trim();
  }, [location.search]);

  useEffect(() => {
    if (loadedPreviewTokenRef.current === token) {
      return;
    }

    let active = true;
    const loadPreview = async () => {
      if (!token) {
        if (active) {
          loadedPreviewTokenRef.current = '';
          setPreview(null);
          setPreviewLoading(false);
        }
        return;
      }
      loadedPreviewTokenRef.current = token;
      setPreviewLoading(true);
      setError('');
      try {
        const response = await api.get('/team/invitations/preview', {
          params: { token },
        });
        if (!active) return;
        setPreview(response.data || null);
      } catch (err) {
        if (!active) return;
        const detail = err.response?.data?.detail || t('teamInvite.previewFailed');
        setError(detail);
        setPreview(null);
      } finally {
        if (active) {
          setPreviewLoading(false);
        }
      }
    };

    loadPreview();
    return () => {
      active = false;
    };
  }, [token]);

  const normalizedUserEmail = String(user?.email || '').trim().toLowerCase();
  const normalizedInviteEmail = String(preview?.email || '').trim().toLowerCase();
  const inviteMatchesCurrentUser = Boolean(user && preview && normalizedUserEmail === normalizedInviteEmail);

  const handleAcceptInvitation = async () => {
    if (!token) return;
    setActionLoading(true);
    setError('');
    try {
      const response = await api.post('/team/invitations/accept', { token });
      await refreshWorkspaces(user);
      if (response.data?.workspace?.workspace_id) {
        switchWorkspace(response.data.workspace.workspace_id);
        setAcceptedWorkspace(response.data.workspace);
      } else {
        setAcceptedWorkspace(null);
      }
      toast.success(response.data?.message || t('teamInvite.acceptedToast'));
    } catch (err) {
      const detail = err.response?.data?.detail || t('teamInvite.acceptFailed');
      setError(detail);
      toast.error(detail);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeclineInvitation = async () => {
    if (!preview?.invitation_id) return;
    setActionLoading(true);
    setError('');
    try {
      const response = await api.post(`/team/invitations/${preview.invitation_id}/decline`);
      setDeclined(true);
      toast.success(response.data?.message || t('teamInvite.declinedToast'));
    } catch (err) {
      const detail = err.response?.data?.detail || t('teamInvite.declineFailed');
      setError(detail);
      toast.error(detail);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSwitchAccount = async () => {
    await logout();
    navigate('/login', { replace: true, state: { from: location } });
  };

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
          ) : previewLoading ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center space-x-3 text-emerald-800">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t('teamInvite.loading')}</span>
            </div>
          ) : error && !preview ? (
            <>
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
                {error}
              </div>
              <div className="flex gap-3">
                <Link to="/dashboard">
                  <Button className="bg-emerald-900 hover:bg-emerald-800">{t('teamInvite.goToDashboard')}</Button>
                </Link>
              </div>
            </>
          ) : declined ? (
            <>
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-stone-700">
                {t('teamInvite.declinedMessage')}
              </div>
              <div className="flex gap-3">
                <Link to="/dashboard">
                  <Button className="bg-emerald-900 hover:bg-emerald-800">{t('teamInvite.goToDashboard')}</Button>
                </Link>
              </div>
            </>
          ) : !user ? (
            <>
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-stone-700">
                {t('teamInvite.signInFirst')}
              </div>
              {preview ? (
                <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-700">
                  <p><span className="font-medium">{t('teamInvite.workspaceLabel')}:</span> {preview.account_name}</p>
                  <p><span className="font-medium">{t('teamInvite.emailLabel')}:</span> {preview.email}</p>
                  <p><span className="font-medium">{t('teamInvite.roleLabel')}:</span> {preview.role_label}</p>
                </div>
              ) : null}
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
          ) : !inviteMatchesCurrentUser ? (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                <p className="font-semibold">{t('teamInvite.accountMismatchTitle')}</p>
                <p className="text-sm mt-1">
                  {t('teamInvite.accountMismatchDescription', {
                    currentEmail: user?.email || t('teamInvite.unknownEmail'),
                    inviteEmail: preview?.email || t('teamInvite.unknownEmail'),
                  })}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button className="bg-emerald-900 hover:bg-emerald-800" onClick={handleSwitchAccount}>
                  {t('teamInvite.switchAccount')}
                </Button>
                <Link to="/dashboard">
                  <Button variant="outline">{t('teamInvite.goToDashboard')}</Button>
                </Link>
              </div>
            </>
          ) : error ? (
            <>
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
                {error}
              </div>
              <div className="flex gap-3">
                <Button className="bg-emerald-900 hover:bg-emerald-800" onClick={handleAcceptInvitation} disabled={actionLoading}>
                  {actionLoading ? t('teamInvite.accepting') : t('teamInvite.acceptAction')}
                </Button>
                <Button variant="outline" onClick={handleDeclineInvitation} disabled={actionLoading}>
                  {t('teamInvite.declineAction')}
                </Button>
              </div>
            </>
          ) : (
            <>
              {acceptedWorkspace ? (
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
              ) : (
                <>
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-stone-700 space-y-2">
                    <p className="font-semibold text-stone-900">{preview?.account_name}</p>
                    <p><span className="font-medium">{t('teamInvite.emailLabel')}:</span> {preview?.email}</p>
                    <p><span className="font-medium">{t('teamInvite.roleLabel')}:</span> {preview?.role_label}</p>
                    <p><span className="font-medium">{t('teamInvite.invitedByLabel')}:</span> {preview?.invited_by_name}</p>
                  </div>
                  <div className="flex gap-3">
                    <Button className="bg-emerald-900 hover:bg-emerald-800" onClick={handleAcceptInvitation} disabled={actionLoading}>
                      {actionLoading ? t('teamInvite.accepting') : t('teamInvite.acceptAction')}
                    </Button>
                    <Button variant="outline" onClick={handleDeclineInvitation} disabled={actionLoading}>
                      {t('teamInvite.declineAction')}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamInvitation;
