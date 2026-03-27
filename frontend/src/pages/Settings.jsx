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
import { Link } from 'react-router-dom';
import { SettingsTabsContent } from '../components/settings/SettingsTabs';

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
    watermark_mode: 'basic',
    watermark_text: '',
    watermark_logo_url: '',
    single_viewer_session: false,
    nda_required: false,
    nda_title: 'Confidentiality agreement',
    nda_text: 'This document contains confidential information. By continuing, you agree not to copy, share, capture, or distribute any part of this material without authorization.',
    nda_accept_label: 'I agree and continue',
    lock_to_first_ip: false,
    geo_restriction_mode: 'off',
    geo_country_codes: '',
  });
  const isPrivilegedAccount = user?.role === 'admin' || user?.role === 'super_admin';
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language || 'en', { dateStyle: 'long' }),
    [language],
  );
  const dateTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat(language || 'en', { dateStyle: 'medium', timeStyle: 'short' }),
    [language],
  );

  const formatLocalizedDate = (value) => {
    if (!value) return '';
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return dateFormatter.format(parsed);
  };

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
        watermark_mode: user?.secure_link_defaults?.watermark_mode || 'basic',
        watermark_text: user?.secure_link_defaults?.watermark_text || '',
        watermark_logo_url: user?.secure_link_defaults?.watermark_logo_url || '',
        single_viewer_session: Boolean(user?.secure_link_defaults?.single_viewer_session),
        nda_required: Boolean(user?.secure_link_defaults?.nda_required),
        nda_title: user?.secure_link_defaults?.nda_title || 'Confidentiality agreement',
        nda_text: user?.secure_link_defaults?.nda_text || 'This document contains confidential information. By continuing, you agree not to copy, share, capture, or distribute any part of this material without authorization.',
        nda_accept_label: user?.secure_link_defaults?.nda_accept_label || 'I agree and continue',
        lock_to_first_ip: Boolean(user?.secure_link_defaults?.lock_to_first_ip),
        geo_restriction_mode: user?.secure_link_defaults?.geo_restriction_mode || 'off',
        geo_country_codes: Array.isArray(user?.secure_link_defaults?.geo_country_codes)
          ? user.secure_link_defaults.geo_country_codes.join(', ')
          : '',
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
      toast.success(t('settings.languageUpdated'));
    } catch (error) {
      toast.error(t('settings.languageUpdateFailed'));
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
      toast.success(t('settings.domainAdded'));
      await fetchDomains();
      if (response.data?.is_default && response.data?.is_ready) {
        setDefaultDomainId(response.data.domain_id);
      }
      setNewDomain('');
    } catch (error) {
      const message = error.response?.data?.detail || t('settings.addDomainFailed');
      toast.error(message);
    } finally {
      setAddingDomain(false);
    }
  };

  const handleDeleteDomain = async (domainId) => {
    try {
      await api.delete(`/domains/${domainId}`);
      toast.success(t('settings.domainRemoved'));
      await fetchDomains();
    } catch (error) {
      toast.error(t('settings.removeDomainFailed'));
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
      toast.success(t('settings.defaultDomainUpdated'));
      await fetchDomains();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('settings.defaultDomainUpdateFailed'));
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
        toast.success(t('settings.domainVerifiedActiveSsl'));
      } else {
        toast.warning(response.data?.verification_error || t('settings.domainNotReady'));
      }
      await fetchDomains();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('settings.verifyDomainFailed'));
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
      toast.success(response.data?.message || t('workspaceTeam.inviteCreated'));
      if (response.data?.invite_url) {
        try {
          if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(response.data.invite_url);
            toast.success(t('workspaceTeam.inviteLinkCopied'));
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
      toast.success(response.data?.message || t('workspaceTeam.memberUpdated'));
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
      toast.success(response.data?.message || t('workspaceTeam.memberRemoved'));
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
      toast.success(response.data?.message || t('workspaceTeam.inviteCancelled'));
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
      toast.success(response.data?.message || t('workspaceTeam.inviteAccepted'));
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
      toast.success(response.data?.message || t('workspaceTeam.inviteDeclined'));
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
      toast.success(t('settings.profileUpdated'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('settings.profileUpdateFailed'));
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
      toast.success(t('settings.billingProfileUpdated'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('settings.billingProfileUpdateFailed'));
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
        toast.error(error.response?.data?.detail || t('settings.billingLoadFailed'));
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
      toast.error(error.response?.data?.detail || t('settings.billingPortalFailed'));
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
      toast.success(t('settings.invoiceDownloaded'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('settings.invoiceDownloadFailed'));
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const handleSendResetEmail = async () => {
    if (!user?.email) {
      toast.error(t('settings.missingEmailAddress'));
      return;
    }

    setSendingResetEmail(true);
    try {
      await requestOwnPasswordReset();
      toast.success(t('settings.passwordResetSent'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('settings.passwordResetFailed'));
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
      toast.error(error.response?.data?.detail || t('settings.twoFactorStatusLoadFailed'));
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
      toast.success(t('settings.twoFactorSetupStarted'));
      await refreshUser();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('settings.twoFactorSetupStartFailed'));
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
      toast.success(response.data?.message || t('settings.twoFactorEnabledToast'));
      await refreshUser();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('settings.twoFactorEnableFailed'));
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
      toast.success(response.data?.message || t('settings.twoFactorDisabledToast'));
      await refreshUser();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('settings.twoFactorDisableFailed'));
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
    if (
      secureLinkDefaults.geo_restriction_mode !== 'off' &&
      !String(secureLinkDefaults.geo_country_codes || '').trim()
    ) {
      toast.error(t('settings.geoCountryCodesRequired'));
      return;
    }
    if (secureLinkDefaults.watermark_mode === 'text' && !String(secureLinkDefaults.watermark_text || '').trim()) {
      toast.error('Add watermark text or switch to a different watermark type.');
      return;
    }
    if (secureLinkDefaults.watermark_mode === 'logo' && !String(secureLinkDefaults.watermark_logo_url || '').trim()) {
      toast.error('Add a logo image URL or switch to a different watermark type.');
      return;
    }
    setSavingSecureLinkDefaults(true);
    try {
      await api.put('/auth/profile', {
        secure_link_defaults: secureLinkDefaults,
      });
      await refreshUser();
      toast.success(t('settings.secureLinkDefaultsUpdated'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('settings.secureLinkDefaultsUpdateFailed'));
    } finally {
      setSavingSecureLinkDefaults(false);
    }
  };

  const getPlanLabel = (planId) => {
    if (planId && plans?.[planId]?.name) return plans[planId].name;
    return t('adminUsers.noSubscription');
  };

  const settingsTabsContext = {
    user,
    activeWorkspace,
    activeWorkspaceId,
    refreshWorkspaces,
    updateUserLanguage,
    refreshUser,
    requestOwnPasswordReset,
    requestEmailChange,
    plans,
    language,
    setLanguage,
    languages,
    t,
    activeTab,
    setActiveTab,
    loadedTabs,
    setLoadedTabs,
    domains,
    setDomains,
    defaultDomainId,
    setDefaultDomainId,
    newDomain,
    setNewDomain,
    addingDomain,
    setAddingDomain,
    updatingDefaultDomain,
    setUpdatingDefaultDomain,
    verifyingDomainId,
    setVerifyingDomainId,
    savingLanguage,
    setSavingLanguage,
    billingOverview,
    setBillingOverview,
    billingLoading,
    setBillingLoading,
    openingBillingPortal,
    setOpeningBillingPortal,
    downloadingInvoiceId,
    setDownloadingInvoiceId,
    profileName,
    setProfileName,
    billingProfile,
    setBillingProfile,
    savingAccount,
    setSavingAccount,
    savingBillingProfile,
    setSavingBillingProfile,
    sendingResetEmail,
    setSendingResetEmail,
    newEmail,
    setNewEmail,
    sendingEmailChange,
    setSendingEmailChange,
    teamState,
    setTeamState,
    teamLoading,
    setTeamLoading,
    inviteEmail,
    setInviteEmail,
    inviteRole,
    setInviteRole,
    invitingTeamMember,
    setInvitingTeamMember,
    updatingMembershipId,
    setUpdatingMembershipId,
    removingMembershipId,
    setRemovingMembershipId,
    cancellingInvitationId,
    setCancellingInvitationId,
    processingReceivedInvitationId,
    setProcessingReceivedInvitationId,
    twoFactorStatus,
    setTwoFactorStatus,
    twoFactorSetupData,
    setTwoFactorSetupData,
    twoFactorQrCodeUrl,
    setTwoFactorQrCodeUrl,
    twoFactorCode,
    setTwoFactorCode,
    twoFactorDisableCode,
    setTwoFactorDisableCode,
    twoFactorLoading,
    setTwoFactorLoading,
    savingSecureLinkDefaults,
    setSavingSecureLinkDefaults,
    secureLinkDefaults,
    setSecureLinkDefaults,
    isPrivilegedAccount,
    dateFormatter,
    dateTimeFormatter,
    formatLocalizedDate,
    formatLocalizedDateTime,
    getWorkspaceRoleLabel,
    fetchDomains,
    isDomainReady,
    handleLanguageChange,
    handleAddDomain,
    handleDeleteDomain,
    handleDefaultDomainChange,
    handleVerifyDomain,
    fetchTeamState,
    handleInviteTeamMember,
    handleUpdateMemberRole,
    handleRemoveMember,
    handleCancelInvitation,
    handleAcceptInvitation,
    handleDeclineInvitation,
    updateBillingField,
    handleAccountSave,
    handleBillingProfileSave,
    formatAmount,
    fetchBillingOverview,
    handleManageBilling,
    handleDownloadInvoice,
    handleSendResetEmail,
    fetchTwoFactorStatus,
    handleStartTwoFactorSetup,
    handleEnableTwoFactor,
    handleDisableTwoFactor,
    handleRequestEmailChange,
    updateSecureLinkDefault,
    handleSaveSecureLinkDefaults,
    getPlanLabel,
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

        <SettingsTabsContent ctx={settingsTabsContext} />
      </Tabs>
    </DashboardLayout>
  );
};

export default Settings;
