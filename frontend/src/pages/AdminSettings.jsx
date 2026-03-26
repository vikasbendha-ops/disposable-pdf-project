import React, { useMemo, useState, useEffect, useRef } from 'react';
import { CreditCard, Shield, CheckCircle, AlertCircle, Eye, EyeOff, Palette, Search, Globe, FileText, Mail, Copy, Link2, Plus, Activity, History, RefreshCw, Settings2, HardDrive } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  api,
  DEFAULT_BRANDING,
  DEFAULT_PUBLIC_SITE,
  DEFAULT_SUBSCRIPTION_PLANS,
  getOrderedPlanEntries,
  useAuth,
  useBranding,
  usePublicSite,
  useSeo,
  useSubscriptionPlans,
} from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { getRawTranslation, getTranslationEntries } from '../i18n/translations';
import { DEFAULT_SEO_SETTINGS } from '../../../lib/seo';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import { AdminSettingsTabsContent } from '../components/admin-settings/AdminSettingsTabs';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const PLAN_ID_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const SETTINGS_ACCESS_ROLES = ['admin', 'super_admin'];
const SETTINGS_SECTION_KEYS = [
  'payments',
  'localization',
  'email',
  'public_site',
  'plans',
  'storage',
  'domains',
  'branding',
  'seo',
  'invoice',
];
const STORAGE_PROVIDER_LABELS = {
  supabase_db: 'Supabase (database)',
  wasabi_s3: 'Wasabi (S3 compatible)',
};
const SETTINGS_GROUPS = [
  {
    value: 'operations',
    labelKey: 'adminSettingsGroups.operations',
    icon: Activity,
    tabs: ['operations'],
  },
  {
    value: 'commerce',
    labelKey: 'adminSettingsGroups.commerce',
    icon: CreditCard,
    tabs: ['payments', 'plans', 'invoice'],
  },
  {
    value: 'platform',
    labelKey: 'adminSettingsGroups.platform',
    icon: Globe,
    tabs: ['localization', 'public-site', 'branding', 'seo'],
  },
  {
    value: 'infrastructure',
    labelKey: 'adminSettingsGroups.infrastructure',
    icon: HardDrive,
    tabs: ['email', 'storage', 'domains'],
  },
  {
    value: 'access',
    labelKey: 'adminSettingsGroups.access',
    icon: Shield,
    tabs: ['permissions'],
  },
];

const formatPlanNameFromId = (planId) =>
  String(planId || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Custom Plan';

const createPlanEditor = (planId, plan = {}, index = 0) => {
  const defaults = DEFAULT_SUBSCRIPTION_PLANS[planId] || {
    name: formatPlanNameFromId(planId),
    description: '',
    badge: '',
    price: 0,
    storage_mb: 0,
    links_per_month: 0,
    featured: false,
    active: true,
    public_visible: false,
    sort_order: 100 + index,
    features: [],
  };
  return {
    name: plan?.name || defaults.name || '',
    description: plan?.description || defaults.description || '',
    badge: plan?.badge || defaults.badge || '',
    price: String(plan?.price ?? defaults.price ?? ''),
    storage_mb: String(plan?.storage_mb ?? defaults.storage_mb ?? ''),
    links_per_month: String(plan?.links_per_month ?? defaults.links_per_month ?? ''),
    featured: Boolean(plan?.featured ?? defaults.featured),
    active: plan?.active !== false,
    public_visible:
      plan?.public_visible !== undefined
        ? Boolean(plan.public_visible)
        : Boolean(defaults.public_visible),
    sort_order: String(plan?.sort_order ?? defaults.sort_order ?? (100 + index)),
    features: Array.isArray(plan?.features) ? plan.features.join('\n') : defaults.features.join('\n'),
  };
};

const buildPlanEditorState = (planSource = DEFAULT_SUBSCRIPTION_PLANS) => {
  const orderedPlanIds = getOrderedPlanEntries({
    ...DEFAULT_SUBSCRIPTION_PLANS,
    ...(planSource || {}),
  }).map(([planId]) => planId);
  return orderedPlanIds.reduce((accumulator, planId, index) => {
    accumulator[planId] = createPlanEditor(planId, planSource?.[planId], index);
    return accumulator;
  }, {});
};

const getCredentialSaveState = (saved, draft) => {
  if (saved && draft) return 'updated, save pending';
  if (saved) return 'saved';
  if (draft) return 'entered, save pending';
  return 'missing';
};

const getDraftFieldValue = (stateValue, inputRef) => {
  const stateText = String(stateValue || '').trim();
  if (stateText) return stateText;
  return String(inputRef?.current?.value || '').trim();
};

const COMMON_CURRENCY_OPTIONS = ['EUR', 'USD', 'GBP', 'INR', 'AUD', 'CAD', 'SGD', 'AED'];

const getTimezoneOptions = () => {
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return ['UTC', 'Europe/Rome', 'Europe/London', 'Asia/Kolkata', 'America/New_York'];
    }
  }
  return ['UTC', 'Europe/Rome', 'Europe/London', 'Asia/Kolkata', 'America/New_York'];
};

const resolveTranslationPreviewValue = ({
  languageCode,
  path,
  fallbackLanguage,
  manualOverrides,
}) => {
  const ownOverride = manualOverrides?.[languageCode]?.[path];
  if (ownOverride !== undefined) {
    return ownOverride;
  }

  const ownValue = getRawTranslation(languageCode, path);
  if (ownValue !== undefined) {
    return ownValue;
  }

  const fallbackOverride = manualOverrides?.[fallbackLanguage]?.[path];
  if (fallbackOverride !== undefined) {
    return fallbackOverride;
  }

  const fallbackValue = getRawTranslation(fallbackLanguage, path);
  if (fallbackValue !== undefined) {
    return fallbackValue;
  }

  return getRawTranslation('en', path);
};

