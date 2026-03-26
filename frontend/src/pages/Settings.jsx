import React, { useEffect, useMemo, useState } from 'react';
import { User, Lock, Globe, CreditCard, ChevronRight, RefreshCw, Download, ExternalLink, Mail, Shield, Users } from 'lucide-react';
import QRCode from 'qrcode';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { api, useAuth, useSubscriptionPlans } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

const Settings = () => {
  const {
    user,
    activeWorkspace,
    activeWorkspaceId,
    refreshWorkspaces,
    updateUserLanguage,
    refreshUser,
    requestOwnPasswordReset,
    requestEmailChange,
  } = useAuth();
  const { plans } = useSubscriptionPlans();
  const { language, setLanguage, languages, t } = useLanguage();
  const [activeTab, setActiveTab] = useState('account');
  const [loadedTabs, setLoadedTabs] = useState({});
  const [domains, setDomains] = useState([]);
  const [defaultDomainId, setDefaultDomainId] = useState('platform');
  const [newDomain, setNewDomain] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);
  const [updatingDefaultDomain, setUpdatingDefaultDomain] = useState(false);
  const [verifyingDomainId, setVerifyingDomainId] = useState(null);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [billingOverview, setBillingOverview] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [openingBillingPortal, setOpeningBillingPortal] = useState(false);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState(null);
  const [profileName, setProfileName] = useState('');
  const [billingProfile, setBillingProfile] = useState({
    full_name: '',
    company_name: '',
    email: '',
    phone: '',
    tax_label: 'Tax ID',
    tax_id: '',
    address_line_1: '',
    address_line_2: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
  });
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingBillingProfile, setSavingBillingProfile] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [sendingEmailChange, setSendingEmailChange] = useState(false);
  const [teamState, setTeamState] = useState({
    workspace: null,
    workspaces: [],
    can_manage_team: false,
    members: [],
    invitations: [],
    received_invitations: [],
  });
  const [teamLoading, setTeamLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [invitingTeamMember, setInvitingTeamMember] = useState(false);
  const [updatingMembershipId, setUpdatingMembershipId] = useState(null);
  const [removingMembershipId, setRemovingMembershipId] = useState(null);
  const [cancellingInvitationId, setCancellingInvitationId] = useState(null);
  const [processingReceivedInvitationId, setProcessingReceivedInvitationId] = useState(null);
  const [twoFactorStatus, setTwoFactorStatus] = useState(null);
  const [twoFactorSetupData, setTwoFactorSetupData] = useState(null);
  const [twoFactorQrCodeUrl, setTwoFactorQrCodeUrl] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorDisableCode, setTwoFactorDisableCode] = useState('');
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [savingSecureLinkDefaults, setSavingSecureLinkDefaults] = useState(false);
  const [secureLinkDefaults, setSecureLinkDefaults] = useState({
    focus_lock_enabled: true,
    idle_timeout_seconds: null,
    strict_security_mode: false,
    require_fullscreen: false,
    enhanced_watermark: false,
    single_viewer_session: false,
    nda_required: false,
    nda_title: 'Confidentiality agreement',
    nda_text: 'This document contains confidential information. By continuing, you agree not to copy, share, capture, or distribute any part of this material without authorization.',
    nda_accept_label: 'I agree and continue',
    lock_to_first_ip: false,
  });
  const isPrivilegedAccount = user?.role === 'admin' || user?.role === 'super_admin';
  const dateTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat(language || 'en', { dateStyle: 'medium', timeStyle: 'short' }),
    [language],
  );

  const formatLocalizedDateTime = (value) => {
    if (!value) return '';
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return dateTimeFormatter.format(parsed);
  };

  const getWorkspaceRoleLabel = (role, fallbackLabel) => {
    if (role === 'owner') return t('workspaceTeam.roleOwner');
    if (role === 'admin') return t('workspaceTeam.roleAdmin');
    if (role === 'member') return t('workspaceTeam.roleMember');
    return fallbackLabel || t('workspaceTeam.roleMember');
  };

  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setNewEmail('');
      setBillingProfile({
        full_name: user?.billing_profile?.full_name || user?.name || '',
        company_name: user?.billing_profile?.company_name || '',
        email: user?.billing_profile?.email || user?.email || '',
        phone: user?.billing_profile?.phone || '',
        tax_label: user?.billing_profile?.tax_label || 'Tax ID',
        tax_id: user?.billing_profile?.tax_id || '',
        address_line_1: user?.billing_profile?.address_line_1 || '',
        address_line_2: user?.billing_profile?.address_line_2 || '',
        city: user?.billing_profile?.city || '',
        state: user?.billing_profile?.state || '',
        postal_code: user?.billing_profile?.postal_code || '',
        country: user?.billing_profile?.country || '',
      });
      setSecureLinkDefaults({
        focus_lock_enabled: user?.secure_link_defaults?.focus_lock_enabled !== false,
        idle_timeout_seconds: Number(user?.secure_link_defaults?.idle_timeout_seconds || 0) || null,
        strict_security_mode: Boolean(user?.secure_link_defaults?.strict_security_mode),
        require_fullscreen: Boolean(user?.secure_link_defaults?.require_fullscreen),
        enhanced_watermark: Boolean(user?.secure_link_defaults?.enhanced_watermark),
        single_viewer_session: Boolean(user?.secure_link_defaults?.single_viewer_session),
        nda_required: Boolean(user?.secure_link_defaults?.nda_required),
        nda_title: user?.secure_link_defaults?.nda_title || 'Confidentiality agreement',
        nda_text: user?.secure_link_defaults?.nda_text || 'This document contains confidential information. By continuing, you agree not to copy, share, capture, or distribute any part of this material without authorization.',
        nda_accept_label: user?.secure_link_defaults?.nda_accept_label || 'I agree and continue',
        lock_to_first_ip: Boolean(user?.secure_link_defaults?.lock_to_first_ip),
      });
    }
  }, [user]);

  useEffect(() => {
    let active = true;

    const generateQr = async () => {
      const otpAuthUri = String(twoFactorSetupData?.otp_auth_uri || '').trim();
      if (!otpAuthUri) {
        if (active) setTwoFactorQrCodeUrl('');
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(otpAuthUri, {
          width: 240,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#111827',
            light: '#ffffff',
          },
        });
        if (active) {
          setTwoFactorQrCodeUrl(dataUrl);
        }
      } catch (error) {
        if (active) {
          setTwoFactorQrCodeUrl('');
        }
      }
    };

    generateQr();

    return () => {
      active = false;
    };
  }, [twoFactorSetupData]);

  useEffect(() => {
    const ensureTabLoaded = async () => {
      if (loadedTabs[activeTab]) return;
      if (activeTab === 'billing' && user) {
        await fetchBillingOverview();
      } else if (activeTab === 'domains' && user) {
        await fetchDomains();
      } else if (activeTab === 'team' && user) {
        await fetchTeamState();
      } else if (activeTab === 'security' && user && isPrivilegedAccount) {
        await fetchTwoFactorStatus();
      }
      setLoadedTabs((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
    };

    ensureTabLoaded();
  }, [activeTab, loadedTabs, user, isPrivilegedAccount]);

  useEffect(() => {
    if (!user) return;
    if (activeTab === 'domains') {
      fetchDomains();
    }
    if (activeTab === 'team') {
      fetchTeamState();
    }
  }, [activeWorkspaceId]);

  const fetchDomains = async () => {
    try {
      const response = await api.get('/domains');
      const items = Array.isArray(response.data) ? response.data : [];
      setDomains(items);
      const defaultDomain = items.find((domain) => domain.is_default);
      const readyDefault = defaultDomain?.is_ready ? defaultDomain.domain_id : 'platform';
      setDefaultDomainId(readyDefault);
    } catch (error) {
      console.error('Failed to fetch domains');
    }
  };

  const isDomainReady = (domain) => Boolean(domain?.is_ready);

  const handleLanguageChange = async (newLang) => {
    setSavingLanguage(true);
    try {
      await updateUserLanguage(newLang);
      setLanguage(newLang);
      toast.success('Language updated successfully');
    } catch (error) {
      toast.error('Failed to update language');
    } finally {
      setSavingLanguage(false);
    }
  };

  const handleAddDomain = async (e) => {
    e.preventDefault();
    if (!newDomain.trim()) return;

    setAddingDomain(true);
    try {
      const response = await api.post('/domains', { domain: newDomain });
      toast.success('Domain added! Follow the verification instructions.');
      await fetchDomains();
      if (response.data?.is_default && response.data?.is_ready) {
        setDefaultDomainId(response.data.domain_id);
      }
      setNewDomain('');
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to add domain';
      toast.error(message);
    } finally {
      setAddingDomain(false);
    }
  };

  const handleDeleteDomain = async (domainId) => {
    try {
      await api.delete(`/domains/${domainId}`);
      toast.success('Domain removed');
      await fetchDomains();
    } catch (error) {
      toast.error('Failed to remove domain');
    }
  };

  const handleDefaultDomainChange = async (domainId) => {
    const target = domainId || 'platform';
    setDefaultDomainId(target);
    setUpdatingDefaultDomain(true);
    try {
      await api.put('/domains/default', {
        domain_id: target === 'platform' ? null : target,
      });
      toast.success('Default domain updated');
      await fetchDomains();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update default domain');
      await fetchDomains();
    } finally {
      setUpdatingDefaultDomain(false);
    }
  };

  const handleVerifyDomain = async (domainId) => {
    setVerifyingDomainId(domainId);
    try {
      const response = await api.post(`/domains/${domainId}`);
      if (response.data?.is_ready) {
        toast.success('Domain verified with active SSL');
      } else {
        toast.warning(response.data?.verification_error || 'Domain not ready yet. Check DNS and SSL.');
      }
      await fetchDomains();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to verify domain');
    } finally {
      setVerifyingDomainId(null);
    }
  };

  const fetchTeamState = async () => {
    setTeamLoading(true);
    try {
      const response = await api.get('/team');
      setTeamState({
        workspace: response.data?.workspace || null,
        workspaces: Array.isArray(response.data?.workspaces) ? response.data.workspaces : [],
        can_manage_team: Boolean(response.data?.can_manage_team),
        members: Array.isArray(response.data?.members) ? response.data.members : [],
        invitations: Array.isArray(response.data?.invitations) ? response.data.invitations : [],
        received_invitations: Array.isArray(response.data?.received_invitations) ? response.data.received_invitations : [],
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || t('workspaceTeam.loadFailed'));
    } finally {
      setTeamLoading(false);
    }
  };

  const handleInviteTeamMember = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      toast.error(t('workspaceTeam.emailRequired'));
      return;
    }

    setInvitingTeamMember(true);
    try {
      const response = await api.post('/team/invitations', {
        email: inviteEmail.trim(),
        account_role: inviteRole,
        origin_url: window.location.origin,
      });
      toast.success(response.data?.message || 'Invitation created');
      if (response.data?.invite_url) {
        try {
          if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(response.data.invite_url);
            toast.success('Invite link copied');
          }
        } catch {
          // ignore clipboard errors; invitation already exists
        }
      }
      setInviteEmail('');
      setInviteRole('member');
      await refreshWorkspaces(user);
      await fetchTeamState();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('workspaceTeam.inviteCreateFailed'));
    } finally {
      setInvitingTeamMember(false);
    }
  };

  const handleUpdateMemberRole = async (membershipId, role) => {
    setUpdatingMembershipId(membershipId);
    try {
      const response = await api.put(`/team/members/${membershipId}`, {
        account_role: role,
      });
      toast.success(response.data?.message || 'Team member updated');
      await fetchTeamState();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('workspaceTeam.memberUpdateFailed'));
    } finally {
      setUpdatingMembershipId(null);
    }
  };

  const handleRemoveMember = async (membershipId) => {
    setRemovingMembershipId(membershipId);
    try {
      const response = await api.delete(`/team/members/${membershipId}`);
      toast.success(response.data?.message || 'Team member removed');
      await refreshWorkspaces(user);
      await fetchTeamState();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('workspaceTeam.memberRemoveFailed'));
    } finally {
      setRemovingMembershipId(null);
    }
  };

  const handleCancelInvitation = async (invitationId) => {
    setCancellingInvitationId(invitationId);
    try {
      const response = await api.delete(`/team/invitations/${invitationId}`);
      toast.success(response.data?.message || 'Invitation cancelled');
      await fetchTeamState();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('workspaceTeam.inviteCancelFailed'));
    } finally {
      setCancellingInvitationId(null);
    }
  };

  const handleAcceptInvitation = async (invitationId) => {
    setProcessingReceivedInvitationId(invitationId);
    try {
      const response = await api.post('/team/invitations/accept', { invitation_id: invitationId });
      toast.success(response.data?.message || 'Invitation accepted');
      if (response.data?.workspace?.workspace_id) {
        await refreshWorkspaces(user);
      }
      await fetchTeamState();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('workspaceTeam.inviteAcceptFailed'));
    } finally {
      setProcessingReceivedInvitationId(null);
    }
  };

  const handleDeclineInvitation = async (invitationId) => {
    setProcessingReceivedInvitationId(invitationId);
    try {
      const response = await api.post(`/team/invitations/${invitationId}/decline`);
      toast.success(response.data?.message || 'Invitation declined');
      await fetchTeamState();
      await refreshWorkspaces(user);
    } catch (error) {
      toast.error(error.response?.data?.detail || t('workspaceTeam.inviteDeclineFailed'));
    } finally {
      setProcessingReceivedInvitationId(null);
    }
  };

  const updateBillingField = (field, value) => {
    setBillingProfile((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAccountSave = async (e) => {
    e.preventDefault();
    setSavingAccount(true);
    try {
      await api.put('/auth/profile', {
        name: profileName,
      });
      await refreshUser();
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleBillingProfileSave = async (e) => {
    e.preventDefault();
    setSavingBillingProfile(true);
    try {
      await api.put('/auth/profile', {
        billing_profile: billingProfile,
      });
      await refreshUser();
      toast.success('Billing profile updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update billing profile');
    } finally {
      setSavingBillingProfile(false);
    }
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

  const fetchBillingOverview = async () => {
    setBillingLoading(true);
    try {
      const response = await api.get('/subscription/overview');
      setBillingOverview(response.data || null);
    } catch (error) {
      setBillingOverview(null);
      if (error.response?.status !== 404) {
        toast.error(error.response?.data?.detail || 'Failed to load billing details');
      }
    } finally {
      setBillingLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setOpeningBillingPortal(true);
    try {
      const response = await api.post('/subscription/billing-portal', {
        origin_url: window.location.origin,
      });
      if (!response.data?.url) {
        throw new Error('No billing portal URL returned');
      }
      window.location.href = response.data.url;
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to open billing portal');
    } finally {
      setOpeningBillingPortal(false);
    }
  };

  const handleDownloadInvoice = async (transactionId, invoiceNumber) => {
    if (!transactionId) return;
    setDownloadingInvoiceId(transactionId);
    try {
      const response = await api.get(`/subscription/invoices/${transactionId}/download`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${invoiceNumber || `invoice-${transactionId}`}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Invoice downloaded');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to download invoice');
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const handleSendResetEmail = async () => {
    if (!user?.email) {
      toast.error('Email address is missing');
      return;
    }

    setSendingResetEmail(true);
    try {
      await requestOwnPasswordReset();
      toast.success('Password reset email sent');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send password reset email');
    } finally {
      setSendingResetEmail(false);
    }
  };

  const fetchTwoFactorStatus = async () => {
    if (!isPrivilegedAccount) {
      setTwoFactorStatus(null);
      setTwoFactorSetupData(null);
      return;
    }
    try {
      const response = await api.get('/auth/2fa');
      setTwoFactorStatus(response.data?.two_factor || null);
      if (!response.data?.two_factor?.setup_pending) {
        setTwoFactorSetupData(null);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load two-factor authentication status');
    }
  };

  const handleStartTwoFactorSetup = async () => {
    setTwoFactorLoading(true);
    try {
      const response = await api.post('/auth/2fa/setup');
      setTwoFactorStatus(response.data?.two_factor || null);
      setTwoFactorSetupData({
        manual_entry_key: response.data?.manual_entry_key || response.data?.secret || '',
        otp_auth_uri: response.data?.otp_auth_uri || '',
      });
      setTwoFactorCode('');
      toast.success('Two-factor setup started');
      await refreshUser();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start two-factor setup');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleEnableTwoFactor = async (e) => {
    e.preventDefault();
    setTwoFactorLoading(true);
    try {
      const response = await api.post('/auth/2fa/enable', {
        code: twoFactorCode,
      });
      setTwoFactorStatus(response.data?.two_factor || null);
      setTwoFactorSetupData(null);
      setTwoFactorCode('');
      toast.success(response.data?.message || 'Two-factor authentication enabled');
      await refreshUser();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to enable two-factor authentication');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleDisableTwoFactor = async (e) => {
    e.preventDefault();
    setTwoFactorLoading(true);
    try {
      const response = await api.post('/auth/2fa/disable', {
        code: twoFactorDisableCode,
      });
      setTwoFactorStatus(response.data?.two_factor || null);
      setTwoFactorDisableCode('');
      setTwoFactorSetupData(null);
      toast.success(response.data?.message || 'Two-factor authentication disabled');
      await refreshUser();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to disable two-factor authentication');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleRequestEmailChange = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      toast.error(t('settings.emailChangeRequired'));
      return;
    }

    setSendingEmailChange(true);
    try {
      const response = await requestEmailChange(newEmail.trim());
      await refreshUser();
      setNewEmail('');
      toast.success(response?.message || t('settings.emailChangeSuccess'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('settings.emailChangeFailed'));
    } finally {
      setSendingEmailChange(false);
    }
  };

  const updateSecureLinkDefault = (field, value) => {
    setSecureLinkDefaults((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveSecureLinkDefaults = async (e) => {
    e.preventDefault();
    setSavingSecureLinkDefaults(true);
    try {
      await api.put('/auth/profile', {
        secure_link_defaults: secureLinkDefaults,
      });
      await refreshUser();
      toast.success('Secure link defaults updated');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update secure link defaults');
    } finally {
      setSavingSecureLinkDefaults(false);
    }
  };

  const getPlanLabel = (planId) => {
    if (planId && plans?.[planId]?.name) return plans[planId].name;
    return t('adminUsers.noSubscription');
  };

  return (
    <DashboardLayout title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto w-max min-w-full justify-start gap-2 rounded-xl bg-stone-100 p-1">
            <TabsTrigger value="account" className="px-4 py-2">{t('settings.profileInfo')}</TabsTrigger>
            <TabsTrigger value="billing" className="px-4 py-2">{t('settings.subscription')}</TabsTrigger>
            <TabsTrigger value="security" className="px-4 py-2">{t('settings.accountSecurity')}</TabsTrigger>
            <TabsTrigger value="linkSecurity" className="px-4 py-2">{t('settings.linkSecurity')}</TabsTrigger>
            <TabsTrigger value="team" className="px-4 py-2">{t('workspaceTeam.tab')}</TabsTrigger>
            {(activeWorkspace?.permissions?.manage_domains ?? true) && (
              <TabsTrigger value="domains" className="px-4 py-2">{t('settings.customDomains')}</TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="account" className="max-w-4xl space-y-6">
          <Card className="border-emerald-200 bg-emerald-50/30">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Globe className="w-5 h-5 text-emerald-700" />
                <span>{t('settings.language')}</span>
              </CardTitle>
              <CardDescription>{t('settings.languageDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={language} onValueChange={handleLanguageChange} disabled={savingLanguage}>
                <SelectTrigger className="h-12 max-w-md" data-testid="settings-language-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {languages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      <span className="flex items-center">
                        <span className="font-medium">{lang.nativeName}</span>
                        <span className="text-stone-500 ml-2">({lang.name})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {savingLanguage && <p className="text-sm text-emerald-600 mt-2">{t('adminUsers.saving')}</p>}
            </CardContent>
          </Card>

          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="w-5 h-5 text-emerald-700" />
                <span>{t('settings.profileInfo')}</span>
              </CardTitle>
              <CardDescription>{t('settings.profileDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAccountSave} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-stone-500">{t('settings.name')}</Label>
                    <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm text-stone-500">{t('settings.email')}</Label>
                    <Input value={user?.email || ''} readOnly className="h-12 mt-1 bg-stone-50" />
                  </div>
                  <div>
                    <Label className="text-sm text-stone-500">{t('settings.memberSince')}</Label>
                    <p className="font-medium text-stone-900 mt-2">
                      {user?.created_at ? format(new Date(user.created_at), 'MMMM d, yyyy') : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm text-stone-500">{t('settings.accountRole')}</Label>
                    <p className="font-medium text-stone-900 capitalize mt-2">{user?.role}</p>
                  </div>
                </div>
                <Button type="submit" className="bg-emerald-900 hover:bg-emerald-800" disabled={savingAccount}>
                  {savingAccount ? t('adminUsers.saving') : t('common.save')}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Mail className="w-5 h-5 text-emerald-700" />
                <span>{t('settings.emailChangeTitle')}</span>
              </CardTitle>
              <CardDescription>{t('settings.emailChangeDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                <p className="font-medium text-stone-900">{t('settings.currentEmailLabel')}: {user?.email || t('common.na')}</p>
                <p className="text-sm text-stone-500 mt-1">{t('settings.emailChangeNotice')}</p>
              </div>

              {user?.pending_email && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="font-medium text-amber-900">
                    {t('settings.pendingEmailLabel')}: {user.pending_email}
                  </p>
                  <p className="text-sm text-amber-800 mt-1">
                    {t('settings.pendingEmailNotice')}
                    {user?.pending_email_requested_at ? ` ${format(new Date(user.pending_email_requested_at), 'MMM d, yyyy HH:mm')}` : ''}
                  </p>
                </div>
              )}

              <form onSubmit={handleRequestEmailChange} className="space-y-4">
                <div>
                  <Label>{t('settings.newEmailLabel')}</Label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="h-12 mt-1"
                    placeholder="name@example.com"
                  />
                </div>
                <Button
                  type="submit"
                  className="bg-emerald-900 hover:bg-emerald-800"
                  disabled={sendingEmailChange || !newEmail.trim()}
                >
                  {sendingEmailChange ? t('settings.emailChangeSending') : t('settings.emailChangeButton')}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="max-w-4xl space-y-6">
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CreditCard className="w-5 h-5 text-emerald-700" />
                <span>{t('settings.subscription')}</span>
              </CardTitle>
              <CardDescription>{t('settings.subscriptionDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {billingLoading && !billingOverview ? (
                <p className="text-sm text-stone-500">{t('common.loading')}</p>
              ) : (
                <>
                  <div className="flex items-center justify-between p-4 bg-stone-50 rounded-xl">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {getPlanLabel(user?.plan || 'none')} {t('settings.plan')}
                      </p>
                      <p className="text-sm text-stone-500">
                        {t('settings.status')}:{' '}
                        <span className={user?.subscription_status === 'active' ? 'text-emerald-600' : 'text-stone-600'}>
                          {user?.subscription_status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </p>
                    </div>
                    {user?.subscription_status === 'active' ? (
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold uppercase">
                        Active
                      </span>
                    ) : (
                      <Link to="/pricing">
                        <Button className="bg-emerald-900 hover:bg-emerald-800">
                          {t('settings.upgrade')}
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </Link>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-stone-200 p-3">
                      <p className="text-xs uppercase text-stone-500">Successful Payments</p>
                      <p className="text-lg font-semibold text-stone-900">{billingOverview?.payment_summary?.successful_payments || 0}</p>
                    </div>
                    <div className="rounded-lg border border-stone-200 p-3">
                      <p className="text-xs uppercase text-stone-500">Total Paid</p>
                      <p className="text-lg font-semibold text-stone-900">
                        {formatAmount(
                          billingOverview?.payment_summary?.total_paid || 0,
                          billingOverview?.payment_summary?.currency || 'eur',
                        )}
                      </p>
                    </div>
                    <div className="rounded-lg border border-stone-200 p-3">
                      <p className="text-xs uppercase text-stone-500">Next Renewal</p>
                      <p className="text-sm font-semibold text-stone-900">
                        {billingOverview?.payment_summary?.next_renewal_at
                          ? format(new Date(billingOverview.payment_summary.next_renewal_at), 'MMM d, yyyy HH:mm')
                          : 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button variant="outline" onClick={fetchBillingOverview} disabled={billingLoading}>
                      {billingLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Refreshing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Refresh Billing Data
                        </>
                      )}
                    </Button>
                    <Button variant="outline" onClick={handleManageBilling} disabled={openingBillingPortal}>
                      {openingBillingPortal ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Opening Portal...
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Update Card & Billing
                        </>
                      )}
                    </Button>
                    {user?.subscription_status === 'active' && (
                      <Link to="/pricing" className="sm:ml-auto">
                        <Button variant="outline" className="w-full sm:w-auto">
                          {t('settings.changePlan')}
                        </Button>
                      </Link>
                    )}
                  </div>

                  <div className="rounded-lg border border-stone-200 p-3">
                    <p className="text-sm font-semibold text-stone-900 mb-3">Invoices</p>
                    <p className="text-xs text-stone-500 mb-3">
                      Invoice PDFs are generated only after a successful payment. Future billing profile changes do not modify past invoices.
                    </p>
                    {Array.isArray(billingOverview?.payments) && billingOverview.payments.length > 0 ? (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {billingOverview.payments.slice(0, 25).map((payment) => (
                          <div key={payment.transaction_id} className="rounded-md border border-stone-200 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                              <p className="font-medium text-stone-900">{payment.invoice_number || payment.transaction_id}</p>
                              <p className="text-xs text-stone-500 capitalize">
                                {getPlanLabel(payment.plan || 'none')} • {payment.payment_status}
                              </p>
                              <p className="text-xs text-stone-500">
                                {payment.paid_at
                                  ? format(new Date(payment.paid_at), 'MMM d, yyyy HH:mm')
                                  : payment.created_at
                                    ? format(new Date(payment.created_at), 'MMM d, yyyy HH:mm')
                                    : 'N/A'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-stone-900">
                                {formatAmount(payment.amount || 0, payment.currency || 'eur')}
                              </span>
                              {payment.payment_status === 'completed' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDownloadInvoice(payment.transaction_id, payment.invoice_number)}
                                  disabled={downloadingInvoiceId === payment.transaction_id}
                                >
                                  {downloadingInvoiceId === payment.transaction_id ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <>
                                      <Download className="w-4 h-4 mr-1" />
                                      Invoice PDF
                                    </>
                                  )}
                                </Button>
                              ) : (
                                <span className="text-xs text-stone-500">Available after payment</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-stone-500">
                        No invoices yet. After your first successful payment, invoices will appear here.
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Billing Profile</CardTitle>
              <CardDescription>
                This information is copied into future paid invoices. Existing invoices remain locked after payment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBillingProfileSave} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Invoice Full Name</Label>
                    <Input value={billingProfile.full_name} onChange={(e) => updateBillingField('full_name', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>Company Name</Label>
                    <Input value={billingProfile.company_name} onChange={(e) => updateBillingField('company_name', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>Billing Email</Label>
                    <Input value={billingProfile.email} onChange={(e) => updateBillingField('email', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={billingProfile.phone} onChange={(e) => updateBillingField('phone', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>Tax Label</Label>
                    <Input value={billingProfile.tax_label} onChange={(e) => updateBillingField('tax_label', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>Tax ID / VAT / GST</Label>
                    <Input value={billingProfile.tax_id} onChange={(e) => updateBillingField('tax_id', e.target.value)} className="h-12 mt-1" />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label>Address Line 1</Label>
                    <Input value={billingProfile.address_line_1} onChange={(e) => updateBillingField('address_line_1', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>Address Line 2</Label>
                    <Input value={billingProfile.address_line_2} onChange={(e) => updateBillingField('address_line_2', e.target.value)} className="h-12 mt-1" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label>City</Label>
                    <Input value={billingProfile.city} onChange={(e) => updateBillingField('city', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Input value={billingProfile.state} onChange={(e) => updateBillingField('state', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>Postal Code</Label>
                    <Input value={billingProfile.postal_code} onChange={(e) => updateBillingField('postal_code', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>Country</Label>
                    <Input value={billingProfile.country} onChange={(e) => updateBillingField('country', e.target.value)} className="h-12 mt-1" />
                  </div>
                </div>

                <Button type="submit" className="bg-emerald-900 hover:bg-emerald-800" disabled={savingBillingProfile}>
                  {savingBillingProfile ? t('adminUsers.saving') : t('common.save')}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="max-w-3xl space-y-6">
          {isPrivilegedAccount && (
            <Card className="border-stone-200">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="w-5 h-5 text-emerald-700" />
                  <span>{t('settings.twoFactorTitle')}</span>
                </CardTitle>
                <CardDescription>{t('settings.twoFactorDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                  <p className="font-medium text-stone-900">
                    {t('settings.twoFactorStatusLabel')}: {twoFactorStatus?.enabled ? t('settings.twoFactorEnabled') : t('settings.twoFactorDisabled')}
                  </p>
                  {twoFactorStatus?.configured_at && (
                    <p className="text-sm text-stone-500 mt-1">
                      {t('settings.twoFactorConfiguredAt')}: {format(new Date(twoFactorStatus.configured_at), 'MMM d, yyyy HH:mm')}
                    </p>
                  )}
                  {twoFactorStatus?.last_verified_at && (
                    <p className="text-sm text-stone-500 mt-1">
                      {t('settings.twoFactorLastVerifiedAt')}: {format(new Date(twoFactorStatus.last_verified_at), 'MMM d, yyyy HH:mm')}
                    </p>
                  )}
                </div>

                {!twoFactorStatus?.enabled && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-4">
                    <div>
                      <p className="font-medium text-stone-900">{t('settings.twoFactorSetupTitle')}</p>
                      <p className="text-sm text-stone-600 mt-1">{t('settings.twoFactorSetupHelp')}</p>
                    </div>

                    {twoFactorSetupData?.manual_entry_key ? (
                      <form onSubmit={handleEnableTwoFactor} className="space-y-4">
                        {twoFactorQrCodeUrl && (
                          <div className="rounded-lg border border-stone-200 bg-white p-4">
                            <p className="font-medium text-stone-900 mb-3">{t('settings.twoFactorScanQr')}</p>
                            <div className="flex justify-center">
                              <img
                                src={twoFactorQrCodeUrl}
                                alt={t('settings.twoFactorQrAlt')}
                                className="h-56 w-56 rounded-lg border border-stone-200 bg-white p-3"
                              />
                            </div>
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label>{t('settings.twoFactorManualKey')}</Label>
                          <Input value={twoFactorSetupData.manual_entry_key} readOnly className="h-12 font-mono" />
                        </div>
                        <div className="space-y-2">
                          <Label>{t('settings.twoFactorOtpUri')}</Label>
                          <Textarea value={twoFactorSetupData.otp_auth_uri || ''} readOnly rows={3} className="font-mono text-xs" />
                        </div>
                        <div className="space-y-2">
                          <Label>{t('settings.twoFactorCodeLabel')}</Label>
                          <Input
                            value={twoFactorCode}
                            onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="123456"
                            maxLength={6}
                            className="h-12 font-mono tracking-[0.35em] text-center"
                          />
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <Button
                            type="submit"
                            className="bg-emerald-900 hover:bg-emerald-800"
                            disabled={twoFactorLoading || twoFactorCode.length !== 6}
                          >
                            {twoFactorLoading ? t('settings.twoFactorVerifying') : t('settings.twoFactorEnable')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleStartTwoFactorSetup}
                            disabled={twoFactorLoading}
                          >
                            {t('settings.twoFactorRegenerate')}
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <Button
                        onClick={handleStartTwoFactorSetup}
                        className="bg-emerald-900 hover:bg-emerald-800"
                        disabled={twoFactorLoading}
                      >
                        {twoFactorLoading ? t('settings.twoFactorStarting') : t('settings.twoFactorStart')}
                      </Button>
                    )}
                  </div>
                )}

                {twoFactorStatus?.enabled && (
                  <form onSubmit={handleDisableTwoFactor} className="space-y-4 rounded-lg border border-red-200 bg-red-50/40 p-4">
                    <div>
                      <p className="font-medium text-stone-900">{t('settings.twoFactorDisableTitle')}</p>
                      <p className="text-sm text-stone-600 mt-1">{t('settings.twoFactorDisableHelp')}</p>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('settings.twoFactorCodeLabel')}</Label>
                      <Input
                        value={twoFactorDisableCode}
                        onChange={(e) => setTwoFactorDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        maxLength={6}
                        className="h-12 font-mono tracking-[0.35em] text-center"
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                      disabled={twoFactorLoading || twoFactorDisableCode.length !== 6}
                    >
                      {twoFactorLoading ? t('settings.twoFactorVerifying') : t('settings.twoFactorDisable')}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Lock className="w-5 h-5 text-emerald-700" />
                <span>{t('settings.changePassword')}</span>
              </CardTitle>
              <CardDescription>
                Password changes are handled by secure reset email so active sessions and auth state stay consistent.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                <p className="font-medium text-stone-900">Reset password for {user?.email || 'your account'}</p>
                <p className="text-sm text-stone-500 mt-1">
                  We will send a reset link to your verified email address.
                </p>
              </div>
              <Button
                onClick={handleSendResetEmail}
                disabled={sendingResetEmail}
                className="bg-emerald-900 hover:bg-emerald-800"
              >
                {sendingResetEmail ? 'Sending...' : 'Send Password Reset Email'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="linkSecurity" className="max-w-3xl space-y-6">
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Lock className="w-5 h-5 text-emerald-700" />
                <span>{t('settings.secureLinkDefaultsTitle')}</span>
              </CardTitle>
              <CardDescription>
                {t('settings.secureLinkDefaultsDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveSecureLinkDefaults} className="space-y-5">
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/70 p-4">
                  <div>
                    <p className="font-medium text-stone-900">{t('settings.strictSecurityDefaultTitle')}</p>
                    <p className="text-sm text-stone-500">{t('settings.strictSecurityDefaultDesc')}</p>
                  </div>
                  <Switch
                    checked={secureLinkDefaults.strict_security_mode}
                    onCheckedChange={(checked) => updateSecureLinkDefault('strict_security_mode', checked)}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-stone-200 p-4">
                  <div>
                    <p className="font-medium text-stone-900">{t('settings.focusLockTitle')}</p>
                    <p className="text-sm text-stone-500">{t('settings.focusLockDesc')}</p>
                  </div>
                  <Switch
                    checked={secureLinkDefaults.focus_lock_enabled}
                    onCheckedChange={(checked) => updateSecureLinkDefault('focus_lock_enabled', checked)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('settings.idleTimeoutTitle')}</Label>
                  <Input
                    type="number"
                    min="0"
                    max="86400"
                    value={secureLinkDefaults.idle_timeout_seconds || 0}
                    onChange={(e) => updateSecureLinkDefault('idle_timeout_seconds', Number.parseInt(e.target.value || '0', 10) || null)}
                    className="h-12"
                  />
                  <p className="text-xs text-stone-500">{t('settings.idleTimeoutHelp')}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="flex items-center justify-between rounded-lg border border-stone-200 p-4">
                    <div>
                      <p className="font-medium text-stone-900">{t('settings.requireFullscreenTitle')}</p>
                      <p className="text-sm text-stone-500">{t('settings.requireFullscreenDesc')}</p>
                    </div>
                    <Switch
                      checked={secureLinkDefaults.require_fullscreen}
                      onCheckedChange={(checked) => updateSecureLinkDefault('require_fullscreen', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-stone-200 p-4">
                    <div>
                      <p className="font-medium text-stone-900">{t('settings.enhancedWatermarkTitle')}</p>
                      <p className="text-sm text-stone-500">{t('settings.enhancedWatermarkDesc')}</p>
                    </div>
                    <Switch
                      checked={secureLinkDefaults.enhanced_watermark}
                      onCheckedChange={(checked) => updateSecureLinkDefault('enhanced_watermark', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-stone-200 p-4">
                    <div>
                      <p className="font-medium text-stone-900">{t('settings.singleSessionTitle')}</p>
                      <p className="text-sm text-stone-500">{t('settings.singleSessionDesc')}</p>
                    </div>
                    <Switch
                      checked={secureLinkDefaults.single_viewer_session}
                      onCheckedChange={(checked) => updateSecureLinkDefault('single_viewer_session', checked)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-stone-200 p-4">
                  <div>
                    <p className="font-medium text-stone-900">{t('settings.lockFirstIpTitle')}</p>
                    <p className="text-sm text-stone-500">{t('settings.lockFirstIpDesc')}</p>
                  </div>
                  <Switch
                    checked={secureLinkDefaults.lock_to_first_ip}
                    onCheckedChange={(checked) => updateSecureLinkDefault('lock_to_first_ip', checked)}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-stone-200 p-4">
                  <div>
                    <p className="font-medium text-stone-900">{t('settings.ndaDefaultTitle')}</p>
                    <p className="text-sm text-stone-500">{t('settings.ndaDefaultDesc')}</p>
                  </div>
                  <Switch
                    checked={secureLinkDefaults.nda_required}
                    onCheckedChange={(checked) => updateSecureLinkDefault('nda_required', checked)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('settings.ndaTitleLabel')}</Label>
                  <Input
                    value={secureLinkDefaults.nda_title}
                    onChange={(e) => updateSecureLinkDefault('nda_title', e.target.value)}
                    className="h-12"
                    maxLength={120}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('settings.ndaTextLabel')}</Label>
                  <Textarea
                    value={secureLinkDefaults.nda_text}
                    onChange={(e) => updateSecureLinkDefault('nda_text', e.target.value)}
                    rows={5}
                    maxLength={4000}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('settings.ndaButtonLabel')}</Label>
                  <Input
                    value={secureLinkDefaults.nda_accept_label}
                    onChange={(e) => updateSecureLinkDefault('nda_accept_label', e.target.value)}
                    className="h-12"
                    maxLength={60}
                  />
                </div>

                <Button type="submit" className="bg-emerald-900 hover:bg-emerald-800" disabled={savingSecureLinkDefaults}>
                  {savingSecureLinkDefaults ? t('adminUsers.saving') : t('settings.secureLinkDefaultsSave')}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="max-w-4xl space-y-6">
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-emerald-700" />
                <span>{t('workspaceTeam.title')}</span>
              </CardTitle>
              <CardDescription>
                {t('workspaceTeam.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                <p className="font-medium text-stone-900">
                  {t('workspaceTeam.currentWorkspace')}: {teamState.workspace?.label || activeWorkspace?.label || user?.name || t('dashboardLayout.workspaceLabel')}
                </p>
                <p className="text-sm text-stone-500 mt-1">
                  {t('workspaceTeam.currentRole')}: {getWorkspaceRoleLabel(teamState.workspace?.role || activeWorkspace?.role, teamState.workspace?.role_label || activeWorkspace?.role_label || t('workspaceTeam.roleOwner'))}
                  {(teamState.workspace?.permissions?.manage_team || activeWorkspace?.permissions?.manage_team)
                    ? ` • ${t('workspaceTeam.manageEnabled')}`
                    : ` • ${t('workspaceTeam.viewOnly')}`}
                </p>
              </div>

              {teamLoading ? (
                <p className="text-sm text-stone-500">{t('workspaceTeam.loading')}</p>
              ) : (
                <>
                  {teamState.received_invitations.length > 0 && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                      <div>
                        <p className="font-medium text-stone-900">{t('workspaceTeam.pendingReceivedTitle')}</p>
                        <p className="text-sm text-stone-600">
                          {t('workspaceTeam.invitationsSentTo', { email: user?.email || t('workspaceTeam.yourAccount') })}
                        </p>
                      </div>
                      <div className="space-y-3">
                        {teamState.received_invitations.map((invitation) => (
                          <div key={invitation.invitation_id} className="rounded-lg border border-emerald-200 bg-white p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="font-medium text-stone-900">{invitation.account_name}</p>
                              <p className="text-sm text-stone-500">
                                {getWorkspaceRoleLabel(invitation.account_role, invitation.role_label)} {t('workspaceTeam.accessLabel')} • {t('workspaceTeam.invitedBy', { name: invitation.invited_by_name })}
                              </p>
                              <p className="text-xs text-stone-500 mt-1">
                                {t('workspaceTeam.expiresAt', {
                                  date: invitation.expires_at ? formatLocalizedDateTime(invitation.expires_at) : t('workspaceTeam.soon'),
                                })}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                className="bg-emerald-900 hover:bg-emerald-800"
                                disabled={processingReceivedInvitationId === invitation.invitation_id}
                                onClick={() => handleAcceptInvitation(invitation.invitation_id)}
                              >
                                {t('workspaceTeam.accept')}
                              </Button>
                              <Button
                                variant="outline"
                                disabled={processingReceivedInvitationId === invitation.invitation_id}
                                onClick={() => handleDeclineInvitation(invitation.invitation_id)}
                              >
                                {t('workspaceTeam.decline')}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {teamState.can_manage_team ? (
                    <>
                      <Card className="border-stone-200">
                        <CardHeader>
                          <CardTitle className="text-lg">{t('workspaceTeam.inviteTitle')}</CardTitle>
                          <CardDescription>
                            {t('workspaceTeam.inviteDescription')}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <form onSubmit={handleInviteTeamMember} className="grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_0.8fr_auto]">
                            <div>
                              <Label>{t('workspaceTeam.emailLabel')}</Label>
                              <Input
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                className="h-12 mt-1"
                                placeholder={t('workspaceTeam.emailPlaceholder')}
                              />
                            </div>
                            <div>
                              <Label>{t('workspaceTeam.roleLabel')}</Label>
                              <Select value={inviteRole} onValueChange={setInviteRole}>
                                <SelectTrigger className="h-12 mt-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="member">{t('workspaceTeam.roleMember')}</SelectItem>
                                  <SelectItem value="admin">{t('workspaceTeam.roleAdmin')}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-end">
                              <Button type="submit" className="w-full bg-emerald-900 hover:bg-emerald-800 h-12" disabled={invitingTeamMember}>
                                {invitingTeamMember ? t('workspaceTeam.inviting') : t('workspaceTeam.inviteAction')}
                              </Button>
                            </div>
                          </form>
                        </CardContent>
                      </Card>

                      <Card className="border-stone-200">
                        <CardHeader>
                          <CardTitle className="text-lg">{t('workspaceTeam.membersTitle')}</CardTitle>
                          <CardDescription>
                            {t('workspaceTeam.membersDescription')}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {teamState.members.map((member) => (
                            <div key={member.membership_id} className="rounded-lg border border-stone-200 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="font-medium text-stone-900">
                                  {member.name}
                                  {member.is_self ? ` (${t('workspaceTeam.youLabel')})` : ''}
                                </p>
                                <p className="text-sm text-stone-500">{member.email || t('workspaceTeam.noEmail')}</p>
                              </div>
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                {member.is_owner ? (
                                  <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-700">
                                    {t('workspaceTeam.roleOwner')}
                                  </div>
                                ) : (
                                  <>
                                    <Select
                                      value={member.account_role}
                                      onValueChange={(value) => handleUpdateMemberRole(member.membership_id, value)}
                                      disabled={updatingMembershipId === member.membership_id}
                                    >
                                      <SelectTrigger className="h-10 min-w-[140px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="member">{t('workspaceTeam.roleMember')}</SelectItem>
                                        <SelectItem value="admin">{t('workspaceTeam.roleAdmin')}</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      variant="outline"
                                      className="text-red-700 hover:bg-red-50"
                                      disabled={removingMembershipId === member.membership_id}
                                      onClick={() => handleRemoveMember(member.membership_id)}
                                    >
                                      {member.is_self ? t('workspaceTeam.leaveWorkspace') : t('workspaceTeam.removeMember')}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      <Card className="border-stone-200">
                        <CardHeader>
                          <CardTitle className="text-lg">{t('workspaceTeam.pendingTitle')}</CardTitle>
                          <CardDescription>
                            {t('workspaceTeam.pendingDescription')}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {teamState.invitations.length > 0 ? (
                            teamState.invitations.map((invitation) => (
                              <div key={invitation.invitation_id} className="rounded-lg border border-stone-200 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <p className="font-medium text-stone-900">{invitation.email}</p>
                                  <p className="text-sm text-stone-500">
                                    {getWorkspaceRoleLabel(invitation.account_role, invitation.role_label)} • {t('workspaceTeam.invitedBy', { name: invitation.invited_by_name })}
                                  </p>
                                  <p className="text-xs text-stone-500 mt-1">
                                    {t('workspaceTeam.expiresAt', {
                                      date: invitation.expires_at ? formatLocalizedDateTime(invitation.expires_at) : t('workspaceTeam.soon'),
                                    })}
                                  </p>
                                </div>
                                <Button
                                  variant="outline"
                                  className="text-red-700 hover:bg-red-50"
                                  disabled={cancellingInvitationId === invitation.invitation_id}
                                  onClick={() => handleCancelInvitation(invitation.invitation_id)}
                                >
                                  {t('workspaceTeam.cancelInvitation')}
                                </Button>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-stone-500">{t('workspaceTeam.noPending')}</p>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  ) : teamState.received_invitations.length === 0 ? (
                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
                      {t('workspaceTeam.readOnlyDescription')}
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {(activeWorkspace?.permissions?.manage_domains ?? true) && (
        <TabsContent value="domains" className="max-w-4xl">
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Globe className="w-5 h-5 text-emerald-700" />
                <span>{t('settings.customDomains')}</span>
              </CardTitle>
              <CardDescription>
                Add domains for secure links and direct PDF links, then choose a default.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Label className="text-sm text-stone-500 mb-2 block">Default domain for new links</Label>
                <Select value={defaultDomainId} onValueChange={handleDefaultDomainChange} disabled={updatingDefaultDomain}>
                  <SelectTrigger className="h-12 max-w-md" data-testid="default-domain-select">
                    <SelectValue placeholder="Select default domain" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="platform">Platform domain</SelectItem>
                    {domains.map((domain) => (
                      <SelectItem key={domain.domain_id} value={domain.domain_id} disabled={!isDomainReady(domain)}>
                        {domain.domain}{isDomainReady(domain) ? '' : ' (Verify first)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-stone-500 mt-2">
                  Only verified domains with active SSL can be set as default.
                </p>
              </div>

              <form onSubmit={handleAddDomain} className="flex gap-3 mb-6">
                <Input
                  placeholder="secure.yourdomain.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="h-12 flex-1"
                  data-testid="add-domain-input"
                />
                <Button type="submit" className="bg-emerald-900 hover:bg-emerald-800 h-12" disabled={addingDomain}>
                  {addingDomain ? t('settings.adding') : t('settings.addDomain')}
                </Button>
              </form>

              {domains.length > 0 ? (
                <div className="space-y-3">
                  {domains.map((domain) => (
                    <div key={domain.domain_id} className="p-4 bg-stone-50 rounded-lg">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium text-stone-900">{domain.domain}</p>
                            <p className="text-sm text-stone-500">
                              DNS: {domain.verification_status === 'verified' ? (
                                <span className="text-emerald-600">{t('settings.verified')}</span>
                              ) : (
                                <span className="text-amber-600">{t('settings.pendingVerification')}</span>
                              )}
                              <span className="mx-2">•</span>
                              SSL: {domain.ssl_status === 'active' ? (
                                <span className="text-emerald-600">Active (Let's Encrypt)</span>
                              ) : domain.ssl_status === 'invalid' ? (
                                <span className="text-red-600">Invalid</span>
                              ) : (
                                <span className="text-amber-600">Pending</span>
                              )}
                              <span className="mx-2">•</span>
                              Vercel: {domain.vercel_status === 'verified' ? (
                                <span className="text-emerald-600">Verified</span>
                              ) : domain.vercel_status === 'pending' ? (
                                <span className="text-amber-600">Pending</span>
                              ) : domain.vercel_status === 'error' ? (
                                <span className="text-red-600">Error</span>
                              ) : domain.vercel_status === 'not_configured' ? (
                                <span className="text-amber-600">Not Configured</span>
                              ) : (
                                <span className="text-stone-600">{domain.vercel_status || 'Unknown'}</span>
                              )}
                              {domain.is_default && (
                                <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                                  Default
                                </span>
                              )}
                            </p>
                            {domain.verification_error && !domain.is_ready && (
                              <p className="text-xs text-amber-700 mt-1">{domain.verification_error}</p>
                            )}
                            {domain.vercel_error && (
                              <p className="text-xs text-amber-700 mt-1">Vercel: {domain.vercel_error}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleVerifyDomain(domain.domain_id)}
                              disabled={verifyingDomainId === domain.domain_id}
                            >
                              {verifyingDomainId === domain.domain_id ? 'Verifying...' : 'Verify DNS & SSL'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteDomain(domain.domain_id)}
                              className="text-red-600 hover:bg-red-50"
                            >
                              {t('settings.remove')}
                            </Button>
                          </div>
                        </div>

                        <div className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600 space-y-1">
                          <p>
                            <span className="font-semibold">TXT</span> {domain.verification_txt_name} = {domain.verification_token}
                          </p>
                          <p>
                            <span className="font-semibold">CNAME</span> {domain.domain} → {domain.cname_target}
                          </p>
                          {Array.isArray(domain.expected_a_targets) && domain.expected_a_targets.length > 0 && (
                            <p>
                              <span className="font-semibold">A</span> (optional for apex): {domain.expected_a_targets.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-stone-500 text-center py-8">{t('settings.noDomains')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}
      </Tabs>
    </DashboardLayout>
  );
};

export default Settings;
