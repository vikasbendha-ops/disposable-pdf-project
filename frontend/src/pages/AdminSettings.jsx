import React, { useMemo, useState, useEffect, useRef } from 'react';
import { CreditCard, Shield, CheckCircle, AlertCircle, Eye, EyeOff, Palette, Search, Globe, FileText, Mail, Copy, Link2, Plus } from 'lucide-react';
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

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const PLAN_ID_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;

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

  const fetchStripeConfig = async () => {
    try {
      const res = await api.get('/admin/settings/stripe');
      setStripeConfig(res.data);
    } catch (err) {
      toast.error('Failed to load Stripe settings');
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
        toast.error(err.response?.data?.detail || 'Failed to load storage settings');
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
        toast.error(err.response?.data?.detail || 'Failed to load email delivery settings');
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
        toast.error(err.response?.data?.detail || 'Failed to load Vercel settings');
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
        toast.error(err.response?.data?.detail || 'Failed to load branding settings');
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
        toast.error(err.response?.data?.detail || 'Failed to load SEO settings');
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
        toast.error(err.response?.data?.detail || 'Failed to load invoice template settings');
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
        toast.error(err.response?.data?.detail || 'Failed to load public site settings');
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
        toast.error(err.response?.data?.detail || 'Failed to load subscription plan settings');
      }
    } finally {
      setPlanLoading(false);
    }
  };

  const ensureTabLoaded = async (tab) => {
    if (loadedTabs[tab]) return;

    if (tab === 'payments') {
      await fetchStripeConfig();
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
    gmail: 'Gmail / Google Workspace',
    mailgun: 'Mailgun',
    outlook: 'Microsoft 365 / Outlook',
    resend: 'Resend',
    smtp: 'Other SMTP',
    supabase: 'Supabase Auth Emails',
  };
  let emailHealthStatus = 'Not ready';
  let emailHealthStatusClass = 'text-amber-700';
  let emailHealthDetail = '';

  if (activeEmailProvider === 'gmail') {
    emailHealthStatus = emailDeliveryConfig?.gmail?.connected ? 'Connected' : 'Needs connection';
    emailHealthStatusClass = emailDeliveryConfig?.gmail?.connected ? 'text-emerald-700' : 'text-amber-700';
    emailHealthDetail = emailDeliveryConfig?.gmail?.email || gmailFromEmail || 'Sender mailbox not confirmed yet';
  } else if (activeEmailProvider === 'outlook') {
    emailHealthStatus = emailDeliveryConfig?.outlook?.connected ? 'Connected' : 'Needs connection';
    emailHealthStatusClass = emailDeliveryConfig?.outlook?.connected ? 'text-emerald-700' : 'text-amber-700';
    emailHealthDetail = emailDeliveryConfig?.outlook?.email || outlookFromEmail || 'Sender mailbox not confirmed yet';
  } else if (activeEmailProvider === 'mailgun') {
    emailHealthStatus = emailDeliveryConfig?.mailgun?.configured ? 'Ready' : 'Needs configuration';
    emailHealthStatusClass = emailDeliveryConfig?.mailgun?.configured ? 'text-emerald-700' : 'text-amber-700';
    emailHealthDetail = emailDeliveryConfig?.mailgun?.domain || mailgunDomain || 'Mailgun sending domain not set';
  } else if (activeEmailProvider === 'smtp') {
    emailHealthStatus = emailDeliveryConfig?.smtp?.configured ? 'Ready' : 'Needs configuration';
    emailHealthStatusClass = emailDeliveryConfig?.smtp?.configured ? 'text-emerald-700' : 'text-amber-700';
    emailHealthDetail = emailDeliveryConfig?.smtp?.from_email || smtpFromEmail || emailDeliveryConfig?.smtp?.host || smtpHost || 'SMTP sender not set';
  } else if (activeEmailProvider === 'resend') {
    emailHealthStatus = emailDeliveryConfig?.resend?.configured ? 'Ready' : 'Needs configuration';
    emailHealthStatusClass = emailDeliveryConfig?.resend?.configured ? 'text-emerald-700' : 'text-amber-700';
    emailHealthDetail = emailDeliveryConfig?.resend?.from_email || 'Resend sender email not configured';
  } else {
    emailHealthStatus = emailDeliveryConfig?.supabase?.publishable_key_set ? 'Ready' : 'Needs configuration';
    emailHealthStatusClass = emailDeliveryConfig?.supabase?.publishable_key_set ? 'text-emerald-700' : 'text-amber-700';
    emailHealthDetail = emailDeliveryConfig?.supabase?.publishable_key_set
      ? 'Supabase Auth email delivery is enabled'
      : 'Supabase publishable key is missing';
  }
  const emailFallbackNotice = requestedEmailProvider !== activeEmailProvider
    ? `${emailProviderLabels[requestedEmailProvider] || requestedEmailProvider} is not ready, so ${emailProviderLabels[activeEmailProvider] || activeEmailProvider} is active.`
    : '';
  const adminTabs = [
    { value: 'payments', label: t('adminSettingsTabs.payments') },
    { value: 'localization', label: t('adminSettingsTabs.localization') },
  ];
  const superAdminTabs = [
    { value: 'email', label: t('adminSettingsTabs.email') },
    { value: 'public-site', label: t('adminSettingsTabs.publicSite') },
    { value: 'plans', label: t('adminSettingsTabs.plans') },
    { value: 'storage', label: t('adminSettingsTabs.storage') },
    { value: 'domains', label: t('adminSettingsTabs.domains') },
    { value: 'branding', label: t('adminSettingsTabs.branding') },
    { value: 'seo', label: t('adminSettingsTabs.seo') },
    { value: 'invoice', label: t('adminSettingsTabs.invoice') },
  ];
  const displayedTabs = isSuperAdmin ? [...adminTabs, ...superAdminTabs] : adminTabs;
  const seoPreviewUrl = (seoCanonicalBaseUrl || 'https://your-domain.com').replace(/\/$/, '');

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
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto w-max min-w-full justify-start gap-2 rounded-xl bg-stone-100 p-1">
            {displayedTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="px-4 py-2">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="payments" className="max-w-4xl">
          <Card className="border-stone-200" data-testid="stripe-settings-card">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-indigo-700" />
                  </div>
                  <div>
                    <CardTitle>Stripe Payment Integration</CardTitle>
                    <CardDescription>Manage subscription payments and Stripe mode.</CardDescription>
                  </div>
                </div>
                <Badge
                  data-testid="stripe-mode-badge"
                  className={isLive
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : 'bg-amber-100 text-amber-800 border-amber-200'
                  }
                >
                  {isLive ? 'Live Mode' : 'Sandbox Mode'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-xl bg-stone-50 border border-stone-200 p-4">
                <div className="flex items-start space-x-3">
                  {isLive ? (
                    <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div>
                    <p className="font-semibold text-stone-900">
                      {isLive ? 'Live payments active' : 'Sandbox mode active'}
                    </p>
                    <p className="text-sm text-stone-600 mt-1">
                      {isLive
                        ? 'Real payments are enabled.'
                        : 'Stripe test cards are active. No real charges are processed.'}
                    </p>
                    <p className="text-xs font-mono text-stone-400 mt-2">
                      Active key: {stripeConfig?.key_preview}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-stone-900 mb-1">Activate Live Mode</h3>
                  <p className="text-sm text-stone-500">
                    Save a live secret key to process real payments.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Input
                      data-testid="stripe-live-key-input"
                      type={showKey ? 'text' : 'password'}
                      placeholder="sk_live_..."
                      value={liveKey}
                      onChange={(e) => setLiveKey(e.target.value)}
                      className="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button
                    data-testid="save-stripe-live-key-btn"
                    onClick={handleSaveLiveKey}
                    disabled={saving || !liveKey.trim()}
                    className="bg-emerald-900 hover:bg-emerald-800 whitespace-nowrap"
                  >
                    {saving ? 'Saving...' : 'Save & Activate Live'}
                  </Button>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-stone-200">
                <div>
                  <h3 className="font-semibold text-stone-900 mb-1">Activate Sandbox Mode</h3>
                  <p className="text-sm text-stone-500">
                    Save a sandbox key or switch the existing configuration back to test mode.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    placeholder="sk_test_..."
                    value={sandboxKey}
                    onChange={(e) => setSandboxKey(e.target.value)}
                    className="font-mono text-sm"
                    data-testid="stripe-sandbox-key-input"
                  />
                  <Button
                    onClick={handleSaveSandboxKey}
                    disabled={saving || !sandboxKey.trim()}
                    variant="outline"
                    className="whitespace-nowrap"
                    data-testid="save-stripe-sandbox-key-btn"
                  >
                    {saving ? 'Saving...' : 'Save & Activate Sandbox'}
                  </Button>
                </div>
              </div>

              {isLive && (
                <div className="pt-4 border-t border-stone-200 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-stone-900">Switch back to sandbox</p>
                    <p className="text-sm text-stone-500">Useful before testing deployment changes.</p>
                  </div>
                  <Button
                    data-testid="activate-sandbox-btn"
                    variant="outline"
                    onClick={handleActivateSandbox}
                    disabled={saving}
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    Activate Sandbox
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="max-w-4xl">
          <Card className="border-stone-200">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center">
                    <Mail className="w-5 h-5 text-sky-700" />
                  </div>
                  <div>
                    <CardTitle>Email Delivery</CardTitle>
                    <CardDescription>
                      Configure provider-specific mailers like Gmail, Mailgun, Microsoft 365, or Other SMTP from one place.
                    </CardDescription>
                  </div>
                </div>
                <Badge className={emailDeliveryConfig?.custom_delivery_enabled
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : 'bg-amber-100 text-amber-800 border-amber-200'
                }>
                  {emailDeliveryConfig?.active_provider || 'supabase'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {emailLoading ? (
                <p className="text-sm text-stone-500">Loading email delivery settings...</p>
              ) : (
                <>
                  {emailOauthFeedback && (
                    <div
                      className={`rounded-xl border p-4 text-sm ${
                        emailOauthFeedback.type === 'success'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-red-200 bg-red-50 text-red-800'
                      }`}
                    >
                      {emailOauthFeedback.message}
                    </div>
                  )}

                  <div className="rounded-xl bg-stone-50 border border-stone-200 p-4 space-y-2">
                    <p className="font-semibold text-stone-900">Delivery health</p>
                    <p className="text-sm text-stone-600">
                      Active provider: <span className="font-medium text-stone-900">{emailProviderLabels[activeEmailProvider] || activeEmailProvider}</span>
                    </p>
                    <p className="text-sm text-stone-600">
                      Status: <span className={`font-medium ${emailHealthStatusClass}`}>{emailHealthStatus}</span>
                    </p>
                    <p className="text-sm text-stone-600">
                      Active sender: <span className="font-medium text-stone-900">{emailHealthDetail}</span>
                    </p>
                    {emailFallbackNotice && (
                      <p className="text-xs text-amber-700 pt-1">{emailFallbackNotice}</p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label>Active Provider</Label>
                    <Select value={emailProvider} onValueChange={setEmailProvider}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="supabase">Supabase Auth Emails</SelectItem>
                        <SelectItem value="gmail">Gmail / Google Workspace</SelectItem>
                        <SelectItem value="mailgun">Mailgun API</SelectItem>
                        <SelectItem value="outlook">Microsoft 365 / Outlook</SelectItem>
                        <SelectItem value="smtp">Other SMTP</SelectItem>
                        <SelectItem value="resend">Resend Environment</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-stone-500">
                      Gmail and Microsoft use OAuth connect flows. Mailgun uses API credentials. Other SMTP is for host, port, encryption, auth, reply-to, and controllable return-path.
                    </p>
                  </div>

                  {emailProvider === 'gmail' && (
                    <div className="space-y-4 rounded-xl border border-stone-200 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-stone-900">Gmail / Google Workspace mailer</p>
                          <p className="text-sm text-stone-500">
                            Save your Google OAuth web app credentials, then connect the mailbox with OAuth.
                          </p>
                          <p className="text-xs text-stone-500 mt-2">
                            Redirect URI: {emailDeliveryConfig?.gmail?.oauth_callback_url || 'Unavailable until this page is served from the live app URL'}
                          </p>
                          <p className="text-xs text-stone-500 mt-1">
                            Use the OAuth Client ID and Client Secret from Google Cloud. The API key is not used here.
                          </p>
                        </div>
                        <Badge className={emailDeliveryConfig?.gmail?.connected ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-stone-100 text-stone-700 border-stone-200'}>
                          {emailDeliveryConfig?.gmail?.connected ? 'Connected' : 'Not Connected'}
                        </Badge>
                      </div>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Google Client ID</Label>
                          <Input
                            ref={gmailClientIdRef}
                            value={gmailClientId}
                            onChange={(e) => setGmailClientId(e.target.value)}
                            onBlur={() => setGmailClientId(String(gmailClientIdRef.current?.value || '').trim())}
                            autoComplete="off"
                            placeholder={emailDeliveryConfig?.gmail?.client_id_set ? 'Saved client ID is already configured' : 'Google OAuth client ID'}
                          />
                          <p className="text-xs text-stone-500">
                            Status: {gmailClientIdStatus}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Google Client Secret</Label>
                          <div className="relative">
                            <Input
                              ref={gmailClientSecretRef}
                              type={showGmailClientSecret ? 'text' : 'password'}
                              value={gmailClientSecret}
                              onChange={(e) => setGmailClientSecret(e.target.value)}
                              onBlur={() => setGmailClientSecret(String(gmailClientSecretRef.current?.value || '').trim())}
                              autoComplete="off"
                              placeholder={emailDeliveryConfig?.gmail?.client_secret_set ? 'Saved secret is masked. Enter a new one to replace it.' : 'Google OAuth client secret'}
                              className="pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowGmailClientSecret((prev) => !prev)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                            >
                              {showGmailClientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <p className="text-xs text-stone-500">
                            Status: {gmailClientSecretStatus}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>From Email</Label>
                          <Input value={gmailFromEmail} onChange={(e) => setGmailFromEmail(e.target.value)} placeholder={emailDeliveryConfig?.gmail?.email || 'mailer@yourdomain.com'} />
                        </div>
                        <div className="space-y-2">
                          <Label>From Name</Label>
                          <Input value={gmailFromName} onChange={(e) => setGmailFromName(e.target.value)} placeholder="Secure PDF Platform" />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <Label>Reply-To</Label>
                          <Input value={gmailReplyTo} onChange={(e) => setGmailReplyTo(e.target.value)} placeholder="support@yourdomain.com" />
                        </div>
                      </div>
                      <p className="text-sm text-stone-500">
                        `Reply-To` is supported here. Bounce handling and actual return-path are managed by Google.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => handleEmailOAuthConnect('gmail')}
                          variant="outline"
                          disabled={!gmailCanStartOAuth}
                        >
                          {emailSaving
                            ? 'Saving Gmail Settings...'
                            : emailDeliveryConfig?.gmail?.connected
                              ? 'Reconnect Gmail'
                              : 'Connect Gmail'}
                        </Button>
                        {emailDeliveryConfig?.gmail?.connected && (
                          <Button variant="outline" onClick={() => handleEmailProviderDisconnect('gmail')} disabled={emailSaving}>
                            Disconnect Gmail
                          </Button>
                        )}
                      </div>
                      {!gmailHasClientSecret && (
                        <p className="text-sm text-red-700">
                          Google login will not open until the OAuth Client Secret is created in Google Cloud and entered here.
                        </p>
                      )}
                      {(gmailDraftClientId || gmailDraftClientSecret) && (
                        <p className="text-sm text-amber-700">
                          Draft credentials are present. Clicking `Connect Gmail` will save them first, then continue to Google login.
                        </p>
                      )}
                    </div>
                  )}

                  {emailProvider === 'mailgun' && (
                    <div className="space-y-4 rounded-xl border border-stone-200 p-4">
                      <div>
                        <p className="font-semibold text-stone-900">Mailgun API mailer</p>
                        <p className="text-sm text-stone-500">Use your Mailgun sending domain, API key, and preferred sender identity.</p>
                      </div>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Mailgun API Key</Label>
                          <div className="relative">
                            <Input
                              type={showMailgunApiKey ? 'text' : 'password'}
                              value={mailgunApiKey}
                              onChange={(e) => setMailgunApiKey(e.target.value)}
                              placeholder={emailDeliveryConfig?.mailgun?.api_key_set ? 'Saved API key is masked. Enter a new one to replace it.' : 'key-...'}
                              className="pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowMailgunApiKey((prev) => !prev)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                            >
                              {showMailgunApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Sending Domain</Label>
                          <Input value={mailgunDomain} onChange={(e) => setMailgunDomain(e.target.value)} placeholder="mg.yourdomain.com" />
                        </div>
                        <div className="space-y-2">
                          <Label>Region</Label>
                          <Select value={mailgunRegion} onValueChange={setMailgunRegion}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="us">US</SelectItem>
                              <SelectItem value="eu">EU</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>From Email</Label>
                          <Input value={mailgunFromEmail} onChange={(e) => setMailgunFromEmail(e.target.value)} placeholder="mailer@yourdomain.com" />
                        </div>
                        <div className="space-y-2">
                          <Label>From Name</Label>
                          <Input value={mailgunFromName} onChange={(e) => setMailgunFromName(e.target.value)} placeholder="Secure PDF Platform" />
                        </div>
                        <div className="space-y-2">
                          <Label>Reply-To</Label>
                          <Input value={mailgunReplyTo} onChange={(e) => setMailgunReplyTo(e.target.value)} placeholder="support@yourdomain.com" />
                        </div>
                      </div>
                      <p className="text-sm text-stone-500">
                        `Reply-To` is supported here. Bounce routing and return-path are managed by Mailgun and your sending domain configuration.
                      </p>
                    </div>
                  )}

                  {emailProvider === 'outlook' && (
                    <div className="space-y-4 rounded-xl border border-stone-200 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-stone-900">Microsoft 365 / Outlook mailer</p>
                          <p className="text-sm text-stone-500">Save the Azure app credentials, then authorize the Microsoft account that will send mail.</p>
                          <p className="text-xs text-stone-500 mt-2">
                            Redirect URI: {emailDeliveryConfig?.outlook?.oauth_callback_url || 'Unavailable until this page is served from the live app URL'}
                          </p>
                        </div>
                        <Badge className={emailDeliveryConfig?.outlook?.connected ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-stone-100 text-stone-700 border-stone-200'}>
                          {emailDeliveryConfig?.outlook?.connected ? 'Connected' : 'Not Connected'}
                        </Badge>
                      </div>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Tenant ID</Label>
                          <Input value={outlookTenantId} onChange={(e) => setOutlookTenantId(e.target.value)} placeholder="common" />
                        </div>
                        <div className="space-y-2">
                          <Label>Application ID</Label>
                          <Input
                            ref={outlookClientIdRef}
                            value={outlookClientId}
                            onChange={(e) => setOutlookClientId(e.target.value)}
                            onBlur={() => setOutlookClientId(String(outlookClientIdRef.current?.value || '').trim())}
                            autoComplete="off"
                            placeholder={emailDeliveryConfig?.outlook?.client_id_set ? 'Saved application ID is already configured' : 'Azure application ID'}
                          />
                          <p className="text-xs text-stone-500">
                            Status: {outlookClientIdStatus}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Application Secret</Label>
                          <div className="relative">
                            <Input
                              ref={outlookClientSecretRef}
                              type={showOutlookClientSecret ? 'text' : 'password'}
                              value={outlookClientSecret}
                              onChange={(e) => setOutlookClientSecret(e.target.value)}
                              onBlur={() => setOutlookClientSecret(String(outlookClientSecretRef.current?.value || '').trim())}
                              autoComplete="off"
                              placeholder={emailDeliveryConfig?.outlook?.client_secret_set ? 'Saved secret is masked. Enter a new one to replace it.' : 'Azure application secret'}
                              className="pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowOutlookClientSecret((prev) => !prev)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                            >
                              {showOutlookClientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <p className="text-xs text-stone-500">
                            Status: {outlookClientSecretStatus}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>From Email</Label>
                          <Input value={outlookFromEmail} onChange={(e) => setOutlookFromEmail(e.target.value)} placeholder={emailDeliveryConfig?.outlook?.email || 'mailer@yourdomain.com'} />
                        </div>
                        <div className="space-y-2">
                          <Label>From Name</Label>
                          <Input value={outlookFromName} onChange={(e) => setOutlookFromName(e.target.value)} placeholder="Secure PDF Platform" />
                        </div>
                        <div className="space-y-2">
                          <Label>Reply-To</Label>
                          <Input value={outlookReplyTo} onChange={(e) => setOutlookReplyTo(e.target.value)} placeholder="support@yourdomain.com" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-stone-200 p-4">
                        <div>
                          <p className="font-medium text-stone-900">Save a copy to Sent Items</p>
                          <p className="text-sm text-stone-500">Uses Microsoft Graph `saveToSentItems` for the connected mailbox.</p>
                        </div>
                        <Switch checked={outlookSaveToSentItems} onCheckedChange={setOutlookSaveToSentItems} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => handleEmailOAuthConnect('outlook')}
                          variant="outline"
                          disabled={!outlookCanStartOAuth}
                        >
                          {emailSaving
                            ? 'Saving Microsoft Settings...'
                            : emailDeliveryConfig?.outlook?.connected
                              ? 'Reconnect Microsoft'
                              : 'Connect Microsoft'}
                        </Button>
                        {emailDeliveryConfig?.outlook?.connected && (
                          <Button variant="outline" onClick={() => handleEmailProviderDisconnect('outlook')} disabled={emailSaving}>
                            Disconnect Microsoft
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {emailProvider === 'smtp' && (
                    <div className="space-y-4 rounded-xl border border-stone-200 p-4">
                      <div>
                        <p className="font-semibold text-stone-900">Other SMTP</p>
                        <p className="text-sm text-stone-500">Use this for any standard SMTP server with custom host, port, encryption, reply-to, and return-path.</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>SMTP Host</Label>
                          <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.your-provider.com" className="mt-1" />
                        </div>
                        <div>
                          <Label>SMTP Port</Label>
                          <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" className="mt-1" />
                        </div>
                        <div>
                          <Label>Encryption</Label>
                          <Select value={smtpEncryption} onValueChange={setSmtpEncryption}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="tls">TLS / STARTTLS</SelectItem>
                              <SelectItem value="ssl">SSL / SMTPS</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-stone-200 p-4 mt-6">
                          <div>
                            <p className="font-medium text-stone-900">Use SMTP Authentication</p>
                            <p className="text-sm text-stone-500">Turn this off only for relays that do not require username and password.</p>
                          </div>
                          <Switch checked={smtpAuthEnabled} onCheckedChange={setSmtpAuthEnabled} />
                        </div>
                        <div>
                          <Label>SMTP Username</Label>
                          <Input value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} placeholder={emailDeliveryConfig?.smtp?.username_set ? `Saved: ${emailDeliveryConfig?.smtp?.username_preview || 'set'}` : 'mailer@yourdomain.com'} className="mt-1" />
                        </div>
                        <div>
                          <Label>SMTP Password</Label>
                          <div className="relative mt-1">
                            <Input
                              type={showSmtpPassword ? 'text' : 'password'}
                              value={smtpPassword}
                              onChange={(e) => setSmtpPassword(e.target.value)}
                              placeholder={emailDeliveryConfig?.smtp?.password_set ? 'Saved password is masked. Enter a new one to replace it.' : 'SMTP password or app password'}
                              className="pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSmtpPassword((prev) => !prev)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                            >
                              {showSmtpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <Label>From Email</Label>
                          <Input value={smtpFromEmail} onChange={(e) => setSmtpFromEmail(e.target.value)} placeholder="no-reply@yourdomain.com" className="mt-1" />
                        </div>
                        <div>
                          <Label>From Name</Label>
                          <Input value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} placeholder="Secure PDF Platform" className="mt-1" />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Reply-To</Label>
                          <Input value={smtpReplyTo} onChange={(e) => setSmtpReplyTo(e.target.value)} placeholder="support@yourdomain.com" className="mt-1" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-stone-200 p-4">
                        <div>
                          <p className="font-medium text-stone-900">Force Return-Path</p>
                          <p className="text-sm text-stone-500">Sets the SMTP envelope sender to match the From Email when supported.</p>
                        </div>
                        <Switch checked={smtpForceReturnPath} onCheckedChange={setSmtpForceReturnPath} />
                      </div>
                    </div>
                  )}

                  {emailProvider === 'resend' && (
                    <div className="space-y-2 rounded-xl border border-stone-200 p-4">
                      <p className="font-semibold text-stone-900">Resend Environment</p>
                      <p className="text-sm text-stone-500">
                        This provider uses `RESEND_API_KEY` and `EMAIL_FROM` from the server environment. Configure those in Vercel, then save this provider as active here.
                      </p>
                    </div>
                  )}

                  {emailProvider === 'supabase' && (
                    <div className="space-y-2 rounded-xl border border-stone-200 p-4">
                      <p className="font-semibold text-stone-900">Supabase Auth Emails</p>
                      <p className="text-sm text-stone-500">
                        Use this only if you configured custom SMTP inside Supabase Auth. Supabase default delivery is not appropriate for production.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button onClick={handleSaveEmailDeliveryConfig} disabled={emailSaving} className="bg-emerald-900 hover:bg-emerald-800">
                      {emailSaving ? 'Saving...' : 'Save Email Delivery Settings'}
                    </Button>
                    <div className="flex-1 flex flex-col sm:flex-row gap-2">
                      <Input value={emailTestRecipient} onChange={(e) => setEmailTestRecipient(e.target.value)} placeholder="test@yourdomain.com" />
                      <Button variant="outline" onClick={handleSendTestEmail} disabled={emailTesting}>
                        {emailTesting ? 'Sending Test...' : 'Send Test Email'}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-stone-200 mt-6">
            <CardHeader>
              <CardTitle>Verification Email</CardTitle>
              <CardDescription>
                Customize the email sent after account registration and verification resend. Supported placeholders:
                {' '}
                <span className="font-mono">{'{{app_name}}'}</span>,{' '}
                <span className="font-mono">{'{{verify_url}}'}</span>,{' '}
                <span className="font-mono">{'{{expiry_hours}}'}</span>,{' '}
                <span className="font-mono">{'{{recipient_email}}'}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {authEmailLoading ? (
                <p className="text-sm text-stone-500">Loading verification email template...</p>
              ) : (
                <>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Subject</Label>
                      <Input
                        value={verifyEmailSubject}
                        onChange={(e) => setVerifyEmailSubject(e.target.value)}
                        placeholder="Verify your email address"
                        maxLength={160}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Preview Text</Label>
                      <Input
                        value={verifyEmailPreview}
                        onChange={(e) => setVerifyEmailPreview(e.target.value)}
                        placeholder="Use the secure link below to verify your email and activate your account."
                        maxLength={220}
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Heading</Label>
                      <Input
                        value={verifyEmailHeading}
                        onChange={(e) => setVerifyEmailHeading(e.target.value)}
                        placeholder="Verify your email address"
                        maxLength={120}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Button Label</Label>
                      <Input
                        value={verifyEmailButtonLabel}
                        onChange={(e) => setVerifyEmailButtonLabel(e.target.value)}
                        placeholder="Verify email"
                        maxLength={60}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Body</Label>
                    <Textarea
                      value={verifyEmailBody}
                      onChange={(e) => setVerifyEmailBody(e.target.value)}
                      rows={5}
                      maxLength={1200}
                      placeholder="Welcome to {{app_name}}. Use the secure button below to verify your email address and activate your account."
                    />
                    <p className="text-xs text-stone-500">Use a blank line to create a new paragraph.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Expiry Notice</Label>
                    <Input
                      value={verifyEmailExpiryNotice}
                      onChange={(e) => setVerifyEmailExpiryNotice(e.target.value)}
                      placeholder="This secure link expires in {{expiry_hours}} hours."
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Footer</Label>
                    <Textarea
                      value={verifyEmailFooter}
                      onChange={(e) => setVerifyEmailFooter(e.target.value)}
                      rows={3}
                      maxLength={320}
                      placeholder="If you did not create this account, you can safely ignore this email."
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-stone-200 mt-6">
            <CardHeader>
              <CardTitle>Password Reset Email</CardTitle>
              <CardDescription>
                Customize the email users receive when they request a password reset. Supported placeholders:
                {' '}
                <span className="font-mono">{'{{app_name}}'}</span>,{' '}
                <span className="font-mono">{'{{reset_url}}'}</span>,{' '}
                <span className="font-mono">{'{{expiry_minutes}}'}</span>,{' '}
                <span className="font-mono">{'{{recipient_email}}'}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {authEmailLoading ? (
                <p className="text-sm text-stone-500">Loading password reset email template...</p>
              ) : (
                <>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Subject</Label>
                      <Input
                        value={passwordResetEmailSubject}
                        onChange={(e) => setPasswordResetEmailSubject(e.target.value)}
                        placeholder="Reset your password"
                        maxLength={160}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Preview Text</Label>
                      <Input
                        value={passwordResetEmailPreview}
                        onChange={(e) => setPasswordResetEmailPreview(e.target.value)}
                        placeholder="Use the secure link below to choose a new password for your account."
                        maxLength={220}
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Heading</Label>
                      <Input
                        value={passwordResetEmailHeading}
                        onChange={(e) => setPasswordResetEmailHeading(e.target.value)}
                        placeholder="Reset your password"
                        maxLength={120}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Button Label</Label>
                      <Input
                        value={passwordResetEmailButtonLabel}
                        onChange={(e) => setPasswordResetEmailButtonLabel(e.target.value)}
                        placeholder="Reset password"
                        maxLength={60}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Body</Label>
                    <Textarea
                      value={passwordResetEmailBody}
                      onChange={(e) => setPasswordResetEmailBody(e.target.value)}
                      rows={5}
                      maxLength={1200}
                      placeholder="We received a request to reset the password for your {{app_name}} account."
                    />
                    <p className="text-xs text-stone-500">Use a blank line to create a new paragraph.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Expiry Notice</Label>
                    <Input
                      value={passwordResetEmailExpiryNotice}
                      onChange={(e) => setPasswordResetEmailExpiryNotice(e.target.value)}
                      placeholder="This secure link expires in {{expiry_minutes}} minutes."
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Footer</Label>
                    <Textarea
                      value={passwordResetEmailFooter}
                      onChange={(e) => setPasswordResetEmailFooter(e.target.value)}
                      rows={3}
                      maxLength={320}
                      placeholder="If you did not request a password reset, you can safely ignore this email."
                    />
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-2">
                    <p className="text-sm font-semibold text-stone-900">Live token preview</p>
                    <p className="text-xs text-stone-500">
                      <span className="font-mono">{'{{app_name}}'}</span> resolves to your current platform brand.
                      {' '}
                      <span className="font-mono">{'{{reset_url}}'}</span> is inserted automatically when the email is sent.
                    </p>
                  </div>
                  <Button onClick={handleSaveAuthEmailTemplate} disabled={authEmailSaving} className="bg-emerald-900 hover:bg-emerald-800">
                    {authEmailSaving ? 'Saving...' : 'Save Auth Emails'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="localization" className="max-w-6xl">
          <Card className="border-stone-200">
            <CardHeader>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <Globe className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <CardTitle>{t('adminSettingsLocalization.title')}</CardTitle>
                  <CardDescription>{t('adminSettingsLocalization.description')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {localizationLoading ? (
                <p className="text-sm text-stone-500">Loading localization settings...</p>
              ) : (
                <Tabs value={localizationSectionTab} onValueChange={setLocalizationSectionTab} className="space-y-6">
                  <TabsList className="h-auto w-full justify-start gap-2 rounded-xl bg-stone-100 p-1">
                    <TabsTrigger value="languages" className="px-4 py-2">Languages</TabsTrigger>
                    <TabsTrigger value="strings" className="px-4 py-2">String Translation</TabsTrigger>
                    <TabsTrigger value="advanced" className="px-4 py-2">Advanced Translation</TabsTrigger>
                  </TabsList>

                  <TabsContent value="languages" className="space-y-6">
                    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                      <ol className="space-y-2 list-decimal pl-5">
                        <li>Untranslated strings fall back to the primary language, then to English if the primary language does not contain that key.</li>
                        <li>Turning a language off removes it from sign-up and profile selectors, but keeps its saved manual overrides for later reuse.</li>
                        <li>Manual overrides are applied at runtime and do not require a code deploy.</li>
                      </ol>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <Card className="border-stone-200">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Automatic Recognition</CardTitle>
                          <CardDescription>Allow browser language auto-detection for first-time visitors.</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 p-3">
                            <span className="text-sm font-medium text-stone-700">Enable automatic recognition</span>
                            <Switch
                              checked={automaticLanguageRecognition}
                              onCheckedChange={setAutomaticLanguageRecognition}
                            />
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-stone-200">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Website Timezone</CardTitle>
                          <CardDescription>Used as the platform timezone reference in admin-controlled settings.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <Select value={siteTimezone} onValueChange={setSiteTimezone}>
                            <SelectTrigger className="h-12">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[320px]">
                              {timezoneSelectOptions.map((timezone) => (
                                <SelectItem key={timezone} value={timezone}>{timezone}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </CardContent>
                      </Card>

                      <Card className="border-stone-200">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Website Currency</CardTitle>
                          <CardDescription>Reference currency for public pricing and platform defaults.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <Select value={siteCurrency} onValueChange={setSiteCurrency}>
                            <SelectTrigger className="h-12">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {currencyOptions.map((currencyCode) => (
                                <SelectItem key={currencyCode} value={currencyCode}>{currencyCode}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </CardContent>
                      </Card>

                      <Card className="border-stone-200">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Primary Language</CardTitle>
                          <CardDescription>Default fallback language across the whole platform.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <Select value={platformLanguage} onValueChange={handleSetPrimaryLanguage}>
                            <SelectTrigger className="h-12">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {availableAdminLanguages.map((language) => (
                                <SelectItem key={language.code} value={language.code}>
                                  {language.nativeName} ({language.name})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </CardContent>
                      </Card>
                    </div>

                    <Card className="border-stone-200">
                      <CardHeader>
                        <CardTitle>Select Languages</CardTitle>
                        <CardDescription>Choose which languages are active, then save the localization configuration.</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4">
                        {availableAdminLanguages.map((language) => {
                          const isEnabled = enabledLanguageSet.has(language.code);
                          const isPrimary = platformLanguage === language.code;
                          const overrideCount = Object.keys(manualTranslationOverrides?.[language.code] || {}).length;
                          return (
                            <div
                              key={language.code}
                              className={`rounded-2xl border p-4 ${
                                isPrimary
                                  ? 'border-emerald-300 bg-emerald-50/60'
                                  : 'border-stone-200 bg-white'
                              }`}
                            >
                              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <div className="flex items-center gap-3">
                                    <p className="text-lg font-semibold text-stone-900">
                                      {language.nativeName}
                                    </p>
                                    <Badge variant="outline" className="uppercase">{language.code}</Badge>
                                    {isPrimary && (
                                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                                        Primary
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="mt-1 text-sm text-stone-500">
                                    {language.name} • {overrideCount} manual override{overrideCount === 1 ? '' : 's'}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    variant={isPrimary ? 'default' : 'outline'}
                                    className={isPrimary ? 'bg-emerald-900 hover:bg-emerald-800' : ''}
                                    onClick={() => handleSetPrimaryLanguage(language.code)}
                                  >
                                    {isPrimary ? 'Primary Language' : 'Set as Primary'}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={isEnabled ? 'outline' : 'default'}
                                    className={!isEnabled ? 'bg-sky-700 hover:bg-sky-600' : ''}
                                    onClick={() => handleToggleEnabledLanguage(language.code)}
                                  >
                                    {isEnabled ? 'Turn Off' : 'Activate'}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>

                    <div className="flex justify-end">
                      <Button
                        className="bg-emerald-900 hover:bg-emerald-800"
                        onClick={handleSaveLocalizationConfig}
                        disabled={localizationSaving}
                      >
                        {localizationSaving ? t('adminSettingsLocalization.saving') : 'Save Language Configuration'}
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="strings" className="space-y-6">
                    <Card className="border-stone-200">
                      <CardHeader>
                        <CardTitle>String Translation</CardTitle>
                        <CardDescription>Search platform strings and set manual overrides for the selected language.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_180px_160px]">
                          <div className="space-y-2">
                            <Label>Target Language</Label>
                            <Select value={translationTargetLanguage} onValueChange={setTranslationTargetLanguage}>
                              <SelectTrigger className="h-12">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {availableAdminLanguages
                                  .filter((language) => enabledLanguageSet.has(language.code))
                                  .map((language) => (
                                    <SelectItem key={language.code} value={language.code}>
                                      {language.nativeName}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Search</Label>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                              <Input
                                value={translationSearch}
                                onChange={(e) => setTranslationSearch(e.target.value)}
                                className="h-12 pl-10"
                                placeholder="Search by key or text"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Show</Label>
                            <Select value={translationRowsPerPage} onValueChange={setTranslationRowsPerPage}>
                              <SelectTrigger className="h-12">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="10">10 entries</SelectItem>
                                <SelectItem value="25">25 entries</SelectItem>
                                <SelectItem value="50">50 entries</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end">
                            <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-4 py-3 w-full">
                              <span className="text-sm font-medium text-stone-700">Only untranslated</span>
                              <Switch
                                checked={translationShowUntranslatedOnly}
                                onCheckedChange={setTranslationShowUntranslatedOnly}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-stone-200">
                          <div className="grid grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)] gap-0 border-b border-stone-200 bg-stone-50 text-sm font-semibold text-stone-900">
                            <div className="px-4 py-3">Translation Key</div>
                            <div className="px-4 py-3">Original String ({platformLanguage.toUpperCase()})</div>
                            <div className="px-4 py-3">Translated String ({translationTargetLanguage.toUpperCase()})</div>
                          </div>
                          <div className="divide-y divide-stone-200">
                            {translationVisibleEntries.length ? (
                              translationVisibleEntries.map((entry) => {
                                const sourceValue = resolveTranslationPreviewValue({
                                  languageCode: platformLanguage,
                                  path: entry.path,
                                  fallbackLanguage: platformLanguage || 'en',
                                  manualOverrides: manualTranslationOverrides,
                                });
                                const targetValue =
                                  manualTranslationOverrides?.[translationTargetLanguage]?.[entry.path] ??
                                  (translationTargetLanguage === platformLanguage
                                    ? String(sourceValue || '')
                                    : '');

                                return (
                                  <div
                                    key={entry.path}
                                    className="grid grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)] gap-0 bg-white"
                                  >
                                    <div className="px-4 py-3 text-xs text-stone-500 font-mono break-all">
                                      {entry.path}
                                    </div>
                                    <div className="px-4 py-3 text-sm text-stone-700 whitespace-pre-wrap">
                                      {String(sourceValue || '')}
                                    </div>
                                    <div className="px-4 py-3">
                                      <Textarea
                                        rows={2}
                                        value={targetValue}
                                        onChange={(e) => handleTranslationValueChange(
                                          translationTargetLanguage,
                                          entry.path,
                                          e.target.value,
                                        )}
                                        placeholder={translationTargetLanguage === platformLanguage
                                          ? 'Primary language value'
                                          : 'Enter manual translation override'}
                                      />
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="px-4 py-8 text-sm text-stone-500">
                                No strings match the current filters.
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm text-stone-500">
                            {localizationFilteredEntries.length} string{localizationFilteredEntries.length === 1 ? '' : 's'} found
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setTranslationPage((current) => Math.max(1, current - 1))}
                              disabled={translationPage <= 1}
                            >
                              Previous
                            </Button>
                            <span className="text-sm text-stone-600">
                              Page {Math.min(translationPage, translationTotalPages)} of {translationTotalPages}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setTranslationPage((current) => Math.min(translationTotalPages, current + 1))}
                              disabled={translationPage >= translationTotalPages}
                            >
                              Next
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleResetLanguageOverrides(translationTargetLanguage)}
                            disabled={translationSaving}
                          >
                            Clear {translationTargetLanguage.toUpperCase()} Overrides
                          </Button>
                          <Button
                            type="button"
                            className="bg-emerald-900 hover:bg-emerald-800"
                            onClick={handleSaveLocalizationOverrides}
                            disabled={translationSaving}
                          >
                            {translationSaving ? 'Saving...' : 'Save Manual Translations'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="advanced" className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                      <Card className="border-stone-200">
                        <CardHeader>
                          <CardTitle>Language Stats</CardTitle>
                          <CardDescription>Quick view of enabled languages and saved override counts.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {availableAdminLanguages.map((language) => {
                            const count = Object.keys(manualTranslationOverrides?.[language.code] || {}).length;
                            return (
                              <div key={language.code} className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2">
                                <div>
                                  <p className="font-medium text-stone-900">{language.nativeName}</p>
                                  <p className="text-xs text-stone-500 uppercase">{language.code}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-stone-900">{count}</p>
                                  <p className="text-xs text-stone-500">overrides</p>
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>

                      <Card className="border-stone-200">
                        <CardHeader>
                          <CardTitle>Advanced Translation Editor</CardTitle>
                          <CardDescription>Bulk edit one language as flat JSON: translation path to translated value.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Language</Label>
                              <Select value={advancedLanguage} onValueChange={setAdvancedLanguage}>
                                <SelectTrigger className="h-12">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableAdminLanguages.map((language) => (
                                    <SelectItem key={language.code} value={language.code}>
                                      {language.nativeName} ({language.code.toUpperCase()})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                              Fallback order:
                              {' '}
                              <span className="font-medium text-stone-900">{translationTargetLanguage.toUpperCase()}</span>
                              {' '}
                              →
                              {' '}
                              <span className="font-medium text-stone-900">{platformLanguage.toUpperCase()}</span>
                              {' '}
                              →
                              {' '}
                              <span className="font-medium text-stone-900">EN</span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Overrides JSON</Label>
                            <Textarea
                              rows={18}
                              value={advancedOverridesJson}
                              onChange={(e) => setAdvancedOverridesJson(e.target.value)}
                              className="font-mono text-xs"
                              placeholder='{\n  "dashboard.title": "Dashboard"\n}'
                            />
                          </div>

                          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setAdvancedOverridesJson(JSON.stringify(manualTranslationOverrides?.[advancedLanguage] || {}, null, 2))}
                            >
                              Reload JSON
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleResetLanguageOverrides(advancedLanguage)}
                              disabled={translationSaving}
                            >
                              Clear Language Overrides
                            </Button>
                            <Button
                              type="button"
                              className="bg-emerald-900 hover:bg-emerald-800"
                              onClick={handleImportAdvancedOverrides}
                              disabled={translationSaving}
                            >
                              {translationSaving ? 'Saving...' : 'Import & Save JSON'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isSuperAdmin && (
          <>
            <TabsContent value="public-site" className="max-w-4xl">
              <Card className="border-stone-200">
                <CardHeader>
                  <CardTitle>Public Site Settings</CardTitle>
                  <CardDescription>
                    Footer links and authentication portal URL used by public pages.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {publicSiteLoading ? (
                    <p className="text-sm text-stone-500">Loading public site settings...</p>
                  ) : (
                    <>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>About URL</Label>
                          <Input value={publicAboutUrl} onChange={(e) => setPublicAboutUrl(e.target.value)} placeholder="https://example.com/about" />
                        </div>
                        <div className="space-y-2">
                          <Label>Contact URL</Label>
                          <Input value={publicContactUrl} onChange={(e) => setPublicContactUrl(e.target.value)} placeholder="https://example.com/contact" />
                        </div>
                      </div>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Blog URL</Label>
                          <Input value={publicBlogUrl} onChange={(e) => setPublicBlogUrl(e.target.value)} placeholder="https://example.com/blog" />
                        </div>
                        <div className="space-y-2">
                          <Label>GDPR URL</Label>
                          <Input value={publicGdprUrl} onChange={(e) => setPublicGdprUrl(e.target.value)} placeholder="https://example.com/gdpr" />
                        </div>
                      </div>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Privacy URL</Label>
                          <Input value={publicPrivacyUrl} onChange={(e) => setPublicPrivacyUrl(e.target.value)} placeholder="/privacy" />
                        </div>
                        <div className="space-y-2">
                          <Label>Terms URL</Label>
                          <Input value={publicTermsUrl} onChange={(e) => setPublicTermsUrl(e.target.value)} placeholder="/terms" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Legacy Auth Portal URL</Label>
                        <Input value={authPortalUrl} onChange={(e) => setAuthPortalUrl(e.target.value)} placeholder="https://auth.example.com" />
                        <p className="text-xs text-stone-500">
                          Optional legacy setting. Native Google sign-in now uses the built-in Supabase OAuth flow instead.
                        </p>
                      </div>
                      <Button
                        onClick={handleSavePublicSiteConfig}
                        disabled={publicSiteSaving}
                        className="bg-emerald-900 hover:bg-emerald-800"
                      >
                        {publicSiteSaving ? 'Saving...' : 'Save Public Site Settings'}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="plans" className="max-w-5xl">
              <Card className="border-stone-200">
                <CardHeader>
                  <CardTitle>{t('adminSettingsPlans.title')}</CardTitle>
                  <CardDescription>
                    {t('adminSettingsPlans.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {planLoading ? (
                    <p className="text-sm text-stone-500">{t('adminSettingsPlans.loading')}</p>
                  ) : (
                    <>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="grid flex-1 gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>{t('adminSettingsPlans.currency')}</Label>
                            <Input value={planCurrency} onChange={(e) => setPlanCurrency(e.target.value.toLowerCase())} placeholder="eur" maxLength={3} />
                          </div>
                          <div className="space-y-2">
                            <Label>{t('adminSettingsPlans.billingInterval')}</Label>
                            <Select value={planInterval} onValueChange={setPlanInterval}>
                              <SelectTrigger className="h-12">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="month">{t('adminSettingsPlans.intervalMonth')}</SelectItem>
                                <SelectItem value="year">{t('adminSettingsPlans.intervalYear')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button
                          type="button"
                          className="bg-emerald-900 hover:bg-emerald-800"
                          onClick={() => setShowNewPlanDialog(true)}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          {t('adminSettingsPlans.newPlan')}
                        </Button>
                      </div>

                      <div className="grid gap-4">
                        {orderedPlanEntries.map(([planId, editor]) => {
                          const shareUrl =
                            typeof window === 'undefined'
                              ? `/pricing?plan=${encodeURIComponent(planId)}`
                              : `${window.location.origin}/pricing?plan=${encodeURIComponent(planId)}`;
                          return (
                            <Card key={planId} className="border-stone-200 bg-stone-50/50">
                              <CardContent className="space-y-4 p-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                  <div>
                                    <p className="font-semibold text-stone-900">{editor.name || formatPlanNameFromId(planId)}</p>
                                    <p className="text-sm text-stone-500">
                                      {t('adminSettingsPlans.planId')}: <code>{planId}</code>
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-4">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-stone-600">{t('adminSettingsPlans.featured')}</span>
                                      <Switch checked={editor.featured} onCheckedChange={(value) => updatePlanEditorField(planId, 'featured', value)} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-stone-600">{t('adminSettingsPlans.active')}</span>
                                      <Switch checked={editor.active} onCheckedChange={(value) => updatePlanEditorField(planId, 'active', value)} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-stone-600">{t('adminSettingsPlans.showOnPricing')}</span>
                                      <Switch checked={editor.public_visible} onCheckedChange={(value) => updatePlanEditorField(planId, 'public_visible', value)} />
                                    </div>
                                  </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label>{t('adminSettingsPlans.name')}</Label>
                                    <Input value={editor.name} onChange={(e) => updatePlanEditorField(planId, 'name', e.target.value)} />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>{t('adminSettingsPlans.badge')}</Label>
                                    <Input value={editor.badge} onChange={(e) => updatePlanEditorField(planId, 'badge', e.target.value)} placeholder={t('adminSettingsPlans.badgePlaceholder')} />
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label>{t('adminSettingsPlans.descriptionLabel')}</Label>
                                  <Input value={editor.description} onChange={(e) => updatePlanEditorField(planId, 'description', e.target.value)} />
                                </div>

                                <div className="grid gap-3 md:grid-cols-4">
                                  <div className="space-y-2">
                                    <Label>{t('adminSettingsPlans.price')}</Label>
                                    <Input type="number" min="0" step="0.01" value={editor.price} onChange={(e) => updatePlanEditorField(planId, 'price', e.target.value)} />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>{t('adminSettingsPlans.storageMb')}</Label>
                                    <Input type="number" min="0" step="1" value={editor.storage_mb} onChange={(e) => updatePlanEditorField(planId, 'storage_mb', e.target.value)} />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>{t('adminSettingsPlans.linksPerMonth')}</Label>
                                    <Input type="number" min="0" step="1" value={editor.links_per_month} onChange={(e) => updatePlanEditorField(planId, 'links_per_month', e.target.value)} />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>{t('adminSettingsPlans.sortOrder')}</Label>
                                    <Input type="number" min="0" step="1" value={editor.sort_order} onChange={(e) => updatePlanEditorField(planId, 'sort_order', e.target.value)} />
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label>{t('adminSettingsPlans.features')}</Label>
                                  <Textarea value={editor.features} onChange={(e) => updatePlanEditorField(planId, 'features', e.target.value)} rows={6} />
                                </div>

                                <div className="rounded-xl border border-stone-200 bg-white p-4">
                                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                      <p className="font-medium text-stone-900">{t('adminSettingsPlans.shareLink')}</p>
                                      <p className="text-sm text-stone-500">
                                        {editor.public_visible
                                          ? t('adminSettingsPlans.shareLinkPublic')
                                          : t('adminSettingsPlans.shareLinkHidden')}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Link2 className="h-4 w-4 text-stone-400" />
                                      <code className="max-w-[440px] truncate rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
                                        {shareUrl}
                                      </code>
                                      <Button type="button" variant="outline" size="icon" onClick={() => handleCopyPlanLink(planId)}>
                                        {copiedPlanLink === planId ? (
                                          <CheckCircle className="h-4 w-4 text-emerald-600" />
                                        ) : (
                                          <Copy className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>

                      <Button
                        onClick={handleSaveSubscriptionPlans}
                        disabled={planSaving}
                        className="bg-emerald-900 hover:bg-emerald-800"
                      >
                        {planSaving ? t('adminSettingsPlans.saving') : t('adminSettingsPlans.save')}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="storage" className="max-w-4xl">
              <Card className="border-stone-200" data-testid="storage-settings-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>PDF Storage Provider</CardTitle>
                      <CardDescription>Select where new PDFs are stored.</CardDescription>
                    </div>
                    <Badge className={storageProvider === 'wasabi_s3'
                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'}
                    >
                      {storageProvider === 'wasabi_s3' ? 'Wasabi Active' : 'Supabase Active'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {storageLoading ? (
                    <p className="text-sm text-stone-500">Loading storage settings...</p>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label>Active provider</Label>
                        <Select value={storageProvider} onValueChange={setStorageProvider}>
                          <SelectTrigger className="h-12">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="supabase_db">Supabase (database)</SelectItem>
                            <SelectItem value="wasabi_s3">Wasabi (S3 compatible)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid md:grid-cols-2 gap-3">
                        <Input placeholder="Wasabi endpoint" value={wasabiEndpoint} onChange={(e) => setWasabiEndpoint(e.target.value)} />
                        <Input placeholder="Region" value={wasabiRegion} onChange={(e) => setWasabiRegion(e.target.value)} />
                        <Input placeholder="Bucket" value={wasabiBucket} onChange={(e) => setWasabiBucket(e.target.value)} />
                        <Input placeholder="Access key ID" value={wasabiAccessKey} onChange={(e) => setWasabiAccessKey(e.target.value)} />
                      </div>
                      <Input type="password" placeholder="Secret access key" value={wasabiSecretKey} onChange={(e) => setWasabiSecretKey(e.target.value)} />
                      <div className="flex items-center justify-between rounded-lg border border-stone-200 p-3">
                        <div>
                          <p className="text-sm font-medium text-stone-900">Force path style</p>
                          <p className="text-xs text-stone-500">Recommended for S3-compatible providers.</p>
                        </div>
                        <Switch checked={wasabiForcePathStyle} onCheckedChange={setWasabiForcePathStyle} />
                      </div>
                      <p className="text-xs text-stone-500">
                        Current key status: {storageConfig?.wasabi?.access_key_set ? 'access key set' : 'access key missing'} / {storageConfig?.wasabi?.secret_key_set ? 'secret key set' : 'secret key missing'}
                      </p>
                      <Button onClick={handleSaveStorageConfig} disabled={storageSaving} className="bg-emerald-900 hover:bg-emerald-800">
                        {storageSaving ? 'Saving...' : 'Save Storage Settings'}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="domains" className="max-w-4xl">
              <Card className="border-stone-200" data-testid="vercel-settings-card">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle>Vercel Domain Automation</CardTitle>
                      <CardDescription>Configure automatic domain attach and SSL preparation.</CardDescription>
                    </div>
                    <Badge className={vercelConfig?.configured
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border-amber-200'}
                    >
                      {vercelConfig?.configured ? 'Configured' : 'Needs Setup'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {vercelLoading ? (
                    <p className="text-sm text-stone-500">Loading Vercel settings...</p>
                  ) : (
                    <>
                      <Input value={vercelProjectId} onChange={(e) => setVercelProjectId(e.target.value)} placeholder="Vercel project ID" />
                      <Input value={vercelTeamId} onChange={(e) => setVercelTeamId(e.target.value)} placeholder="Vercel team ID (optional)" />
                      <div className="relative">
                        <Input
                          type={showVercelToken ? 'text' : 'password'}
                          value={vercelApiToken}
                          onChange={(e) => setVercelApiToken(e.target.value)}
                          placeholder="API token"
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowVercelToken(!showVercelToken)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                        >
                          {showVercelToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-stone-500">
                        Current token: {vercelConfig?.token_set ? vercelConfig?.token_preview : 'not set'}
                      </p>
                      <div className="flex items-center justify-between rounded-lg border border-stone-200 p-3">
                        <div>
                          <p className="text-sm font-medium text-stone-900">Auto-attach domains</p>
                          <p className="text-xs text-stone-500">Automatically add user domains to the linked Vercel project.</p>
                        </div>
                        <Switch checked={vercelAutoAttach} onCheckedChange={setVercelAutoAttach} />
                      </div>
                      <Button onClick={handleSaveVercelConfig} disabled={vercelSaving} className="bg-emerald-900 hover:bg-emerald-800">
                        {vercelSaving ? 'Saving...' : 'Save Vercel Settings'}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="branding" className="max-w-4xl">
              <Card className="border-stone-200" data-testid="branding-settings-card">
                <CardHeader>
                  <CardTitle>Branding Settings</CardTitle>
                  <CardDescription>Update brand names, tagline, and colors used across the platform.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {brandingLoading ? (
                    <p className="text-sm text-stone-500">Loading branding settings...</p>
                  ) : (
                    <>
                      <div className="grid md:grid-cols-2 gap-3">
                        <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="App name" maxLength={48} />
                        <Input value={brandProductName} onChange={(e) => setBrandProductName(e.target.value)} placeholder="Product name" maxLength={72} />
                      </div>
                      <Input value={brandTagline} onChange={(e) => setBrandTagline(e.target.value)} placeholder="Tagline" maxLength={120} />
                      <div className="grid md:grid-cols-2 gap-3">
                        <Input value={brandPrimaryColor} onChange={(e) => setBrandPrimaryColor(e.target.value)} placeholder="#064e3b" className="font-mono" />
                        <Input value={brandAccentColor} onChange={(e) => setBrandAccentColor(e.target.value)} placeholder="#10b981" className="font-mono" />
                      </div>
                      <Input value={brandFooterText} onChange={(e) => setBrandFooterText(e.target.value)} placeholder="Footer text" maxLength={160} />
                      <div className="rounded-lg border border-stone-200 p-4 bg-stone-50">
                        <p className="font-heading text-lg text-stone-900">{brandName || DEFAULT_BRANDING.app_name}</p>
                        <p className="text-sm text-stone-600">{brandTagline || DEFAULT_BRANDING.tagline}</p>
                        <p className="text-xs text-stone-500 mt-2">
                          {new Date().getFullYear()} {brandProductName || DEFAULT_BRANDING.product_name}. {brandFooterText || DEFAULT_BRANDING.footer_text}
                        </p>
                      </div>
                      <Button onClick={handleSaveBrandingConfig} disabled={brandingSaving} className="bg-emerald-900 hover:bg-emerald-800">
                        {brandingSaving ? 'Saving...' : 'Save Branding Settings'}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="seo" className="max-w-4xl">
              <Card className="border-stone-200" data-testid="seo-settings-card">
                <CardHeader>
                  <CardTitle>SEO Settings</CardTitle>
                  <CardDescription>Default metadata, social image, favicon, and canonical configuration.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {seoLoading ? (
                    <p className="text-sm text-stone-500">Loading SEO settings...</p>
                  ) : (
                    <>
                      <Input value={seoSiteName} onChange={(e) => setSeoSiteName(e.target.value)} placeholder="Site name" maxLength={80} />
                      <Input value={seoDefaultTitle} onChange={(e) => setSeoDefaultTitle(e.target.value)} placeholder="Default page title" maxLength={120} />
                      <Textarea value={seoDefaultDescription} onChange={(e) => setSeoDefaultDescription(e.target.value)} rows={3} maxLength={320} placeholder="Default description" />
                      <Input value={seoKeywords} onChange={(e) => setSeoKeywords(e.target.value)} placeholder="Keywords" maxLength={320} />
                      <div className="grid md:grid-cols-2 gap-3">
                        <Input value={seoOgImageUrl} onChange={(e) => setSeoOgImageUrl(e.target.value)} placeholder="Open Graph image URL" maxLength={400} />
                        <Input value={seoFaviconUrl} onChange={(e) => setSeoFaviconUrl(e.target.value)} placeholder="Favicon URL" maxLength={400} />
                      </div>
                      <div className="grid md:grid-cols-2 gap-3">
                        <Input value={seoCanonicalBaseUrl} onChange={(e) => setSeoCanonicalBaseUrl(e.target.value)} placeholder="Canonical base URL" maxLength={240} />
                        <Input value={seoTwitterHandle} onChange={(e) => setSeoTwitterHandle(e.target.value)} placeholder="Twitter handle" maxLength={64} />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-stone-200 p-3">
                        <div>
                          <p className="text-sm font-medium text-stone-900">Disable indexing globally</p>
                          <p className="text-xs text-stone-500">Sets all pages to noindex, nofollow.</p>
                        </div>
                        <Switch checked={seoNoindex} onCheckedChange={setSeoNoindex} />
                      </div>
                      <div className="rounded-lg border border-stone-200 p-4 bg-stone-50">
                        <p className="text-sm font-semibold text-blue-700 truncate">{seoDefaultTitle || DEFAULT_SEO_SETTINGS.default_title}</p>
                        <p className="text-xs text-emerald-700 truncate mt-1">{seoPreviewUrl}/</p>
                        <p className="text-xs text-stone-600 mt-1 line-clamp-2">
                          {seoDefaultDescription || DEFAULT_SEO_SETTINGS.default_description}
                        </p>
                      </div>
                      <Button onClick={handleSaveSeoConfig} disabled={seoSaving} className="bg-emerald-900 hover:bg-emerald-800">
                        {seoSaving ? 'Saving...' : 'Save SEO Settings'}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="invoice" className="max-w-4xl">
              <Card className="border-stone-200" data-testid="invoice-template-settings-card">
                <CardHeader>
                  <CardTitle>Invoice Template Settings</CardTitle>
                  <CardDescription>Company details and branding used for generated invoice PDFs.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {invoiceLoading ? (
                    <p className="text-sm text-stone-500">Loading invoice template settings...</p>
                  ) : (
                    <>
                      <div className="grid md:grid-cols-2 gap-3">
                        <Input value={invoiceCompanyName} onChange={(e) => setInvoiceCompanyName(e.target.value)} placeholder="Company name" maxLength={100} />
                        <Input value={invoiceCompanyEmail} onChange={(e) => setInvoiceCompanyEmail(e.target.value)} placeholder="Company email" maxLength={120} />
                      </div>
                      <div className="grid md:grid-cols-2 gap-3">
                        <Input value={invoiceCompanyPhone} onChange={(e) => setInvoiceCompanyPhone(e.target.value)} placeholder="Company phone" maxLength={64} />
                        <Input value={invoiceCompanyWebsite} onChange={(e) => setInvoiceCompanyWebsite(e.target.value)} placeholder="Company website" maxLength={220} />
                      </div>
                      <Textarea value={invoiceCompanyAddress} onChange={(e) => setInvoiceCompanyAddress(e.target.value)} rows={2} maxLength={200} placeholder="Company address" />
                      <div className="grid md:grid-cols-3 gap-3">
                        <Input value={invoiceTaxLabel} onChange={(e) => setInvoiceTaxLabel(e.target.value)} placeholder="Tax label" maxLength={40} />
                        <Input value={invoiceTaxId} onChange={(e) => setInvoiceTaxId(e.target.value)} placeholder="Tax ID" maxLength={80} />
                        <Input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())} placeholder="Invoice prefix" maxLength={12} />
                      </div>
                      <div className="grid md:grid-cols-2 gap-3">
                        <Input value={invoicePrimaryColor} onChange={(e) => setInvoicePrimaryColor(e.target.value)} placeholder="#064e3b" className="font-mono" />
                        <Input value={invoiceAccentColor} onChange={(e) => setInvoiceAccentColor(e.target.value)} placeholder="#10b981" className="font-mono" />
                      </div>
                      <Input value={invoiceLogoUrl} onChange={(e) => setInvoiceLogoUrl(e.target.value)} placeholder="Logo URL" maxLength={400} />
                      <div className="flex items-center justify-between rounded-lg border border-stone-200 p-3">
                        <div>
                          <p className="text-sm font-medium text-stone-900">Show logo on invoices</p>
                          <p className="text-xs text-stone-500">Disable to keep a text-only invoice header.</p>
                        </div>
                        <Switch checked={invoiceShowLogo} onCheckedChange={setInvoiceShowLogo} />
                      </div>
                      <Textarea value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} rows={3} maxLength={500} placeholder="Invoice notes" />
                      <Textarea value={invoiceTerms} onChange={(e) => setInvoiceTerms(e.target.value)} rows={3} maxLength={500} placeholder="Invoice terms" />
                      <Input value={invoiceFooterText} onChange={(e) => setInvoiceFooterText(e.target.value)} placeholder="Footer text" maxLength={240} />
                      <Button onClick={handleSaveInvoiceTemplate} disabled={invoiceSaving} className="bg-emerald-900 hover:bg-emerald-800">
                        {invoiceSaving ? 'Saving...' : 'Save Invoice Template'}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </>
        )}

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