const AdminSettings = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { refreshBranding } = useBranding();
  const { refreshPublicSite } = usePublicSite();
  const { refreshSeo } = useSeo();
  const { refreshPlans } = useSubscriptionPlans();
  const {
    t,
    languages,
    allLanguages,
    refreshLocalization,
  } = useLanguage();
  const isSuperAdmin = user?.role === 'super_admin';
  const [activeTab, setActiveTab] = useState('payments');
  const [loadedTabs, setLoadedTabs] = useState({});

  const [stripeConfig, setStripeConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liveKey, setLiveKey] = useState('');
  const [sandboxKey, setSandboxKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const [storageConfig, setStorageConfig] = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageSaving, setStorageSaving] = useState(false);
  const [storageProvider, setStorageProvider] = useState('supabase_db');
  const [wasabiEndpoint, setWasabiEndpoint] = useState('');
  const [wasabiRegion, setWasabiRegion] = useState('us-east-1');
  const [wasabiBucket, setWasabiBucket] = useState('');
  const [wasabiAccessKey, setWasabiAccessKey] = useState('');
  const [wasabiSecretKey, setWasabiSecretKey] = useState('');
  const [wasabiForcePathStyle, setWasabiForcePathStyle] = useState(true);
  const [emailDeliveryConfig, setEmailDeliveryConfig] = useState(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailProvider, setEmailProvider] = useState('supabase');
  const [gmailClientId, setGmailClientId] = useState('');
  const [gmailClientSecret, setGmailClientSecret] = useState('');
  const [gmailFromEmail, setGmailFromEmail] = useState('');
  const [gmailFromName, setGmailFromName] = useState('');
  const [gmailReplyTo, setGmailReplyTo] = useState('');
  const [showGmailClientSecret, setShowGmailClientSecret] = useState(false);
  const [mailgunApiKey, setMailgunApiKey] = useState('');
  const [mailgunDomain, setMailgunDomain] = useState('');
  const [mailgunRegion, setMailgunRegion] = useState('us');
  const [mailgunFromEmail, setMailgunFromEmail] = useState('');
  const [mailgunFromName, setMailgunFromName] = useState('');
  const [mailgunReplyTo, setMailgunReplyTo] = useState('');
  const [showMailgunApiKey, setShowMailgunApiKey] = useState(false);
  const [outlookTenantId, setOutlookTenantId] = useState('common');
  const [outlookClientId, setOutlookClientId] = useState('');
  const [outlookClientSecret, setOutlookClientSecret] = useState('');
  const [outlookFromEmail, setOutlookFromEmail] = useState('');
  const [outlookFromName, setOutlookFromName] = useState('');
  const [outlookReplyTo, setOutlookReplyTo] = useState('');
  const [outlookSaveToSentItems, setOutlookSaveToSentItems] = useState(true);
  const [showOutlookClientSecret, setShowOutlookClientSecret] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpEncryption, setSmtpEncryption] = useState('tls');
  const [smtpAuthEnabled, setSmtpAuthEnabled] = useState(true);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpReplyTo, setSmtpReplyTo] = useState('');
  const [smtpForceReturnPath, setSmtpForceReturnPath] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [emailTestRecipient, setEmailTestRecipient] = useState('');
  const [emailOauthFeedback, setEmailOauthFeedback] = useState(null);
  const [vercelConfig, setVercelConfig] = useState(null);
  const [vercelLoading, setVercelLoading] = useState(false);
  const [vercelSaving, setVercelSaving] = useState(false);
  const [vercelProjectId, setVercelProjectId] = useState('');
  const [vercelTeamId, setVercelTeamId] = useState('');
  const [vercelApiToken, setVercelApiToken] = useState('');
  const [vercelAutoAttach, setVercelAutoAttach] = useState(true);
  const [showVercelToken, setShowVercelToken] = useState(false);
  const gmailClientIdRef = useRef(null);
  const gmailClientSecretRef = useRef(null);
  const outlookClientIdRef = useRef(null);
  const outlookClientSecretRef = useRef(null);

  const [brandingConfig, setBrandingConfig] = useState(null);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandName, setBrandName] = useState(DEFAULT_BRANDING.app_name);
  const [brandProductName, setBrandProductName] = useState(DEFAULT_BRANDING.product_name);
  const [brandTagline, setBrandTagline] = useState(DEFAULT_BRANDING.tagline);
  const [brandPrimaryColor, setBrandPrimaryColor] = useState(DEFAULT_BRANDING.primary_color);
  const [brandAccentColor, setBrandAccentColor] = useState(DEFAULT_BRANDING.accent_color);
  const [brandFooterText, setBrandFooterText] = useState(DEFAULT_BRANDING.footer_text);

  const [seoConfig, setSeoConfig] = useState(null);
  const [seoLoading, setSeoLoading] = useState(false);
  const [seoSaving, setSeoSaving] = useState(false);
  const [seoSiteName, setSeoSiteName] = useState(DEFAULT_SEO_SETTINGS.site_name);
  const [seoDefaultTitle, setSeoDefaultTitle] = useState(DEFAULT_SEO_SETTINGS.default_title);
  const [seoDefaultDescription, setSeoDefaultDescription] = useState(
    DEFAULT_SEO_SETTINGS.default_description,
  );
  const [seoKeywords, setSeoKeywords] = useState(DEFAULT_SEO_SETTINGS.default_keywords);
  const [seoOgImageUrl, setSeoOgImageUrl] = useState(DEFAULT_SEO_SETTINGS.og_image_url);
  const [seoFaviconUrl, setSeoFaviconUrl] = useState(DEFAULT_SEO_SETTINGS.favicon_url);
  const [seoCanonicalBaseUrl, setSeoCanonicalBaseUrl] = useState('');
  const [seoTwitterHandle, setSeoTwitterHandle] = useState('');
  const [seoNoindex, setSeoNoindex] = useState(false);

  const [invoiceTemplate, setInvoiceTemplate] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceCompanyName, setInvoiceCompanyName] = useState('Autodestroy PDF Platform');
  const [invoiceCompanyAddress, setInvoiceCompanyAddress] = useState('Business Address, City, Country');
  const [invoiceCompanyEmail, setInvoiceCompanyEmail] = useState('billing@autodestroy.app');
  const [invoiceCompanyPhone, setInvoiceCompanyPhone] = useState('');
  const [invoiceCompanyWebsite, setInvoiceCompanyWebsite] = useState('');
  const [invoiceTaxLabel, setInvoiceTaxLabel] = useState('Tax ID');
  const [invoiceTaxId, setInvoiceTaxId] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('INV');
  const [invoiceNotes, setInvoiceNotes] = useState('Thank you for your business.');
  const [invoiceTerms, setInvoiceTerms] = useState('Payments are processed securely by Stripe.');
  const [invoiceFooterText, setInvoiceFooterText] = useState('This invoice is system generated and valid without signature.');
  const [invoicePrimaryColor, setInvoicePrimaryColor] = useState('#064e3b');
  const [invoiceAccentColor, setInvoiceAccentColor] = useState('#10b981');
  const [invoiceLogoUrl, setInvoiceLogoUrl] = useState('');
  const [invoiceShowLogo, setInvoiceShowLogo] = useState(true);
  const [authEmailTemplate, setAuthEmailTemplate] = useState(null);
  const [authEmailLoading, setAuthEmailLoading] = useState(false);
  const [authEmailSaving, setAuthEmailSaving] = useState(false);
  const [verifyEmailSubject, setVerifyEmailSubject] = useState('Verify your email address');
  const [verifyEmailPreview, setVerifyEmailPreview] = useState('Use the secure link below to verify your email and activate your account.');
  const [verifyEmailHeading, setVerifyEmailHeading] = useState('Verify your email address');
  const [verifyEmailBody, setVerifyEmailBody] = useState('Welcome to {{app_name}}.\n\nUse the secure button below to verify your email address and activate your account.');
  const [verifyEmailButtonLabel, setVerifyEmailButtonLabel] = useState('Verify email');
  const [verifyEmailExpiryNotice, setVerifyEmailExpiryNotice] = useState('This secure link expires in {{expiry_hours}} hours.');
  const [verifyEmailFooter, setVerifyEmailFooter] = useState('If you did not create this account, you can safely ignore this email.');
  const [passwordResetEmailSubject, setPasswordResetEmailSubject] = useState('Reset your password');
  const [passwordResetEmailPreview, setPasswordResetEmailPreview] = useState('Use the secure link below to choose a new password for your account.');
  const [passwordResetEmailHeading, setPasswordResetEmailHeading] = useState('Reset your password');
  const [passwordResetEmailBody, setPasswordResetEmailBody] = useState('We received a request to reset the password for your {{app_name}} account.\n\nUse the secure button below to choose a new password.');
  const [passwordResetEmailButtonLabel, setPasswordResetEmailButtonLabel] = useState('Reset password');
  const [passwordResetEmailExpiryNotice, setPasswordResetEmailExpiryNotice] = useState('This secure link expires in {{expiry_minutes}} minutes.');
  const [passwordResetEmailFooter, setPasswordResetEmailFooter] = useState('If you did not request a password reset, you can safely ignore this email.');
  const [localizationLoading, setLocalizationLoading] = useState(false);
  const [localizationSaving, setLocalizationSaving] = useState(false);
  const [platformLanguage, setPlatformLanguage] = useState('en');
  const [enabledLanguages, setEnabledLanguages] = useState(['en']);
  const [automaticLanguageRecognition, setAutomaticLanguageRecognition] = useState(false);
  const [siteTimezone, setSiteTimezone] = useState('UTC');
  const [siteCurrency, setSiteCurrency] = useState('EUR');
  const [manualTranslationOverrides, setManualTranslationOverrides] = useState({});
  const [localizationSectionTab, setLocalizationSectionTab] = useState('languages');
  const [translationTargetLanguage, setTranslationTargetLanguage] = useState('en');
  const [translationSearch, setTranslationSearch] = useState('');
  const [translationShowUntranslatedOnly, setTranslationShowUntranslatedOnly] = useState(false);
  const [translationRowsPerPage, setTranslationRowsPerPage] = useState('25');
  const [translationPage, setTranslationPage] = useState(1);
  const [translationSaving, setTranslationSaving] = useState(false);
  const [advancedLanguage, setAdvancedLanguage] = useState('en');
  const [advancedOverridesJson, setAdvancedOverridesJson] = useState('{}');
  const [publicSiteConfig, setPublicSiteConfig] = useState(null);
  const [publicSiteLoading, setPublicSiteLoading] = useState(false);
  const [publicSiteSaving, setPublicSiteSaving] = useState(false);
  const [publicAboutUrl, setPublicAboutUrl] = useState(DEFAULT_PUBLIC_SITE.about_url);
  const [publicContactUrl, setPublicContactUrl] = useState(DEFAULT_PUBLIC_SITE.contact_url);
  const [publicBlogUrl, setPublicBlogUrl] = useState(DEFAULT_PUBLIC_SITE.blog_url);
  const [publicPrivacyUrl, setPublicPrivacyUrl] = useState(DEFAULT_PUBLIC_SITE.privacy_url);
  const [publicTermsUrl, setPublicTermsUrl] = useState(DEFAULT_PUBLIC_SITE.terms_url);
  const [publicGdprUrl, setPublicGdprUrl] = useState(DEFAULT_PUBLIC_SITE.gdpr_url);
  const [authPortalUrl, setAuthPortalUrl] = useState(DEFAULT_PUBLIC_SITE.auth_portal_url);
  const [planConfig, setPlanConfig] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [planCurrency, setPlanCurrency] = useState('eur');
  const [planInterval, setPlanInterval] = useState('month');
  const [planEditors, setPlanEditors] = useState(() => buildPlanEditorState());
  const [showNewPlanDialog, setShowNewPlanDialog] = useState(false);
  const [newPlanId, setNewPlanId] = useState('');
  const [newPlanName, setNewPlanName] = useState('');
  const [copiedPlanLink, setCopiedPlanLink] = useState('');
  const [operationsHealth, setOperationsHealth] = useState(null);
  const [operationsHealthLoading, setOperationsHealthLoading] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsRunning, setJobsRunning] = useState(false);
  const [settingsHistory, setSettingsHistory] = useState([]);
  const [settingsHistoryLoading, setSettingsHistoryLoading] = useState(false);
  const [settingsHistoryFilter, setSettingsHistoryFilter] = useState('all');
  const [settingsPermissionsConfig, setSettingsPermissionsConfig] = useState(null);
  const [settingsPermissionsLoading, setSettingsPermissionsLoading] = useState(false);
  const [settingsPermissionsSaving, setSettingsPermissionsSaving] = useState(false);
  const [settingsPermissionEditors, setSettingsPermissionEditors] = useState({});
  const [storageMigrationSource, setStorageMigrationSource] = useState('all');
  const [storageMigrationLimit, setStorageMigrationLimit] = useState('1000');
  const [storageMigrationRunning, setStorageMigrationRunning] = useState(false);

  const fetchStripeConfig = async () => {
    try {
      const res = await api.get('/admin/settings/stripe');
      setStripeConfig(res.data);
    } catch (err) {
      toast.error(t('adminSettingsGeneral.loadStripeFailed'));
    } finally {
      setLoading(false);
    }
  };

  const applyLocalizationState = (config) => {
    setPlatformLanguage(config?.default_language || 'en');
    setEnabledLanguages(
      Array.isArray(config?.enabled_languages) && config.enabled_languages.length
        ? config.enabled_languages
        : [config?.default_language || 'en'],
    );
    setAutomaticLanguageRecognition(Boolean(config?.automatic_detection));
    setSiteTimezone(config?.site_timezone || 'UTC');
    setSiteCurrency((config?.site_currency || 'EUR').toUpperCase());
    setManualTranslationOverrides(config?.manual_overrides || {});
  };

  const fetchLocalizationConfig = async () => {
    setLocalizationLoading(true);
    try {
      const res = await api.get('/admin/settings/localization');
      applyLocalizationState(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || t('adminSettingsLocalization.loadFailed'));
    } finally {
      setLocalizationLoading(false);
    }
  };

  const applyStorageState = (config) => {
    setStorageConfig(config);
    setStorageProvider(config?.active_provider || 'supabase_db');
    setWasabiEndpoint(config?.wasabi?.endpoint || '');
    setWasabiRegion(config?.wasabi?.region || 'us-east-1');
    setWasabiBucket(config?.wasabi?.bucket || '');
    setWasabiForcePathStyle(config?.wasabi?.force_path_style !== false);
  };

  const applyEmailDeliveryState = (config) => {
    setEmailDeliveryConfig(config);
    setEmailProvider(config?.requested_provider || config?.active_provider || 'supabase');
    setGmailClientId('');
    setGmailClientSecret('');
    setGmailFromEmail(config?.gmail?.from_email || '');
    setGmailFromName(config?.gmail?.from_name || '');
    setGmailReplyTo(config?.gmail?.reply_to || '');
    setMailgunApiKey('');
    setMailgunDomain(config?.mailgun?.domain || '');
    setMailgunRegion(config?.mailgun?.region || 'us');
    setMailgunFromEmail(config?.mailgun?.from_email || '');
    setMailgunFromName(config?.mailgun?.from_name || '');
    setMailgunReplyTo(config?.mailgun?.reply_to || '');
    setOutlookTenantId(config?.outlook?.tenant_id || 'common');
    setOutlookClientId('');
    setOutlookClientSecret('');
    setOutlookFromEmail(config?.outlook?.from_email || '');
    setOutlookFromName(config?.outlook?.from_name || '');
    setOutlookReplyTo(config?.outlook?.reply_to || '');
    setOutlookSaveToSentItems(config?.outlook?.save_to_sent_items !== false);
    setSmtpHost(config?.smtp?.host || '');
    setSmtpPort(String(config?.smtp?.port || 587));
    setSmtpEncryption(config?.smtp?.encryption || 'tls');
    setSmtpAuthEnabled(config?.smtp?.auth_enabled !== false);
    setSmtpFromEmail(config?.smtp?.from_email || '');
    setSmtpFromName(config?.smtp?.from_name || '');
    setSmtpReplyTo(config?.smtp?.reply_to || '');
    setSmtpForceReturnPath(Boolean(config?.smtp?.force_return_path));
    setSmtpUsername('');
    setSmtpPassword('');
    setEmailTestRecipient((current) => current || user?.email || '');
  };

  const applyVercelState = (config) => {
    setVercelConfig(config);
    setVercelProjectId(config?.project_id || '');
    setVercelTeamId(config?.team_id || '');
    setVercelAutoAttach(config?.auto_attach !== false);
  };

  const fetchStorageConfig = async () => {
    setStorageLoading(true);
    try {
      const res = await api.get('/admin/settings/storage');
      applyStorageState(res.data);
    } catch (err) {
      setStorageConfig(null);
      if (err.response?.status !== 403) {
        toast.error(err.response?.data?.detail || t('adminSettingsGeneral.loadStorageFailed'));
      }
    } finally {
      setStorageLoading(false);
    }
  };

  const fetchEmailDeliveryConfig = async () => {
    setEmailLoading(true);
    try {
      const res = await api.get('/admin/settings/email-delivery');
      applyEmailDeliveryState(res.data);
    } catch (err) {
      setEmailDeliveryConfig(null);
      if (err.response?.status !== 403) {
        toast.error(err.response?.data?.detail || t('adminSettingsGeneral.loadEmailFailed'));
      }
    } finally {
      setEmailLoading(false);
    }
  };

  const fetchVercelConfig = async () => {
    setVercelLoading(true);
    try {
      const res = await api.get('/admin/settings/vercel');
      applyVercelState(res.data);
    } catch (err) {
      setVercelConfig(null);
      if (err.response?.status !== 403) {
        toast.error(err.response?.data?.detail || t('adminSettingsGeneral.loadVercelFailed'));
      }
    } finally {
      setVercelLoading(false);
    }
  };

  const applyBrandingState = (config) => {
    setBrandingConfig(config);
    setBrandName(config?.app_name || DEFAULT_BRANDING.app_name);
    setBrandProductName(config?.product_name || DEFAULT_BRANDING.product_name);
    setBrandTagline(config?.tagline || DEFAULT_BRANDING.tagline);
    setBrandPrimaryColor(config?.primary_color || DEFAULT_BRANDING.primary_color);
    setBrandAccentColor(config?.accent_color || DEFAULT_BRANDING.accent_color);
    setBrandFooterText(config?.footer_text || DEFAULT_BRANDING.footer_text);
  };

  const fetchBrandingConfig = async () => {
    setBrandingLoading(true);
    try {
      const res = await api.get('/admin/settings/branding');
      applyBrandingState(res.data);
    } catch (err) {
      setBrandingConfig(null);
      if (err.response?.status !== 403) {
        toast.error(err.response?.data?.detail || t('adminSettingsGeneral.loadBrandingFailed'));
      }
    } finally {
      setBrandingLoading(false);
    }
  };

  const applySeoState = (config) => {
    setSeoConfig(config);
    setSeoSiteName(config?.site_name || DEFAULT_SEO_SETTINGS.site_name);
    setSeoDefaultTitle(config?.default_title || DEFAULT_SEO_SETTINGS.default_title);
    setSeoDefaultDescription(config?.default_description || DEFAULT_SEO_SETTINGS.default_description);
    setSeoKeywords(config?.default_keywords || DEFAULT_SEO_SETTINGS.default_keywords);
    setSeoOgImageUrl(config?.og_image_url || DEFAULT_SEO_SETTINGS.og_image_url);
    setSeoFaviconUrl(config?.favicon_url || DEFAULT_SEO_SETTINGS.favicon_url);
    setSeoCanonicalBaseUrl(config?.canonical_base_url || '');
    setSeoTwitterHandle(config?.twitter_handle || '');
    setSeoNoindex(Boolean(config?.noindex));
  };

  const fetchSeoConfig = async () => {
    setSeoLoading(true);
    try {
      const res = await api.get('/admin/settings/seo');
      applySeoState(res.data);
    } catch (err) {
      setSeoConfig(null);
      if (err.response?.status !== 403) {
        toast.error(err.response?.data?.detail || t('adminSettingsGeneral.loadSeoFailed'));
      }
    } finally {
      setSeoLoading(false);
    }
  };

  const applyInvoiceTemplateState = (config) => {
    setInvoiceTemplate(config);
    setInvoiceCompanyName(config?.company_name || 'Autodestroy PDF Platform');
    setInvoiceCompanyAddress(config?.company_address || 'Business Address, City, Country');
    setInvoiceCompanyEmail(config?.company_email || 'billing@autodestroy.app');
    setInvoiceCompanyPhone(config?.company_phone || '');
    setInvoiceCompanyWebsite(config?.company_website || '');
    setInvoiceTaxLabel(config?.tax_label || 'Tax ID');
    setInvoiceTaxId(config?.tax_id || '');
    setInvoicePrefix(config?.invoice_prefix || 'INV');
    setInvoiceNotes(config?.notes || 'Thank you for your business.');
    setInvoiceTerms(config?.terms || 'Payments are processed securely by Stripe.');
    setInvoiceFooterText(config?.footer_text || 'This invoice is system generated and valid without signature.');
    setInvoicePrimaryColor(config?.primary_color || '#064e3b');
    setInvoiceAccentColor(config?.accent_color || '#10b981');
    setInvoiceLogoUrl(config?.logo_url || '');
    setInvoiceShowLogo(config?.show_logo !== false);
  };

  const fetchInvoiceTemplateConfig = async () => {
    setInvoiceLoading(true);
    try {
      const res = await api.get('/admin/settings/invoice-template');
      applyInvoiceTemplateState(res.data);
    } catch (err) {
      setInvoiceTemplate(null);
      if (err.response?.status !== 403) {
        toast.error(err.response?.data?.detail || t('adminSettingsGeneral.loadInvoiceTemplateFailed'));
      }
    } finally {
      setInvoiceLoading(false);
    }
  };

  const applyAuthEmailTemplateState = (config) => {
    setAuthEmailTemplate(config);
    setVerifyEmailSubject(config?.verify_email_subject || 'Verify your email address');
    setVerifyEmailPreview(
      config?.verify_email_preview_text || 'Use the secure link below to verify your email and activate your account.',
    );
    setVerifyEmailHeading(config?.verify_email_heading || 'Verify your email address');
    setVerifyEmailBody(
      config?.verify_email_body || 'Welcome to {{app_name}}.\n\nUse the secure button below to verify your email address and activate your account.',
    );
    setVerifyEmailButtonLabel(config?.verify_email_button_label || 'Verify email');
    setVerifyEmailExpiryNotice(
      config?.verify_email_expiry_notice || 'This secure link expires in {{expiry_hours}} hours.',
    );
    setVerifyEmailFooter(
      config?.verify_email_footer || 'If you did not create this account, you can safely ignore this email.',
    );
    setPasswordResetEmailSubject(config?.password_reset_subject || 'Reset your password');
    setPasswordResetEmailPreview(
      config?.password_reset_preview_text || 'Use the secure link below to choose a new password for your account.',
    );
    setPasswordResetEmailHeading(config?.password_reset_heading || 'Reset your password');
    setPasswordResetEmailBody(
      config?.password_reset_body || 'We received a request to reset the password for your {{app_name}} account.\n\nUse the secure button below to choose a new password.',
    );
    setPasswordResetEmailButtonLabel(config?.password_reset_button_label || 'Reset password');
    setPasswordResetEmailExpiryNotice(
      config?.password_reset_expiry_notice || 'This secure link expires in {{expiry_minutes}} minutes.',
    );
    setPasswordResetEmailFooter(
      config?.password_reset_footer || 'If you did not request a password reset, you can safely ignore this email.',
    );
  };

  const fetchAuthEmailTemplateConfig = async () => {
    setAuthEmailLoading(true);
    try {
      const res = await api.get('/admin/settings/auth-email-template');
      applyAuthEmailTemplateState(res.data);
    } catch (err) {
      applyAuthEmailTemplateState(null);
      if (err.response?.status && err.response.status !== 403) {
        console.error('Failed to load auth email template settings', err.response?.data || err.message);
      }
    } finally {
      setAuthEmailLoading(false);
    }
  };

  const applyPublicSiteState = (config) => {
    setPublicSiteConfig(config);
    setPublicAboutUrl(config?.about_url || DEFAULT_PUBLIC_SITE.about_url);
    setPublicContactUrl(config?.contact_url || DEFAULT_PUBLIC_SITE.contact_url);
    setPublicBlogUrl(config?.blog_url || DEFAULT_PUBLIC_SITE.blog_url);
    setPublicPrivacyUrl(config?.privacy_url || DEFAULT_PUBLIC_SITE.privacy_url);
    setPublicTermsUrl(config?.terms_url || DEFAULT_PUBLIC_SITE.terms_url);
    setPublicGdprUrl(config?.gdpr_url || DEFAULT_PUBLIC_SITE.gdpr_url);
    setAuthPortalUrl(config?.auth_portal_url || DEFAULT_PUBLIC_SITE.auth_portal_url);
  };

  const fetchPublicSiteConfig = async () => {
    setPublicSiteLoading(true);
    try {
      const res = await api.get('/admin/settings/public-site');
      applyPublicSiteState(res.data);
    } catch (err) {
      setPublicSiteConfig(null);
      if (err.response?.status !== 403) {
        toast.error(err.response?.data?.detail || t('adminSettingsGeneral.loadPublicSiteFailed'));
      }
    } finally {
      setPublicSiteLoading(false);
    }
  };

  const applyPlanState = (config) => {
    setPlanConfig(config);
    setPlanCurrency(config?.currency || 'eur');
    setPlanInterval(config?.interval || 'month');
    setPlanEditors(buildPlanEditorState(config?.plans || DEFAULT_SUBSCRIPTION_PLANS));
  };

  const fetchSubscriptionPlanConfig = async () => {
    setPlanLoading(true);
    try {
      const res = await api.get('/admin/settings/subscription-plans');
      applyPlanState(res.data);
    } catch (err) {
      setPlanConfig(null);
      if (err.response?.status !== 403) {
        toast.error(err.response?.data?.detail || t('adminSettingsGeneral.loadPlanSettingsFailed'));
      }
    } finally {
      setPlanLoading(false);
    }
  };

  const applySettingsPermissionsState = (config) => {
    setSettingsPermissionsConfig(config);
    const nextEditors = Object.entries(config?.sections || {}).reduce((accumulator, [sectionKey, section]) => {
      accumulator[sectionKey] = {
        read_role: section?.read_role || 'admin',
        write_role: section?.write_role || 'super_admin',
      };
      return accumulator;
    }, {});
    setSettingsPermissionEditors(nextEditors);
  };

  const fetchSettingsPermissionsConfig = async () => {
    setSettingsPermissionsLoading(true);
    try {
      const res = await api.get('/admin/settings/permissions');
      applySettingsPermissionsState(res.data);
    } catch (err) {
      setSettingsPermissionsConfig(null);
      if (err.response?.status !== 403) {
        toast.error(err.response?.data?.detail || t('adminSettingsGeneral.loadPermissionsFailed'));
      }
    } finally {
      setSettingsPermissionsLoading(false);
    }
  };

  const fetchOperationsHealth = async () => {
    setOperationsHealthLoading(true);
    try {
      const res = await api.get('/admin/operations/health');
      setOperationsHealth(res.data);
    } catch (err) {
      setOperationsHealth(null);
      toast.error(err.response?.data?.detail || t('adminSettingsGeneral.loadOperationsFailed'));
    } finally {
      setOperationsHealthLoading(false);
    }
  };

  const fetchJobs = async () => {
    setJobsLoading(true);
    try {
      const res = await api.get('/admin/jobs', { params: { limit: 50 } });
      setJobs(Array.isArray(res.data?.jobs) ? res.data.jobs : []);
    } catch (err) {
      setJobs([]);
      toast.error(err.response?.data?.detail || t('adminSettingsGeneral.loadJobsFailed'));
    } finally {
      setJobsLoading(false);
    }
  };

  const fetchSettingsHistory = async (settingKey = settingsHistoryFilter) => {
    setSettingsHistoryLoading(true);
    try {
      const params = { limit: 40 };
      if (settingKey && settingKey !== 'all') {
        params.setting_key = settingKey;
      }
      const res = await api.get('/admin/settings/history', { params });
      setSettingsHistory(Array.isArray(res.data?.changes) ? res.data.changes : []);
    } catch (err) {
      setSettingsHistory([]);
      toast.error(err.response?.data?.detail || t('adminSettingsGeneral.loadSettingsHistoryFailed'));
    } finally {
      setSettingsHistoryLoading(false);
    }
  };

  const refreshOperationsData = async () => {
    await Promise.all([fetchOperationsHealth(), fetchJobs(), fetchSettingsHistory()]);
  };

  const ensureTabLoaded = async (tab) => {
    if (loadedTabs[tab]) return;

    if (tab === 'payments') {
      await fetchStripeConfig();
    } else if (tab === 'operations') {
      const operationsTasks = [
        fetchOperationsHealth(),
        fetchJobs(),
        fetchSettingsHistory('all'),
      ];
      if (isSuperAdmin) {
        operationsTasks.push(fetchSettingsPermissionsConfig());
      }
      await Promise.all(operationsTasks);
    } else if (isSuperAdmin && tab === 'permissions') {
      await fetchSettingsPermissionsConfig();
    } else if (isSuperAdmin && tab === 'email') {
      await Promise.all([
        fetchEmailDeliveryConfig(),
        fetchAuthEmailTemplateConfig(),
      ]);
    } else if (tab === 'localization') {
      await fetchLocalizationConfig();
    } else if (isSuperAdmin && tab === 'storage') {
      await fetchStorageConfig();
    } else if (isSuperAdmin && tab === 'domains') {
      await fetchVercelConfig();
    } else if (isSuperAdmin && tab === 'branding') {
      await fetchBrandingConfig();
    } else if (isSuperAdmin && tab === 'seo') {
      await fetchSeoConfig();
    } else if (isSuperAdmin && tab === 'invoice') {
      await fetchInvoiceTemplateConfig();
    } else if (isSuperAdmin && tab === 'public-site') {
      await fetchPublicSiteConfig();
    } else if (isSuperAdmin && tab === 'plans') {
      await fetchSubscriptionPlanConfig();
    }

    setLoadedTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  };

  useEffect(() => {
    ensureTabLoaded(activeTab);
  }, [activeTab, isSuperAdmin]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const tab = url.searchParams.get('tab');
    const oauth = url.searchParams.get('oauth');
    const provider = url.searchParams.get('provider');
    const message = url.searchParams.get('message');

    if (tab === 'email') {
      setActiveTab('email');
    }

    if (!oauth) {
      setEmailOauthFeedback(null);
      return;
    }

    const providerLabel =
      provider === 'gmail'
        ? 'Gmail'
        : provider === 'outlook'
          ? 'Microsoft'
          : 'Email provider';

    if (oauth === 'connected') {
      const successMessage = `${providerLabel} connected successfully`;
      setEmailOauthFeedback({ type: 'success', message: successMessage });
      toast.success(successMessage);
    } else {
      const errorMessage = message || `${providerLabel} connection failed`;
      setEmailOauthFeedback({ type: 'error', message: errorMessage });
      toast.error(errorMessage);
    }

    fetchEmailDeliveryConfig();
    url.searchParams.delete('tab');
    url.searchParams.delete('oauth');
    url.searchParams.delete('provider');
    url.searchParams.delete('message');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [location.search]);

  useEffect(() => {
    if (user?.email && !emailTestRecipient) {
      setEmailTestRecipient(user.email);
    }
  }, [user?.email, emailTestRecipient]);

  useEffect(() => {
    fetchSettingsPermissionsConfig();
  }, []);

  useEffect(() => {
    if (activeTab !== 'email') return;

    const syncAutofilledEmailProviderFields = () => {
      const nextGmailClientId = String(gmailClientIdRef.current?.value || '').trim();
      const nextGmailClientSecret = String(gmailClientSecretRef.current?.value || '').trim();
      const nextOutlookClientId = String(outlookClientIdRef.current?.value || '').trim();
      const nextOutlookClientSecret = String(outlookClientSecretRef.current?.value || '').trim();

      if (nextGmailClientId && nextGmailClientId !== gmailClientId) {
        setGmailClientId(nextGmailClientId);
      }
      if (nextGmailClientSecret && nextGmailClientSecret !== gmailClientSecret) {
        setGmailClientSecret(nextGmailClientSecret);
      }
      if (nextOutlookClientId && nextOutlookClientId !== outlookClientId) {
        setOutlookClientId(nextOutlookClientId);
      }
      if (nextOutlookClientSecret && nextOutlookClientSecret !== outlookClientSecret) {
        setOutlookClientSecret(nextOutlookClientSecret);
      }
    };

    const timers = [
      window.setTimeout(syncAutofilledEmailProviderFields, 100),
      window.setTimeout(syncAutofilledEmailProviderFields, 500),
      window.setTimeout(syncAutofilledEmailProviderFields, 1500),
    ];

    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [
    activeTab,
    emailProvider,
    gmailClientId,
    gmailClientSecret,
    outlookClientId,
    outlookClientSecret,
  ]);

  useEffect(() => {
    if (!enabledLanguages.length) return;
    if (!enabledLanguages.includes(translationTargetLanguage)) {
      setTranslationTargetLanguage(platformLanguage || enabledLanguages[0]);
    }
    if (!enabledLanguages.includes(advancedLanguage)) {
      setAdvancedLanguage(platformLanguage || enabledLanguages[0]);
    }
  }, [advancedLanguage, enabledLanguages, platformLanguage, translationTargetLanguage]);

  useEffect(() => {
    setTranslationPage(1);
  }, [translationSearch, translationTargetLanguage, translationRowsPerPage, translationShowUntranslatedOnly]);

  useEffect(() => {
    const nextOverrides = manualTranslationOverrides?.[advancedLanguage] || {};
    setAdvancedOverridesJson(JSON.stringify(nextOverrides, null, 2));
  }, [advancedLanguage, manualTranslationOverrides]);

  useEffect(() => {
    if (activeTab !== 'operations' || !loadedTabs.operations) return;
    fetchSettingsHistory(settingsHistoryFilter);
  }, [activeTab, loadedTabs.operations, settingsHistoryFilter]);

  const handleSaveLiveKey = async () => {
    if (!liveKey.trim()) {
      toast.error('Please enter a Stripe Live key');
      return;
    }
    if (!liveKey.startsWith('sk_live_')) {
      toast.error('Live key must start with sk_live_');
      return;
    }
    setSaving(true);
    try {
      await api.put('/admin/settings/stripe', { stripe_key: liveKey, mode: 'live' });
      toast.success('Live Stripe key saved! Payments will now use live mode.');
      setLiveKey('');
      fetchStripeConfig();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save key');
    } finally {
      setSaving(false);
    }
  };

  const handleActivateSandbox = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings/stripe', { mode: 'sandbox' });
      toast.success('Switched back to Sandbox mode.');
      fetchStripeConfig();
    } catch (err) {
      toast.error('Failed to switch mode');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSandboxKey = async () => {
    if (!sandboxKey.trim()) {
      toast.error('Please enter a Stripe Test key');
      return;
    }
    if (!sandboxKey.startsWith('sk_test_')) {
      toast.error('Sandbox key must start with sk_test_');
      return;
    }
    setSaving(true);
    try {
      await api.put('/admin/settings/stripe', { stripe_key: sandboxKey, mode: 'sandbox' });
      toast.success('Sandbox key saved! Payments will now use sandbox mode.');
      setSandboxKey('');
      fetchStripeConfig();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save sandbox key');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStorageConfig = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super admin can update storage settings');
      return;
    }

    const payload = {
      active_provider: storageProvider,
      wasabi_endpoint: wasabiEndpoint,
      wasabi_region: wasabiRegion,
      wasabi_bucket: wasabiBucket,
      wasabi_force_path_style: wasabiForcePathStyle,
    };
    if (wasabiAccessKey.trim()) {
      payload.wasabi_access_key_id = wasabiAccessKey.trim();
    }
    if (wasabiSecretKey.trim()) {
      payload.wasabi_secret_access_key = wasabiSecretKey.trim();
    }

    setStorageSaving(true);
    try {
      const res = await api.put('/admin/settings/storage', payload);
      applyStorageState(res.data);
      setWasabiAccessKey('');
      setWasabiSecretKey('');
      toast.success('Storage settings saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save storage settings');
    } finally {
      setStorageSaving(false);
    }
  };

  const handleRunQueuedJobs = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super admin can run queued jobs');
      return;
    }

    setJobsRunning(true);
    try {
      const res = await api.post('/admin/jobs/run', { limit: 5 });
      toast.success(res.data?.message || 'Queued jobs processed');
      await refreshOperationsData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to process queued jobs');
    } finally {
      setJobsRunning(false);
    }
  };

  const handleStartStorageMigration = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super admin can start storage migrations');
      return;
    }

    if (!storageProvider) {
      toast.error('Select the active destination storage provider first');
      return;
    }

    setStorageMigrationRunning(true);
    try {
      const payload = {
        destination_provider: storageProvider,
        run_now: true,
      };
      if (storageMigrationSource !== 'all') {
        payload.source_provider = storageMigrationSource;
      }
      const parsedLimit = Number.parseInt(storageMigrationLimit, 10);
      if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
        payload.limit = parsedLimit;
      }

      const res = await api.post('/admin/jobs/storage-migration', payload);
      toast.success(res.data?.message || 'Storage migration queued');
      await Promise.all([fetchJobs(), fetchOperationsHealth()]);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to start storage migration');
    } finally {
      setStorageMigrationRunning(false);
    }
  };

  const saveEmailDeliveryConfig = async ({ providerOverride = null, silentSuccess = false } = {}) => {
    if (!isSuperAdmin) {
      toast.error('Only super admin can update email delivery settings');
      return null;
    }

    const targetProvider = providerOverride || emailProvider;
    const gmailClientIdValue = getDraftFieldValue(gmailClientId, gmailClientIdRef);
    const gmailClientSecretValue = getDraftFieldValue(gmailClientSecret, gmailClientSecretRef);
    const outlookClientIdValue = getDraftFieldValue(outlookClientId, outlookClientIdRef);
    const outlookClientSecretValue = getDraftFieldValue(outlookClientSecret, outlookClientSecretRef);

    const payload = {
      active_provider: targetProvider,
    };

    if (targetProvider === 'gmail') {
      payload.gmail_client_id = gmailClientIdValue || undefined;
      payload.gmail_client_secret = gmailClientSecretValue || undefined;
      payload.gmail_from_email = gmailFromEmail.trim();
      payload.gmail_from_name = gmailFromName.trim();
      payload.gmail_reply_to = gmailReplyTo.trim();
    } else if (targetProvider === 'mailgun') {
      payload.mailgun_api_key = mailgunApiKey.trim() || undefined;
      payload.mailgun_domain = mailgunDomain.trim();
      payload.mailgun_region = mailgunRegion;
      payload.mailgun_from_email = mailgunFromEmail.trim();
      payload.mailgun_from_name = mailgunFromName.trim();
      payload.mailgun_reply_to = mailgunReplyTo.trim();
    } else if (targetProvider === 'outlook') {
      payload.outlook_tenant_id = outlookTenantId.trim();
      payload.outlook_client_id = outlookClientIdValue || undefined;
      payload.outlook_client_secret = outlookClientSecretValue || undefined;
      payload.outlook_from_email = outlookFromEmail.trim();
      payload.outlook_from_name = outlookFromName.trim();
      payload.outlook_reply_to = outlookReplyTo.trim();
      payload.outlook_save_to_sent_items = outlookSaveToSentItems;
    } else if (targetProvider === 'smtp') {
      payload.smtp_host = smtpHost.trim();
      payload.smtp_port = Number.parseInt(smtpPort || '587', 10);
      payload.smtp_encryption = smtpEncryption;
      payload.smtp_auth_enabled = smtpAuthEnabled;
      payload.smtp_from_email = smtpFromEmail.trim();
      payload.smtp_from_name = smtpFromName.trim();
      payload.smtp_reply_to = smtpReplyTo.trim();
      payload.smtp_force_return_path = smtpForceReturnPath;

      if (smtpUsername.trim() || smtpAuthEnabled) {
        payload.smtp_username = smtpUsername.trim();
      }
      if (smtpPassword.trim() || smtpAuthEnabled) {
        payload.smtp_password = smtpPassword.trim();
      }
    }

    setEmailSaving(true);
    try {
      const res = await api.put('/admin/settings/email-delivery', payload);
      applyEmailDeliveryState(res.data);
      if (!silentSuccess) {
        toast.success('Email delivery settings saved');
      }
      return res.data;
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save email delivery settings');
      return null;
    } finally {
      setEmailSaving(false);
    }
  };

  const handleSaveEmailDeliveryConfig = async () => {
    await saveEmailDeliveryConfig();
  };

  const handleEmailOAuthConnect = async (provider) => {
    const savedClientIdSet =
      provider === 'gmail'
        ? Boolean(emailDeliveryConfig?.gmail?.client_id_set)
        : Boolean(emailDeliveryConfig?.outlook?.client_id_set);
    const savedClientSecretSet =
      provider === 'gmail'
        ? Boolean(emailDeliveryConfig?.gmail?.client_secret_set)
        : Boolean(emailDeliveryConfig?.outlook?.client_secret_set);
    const draftClientId =
      provider === 'gmail'
        ? getDraftFieldValue(gmailClientId, gmailClientIdRef)
        : getDraftFieldValue(outlookClientId, outlookClientIdRef);
    const draftClientSecret =
      provider === 'gmail'
        ? getDraftFieldValue(gmailClientSecret, gmailClientSecretRef)
        : getDraftFieldValue(outlookClientSecret, outlookClientSecretRef);

    if (!savedClientIdSet && !draftClientId) {
      toast.error(provider === 'gmail' ? 'Enter the Google Client ID first' : 'Enter the Microsoft Application ID first');
      return;
    }
    if (!savedClientSecretSet && !draftClientSecret) {
      toast.error(provider === 'gmail' ? 'Enter the Google Client Secret first' : 'Enter the Microsoft Application Secret first');
      return;
    }

    let nextConfig = emailDeliveryConfig;
    if (draftClientId || draftClientSecret || !savedClientIdSet || !savedClientSecretSet) {
      nextConfig = await saveEmailDeliveryConfig({ providerOverride: provider, silentSuccess: true });
      if (!nextConfig) {
        return;
      }
    }

    const startUrl =
      provider === 'gmail'
        ? nextConfig?.gmail?.oauth_start_url
        : nextConfig?.outlook?.oauth_start_url;
    if (!startUrl) {
      toast.error('Provider connect URL is not available yet');
      return;
    }
    window.location.href = startUrl;
  };

  const handleEmailProviderDisconnect = async (provider) => {
    setEmailSaving(true);
    try {
      const res = await api.post(`/admin/settings/email-delivery/${provider}/disconnect`);
      applyEmailDeliveryState(res.data);
      toast.success(`${provider === 'gmail' ? 'Gmail' : 'Microsoft'} disconnected`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to disconnect provider');
    } finally {
      setEmailSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!emailTestRecipient.trim()) {
      toast.error('Enter a recipient email for the test');
      return;
    }

    setEmailTesting(true);
    try {
      const res = await api.post('/admin/settings/email-delivery/test', {
        recipient: emailTestRecipient.trim(),
      });
      toast.success(res.data?.message || 'Test email sent');
      await fetchEmailDeliveryConfig();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send test email');
    } finally {
      setEmailTesting(false);
    }
  };

  const handleSaveVercelConfig = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super admin can update Vercel settings');
      return;
    }

    const payload = {
      project_id: vercelProjectId.trim(),
      team_id: vercelTeamId.trim(),
      auto_attach: vercelAutoAttach,
    };
    if (vercelApiToken.trim()) {
      payload.api_token = vercelApiToken.trim();
    }

    setVercelSaving(true);
    try {
      const res = await api.put('/admin/settings/vercel', payload);
      applyVercelState(res.data);
      setVercelApiToken('');
      toast.success('Vercel settings saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save Vercel settings');
    } finally {
      setVercelSaving(false);
    }
  };

  const handleSaveBrandingConfig = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super admin can update branding settings');
      return;
    }

    if (!HEX_COLOR_RE.test(brandPrimaryColor.trim())) {
      toast.error('Primary color must be a hex value like #064e3b');
      return;
    }
    if (!HEX_COLOR_RE.test(brandAccentColor.trim())) {
      toast.error('Accent color must be a hex value like #10b981');
      return;
    }

    const payload = {
      app_name: brandName.trim(),
      product_name: brandProductName.trim(),
      tagline: brandTagline.trim(),
      primary_color: brandPrimaryColor.trim(),
      accent_color: brandAccentColor.trim(),
      footer_text: brandFooterText.trim(),
    };

    setBrandingSaving(true);
    try {
      const res = await api.put('/admin/settings/branding', payload);
      applyBrandingState(res.data);
      await refreshBranding();
      toast.success('Branding settings saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save branding settings');
    } finally {
      setBrandingSaving(false);
    }
  };

  const handleSaveSeoConfig = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super admin can update SEO settings');
      return;
    }

    const canonicalValue = seoCanonicalBaseUrl.trim();
    if (canonicalValue && !/^https?:\/\/.+/i.test(canonicalValue)) {
      toast.error('Canonical base URL must start with http:// or https://');
      return;
    }

    const payload = {
      site_name: seoSiteName.trim(),
      default_title: seoDefaultTitle.trim(),
      default_description: seoDefaultDescription.trim(),
      default_keywords: seoKeywords.trim(),
      og_image_url: seoOgImageUrl.trim(),
      favicon_url: seoFaviconUrl.trim(),
      canonical_base_url: canonicalValue,
      twitter_handle: seoTwitterHandle.trim(),
      noindex: seoNoindex,
    };

    setSeoSaving(true);
    try {
      const res = await api.put('/admin/settings/seo', payload);
      applySeoState(res.data);
      await refreshSeo();
      toast.success('SEO settings saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save SEO settings');
    } finally {
      setSeoSaving(false);
    }
  };

  const handleSaveInvoiceTemplate = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super admin can update invoice template');
      return;
    }

    if (!HEX_COLOR_RE.test(invoicePrimaryColor.trim())) {
      toast.error('Invoice primary color must be a hex value like #064e3b');
      return;
    }
    if (!HEX_COLOR_RE.test(invoiceAccentColor.trim())) {
      toast.error('Invoice accent color must be a hex value like #10b981');
      return;
    }

    const payload = {
      company_name: invoiceCompanyName.trim(),
      company_address: invoiceCompanyAddress.trim(),
      company_email: invoiceCompanyEmail.trim(),
      company_phone: invoiceCompanyPhone.trim(),
      company_website: invoiceCompanyWebsite.trim(),
      tax_label: invoiceTaxLabel.trim(),
      tax_id: invoiceTaxId.trim(),
      invoice_prefix: invoicePrefix.trim().toUpperCase(),
      notes: invoiceNotes.trim(),
      terms: invoiceTerms.trim(),
      footer_text: invoiceFooterText.trim(),
      primary_color: invoicePrimaryColor.trim(),
      accent_color: invoiceAccentColor.trim(),
      logo_url: invoiceLogoUrl.trim(),
      show_logo: invoiceShowLogo,
    };

    setInvoiceSaving(true);
    try {
      const res = await api.put('/admin/settings/invoice-template', payload);
      applyInvoiceTemplateState(res.data);
      toast.success('Invoice template settings saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save invoice template settings');
    } finally {
      setInvoiceSaving(false);
    }
  };

  const handleSaveAuthEmailTemplate = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super admin can update auth email templates');
      return;
    }

    const payload = {
      verify_email_subject: verifyEmailSubject.trim(),
      verify_email_preview_text: verifyEmailPreview.trim(),
      verify_email_heading: verifyEmailHeading.trim(),
      verify_email_body: verifyEmailBody.trim(),
      verify_email_button_label: verifyEmailButtonLabel.trim(),
      verify_email_expiry_notice: verifyEmailExpiryNotice.trim(),
      verify_email_footer: verifyEmailFooter.trim(),
      password_reset_subject: passwordResetEmailSubject.trim(),
      password_reset_preview_text: passwordResetEmailPreview.trim(),
      password_reset_heading: passwordResetEmailHeading.trim(),
      password_reset_body: passwordResetEmailBody.trim(),
      password_reset_button_label: passwordResetEmailButtonLabel.trim(),
      password_reset_expiry_notice: passwordResetEmailExpiryNotice.trim(),
      password_reset_footer: passwordResetEmailFooter.trim(),
    };

    setAuthEmailSaving(true);
    try {
      const res = await api.put('/admin/settings/auth-email-template', payload);
      applyAuthEmailTemplateState(res.data);
      toast.success('Auth email templates saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save auth email template settings');
    } finally {
      setAuthEmailSaving(false);
    }
  };

  const handleSaveLocalizationConfig = async () => {
    const normalizedEnabledLanguages = Array.from(
      new Set(
        [platformLanguage, ...enabledLanguages]
          .map((code) => String(code || '').trim())
          .filter(Boolean),
      ),
    );

    setLocalizationSaving(true);
    try {
      const res = await api.put('/admin/settings/localization', {
        default_language: platformLanguage,
        enabled_languages: normalizedEnabledLanguages,
        automatic_detection: automaticLanguageRecognition,
        site_timezone: siteTimezone,
        site_currency: siteCurrency,
      });
      applyLocalizationState(res.data);
      await refreshLocalization().catch(() => {});
      toast.success(t('adminSettingsLocalization.saveSuccess'));
    } catch (err) {
      toast.error(err.response?.data?.detail || t('adminSettingsLocalization.saveFailed'));
    } finally {
      setLocalizationSaving(false);
    }
  };

  const handleToggleEnabledLanguage = (languageCode) => {
    setEnabledLanguages((prev) => {
      const next = new Set(prev);
      if (next.has(languageCode)) {
        if (languageCode === platformLanguage) {
          toast.error('Set another primary language before disabling this one');
          return prev;
        }
        if (next.size === 1) {
          toast.error('At least one language must stay enabled');
          return prev;
        }
        next.delete(languageCode);
      } else {
        next.add(languageCode);
      }
      return Array.from(next);
    });
  };

  const handleSetPrimaryLanguage = (languageCode) => {
    setPlatformLanguage(languageCode);
    setEnabledLanguages((prev) => Array.from(new Set([languageCode, ...prev])));
    setTranslationTargetLanguage(languageCode);
    setAdvancedLanguage(languageCode);
  };

  const handleTranslationValueChange = (languageCode, path, value) => {
    setManualTranslationOverrides((prev) => {
      const next = { ...(prev || {}) };
      const nextLanguageOverrides = { ...(next[languageCode] || {}) };
      const text = String(value || '');

      if (text.trim()) {
        nextLanguageOverrides[path] = text;
      } else {
        delete nextLanguageOverrides[path];
      }

      if (Object.keys(nextLanguageOverrides).length) {
        next[languageCode] = nextLanguageOverrides;
      } else {
        delete next[languageCode];
      }
      return next;
    });
  };

  const handleSaveLocalizationOverrides = async () => {
    setTranslationSaving(true);
    try {
      const res = await api.put('/admin/settings/localization', {
        manual_overrides: manualTranslationOverrides,
      });
      applyLocalizationState(res.data);
      await refreshLocalization().catch(() => {});
      toast.success('Manual translations saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save manual translations');
    } finally {
      setTranslationSaving(false);
    }
  };

  const handleResetLanguageOverrides = async (languageCode) => {
    const nextOverrides = { ...(manualTranslationOverrides || {}) };
    delete nextOverrides[languageCode];
    setTranslationSaving(true);
    try {
      const res = await api.put('/admin/settings/localization', {
        manual_overrides: nextOverrides,
      });
      applyLocalizationState(res.data);
      await refreshLocalization().catch(() => {});
      toast.success('Language overrides cleared');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to clear language overrides');
    } finally {
      setTranslationSaving(false);
    }
  };

  const handleImportAdvancedOverrides = async () => {
    let parsed;
    try {
      parsed = JSON.parse(advancedOverridesJson || '{}');
    } catch {
      toast.error('Advanced overrides JSON is not valid');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      toast.error('Advanced overrides JSON must be an object of path to translation');
      return;
    }

    const nextOverrides = {
      ...(manualTranslationOverrides || {}),
      [advancedLanguage]: Object.fromEntries(
        Object.entries(parsed)
          .map(([path, value]) => [String(path || '').trim(), String(value ?? '').trim()])
          .filter(([path, value]) => path && value),
      ),
    };

    setManualTranslationOverrides(nextOverrides);
    setTranslationSaving(true);
    try {
      const res = await api.put('/admin/settings/localization', {
        manual_overrides: nextOverrides,
      });
      applyLocalizationState(res.data);
      await refreshLocalization().catch(() => {});
      toast.success('Advanced translations imported');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to import advanced translations');
    } finally {
      setTranslationSaving(false);
    }
  };

  const handleSavePublicSiteConfig = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super admin can update public site settings');
      return;
    }

    setPublicSiteSaving(true);
    try {
      const res = await api.put('/admin/settings/public-site', {
        about_url: publicAboutUrl.trim(),
        contact_url: publicContactUrl.trim(),
        blog_url: publicBlogUrl.trim(),
        privacy_url: publicPrivacyUrl.trim(),
        terms_url: publicTermsUrl.trim(),
        gdpr_url: publicGdprUrl.trim(),
        auth_portal_url: authPortalUrl.trim(),
      });
      applyPublicSiteState(res.data);
      await refreshPublicSite();
      toast.success('Public site settings saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save public site settings');
    } finally {
      setPublicSiteSaving(false);
    }
  };

  const updatePlanEditorField = (planId, field, value) => {
    setPlanEditors((prev) => ({
      ...prev,
      [planId]: {
        ...prev[planId],
        [field]: value,
      },
    }));
  };

  const handleAddPlanEditor = () => {
    const normalizedPlanId = String(newPlanId || '').trim().toLowerCase();
    const normalizedPlanName = String(newPlanName || '').trim() || formatPlanNameFromId(normalizedPlanId);

    if (!PLAN_ID_RE.test(normalizedPlanId)) {
      toast.error('Plan ID must use lowercase letters, numbers, dashes, or underscores');
      return;
    }
    if (planEditors[normalizedPlanId]) {
      toast.error('A plan with this ID already exists');
      return;
    }

    const nextSortOrder = Math.max(
      0,
      ...Object.values(planEditors || {}).map((plan) => Number(plan?.sort_order || 0)),
    ) + 10;

    setPlanEditors((prev) => ({
      ...prev,
      [normalizedPlanId]: createPlanEditor(
        normalizedPlanId,
        {
          name: normalizedPlanName,
          public_visible: false,
          sort_order: nextSortOrder,
          features: ['Secure PDF access'],
        },
        Object.keys(prev || {}).length,
      ),
    }));
    setShowNewPlanDialog(false);
    setNewPlanId('');
    setNewPlanName('');
    toast.success('Plan editor added');
  };

  const handleCopyPlanLink = async (planId) => {
    const shareUrl =
      typeof window === 'undefined'
        ? `/pricing?plan=${encodeURIComponent(planId)}`
        : `${window.location.origin}/pricing?plan=${encodeURIComponent(planId)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedPlanLink(planId);
      window.setTimeout(() => setCopiedPlanLink(''), 1600);
      toast.success('Plan link copied');
    } catch {
      toast.error('Failed to copy plan link');
    }
  };

  const handleSaveSubscriptionPlans = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super admin can update subscription plans');
      return;
    }

    const payload = {
      currency: planCurrency,
      interval: planInterval,
      plans: Object.entries(planEditors).reduce((accumulator, [planId, editor]) => {
        accumulator[planId] = {
          name: editor.name.trim(),
          description: editor.description.trim(),
          badge: editor.badge.trim(),
          price: Number(editor.price || 0),
          storage_mb: Number(editor.storage_mb || 0),
          links_per_month: Number(editor.links_per_month || 0),
          featured: Boolean(editor.featured),
          active: Boolean(editor.active),
          public_visible: Boolean(editor.public_visible),
          sort_order: Number(editor.sort_order || 0),
          features: editor.features
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
        };
        return accumulator;
      }, {}),
    };

    setPlanSaving(true);
    try {
      const res = await api.put('/admin/settings/subscription-plans', payload);
      applyPlanState(res.data);
      await refreshPlans();
      toast.success('Subscription plan settings saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save subscription plan settings');
    } finally {
      setPlanSaving(false);
    }
  };

  const handleSettingsPermissionEditorChange = (sectionKey, field, value) => {
    setSettingsPermissionEditors((prev) => ({
      ...prev,
      [sectionKey]: {
        ...(prev?.[sectionKey] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveSettingsPermissions = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super admin can update settings permissions');
      return;
    }

    const sections = Object.entries(settingsPermissionEditors || {}).reduce((accumulator, [sectionKey, section]) => {
      accumulator[sectionKey] = {
        read_role: section?.read_role || 'admin',
        write_role: section?.write_role || 'super_admin',
      };
      return accumulator;
    }, {});

    setSettingsPermissionsSaving(true);
    try {
      const res = await api.put('/admin/settings/permissions', { sections });
      applySettingsPermissionsState(res.data);
      toast.success('Settings permissions saved');
      await fetchSettingsHistory('all');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save settings permissions');
    } finally {
      setSettingsPermissionsSaving(false);
    }
  };

  useEffect(() => {
    const accessibleSections = new Set(settingsPermissionsConfig?.accessible_sections || SETTINGS_SECTION_KEYS);
    const nextVisibleTabs = [
      ...(accessibleSections.has('payments') ? ['payments'] : []),
      ...(accessibleSections.has('localization') ? ['localization'] : []),
      'operations',
      ...(isSuperAdmin ? ['email', 'public-site', 'plans', 'storage', 'domains', 'branding', 'seo', 'invoice', 'permissions'] : []),
    ];

    if (nextVisibleTabs.length && !nextVisibleTabs.includes(activeTab)) {
      setActiveTab(nextVisibleTabs[0]);
    }
  }, [activeTab, isSuperAdmin, settingsPermissionsConfig]);

  const orderedPlanEntries = useMemo(
    () => getOrderedPlanEntries(
      Object.fromEntries(
        Object.entries(planEditors || {}).map(([planId, editor]) => [
          planId,
          {
            ...editor,
            name: editor?.name || formatPlanNameFromId(planId),
            sort_order: Number(editor?.sort_order || 0),
          },
        ]),
      ),
    ),
    [planEditors],
  );

  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);
  const timezoneSelectOptions = useMemo(
    () => Array.from(new Set([siteTimezone, ...timezoneOptions].filter(Boolean))),
    [siteTimezone, timezoneOptions],
  );
  const currencyOptions = useMemo(
    () => Array.from(new Set([siteCurrency, ...COMMON_CURRENCY_OPTIONS].filter(Boolean))),
    [siteCurrency],
  );
  const availableAdminLanguages = useMemo(
    () => (allLanguages && allLanguages.length ? allLanguages : languages),
    [allLanguages, languages],
  );
  const enabledLanguageSet = useMemo(() => new Set(enabledLanguages), [enabledLanguages]);
  const localizationSourceEntries = useMemo(
    () => getTranslationEntries(platformLanguage || 'en'),
    [platformLanguage],
  );
  const localizationFilteredEntries = useMemo(() => {
    const searchValue = String(translationSearch || '').trim().toLowerCase();
    return localizationSourceEntries.filter((entry) => {
      const originalValue = resolveTranslationPreviewValue({
        languageCode: platformLanguage,
        path: entry.path,
        fallbackLanguage: platformLanguage || 'en',
        manualOverrides: manualTranslationOverrides,
      });
      const targetValue = resolveTranslationPreviewValue({
        languageCode: translationTargetLanguage,
        path: entry.path,
        fallbackLanguage: platformLanguage || 'en',
        manualOverrides: manualTranslationOverrides,
      });
      const targetOverride = manualTranslationOverrides?.[translationTargetLanguage]?.[entry.path] || '';
      const isUntranslated = !String(targetOverride || '').trim();

      if (translationShowUntranslatedOnly && !isUntranslated) {
        return false;
      }

      if (!searchValue) {
        return true;
      }

      return [
        entry.path,
        String(originalValue || ''),
        String(targetValue || ''),
      ].some((value) => value.toLowerCase().includes(searchValue));
    });
  }, [
    localizationSourceEntries,
    manualTranslationOverrides,
    platformLanguage,
    translationSearch,
    translationShowUntranslatedOnly,
    translationTargetLanguage,
  ]);
  const translationPageSize = Math.max(10, Number.parseInt(translationRowsPerPage || '25', 10) || 25);
  const translationTotalPages = Math.max(1, Math.ceil(localizationFilteredEntries.length / translationPageSize));
  const translationVisibleEntries = useMemo(() => {
    const safePage = Math.min(Math.max(translationPage, 1), translationTotalPages);
    const start = (safePage - 1) * translationPageSize;
    return localizationFilteredEntries.slice(start, start + translationPageSize);
  }, [localizationFilteredEntries, translationPage, translationPageSize, translationTotalPages]);

  useEffect(() => {
    if (translationPage > translationTotalPages) {
      setTranslationPage(translationTotalPages);
    }
  }, [translationPage, translationTotalPages]);

  if (loading) {
    return (
      <DashboardLayout title={t('admin.stripeSettings')}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-emerald-900" />
        </div>
      </DashboardLayout>
    );
  }

  const isLive = stripeConfig?.mode === 'live';
  const gmailDraftClientId = getDraftFieldValue(gmailClientId, gmailClientIdRef);
  const gmailDraftClientSecret = getDraftFieldValue(gmailClientSecret, gmailClientSecretRef);
  const outlookDraftClientId = getDraftFieldValue(outlookClientId, outlookClientIdRef);
  const outlookDraftClientSecret = getDraftFieldValue(outlookClientSecret, outlookClientSecretRef);
  const gmailClientIdStatus = getCredentialSaveState(
    Boolean(emailDeliveryConfig?.gmail?.client_id_set),
    Boolean(gmailDraftClientId),
  );
  const gmailClientSecretStatus = getCredentialSaveState(
    Boolean(emailDeliveryConfig?.gmail?.client_secret_set),
    Boolean(gmailDraftClientSecret),
  );
  const gmailHasClientId = Boolean(emailDeliveryConfig?.gmail?.client_id_set || gmailDraftClientId);
  const gmailHasClientSecret = Boolean(emailDeliveryConfig?.gmail?.client_secret_set || gmailDraftClientSecret);
  const outlookClientIdStatus = getCredentialSaveState(
    Boolean(emailDeliveryConfig?.outlook?.client_id_set),
    Boolean(outlookDraftClientId),
  );
  const outlookClientSecretStatus = getCredentialSaveState(
    Boolean(emailDeliveryConfig?.outlook?.client_secret_set),
    Boolean(outlookDraftClientSecret),
  );
  const outlookHasClientId = Boolean(emailDeliveryConfig?.outlook?.client_id_set || outlookDraftClientId);
  const outlookHasClientSecret = Boolean(emailDeliveryConfig?.outlook?.client_secret_set || outlookDraftClientSecret);
  const gmailCanStartOAuth = !emailSaving && gmailHasClientId && gmailHasClientSecret;
  const outlookCanStartOAuth = !emailSaving && outlookHasClientId && outlookHasClientSecret;
  const activeEmailProvider = emailDeliveryConfig?.active_provider || 'supabase';
  const requestedEmailProvider = emailDeliveryConfig?.requested_provider || activeEmailProvider;
  const emailProviderLabels = {
    gmail: t('adminSettingsGeneral.emailProviderGmail'),
    mailgun: t('adminSettingsGeneral.emailProviderMailgun'),
    outlook: t('adminSettingsGeneral.emailProviderOutlook'),
    resend: t('adminSettingsGeneral.emailProviderResend'),
    smtp: t('adminSettingsGeneral.emailProviderSmtp'),
    supabase: t('adminSettingsGeneral.emailProviderSupabase'),
  };
  let emailHealthStatus = t('adminSettingsGeneral.emailStatusNotReady');
  let emailHealthStatusClass = 'text-amber-700';
  let emailHealthDetail = '';

  if (activeEmailProvider === 'gmail') {
    emailHealthStatus = emailDeliveryConfig?.gmail?.connected ? t('adminSettingsGeneral.connected') : t('adminSettingsGeneral.emailStatusNeedsConnection');
    emailHealthStatusClass = emailDeliveryConfig?.gmail?.connected ? 'text-emerald-700' : 'text-amber-700';
    emailHealthDetail = emailDeliveryConfig?.gmail?.email || gmailFromEmail || t('adminSettingsGeneral.senderMailboxPending');
  } else if (activeEmailProvider === 'outlook') {
    emailHealthStatus = emailDeliveryConfig?.outlook?.connected ? t('adminSettingsGeneral.connected') : t('adminSettingsGeneral.emailStatusNeedsConnection');
    emailHealthStatusClass = emailDeliveryConfig?.outlook?.connected ? 'text-emerald-700' : 'text-amber-700';
    emailHealthDetail = emailDeliveryConfig?.outlook?.email || outlookFromEmail || t('adminSettingsGeneral.senderMailboxPending');
  } else if (activeEmailProvider === 'mailgun') {
    emailHealthStatus = emailDeliveryConfig?.mailgun?.configured ? t('adminSettingsGeneral.emailStatusReady') : t('adminSettingsGeneral.emailStatusNeedsConfiguration');
    emailHealthStatusClass = emailDeliveryConfig?.mailgun?.configured ? 'text-emerald-700' : 'text-amber-700';
    emailHealthDetail = emailDeliveryConfig?.mailgun?.domain || mailgunDomain || t('adminSettingsGeneral.mailgunDomainUnset');
  } else if (activeEmailProvider === 'smtp') {
    emailHealthStatus = emailDeliveryConfig?.smtp?.configured ? t('adminSettingsGeneral.emailStatusReady') : t('adminSettingsGeneral.emailStatusNeedsConfiguration');
    emailHealthStatusClass = emailDeliveryConfig?.smtp?.configured ? 'text-emerald-700' : 'text-amber-700';
    emailHealthDetail = emailDeliveryConfig?.smtp?.from_email || smtpFromEmail || emailDeliveryConfig?.smtp?.host || smtpHost || t('adminSettingsGeneral.senderMailboxUnavailable');
  } else if (activeEmailProvider === 'resend') {
    emailHealthStatus = emailDeliveryConfig?.resend?.configured ? t('adminSettingsGeneral.emailStatusReady') : t('adminSettingsGeneral.emailStatusNeedsConfiguration');
    emailHealthStatusClass = emailDeliveryConfig?.resend?.configured ? 'text-emerald-700' : 'text-amber-700';
    emailHealthDetail = emailDeliveryConfig?.resend?.from_email || t('adminSettingsGeneral.resendEnvironmentMissing');
  } else {
    emailHealthStatus = emailDeliveryConfig?.supabase?.publishable_key_set ? t('adminSettingsGeneral.emailStatusReady') : t('adminSettingsGeneral.emailStatusNeedsConfiguration');
    emailHealthStatusClass = emailDeliveryConfig?.supabase?.publishable_key_set ? 'text-emerald-700' : 'text-amber-700';
    emailHealthDetail = emailDeliveryConfig?.supabase?.publishable_key_set
      ? t('adminSettingsGeneral.emailProviderSupabase')
      : t('adminSettingsGeneral.resendEnvironmentMissing');
  }
  const emailFallbackNotice = requestedEmailProvider !== activeEmailProvider
    ? `${emailProviderLabels[requestedEmailProvider] || requestedEmailProvider} is not ready, so ${emailProviderLabels[activeEmailProvider] || activeEmailProvider} is active.`
    : '';
  const settingsSectionEntries = Object.values(settingsPermissionsConfig?.sections || {});
  const settingsHistoryKeyOptions = [
    { value: 'all', label: 'All settings' },
    ...settingsSectionEntries.flatMap((section) =>
      (section?.setting_keys || []).map((settingKey) => ({
        value: settingKey,
        label: `${section.label}: ${settingKey}`,
      })),
    ),
    ...(isSuperAdmin
      ? [{ value: 'settings_permissions', label: 'Permissions: settings_permissions' }]
      : []),
  ].filter((option, index, array) => array.findIndex((item) => item.value === option.value) === index);
  const accessibleSectionSet = new Set(settingsPermissionsConfig?.accessible_sections || SETTINGS_SECTION_KEYS);
  const adminTabs = [
    { value: 'payments', label: t('adminSettingsTabs.payments'), sectionKey: 'payments' },
    { value: 'localization', label: t('adminSettingsTabs.localization'), sectionKey: 'localization' },
    { value: 'operations', label: t('adminSettingsTabs.operations') },
  ];
  const superAdminTabs = [
    { value: 'email', label: t('adminSettingsTabs.email'), sectionKey: 'email' },
    { value: 'public-site', label: t('adminSettingsTabs.publicSite'), sectionKey: 'public_site' },
    { value: 'plans', label: t('adminSettingsTabs.plans'), sectionKey: 'plans' },
    { value: 'storage', label: t('adminSettingsTabs.storage'), sectionKey: 'storage' },
    { value: 'domains', label: t('adminSettingsTabs.domains'), sectionKey: 'domains' },
    { value: 'branding', label: t('adminSettingsTabs.branding'), sectionKey: 'branding' },
    { value: 'seo', label: t('adminSettingsTabs.seo'), sectionKey: 'seo' },
    { value: 'invoice', label: t('adminSettingsTabs.invoice'), sectionKey: 'invoice' },
    { value: 'permissions', label: t('adminSettingsTabs.permissions') },
  ];
  const displayedTabs = (isSuperAdmin ? [...adminTabs, ...superAdminTabs] : adminTabs).filter(
    (tab) => !tab.sectionKey || accessibleSectionSet.has(tab.sectionKey),
  );
  const displayedTabMap = new Map(displayedTabs.map((tab) => [tab.value, tab]));
  const visibleGroups = SETTINGS_GROUPS.map((group) => ({
    ...group,
    label: t(group.labelKey),
    tabs: group.tabs.filter((tabValue) => displayedTabMap.has(tabValue)),
  })).filter((group) => group.tabs.length > 0);
  const activeGroup =
    visibleGroups.find((group) => group.tabs.includes(activeTab)) || visibleGroups[0] || null;
  const activeGroupTabs = activeGroup
    ? activeGroup.tabs.map((tabValue) => displayedTabMap.get(tabValue)).filter(Boolean)
    : displayedTabs;
  const seoPreviewUrl = (seoCanonicalBaseUrl || 'https://your-domain.com').replace(/\/$/, '');

  const adminSettingsTabsContext = {
    location,
    user,
    refreshBranding,
    refreshPublicSite,
    refreshSeo,
    refreshPlans,
    t,
    languages,
    allLanguages,
    refreshLocalization,
    isSuperAdmin,
    activeTab,
    setActiveTab,
    loadedTabs,
    setLoadedTabs,
    stripeConfig,
    setStripeConfig,
    loading,
    setLoading,
    liveKey,
    setLiveKey,
    sandboxKey,
    setSandboxKey,
    showKey,
    setShowKey,
    saving,
    setSaving,
    storageConfig,
    setStorageConfig,
    storageLoading,
    setStorageLoading,
    storageSaving,
    setStorageSaving,
    storageProvider,
    setStorageProvider,
    wasabiEndpoint,
    setWasabiEndpoint,
    wasabiRegion,
    setWasabiRegion,
    wasabiBucket,
    setWasabiBucket,
    wasabiAccessKey,
    setWasabiAccessKey,
    wasabiSecretKey,
    setWasabiSecretKey,
    wasabiForcePathStyle,
    setWasabiForcePathStyle,
    emailDeliveryConfig,
    setEmailDeliveryConfig,
    emailLoading,
    setEmailLoading,
    emailSaving,
    setEmailSaving,
    emailTesting,
    setEmailTesting,
    emailProvider,
    setEmailProvider,
    gmailClientId,
    setGmailClientId,
    gmailClientSecret,
    setGmailClientSecret,
    gmailFromEmail,
    setGmailFromEmail,
    gmailFromName,
    setGmailFromName,
    gmailReplyTo,
    setGmailReplyTo,
    showGmailClientSecret,
    setShowGmailClientSecret,
    mailgunApiKey,
    setMailgunApiKey,
    mailgunDomain,
    setMailgunDomain,
    mailgunRegion,
    setMailgunRegion,
    mailgunFromEmail,
    setMailgunFromEmail,
    mailgunFromName,
    setMailgunFromName,
    mailgunReplyTo,
    setMailgunReplyTo,
    showMailgunApiKey,
    setShowMailgunApiKey,
    outlookTenantId,
    setOutlookTenantId,
    outlookClientId,
    setOutlookClientId,
    outlookClientSecret,
    setOutlookClientSecret,
    outlookFromEmail,
    setOutlookFromEmail,
    outlookFromName,
    setOutlookFromName,
    outlookReplyTo,
    setOutlookReplyTo,
    outlookSaveToSentItems,
    setOutlookSaveToSentItems,
    showOutlookClientSecret,
    setShowOutlookClientSecret,
    smtpHost,
    setSmtpHost,
    smtpPort,
    setSmtpPort,
    smtpEncryption,
    setSmtpEncryption,
    smtpAuthEnabled,
    setSmtpAuthEnabled,
    smtpUsername,
    setSmtpUsername,
    smtpPassword,
    setSmtpPassword,
    smtpFromEmail,
    setSmtpFromEmail,
    smtpFromName,
    setSmtpFromName,
    smtpReplyTo,
    setSmtpReplyTo,
    smtpForceReturnPath,
    setSmtpForceReturnPath,
    showSmtpPassword,
    setShowSmtpPassword,
    emailTestRecipient,
    setEmailTestRecipient,
    emailOauthFeedback,
    setEmailOauthFeedback,
    vercelConfig,
    setVercelConfig,
    vercelLoading,
    setVercelLoading,
    vercelSaving,
    setVercelSaving,
    vercelProjectId,
    setVercelProjectId,
    vercelTeamId,
    setVercelTeamId,
    vercelApiToken,
    setVercelApiToken,
    vercelAutoAttach,
    setVercelAutoAttach,
    showVercelToken,
    setShowVercelToken,
    gmailClientIdRef,
    gmailClientSecretRef,
    outlookClientIdRef,
    outlookClientSecretRef,
    brandingConfig,
    setBrandingConfig,
    brandingLoading,
    setBrandingLoading,
    brandingSaving,
    setBrandingSaving,
    brandName,
    setBrandName,
    brandProductName,
    setBrandProductName,
    brandTagline,
    setBrandTagline,
    brandPrimaryColor,
    setBrandPrimaryColor,
    brandAccentColor,
    setBrandAccentColor,
    brandFooterText,
    setBrandFooterText,
    seoConfig,
    setSeoConfig,
    seoLoading,
    setSeoLoading,
    seoSaving,
    setSeoSaving,
    seoSiteName,
    setSeoSiteName,
    seoDefaultTitle,
    setSeoDefaultTitle,
    seoDefaultDescription,
    setSeoDefaultDescription,
    seoKeywords,
    setSeoKeywords,
    seoOgImageUrl,
    setSeoOgImageUrl,
    seoFaviconUrl,
    setSeoFaviconUrl,
    seoCanonicalBaseUrl,
    setSeoCanonicalBaseUrl,
    seoTwitterHandle,
    setSeoTwitterHandle,
    seoNoindex,
    setSeoNoindex,
    invoiceTemplate,
    setInvoiceTemplate,
    invoiceLoading,
    setInvoiceLoading,
    invoiceSaving,
    setInvoiceSaving,
    invoiceCompanyName,
    setInvoiceCompanyName,
    invoiceCompanyAddress,
    setInvoiceCompanyAddress,
    invoiceCompanyEmail,
    setInvoiceCompanyEmail,
    invoiceCompanyPhone,
    setInvoiceCompanyPhone,
    invoiceCompanyWebsite,
    setInvoiceCompanyWebsite,
    invoiceTaxLabel,
    setInvoiceTaxLabel,
    invoiceTaxId,
    setInvoiceTaxId,
    invoicePrefix,
    setInvoicePrefix,
    invoiceNotes,
    setInvoiceNotes,
    invoiceTerms,
    setInvoiceTerms,
    invoiceFooterText,
    setInvoiceFooterText,
    invoicePrimaryColor,
    setInvoicePrimaryColor,
    invoiceAccentColor,
    setInvoiceAccentColor,
    invoiceLogoUrl,
    setInvoiceLogoUrl,
    invoiceShowLogo,
    setInvoiceShowLogo,
    authEmailTemplate,
    setAuthEmailTemplate,
    authEmailLoading,
    setAuthEmailLoading,
    authEmailSaving,
    setAuthEmailSaving,
    verifyEmailSubject,
    setVerifyEmailSubject,
    verifyEmailPreview,
    setVerifyEmailPreview,
    verifyEmailHeading,
    setVerifyEmailHeading,
    verifyEmailBody,
    setVerifyEmailBody,
    verifyEmailButtonLabel,
    setVerifyEmailButtonLabel,
    verifyEmailExpiryNotice,
    setVerifyEmailExpiryNotice,
    verifyEmailFooter,
    setVerifyEmailFooter,
    passwordResetEmailSubject,
    setPasswordResetEmailSubject,
    passwordResetEmailPreview,
    setPasswordResetEmailPreview,
    passwordResetEmailHeading,
    setPasswordResetEmailHeading,
    passwordResetEmailBody,
    setPasswordResetEmailBody,
    passwordResetEmailButtonLabel,
    setPasswordResetEmailButtonLabel,
    passwordResetEmailExpiryNotice,
    setPasswordResetEmailExpiryNotice,
    passwordResetEmailFooter,
    setPasswordResetEmailFooter,
    localizationLoading,
    setLocalizationLoading,
    localizationSaving,
    setLocalizationSaving,
    platformLanguage,
    setPlatformLanguage,
    enabledLanguages,
    setEnabledLanguages,
    automaticLanguageRecognition,
    setAutomaticLanguageRecognition,
    siteTimezone,
    setSiteTimezone,
    siteCurrency,
    setSiteCurrency,
    manualTranslationOverrides,
    setManualTranslationOverrides,
    localizationSectionTab,
    setLocalizationSectionTab,
    translationTargetLanguage,
    setTranslationTargetLanguage,
    translationSearch,
    setTranslationSearch,
    translationShowUntranslatedOnly,
    setTranslationShowUntranslatedOnly,
    translationRowsPerPage,
    setTranslationRowsPerPage,
    translationPage,
    setTranslationPage,
    translationSaving,
    setTranslationSaving,
    advancedLanguage,
    setAdvancedLanguage,
    advancedOverridesJson,
    setAdvancedOverridesJson,
    publicSiteConfig,
    setPublicSiteConfig,
    publicSiteLoading,
    setPublicSiteLoading,
    publicSiteSaving,
    setPublicSiteSaving,
    publicAboutUrl,
    setPublicAboutUrl,
    publicContactUrl,
    setPublicContactUrl,
    publicBlogUrl,
    setPublicBlogUrl,
    publicPrivacyUrl,
    setPublicPrivacyUrl,
    publicTermsUrl,
    setPublicTermsUrl,
    publicGdprUrl,
    setPublicGdprUrl,
    authPortalUrl,
    setAuthPortalUrl,
    planConfig,
    setPlanConfig,
    planLoading,
    setPlanLoading,
    planSaving,
    setPlanSaving,
    planCurrency,
    setPlanCurrency,
    planInterval,
    setPlanInterval,
    planEditors,
    setPlanEditors,
    showNewPlanDialog,
    setShowNewPlanDialog,
    newPlanId,
    setNewPlanId,
    newPlanName,
    setNewPlanName,
    copiedPlanLink,
    setCopiedPlanLink,
    operationsHealth,
    setOperationsHealth,
    operationsHealthLoading,
    setOperationsHealthLoading,
    jobs,
    setJobs,
    jobsLoading,
    setJobsLoading,
    jobsRunning,
    setJobsRunning,
    settingsHistory,
    setSettingsHistory,
    settingsHistoryLoading,
    setSettingsHistoryLoading,
    settingsHistoryFilter,
    setSettingsHistoryFilter,
    settingsPermissionsConfig,
    setSettingsPermissionsConfig,
    settingsPermissionsLoading,
    setSettingsPermissionsLoading,
    settingsPermissionsSaving,
    setSettingsPermissionsSaving,
    settingsPermissionEditors,
    setSettingsPermissionEditors,
    storageMigrationSource,
    setStorageMigrationSource,
    storageMigrationLimit,
    setStorageMigrationLimit,
    storageMigrationRunning,
    setStorageMigrationRunning,
    fetchStripeConfig,
    applyLocalizationState,
    fetchLocalizationConfig,
    applyStorageState,
    applyEmailDeliveryState,
    applyVercelState,
    fetchStorageConfig,
    fetchEmailDeliveryConfig,
    fetchVercelConfig,
    applyBrandingState,
    fetchBrandingConfig,
    applySeoState,
    fetchSeoConfig,
    applyInvoiceTemplateState,
    fetchInvoiceTemplateConfig,
    applyAuthEmailTemplateState,
    fetchAuthEmailTemplateConfig,
    applyPublicSiteState,
    fetchPublicSiteConfig,
    applyPlanState,
    fetchSubscriptionPlanConfig,
    applySettingsPermissionsState,
    fetchSettingsPermissionsConfig,
    fetchOperationsHealth,
    fetchJobs,
    fetchSettingsHistory,
    refreshOperationsData,
    ensureTabLoaded,
    handleSaveLiveKey,
    handleActivateSandbox,
    handleSaveSandboxKey,
    handleSaveStorageConfig,
    handleRunQueuedJobs,
    handleStartStorageMigration,
    saveEmailDeliveryConfig,
    handleSaveEmailDeliveryConfig,
    handleEmailOAuthConnect,
    handleEmailProviderDisconnect,
    handleSendTestEmail,
    handleSaveVercelConfig,
    handleSaveBrandingConfig,
    handleSaveSeoConfig,
    handleSaveInvoiceTemplate,
    handleSaveAuthEmailTemplate,
    handleSaveLocalizationConfig,
    handleToggleEnabledLanguage,
    handleSetPrimaryLanguage,
    handleTranslationValueChange,
    handleSaveLocalizationOverrides,
    handleResetLanguageOverrides,
    handleImportAdvancedOverrides,
    handleSavePublicSiteConfig,
    updatePlanEditorField,
    handleAddPlanEditor,
    handleCopyPlanLink,
    handleSaveSubscriptionPlans,
    handleSettingsPermissionEditorChange,
    handleSaveSettingsPermissions,
    orderedPlanEntries,
    timezoneOptions,
    timezoneSelectOptions,
    currencyOptions,
    availableAdminLanguages,
    enabledLanguageSet,
    localizationSourceEntries,
    localizationFilteredEntries,
    translationPageSize,
    translationTotalPages,
    translationVisibleEntries,
    isLive,
    gmailDraftClientId,
    gmailDraftClientSecret,
    outlookDraftClientId,
    outlookDraftClientSecret,
    gmailClientIdStatus,
    gmailClientSecretStatus,
    gmailHasClientId,
    gmailHasClientSecret,
    outlookClientIdStatus,
    outlookClientSecretStatus,
    outlookHasClientId,
    outlookHasClientSecret,
    gmailCanStartOAuth,
    outlookCanStartOAuth,
    activeEmailProvider,
    requestedEmailProvider,
    emailHealthStatus,
    emailHealthStatusClass,
    emailHealthDetail,
    emailProviderLabels,
    emailFallbackNotice,
    settingsSectionEntries,
    settingsHistoryKeyOptions,
    accessibleSectionSet,
    adminTabs,
    superAdminTabs,
    displayedTabs,
    displayedTabMap,
    visibleGroups,
    activeGroupTabs,
    seoPreviewUrl,
    formatPlanNameFromId,
    resolveTranslationPreviewValue,
    DEFAULT_BRANDING,
    DEFAULT_SEO_SETTINGS,
    SETTINGS_ACCESS_ROLES,
    STORAGE_PROVIDER_LABELS,
  };
  return (
    <DashboardLayout
      title={isSuperAdmin ? t('admin.platformSettings') : t('admin.stripeSettings')}
      subtitle={
        isSuperAdmin
          ? t('adminSettingsTabs.subtitle')
          : t('adminSettingsLocalization.description')
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {visibleGroups.map((group) => {
              const Icon = group.icon;
              const isActive = activeGroup?.value === group.value;
              return (
                <button
                  key={group.value}
                  type="button"
                  onClick={() => {
                    if (group.tabs[0]) {
                      setActiveTab(group.tabs[0]);
                    }
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${
                    isActive
                      ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                      : 'border-stone-200 bg-white hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-600'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-stone-900">{group.label}</p>
                      <p className="text-xs text-stone-500">
                        {group.tabs.length} section{group.tabs.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="overflow-x-auto pb-1">
            <TabsList className="h-auto w-max min-w-full justify-start gap-2 rounded-xl bg-stone-100 p-1">
              {activeGroupTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="px-4 py-2">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        <AdminSettingsTabsContent ctx={adminSettingsTabsContext} />

        <Dialog open={showNewPlanDialog} onOpenChange={setShowNewPlanDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('adminSettingsPlans.newPlan')}</DialogTitle>
              <DialogDescription>{t('adminSettingsPlans.newPlanDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{t('adminSettingsPlans.planId')}</Label>
                <Input
                  value={newPlanId}
                  onChange={(e) => setNewPlanId(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder="team"
                  maxLength={40}
                />
                <p className="text-xs text-stone-500">{t('adminSettingsPlans.planIdHelp')}</p>
              </div>
              <div className="space-y-2">
                <Label>{t('adminSettingsPlans.name')}</Label>
                <Input
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  placeholder={t('adminSettingsPlans.namePlaceholder')}
                  maxLength={48}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNewPlanDialog(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" className="bg-emerald-900 hover:bg-emerald-800" onClick={handleAddPlanEditor}>
                {t('adminSettingsPlans.addPlan')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Tabs>
    </DashboardLayout>
  );
};

export default AdminSettings;
