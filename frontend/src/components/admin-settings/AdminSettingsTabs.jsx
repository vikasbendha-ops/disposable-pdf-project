import React from 'react';
import { CreditCard, Shield, CheckCircle, AlertCircle, Eye, EyeOff, Palette, Search, Globe, FileText, Mail, Copy, Link2, Plus, Activity, History, RefreshCw, Settings2, HardDrive } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

export function AdminSettingsTabsContent({ ctx }) {
  const {
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
  } = ctx;

  return (
    <>
        <TabsContent value="payments" className="max-w-4xl">
          <Card className="border-stone-200" data-testid="stripe-settings-card">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-indigo-700" />
                  </div>
                  <div>
                    <CardTitle>{t('adminSettingsGeneral.stripeTitle')}</CardTitle>
                    <CardDescription>{t('adminSettingsGeneral.stripeDescription')}</CardDescription>
                  </div>
                </div>
                <Badge
                  data-testid="stripe-mode-badge"
                  className={isLive
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : 'bg-amber-100 text-amber-800 border-amber-200'
                  }
                >
                  {isLive ? t('adminSettingsGeneral.liveMode') : t('adminSettingsGeneral.sandboxMode')}
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
                  <h3 className="font-semibold text-stone-900 mb-1">{t('adminSettingsGeneral.activateLiveMode')}</h3>
                  <p className="text-sm text-stone-500">
                    Save a live secret key to process real payments.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Input
                      data-testid="stripe-live-key-input"
                      type={showKey ? 'text' : 'password'}
                      placeholder={t('adminSettingsGeneral.liveKeyPlaceholder')}
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
                  <h3 className="font-semibold text-stone-900 mb-1">{t('adminSettingsGeneral.activateSandboxMode')}</h3>
                  <p className="text-sm text-stone-500">
                    Save a sandbox key or switch the existing configuration back to test mode.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    placeholder={t('adminSettingsGeneral.sandboxKeyPlaceholder')}
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
                    <p className="font-medium text-stone-900">{t('adminSettingsGeneral.switchBackToSandbox')}</p>
                    <p className="text-sm text-stone-500">{t('adminSettingsGeneral.switchBackToSandboxDescription')}</p>
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

        <TabsContent value="operations" className="max-w-6xl">
          <div className="space-y-6">
            <Card className="border-stone-200">
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                      <Activity className="h-5 w-5 text-emerald-700" />
                    </div>
                    <div>
                      <CardTitle>{t('adminSettingsGeneral.operationsTitle')}</CardTitle>
                      <CardDescription>{t('adminSettingsGeneral.operationsDescription')}</CardDescription>
                    </div>
                  </div>
                  <Button variant="outline" onClick={refreshOperationsData} disabled={operationsHealthLoading || jobsLoading || settingsHistoryLoading}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {operationsHealthLoading ? (
                    <p className="text-sm text-stone-500">{t('adminSettingsGeneral.loadingOperations')}</p>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                      {Object.entries(operationsHealth?.services || {}).map(([serviceKey, service]) => (
                        <Card key={serviceKey} className="border-stone-200 bg-stone-50/80">
                          <CardContent className="space-y-2 p-4">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold capitalize text-stone-900">
                                {serviceKey.replace(/_/g, ' ')}
                              </p>
                              <Badge
                                className={
                                  service?.status === 'healthy'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : 'bg-amber-100 text-amber-800 border-amber-200'
                                }
                              >
                                {service?.status || 'unknown'}
                              </Badge>
                            </div>
                            <p className="text-xs leading-5 text-stone-600">{service?.detail || 'No details available'}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    <div className="grid gap-4 md:grid-cols-5">
                      {[
                        ['Queued', operationsHealth?.jobs?.queued || 0],
                        ['Running', operationsHealth?.jobs?.running || 0],
                        ['Completed', operationsHealth?.jobs?.completed || 0],
                        ['Failed', operationsHealth?.jobs?.failed || 0],
                        ['Total', operationsHealth?.jobs?.total || 0],
                      ].map(([label, value]) => (
                        <Card key={label} className="border-stone-200">
                          <CardContent className="space-y-1 p-4">
                            <p className="text-sm text-stone-500">{label}</p>
                            <p className="text-3xl font-semibold text-stone-900">{value}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs text-stone-500">
                      Last health snapshot: {operationsHealth?.generated_at ? new Date(operationsHealth.generated_at).toLocaleString() : '—'}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <Card className="border-stone-200">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle>{t('adminSettingsGeneral.jobsTitle')}</CardTitle>
                      <CardDescription>{t('adminSettingsGeneral.jobsDescription')}</CardDescription>
                    </div>
                    {isSuperAdmin && (
                      <Button variant="outline" onClick={handleRunQueuedJobs} disabled={jobsRunning}>
                        <HardDrive className="mr-2 h-4 w-4" />
                        {jobsRunning ? 'Running...' : 'Run queued jobs'}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {jobsLoading ? (
                    <p className="text-sm text-stone-500">{t('adminSettingsGeneral.loadingJobs')}</p>
                  ) : jobs.length ? (
                    <div className="space-y-3">
                      {jobs.map((job) => (
                        <div key={job.job_id} className="rounded-xl border border-stone-200 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-1">
                              <p className="font-medium text-stone-900">{job.job_type}</p>
                              <p className="text-xs text-stone-500 font-mono">{job.job_id}</p>
                              <p className="text-xs text-stone-500">
                                Created: {job.created_at ? new Date(job.created_at).toLocaleString() : '—'}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                className={
                                  job.status === 'completed'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : job.status === 'failed'
                                      ? 'bg-red-100 text-red-800 border-red-200'
                                      : job.status === 'running'
                                        ? 'bg-blue-100 text-blue-800 border-blue-200'
                                        : 'bg-amber-100 text-amber-800 border-amber-200'
                                }
                              >
                                {job.status}
                              </Badge>
                              <Badge variant="outline">{job.progress || 0}%</Badge>
                            </div>
                          </div>
                          {job.last_error && (
                            <p className="mt-3 text-sm text-red-700">{job.last_error}</p>
                          )}
                          {job.result && (
                            <div className="mt-3 rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
                              <pre className="whitespace-pre-wrap break-all">{JSON.stringify(job.result, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-stone-500">{t('adminSettingsGeneral.noJobs')}</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-stone-200">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle>{t('adminSettingsGeneral.settingsHistoryTitle')}</CardTitle>
                      <CardDescription>{t('adminSettingsGeneral.settingsHistoryDescription')}</CardDescription>
                    </div>
                    <div className="w-full max-w-[260px]">
                      <Select value={settingsHistoryFilter} onValueChange={setSettingsHistoryFilter}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {settingsHistoryKeyOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {settingsHistoryLoading ? (
                    <p className="text-sm text-stone-500">{t('adminSettingsGeneral.loadingSettingsHistory')}</p>
                  ) : settingsHistory.length ? (
                    <div className="space-y-3">
                      {settingsHistory.map((entry) => (
                        <div key={entry.change_id} className="rounded-xl border border-stone-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-stone-900">{entry.setting_key}</p>
                              <p className="text-xs text-stone-500">
                                {entry.actor?.name || entry.actor?.email || 'System'} • {entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}
                              </p>
                            </div>
                            <History className="h-4 w-4 text-stone-400" />
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(entry.updated_fields || []).map((field) => (
                              <Badge key={field} variant="outline">{field}</Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-stone-500">{t('adminSettingsGeneral.noSettingsHistory')}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
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
                    <CardTitle>{t('adminSettingsGeneral.emailDeliveryTitle')}</CardTitle>
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
                    <p className="text-sm text-stone-500">{t('adminSettingsGeneral.emailLoading')}</p>
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
                    <p className="font-semibold text-stone-900">{t('adminSettingsGeneral.emailHealthTitle')}</p>
                    <p className="text-sm text-stone-600">
                      {t('adminSettingsGeneral.emailHealthActiveProviderLabel')}: <span className="font-medium text-stone-900">{emailProviderLabels[activeEmailProvider] || activeEmailProvider}</span>
                    </p>
                    <p className="text-sm text-stone-600">
                      {t('adminSettingsGeneral.emailHealthStatusLabel')}: <span className={`font-medium ${emailHealthStatusClass}`}>{emailHealthStatus}</span>
                    </p>
                    <p className="text-sm text-stone-600">
                      {t('adminSettingsGeneral.emailHealthSenderLabel')}: <span className="font-medium text-stone-900">{emailHealthDetail}</span>
                    </p>
                    {emailFallbackNotice && (
                      <p className="text-xs text-amber-700 pt-1">{emailFallbackNotice}</p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label>{t('adminSettingsGeneral.activeProvider')}</Label>
                    <Select value={emailProvider} onValueChange={setEmailProvider}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="supabase">{t('adminSettingsGeneral.emailProviderSupabase')}</SelectItem>
                        <SelectItem value="gmail">{t('adminSettingsGeneral.emailProviderGmail')}</SelectItem>
                        <SelectItem value="mailgun">{t('adminSettingsGeneral.emailProviderMailgun')}</SelectItem>
                        <SelectItem value="outlook">{t('adminSettingsGeneral.emailProviderOutlook')}</SelectItem>
                        <SelectItem value="smtp">{t('adminSettingsGeneral.emailProviderSmtp')}</SelectItem>
                        <SelectItem value="resend">{t('adminSettingsGeneral.emailProviderResend')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-stone-500">
                      {t('adminSettingsGeneral.emailProviderHelp')}
                    </p>
                  </div>

                  {emailProvider === 'gmail' && (
                    <div className="space-y-4 rounded-xl border border-stone-200 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-stone-900">{t('adminSettingsGeneral.gmailMailerTitle')}</p>
                          <p className="text-sm text-stone-500">
                            {t('adminSettingsGeneral.gmailMailerDescription')}
                          </p>
                          <p className="text-xs text-stone-500 mt-2">
                            {t('adminSettingsGeneral.redirectUriLabel')}: {emailDeliveryConfig?.gmail?.oauth_callback_url || t('adminSettingsGeneral.liveUrlUnavailable')}
                          </p>
                          <p className="text-xs text-stone-500 mt-1">
                            {t('adminSettingsGeneral.gmailOauthHint')}
                          </p>
                        </div>
                        <Badge className={emailDeliveryConfig?.gmail?.connected ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-stone-100 text-stone-700 border-stone-200'}>
                          {emailDeliveryConfig?.gmail?.connected ? t('adminSettingsGeneral.connected') : t('adminSettingsGeneral.notConnected')}
                        </Badge>
                      </div>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>{t('adminSettingsGeneral.googleClientId')}</Label>
                          <Input
                            ref={gmailClientIdRef}
                            value={gmailClientId}
                            onChange={(e) => setGmailClientId(e.target.value)}
                            onBlur={() => setGmailClientId(String(gmailClientIdRef.current?.value || '').trim())}
                            autoComplete="off"
                            placeholder={emailDeliveryConfig?.gmail?.client_id_set ? t('adminSettingsGeneral.savedClientIdConfigured') : t('adminSettingsGeneral.googleClientIdPlaceholder')}
                          />
                          <p className="text-xs text-stone-500">
                            {t('adminSettingsGeneral.statusLabel')}: {gmailClientIdStatus}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>{t('adminSettingsGeneral.googleClientSecret')}</Label>
                          <div className="relative">
                            <Input
                              ref={gmailClientSecretRef}
                              type={showGmailClientSecret ? 'text' : 'password'}
                              value={gmailClientSecret}
                              onChange={(e) => setGmailClientSecret(e.target.value)}
                              onBlur={() => setGmailClientSecret(String(gmailClientSecretRef.current?.value || '').trim())}
                              autoComplete="off"
                              placeholder={emailDeliveryConfig?.gmail?.client_secret_set ? t('adminSettingsGeneral.savedClientSecretConfigured') : t('adminSettingsGeneral.googleClientSecretPlaceholder')}
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
                            {t('adminSettingsGeneral.statusLabel')}: {gmailClientSecretStatus}
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
                          {emailDeliveryConfig?.outlook?.connected ? t('adminSettingsGeneral.connected') : t('adminSettingsGeneral.notConnected')}
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
                            {t('adminSettingsGeneral.statusLabel')}: {outlookClientIdStatus}
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
                            {t('adminSettingsGeneral.statusLabel')}: {outlookClientSecretStatus}
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
                      <p className="font-semibold text-stone-900">{t('adminSettingsGeneral.emailProviderResend')}</p>
                      <p className="text-sm text-stone-500">
                        {t('adminSettingsGeneral.resendEnvironmentDescription')}
                      </p>
                    </div>
                  )}

                  {emailProvider === 'supabase' && (
                    <div className="space-y-2 rounded-xl border border-stone-200 p-4">
                      <p className="font-semibold text-stone-900">{t('adminSettingsGeneral.emailProviderSupabase')}</p>
                      <p className="text-sm text-stone-500">
                        {t('adminSettingsGeneral.supabaseDescription')}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button onClick={handleSaveEmailDeliveryConfig} disabled={emailSaving} className="bg-emerald-900 hover:bg-emerald-800">
                      {emailSaving ? t('adminSettingsGeneral.savingLabel') : t('adminSettingsGeneral.saveEmailDeliverySettings')}
                    </Button>
                    <div className="flex-1 flex flex-col sm:flex-row gap-2">
                      <Input value={emailTestRecipient} onChange={(e) => setEmailTestRecipient(e.target.value)} placeholder="test@yourdomain.com" />
                      <Button variant="outline" onClick={handleSendTestEmail} disabled={emailTesting}>
                        {emailTesting ? t('adminSettingsGeneral.sendingTestEmail') : t('adminSettingsGeneral.sendTestEmail')}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-stone-200 mt-6">
            <CardHeader>
              <CardTitle>{t('adminSettingsGeneral.verificationEmailTitle')}</CardTitle>
              <CardDescription>{t('adminSettingsGeneral.verificationEmailDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {authEmailLoading ? (
                <p className="text-sm text-stone-500">{t('adminSettingsGeneral.loadingVerificationTemplate')}</p>
              ) : (
                <>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>{t('adminSettingsGeneral.authFieldSubject')}</Label>
                      <Input
                        value={verifyEmailSubject}
                        onChange={(e) => setVerifyEmailSubject(e.target.value)}
                        placeholder={t('adminSettingsGeneral.verificationSubjectPlaceholder')}
                        maxLength={160}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('adminSettingsGeneral.authFieldPreviewText')}</Label>
                      <Input
                        value={verifyEmailPreview}
                        onChange={(e) => setVerifyEmailPreview(e.target.value)}
                        placeholder={t('adminSettingsGeneral.verificationPreviewPlaceholder')}
                        maxLength={220}
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>{t('adminSettingsGeneral.authFieldHeading')}</Label>
                      <Input
                        value={verifyEmailHeading}
                        onChange={(e) => setVerifyEmailHeading(e.target.value)}
                        placeholder={t('adminSettingsGeneral.verificationHeadingPlaceholder')}
                        maxLength={120}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('adminSettingsGeneral.authFieldButtonLabel')}</Label>
                      <Input
                        value={verifyEmailButtonLabel}
                        onChange={(e) => setVerifyEmailButtonLabel(e.target.value)}
                        placeholder={t('adminSettingsGeneral.verificationButtonPlaceholder')}
                        maxLength={60}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('adminSettingsGeneral.authFieldBody')}</Label>
                    <Textarea
                      value={verifyEmailBody}
                      onChange={(e) => setVerifyEmailBody(e.target.value)}
                      rows={5}
                      maxLength={1200}
                      placeholder={t('adminSettingsGeneral.verificationBodyPlaceholder')}
                    />
                    <p className="text-xs text-stone-500">{t('adminSettingsGeneral.authParagraphHint')}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('adminSettingsGeneral.authFieldExpiryNotice')}</Label>
                    <Input
                      value={verifyEmailExpiryNotice}
                      onChange={(e) => setVerifyEmailExpiryNotice(e.target.value)}
                      placeholder={t('adminSettingsGeneral.verificationExpiryPlaceholder')}
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('adminSettingsGeneral.authFieldFooter')}</Label>
                    <Textarea
                      value={verifyEmailFooter}
                      onChange={(e) => setVerifyEmailFooter(e.target.value)}
                      rows={3}
                      maxLength={320}
                      placeholder={t('adminSettingsGeneral.verificationFooterPlaceholder')}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-stone-200 mt-6">
            <CardHeader>
              <CardTitle>{t('adminSettingsGeneral.passwordResetEmailTitle')}</CardTitle>
              <CardDescription>{t('adminSettingsGeneral.passwordResetEmailDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {authEmailLoading ? (
                <p className="text-sm text-stone-500">{t('adminSettingsGeneral.loadingPasswordResetTemplate')}</p>
              ) : (
                <>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>{t('adminSettingsGeneral.authFieldSubject')}</Label>
                      <Input
                        value={passwordResetEmailSubject}
                        onChange={(e) => setPasswordResetEmailSubject(e.target.value)}
                        placeholder={t('adminSettingsGeneral.resetSubjectPlaceholder')}
                        maxLength={160}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('adminSettingsGeneral.authFieldPreviewText')}</Label>
                      <Input
                        value={passwordResetEmailPreview}
                        onChange={(e) => setPasswordResetEmailPreview(e.target.value)}
                        placeholder={t('adminSettingsGeneral.resetPreviewPlaceholder')}
                        maxLength={220}
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>{t('adminSettingsGeneral.authFieldHeading')}</Label>
                      <Input
                        value={passwordResetEmailHeading}
                        onChange={(e) => setPasswordResetEmailHeading(e.target.value)}
                        placeholder={t('adminSettingsGeneral.resetHeadingPlaceholder')}
                        maxLength={120}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('adminSettingsGeneral.authFieldButtonLabel')}</Label>
                      <Input
                        value={passwordResetEmailButtonLabel}
                        onChange={(e) => setPasswordResetEmailButtonLabel(e.target.value)}
                        placeholder={t('adminSettingsGeneral.resetButtonPlaceholder')}
                        maxLength={60}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('adminSettingsGeneral.authFieldBody')}</Label>
                    <Textarea
                      value={passwordResetEmailBody}
                      onChange={(e) => setPasswordResetEmailBody(e.target.value)}
                      rows={5}
                      maxLength={1200}
                      placeholder={t('adminSettingsGeneral.resetBodyPlaceholder')}
                    />
                    <p className="text-xs text-stone-500">{t('adminSettingsGeneral.authParagraphHint')}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('adminSettingsGeneral.authFieldExpiryNotice')}</Label>
                    <Input
                      value={passwordResetEmailExpiryNotice}
                      onChange={(e) => setPasswordResetEmailExpiryNotice(e.target.value)}
                      placeholder={t('adminSettingsGeneral.resetExpiryPlaceholder')}
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('adminSettingsGeneral.authFieldFooter')}</Label>
                    <Textarea
                      value={passwordResetEmailFooter}
                      onChange={(e) => setPasswordResetEmailFooter(e.target.value)}
                      rows={3}
                      maxLength={320}
                      placeholder={t('adminSettingsGeneral.resetFooterPlaceholder')}
                    />
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-2">
                    <p className="text-sm font-semibold text-stone-900">{t('adminSettingsGeneral.liveTokenPreviewTitle')}</p>
                    <p className="text-xs text-stone-500">{t('adminSettingsGeneral.liveTokenPreviewDescription')}</p>
                  </div>
                  <Button onClick={handleSaveAuthEmailTemplate} disabled={authEmailSaving} className="bg-emerald-900 hover:bg-emerald-800">
                    {authEmailSaving ? t('adminSettingsGeneral.savingLabel') : t('adminSettingsGeneral.saveAuthEmails')}
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
                <p className="text-sm text-stone-500">{t('adminSettingsGeneral.loadingLocalization')}</p>
              ) : (
                <Tabs value={localizationSectionTab} onValueChange={setLocalizationSectionTab} className="space-y-6">
                  <TabsList className="h-auto w-full justify-start gap-2 rounded-xl bg-stone-100 p-1">
                    <TabsTrigger value="languages" className="px-4 py-2">{t('adminSettingsGeneral.translationLanguages')}</TabsTrigger>
                    <TabsTrigger value="strings" className="px-4 py-2">{t('adminSettingsGeneral.translationStrings')}</TabsTrigger>
                    <TabsTrigger value="advanced" className="px-4 py-2">{t('adminSettingsGeneral.translationAdvanced')}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="languages" className="space-y-6">
                    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                      <ol className="space-y-2 list-decimal pl-5">
                        <li>{t('adminSettingsGeneral.localizationFallbackRule')}</li>
                        <li>{t('adminSettingsGeneral.localizationDisableRule')}</li>
                        <li>{t('adminSettingsGeneral.localizationRuntimeRule')}</li>
                      </ol>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <Card className="border-stone-200">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">{t('adminSettingsGeneral.automaticRecognition')}</CardTitle>
                          <CardDescription>{t('adminSettingsGeneral.automaticRecognitionDescription')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 p-3">
                            <span className="text-sm font-medium text-stone-700">{t('adminSettingsGeneral.enableAutomaticRecognition')}</span>
                            <Switch
                              checked={automaticLanguageRecognition}
                              onCheckedChange={setAutomaticLanguageRecognition}
                            />
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-stone-200">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">{t('adminSettingsGeneral.websiteTimezone')}</CardTitle>
                          <CardDescription>{t('adminSettingsGeneral.websiteTimezoneDescription')}</CardDescription>
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
                          <CardTitle className="text-base">{t('adminSettingsGeneral.websiteCurrency')}</CardTitle>
                          <CardDescription>{t('adminSettingsGeneral.websiteCurrencyDescription')}</CardDescription>
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
                          <CardTitle className="text-base">{t('adminSettingsGeneral.primaryLanguage')}</CardTitle>
                          <CardDescription>{t('adminSettingsGeneral.primaryLanguageDescription')}</CardDescription>
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
                        <CardTitle>{t('adminSettingsGeneral.selectLanguages')}</CardTitle>
                        <CardDescription>{t('adminSettingsGeneral.selectLanguagesDescription')}</CardDescription>
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
                                        {t('adminSettingsGeneral.primaryBadge')}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="mt-1 text-sm text-stone-500">
                                    {language.name} • {t(
                                      overrideCount === 1
                                        ? 'adminSettingsGeneral.manualOverrideSingle'
                                        : 'adminSettingsGeneral.manualOverridePlural',
                                      { count: overrideCount },
                                    )}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    variant={isPrimary ? 'default' : 'outline'}
                                    className={isPrimary ? 'bg-emerald-900 hover:bg-emerald-800' : ''}
                                    onClick={() => handleSetPrimaryLanguage(language.code)}
                                  >
                                    {isPrimary ? t('adminSettingsGeneral.primaryLanguageButton') : t('adminSettingsGeneral.setAsPrimary')}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={isEnabled ? 'outline' : 'default'}
                                    className={!isEnabled ? 'bg-sky-700 hover:bg-sky-600' : ''}
                                    onClick={() => handleToggleEnabledLanguage(language.code)}
                                  >
                                    {isEnabled ? t('adminSettingsGeneral.turnOff') : t('adminSettingsGeneral.activate')}
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
                        {localizationSaving ? t('adminSettingsLocalization.saving') : t('adminSettingsGeneral.saveLanguageConfiguration')}
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="strings" className="space-y-6">
                    <Card className="border-stone-200">
                      <CardHeader>
                        <CardTitle>{t('adminSettingsGeneral.stringTranslationTitle')}</CardTitle>
                        <CardDescription>{t('adminSettingsGeneral.stringTranslationDescription')}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_180px_160px]">
                          <div className="space-y-2">
                            <Label>{t('adminSettingsGeneral.targetLanguageLabel')}</Label>
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
                            <Label>{t('adminSettingsGeneral.searchLabel')}</Label>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                              <Input
                                value={translationSearch}
                                onChange={(e) => setTranslationSearch(e.target.value)}
                                className="h-12 pl-10"
                                placeholder={t('adminSettingsGeneral.searchPlaceholder')}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>{t('adminSettingsGeneral.showLabel')}</Label>
                            <Select value={translationRowsPerPage} onValueChange={setTranslationRowsPerPage}>
                              <SelectTrigger className="h-12">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="10">{t('adminSettingsGeneral.entries10')}</SelectItem>
                                <SelectItem value="25">{t('adminSettingsGeneral.entries25')}</SelectItem>
                                <SelectItem value="50">{t('adminSettingsGeneral.entries50')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end">
                            <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-4 py-3 w-full">
                              <span className="text-sm font-medium text-stone-700">{t('adminSettingsGeneral.onlyUntranslated')}</span>
                              <Switch
                                checked={translationShowUntranslatedOnly}
                                onCheckedChange={setTranslationShowUntranslatedOnly}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-stone-200">
                          <div className="grid grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)] gap-0 border-b border-stone-200 bg-stone-50 text-sm font-semibold text-stone-900">
                            <div className="px-4 py-3">{t('adminSettingsGeneral.translationKey')}</div>
                            <div className="px-4 py-3">{t('adminSettingsGeneral.originalStringLabel')} ({platformLanguage.toUpperCase()})</div>
                            <div className="px-4 py-3">{t('adminSettingsGeneral.translatedStringLabel')} ({translationTargetLanguage.toUpperCase()})</div>
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
                                          ? t('adminSettingsGeneral.primaryLanguageValuePlaceholder')
                                          : t('adminSettingsGeneral.manualTranslationPlaceholder')}
                                      />
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="px-4 py-8 text-sm text-stone-500">
                                {t('adminSettingsGeneral.noTranslationMatches')}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm text-stone-500">
                            {t(
                              localizationFilteredEntries.length === 1
                                ? 'adminSettingsGeneral.stringsFoundSingle'
                                : 'adminSettingsGeneral.stringsFoundPlural',
                              { count: localizationFilteredEntries.length },
                            )}
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
                            {t('adminSettingsGeneral.clearLanguageOverrides', {
                              language: translationTargetLanguage.toUpperCase(),
                            })}
                          </Button>
                          <Button
                            type="button"
                            className="bg-emerald-900 hover:bg-emerald-800"
                            onClick={handleSaveLocalizationOverrides}
                            disabled={translationSaving}
                          >
                            {translationSaving ? t('adminSettingsGeneral.savingLabel') : t('adminSettingsGeneral.saveManualTranslations')}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="advanced" className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                      <Card className="border-stone-200">
                        <CardHeader>
                          <CardTitle>{t('adminSettingsGeneral.languageStatsTitle')}</CardTitle>
                          <CardDescription>{t('adminSettingsGeneral.languageStatsDescription')}</CardDescription>
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
                                  <p className="text-xs text-stone-500">{t('adminSettingsGeneral.overridesLabel')}</p>
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>

                      <Card className="border-stone-200">
                        <CardHeader>
                          <CardTitle>{t('adminSettingsGeneral.advancedTranslationTitle')}</CardTitle>
                          <CardDescription>{t('adminSettingsGeneral.advancedTranslationDescription')}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>{t('adminSettingsGeneral.advancedLanguageLabel')}</Label>
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
                              {t('adminSettingsGeneral.fallbackOrderLabel')}:
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

                      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-4">
                        <div>
                          <p className="font-semibold text-stone-900">Migrate Existing PDFs</p>
                          <p className="text-sm text-stone-500">
                            Queue a background job to move existing PDFs into the currently selected destination provider without changing their public link IDs.
                          </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Source provider</Label>
                            <Select value={storageMigrationSource} onValueChange={setStorageMigrationSource}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All providers</SelectItem>
                                {Object.entries(STORAGE_PROVIDER_LABELS).map(([providerValue, providerLabel]) => (
                                  <SelectItem key={providerValue} value={providerValue}>
                                    {providerLabel}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Limit</Label>
                            <Input
                              type="number"
                              min="1"
                              max="10000"
                              value={storageMigrationLimit}
                              onChange={(e) => setStorageMigrationLimit(e.target.value)}
                              placeholder="1000"
                            />
                          </div>
                        </div>
                        <div className="rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-600">
                          Destination provider: <span className="font-medium text-stone-900">{STORAGE_PROVIDER_LABELS[storageProvider] || storageProvider}</span>
                        </div>
                        <Button
                          variant="outline"
                          onClick={handleStartStorageMigration}
                          disabled={storageMigrationRunning}
                        >
                          {storageMigrationRunning ? 'Queuing migration...' : 'Queue storage migration'}
                        </Button>
                      </div>
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

            <TabsContent value="permissions" className="max-w-5xl">
              <Card className="border-stone-200">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
                      <Settings2 className="h-5 w-5 text-violet-700" />
                    </div>
                    <div>
                      <CardTitle>Role-Based Settings Permissions</CardTitle>
                      <CardDescription>
                        Control which admin roles can read or write each platform settings section.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {settingsPermissionsLoading ? (
                    <p className="text-sm text-stone-500">Loading settings permissions...</p>
                  ) : settingsSectionEntries.length ? (
                    <>
                      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                        Write access cannot be less privileged than read access. Super admin always retains full access even if a section is set to admin/admin.
                      </div>
                      <div className="space-y-3">
                        {settingsSectionEntries.map((section) => (
                          <div key={section.key} className="rounded-2xl border border-stone-200 p-4">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="space-y-1">
                                <p className="font-semibold text-stone-900">{section.label}</p>
                                <p className="text-sm text-stone-500">{section.setting_keys.join(', ')}</p>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
                                <div className="space-y-2">
                                  <Label>Read access</Label>
                                  <Select
                                    value={settingsPermissionEditors?.[section.key]?.read_role || section.read_role}
                                    onValueChange={(value) => handleSettingsPermissionEditorChange(section.key, 'read_role', value)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {SETTINGS_ACCESS_ROLES.map((roleValue) => (
                                        <SelectItem key={`${section.key}-read-${roleValue}`} value={roleValue}>
                                          {roleValue}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Write access</Label>
                                  <Select
                                    value={settingsPermissionEditors?.[section.key]?.write_role || section.write_role}
                                    onValueChange={(value) => handleSettingsPermissionEditorChange(section.key, 'write_role', value)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {SETTINGS_ACCESS_ROLES.map((roleValue) => (
                                        <SelectItem key={`${section.key}-write-${roleValue}`} value={roleValue}>
                                          {roleValue}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button
                        onClick={handleSaveSettingsPermissions}
                        disabled={settingsPermissionsSaving}
                        className="bg-emerald-900 hover:bg-emerald-800"
                      >
                        {settingsPermissionsSaving ? 'Saving...' : 'Save Settings Permissions'}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-stone-500">No settings permissions are available yet.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </>
        )}
    </>
  );
}
