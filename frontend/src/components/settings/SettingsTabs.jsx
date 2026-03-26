import React from 'react';
import { User, Lock, Globe, CreditCard, ChevronRight, RefreshCw, Download, ExternalLink, Mail, Shield, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { TabsContent } from '../ui/tabs';

export function SettingsTabsContent({ ctx }) {
  const {
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
  } = ctx;

  return (
    <>
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
                      {user?.created_at ? formatLocalizedDate(user.created_at) : t('common.na')}
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
                    {user?.pending_email_requested_at ? ` ${formatLocalizedDateTime(user.pending_email_requested_at)}` : ''}
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
                    placeholder={t('settings.emailPlaceholder')}
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
                          {user?.subscription_status === 'active' ? t('settings.statusActive') : t('settings.statusInactive')}
                        </span>
                      </p>
                    </div>
                    {user?.subscription_status === 'active' ? (
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold uppercase">
                        {t('settings.statusActive')}
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
                      <p className="text-xs uppercase text-stone-500">{t('settings.successfulPayments')}</p>
                      <p className="text-lg font-semibold text-stone-900">{billingOverview?.payment_summary?.successful_payments || 0}</p>
                    </div>
                    <div className="rounded-lg border border-stone-200 p-3">
                      <p className="text-xs uppercase text-stone-500">{t('settings.totalPaidLabel')}</p>
                      <p className="text-lg font-semibold text-stone-900">
                        {formatAmount(
                          billingOverview?.payment_summary?.total_paid || 0,
                          billingOverview?.payment_summary?.currency || 'eur',
                        )}
                      </p>
                    </div>
                    <div className="rounded-lg border border-stone-200 p-3">
                      <p className="text-xs uppercase text-stone-500">{t('settings.nextRenewalLabel')}</p>
                      <p className="text-sm font-semibold text-stone-900">
                        {billingOverview?.payment_summary?.next_renewal_at
                          ? formatLocalizedDateTime(billingOverview.payment_summary.next_renewal_at)
                          : t('common.na')}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button variant="outline" onClick={fetchBillingOverview} disabled={billingLoading}>
                      {billingLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          {t('settings.refreshingBillingData')}
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          {t('settings.refreshBillingData')}
                        </>
                      )}
                    </Button>
                    <Button variant="outline" onClick={handleManageBilling} disabled={openingBillingPortal}>
                      {openingBillingPortal ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          {t('settings.openingPortal')}
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          {t('settings.updateCardBilling')}
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
                    <p className="text-sm font-semibold text-stone-900 mb-3">{t('settings.invoicesTitle')}</p>
                    <p className="text-xs text-stone-500 mb-3">
                      {t('settings.invoiceLockNotice')}
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
                                  ? formatLocalizedDateTime(payment.paid_at)
                                  : payment.created_at
                                    ? formatLocalizedDateTime(payment.created_at)
                                    : t('common.na')}
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
                                      {t('adminUsers.downloadPdf')}
                                    </>
                                  )}
                                </Button>
                              ) : (
                                <span className="text-xs text-stone-500">{t('settings.invoiceAvailableAfterPayment')}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-stone-500">
                        {t('settings.noInvoicesYet')}
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>{t('settings.billingProfileTitle')}</CardTitle>
              <CardDescription>
                {t('settings.billingProfileDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBillingProfileSave} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{t('settings.invoiceFullName')}</Label>
                    <Input value={billingProfile.full_name} onChange={(e) => updateBillingField('full_name', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>{t('settings.companyName')}</Label>
                    <Input value={billingProfile.company_name} onChange={(e) => updateBillingField('company_name', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>{t('settings.billingEmail')}</Label>
                    <Input value={billingProfile.email} onChange={(e) => updateBillingField('email', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>{t('settings.phoneLabel')}</Label>
                    <Input value={billingProfile.phone} onChange={(e) => updateBillingField('phone', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>{t('settings.taxLabelField')}</Label>
                    <Input value={billingProfile.tax_label} onChange={(e) => updateBillingField('tax_label', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>{t('settings.taxIdField')}</Label>
                    <Input value={billingProfile.tax_id} onChange={(e) => updateBillingField('tax_id', e.target.value)} className="h-12 mt-1" />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label>{t('settings.addressLine1')}</Label>
                    <Input value={billingProfile.address_line_1} onChange={(e) => updateBillingField('address_line_1', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>{t('settings.addressLine2')}</Label>
                    <Input value={billingProfile.address_line_2} onChange={(e) => updateBillingField('address_line_2', e.target.value)} className="h-12 mt-1" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label>{t('settings.cityLabel')}</Label>
                    <Input value={billingProfile.city} onChange={(e) => updateBillingField('city', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>{t('settings.stateLabel')}</Label>
                    <Input value={billingProfile.state} onChange={(e) => updateBillingField('state', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>{t('settings.postalCodeLabel')}</Label>
                    <Input value={billingProfile.postal_code} onChange={(e) => updateBillingField('postal_code', e.target.value)} className="h-12 mt-1" />
                  </div>
                  <div>
                    <Label>{t('settings.countryLabel')}</Label>
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
                      {t('settings.twoFactorConfiguredAt')}: {formatLocalizedDateTime(twoFactorStatus.configured_at)}
                    </p>
                  )}
                  {twoFactorStatus?.last_verified_at && (
                    <p className="text-sm text-stone-500 mt-1">
                      {t('settings.twoFactorLastVerifiedAt')}: {formatLocalizedDateTime(twoFactorStatus.last_verified_at)}
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
                            placeholder={t('settings.twoFactorCodePlaceholder')}
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
                        placeholder={t('settings.twoFactorCodePlaceholder')}
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

                <div className="rounded-lg border border-stone-200 p-4 space-y-4">
                  <div>
                    <p className="font-medium text-stone-900">{t('settings.geoRestrictionTitle')}</p>
                    <p className="text-sm text-stone-500">{t('settings.geoRestrictionDesc')}</p>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('settings.geoRestrictionModeLabel')}</Label>
                    <Select
                      value={secureLinkDefaults.geo_restriction_mode}
                      onValueChange={(value) => updateSecureLinkDefault('geo_restriction_mode', value)}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">{t('settings.geoRestrictionModeOff')}</SelectItem>
                        <SelectItem value="allow">{t('settings.geoRestrictionModeAllow')}</SelectItem>
                        <SelectItem value="block">{t('settings.geoRestrictionModeBlock')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {secureLinkDefaults.geo_restriction_mode !== 'off' && (
                    <div className="space-y-2">
                      <Label>{t('settings.geoCountryCodesLabel')}</Label>
                      <Textarea
                        value={secureLinkDefaults.geo_country_codes}
                        onChange={(e) => updateSecureLinkDefault('geo_country_codes', e.target.value)}
                        rows={4}
                        placeholder={t('settings.geoCountryCodesPlaceholder')}
                      />
                      <p className="text-xs text-stone-500">{t('settings.geoCountryCodesHelp')}</p>
                    </div>
                  )}
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
                {t('settings.domainsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Label className="text-sm text-stone-500 mb-2 block">{t('settings.defaultDomainLabel')}</Label>
                <Select value={defaultDomainId} onValueChange={handleDefaultDomainChange} disabled={updatingDefaultDomain}>
                  <SelectTrigger className="h-12 max-w-md" data-testid="default-domain-select">
                    <SelectValue placeholder={t('settings.defaultDomainPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="platform">{t('settings.platformDomain')}</SelectItem>
                    {domains.map((domain) => (
                      <SelectItem key={domain.domain_id} value={domain.domain_id} disabled={!isDomainReady(domain)}>
                        {domain.domain}{isDomainReady(domain) ? '' : t('settings.verifyFirstSuffix')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-stone-500 mt-2">
                  {t('settings.verifiedDomainsOnlyHint')}
                </p>
              </div>

              <form onSubmit={handleAddDomain} className="flex gap-3 mb-6">
                <Input
                  placeholder={t('settings.domainPlaceholder')}
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
                                <span className="text-emerald-600">{t('settings.sslActive')}</span>
                              ) : domain.ssl_status === 'invalid' ? (
                                <span className="text-red-600">{t('settings.sslInvalid')}</span>
                              ) : (
                                <span className="text-amber-600">{t('settings.statusPending')}</span>
                              )}
                              <span className="mx-2">•</span>
                              Vercel: {domain.vercel_status === 'verified' ? (
                                <span className="text-emerald-600">{t('settings.statusVerified')}</span>
                              ) : domain.vercel_status === 'pending' ? (
                                <span className="text-amber-600">{t('settings.statusPending')}</span>
                              ) : domain.vercel_status === 'error' ? (
                                <span className="text-red-600">{t('settings.statusError')}</span>
                              ) : domain.vercel_status === 'not_configured' ? (
                                <span className="text-amber-600">{t('settings.statusNotConfigured')}</span>
                              ) : (
                                <span className="text-stone-600">{domain.vercel_status || t('settings.statusUnknown')}</span>
                              )}
                              {domain.is_default && (
                                <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                                  {t('settings.defaultBadge')}
                                </span>
                              )}
                            </p>
                            {domain.verification_error && !domain.is_ready && (
                              <p className="text-xs text-amber-700 mt-1">{domain.verification_error}</p>
                            )}
                            {domain.vercel_error && (
                              <p className="text-xs text-amber-700 mt-1">{t('settings.vercelErrorPrefix')}: {domain.vercel_error}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleVerifyDomain(domain.domain_id)}
                              disabled={verifyingDomainId === domain.domain_id}
                            >
                              {verifyingDomainId === domain.domain_id ? t('settings.verifyingDnsSsl') : t('settings.verifyDnsSsl')}
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
    </>
  );
}
