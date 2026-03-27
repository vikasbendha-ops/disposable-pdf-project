export function parsePathSegments(pathSegments) {
  return (pathSegments || [])
    .map((segment) => decodeURIComponent(String(segment || "")))
    .filter((segment) => segment.length > 0);
}

export async function routeApiRequest({
  req,
  res,
  pathSegments,
  handlers,
  sendJson,
  HttpError,
  emailProviders,
}) {
  const method = String(req.method || "GET").toUpperCase();
  const segments = parsePathSegments(pathSegments);
  const routePath = `/${segments.join("/")}`;
  const h = handlers;

  if (method === "GET" && segments.length === 0) {
    sendJson(res, 200, {
      message: "Autodestroy PDF Platform API",
      version: "1.0.0",
    });
    return;
  }

  if (method === "POST" && routePath === "/auth/register") return h.handleAuthRegister(req, res);
  if (method === "POST" && routePath === "/auth/login") return h.handleAuthLogin(req, res);
  if (method === "POST" && routePath === "/auth/login/2fa") return h.handleTwoFactorLoginVerify(req, res);
  if (method === "GET" && routePath === "/auth/google/start") return h.handleAuthGoogleStart(req, res);
  if (method === "POST" && routePath === "/auth/google/exchange") return h.handleAuthGoogleExchange(req, res);
  if (method === "POST" && routePath === "/auth/google/session") return h.handleAuthGoogleSession(req, res);
  if (method === "GET" && routePath === "/auth/2fa") return h.handleTwoFactorStatusGet(req, res);
  if (method === "POST" && routePath === "/auth/2fa/setup") return h.handleTwoFactorSetup(req, res);
  if (method === "POST" && routePath === "/auth/2fa/enable") return h.handleTwoFactorEnable(req, res);
  if (method === "POST" && routePath === "/auth/2fa/disable") return h.handleTwoFactorDisable(req, res);
  if (method === "GET" && routePath === "/auth/me") return h.handleAuthMe(req, res);
  if (method === "POST" && routePath === "/auth/logout") return h.handleAuthLogout(req, res);
  if (method === "PUT" && routePath === "/auth/language") return h.handleAuthLanguage(req, res);
  if (method === "PUT" && routePath === "/auth/profile") return h.handleAuthProfileUpdate(req, res);
  if (method === "POST" && routePath === "/auth/email-change/request") return h.handleAuthEmailChangeRequest(req, res);
  if (method === "POST" && routePath === "/auth/email-change/confirm") return h.handleAuthEmailChangeConfirm(req, res);
  if (method === "POST" && routePath === "/auth/password-reset") return h.handleAuthPasswordReset(req, res);
  if (method === "POST" && routePath === "/auth/password-reset/self") return h.handleAuthPasswordResetSelf(req, res);
  if (method === "GET" && routePath === "/auth/password-reset/validate") return h.handleAuthPasswordResetValidate(req, res);
  if (method === "POST" && routePath === "/auth/password-reset/confirm") return h.handleAuthPasswordResetConfirm(req, res);
  if (method === "POST" && routePath === "/auth/verify-email/confirm") return h.handleAuthVerifyEmailConfirm(req, res);
  if (method === "POST" && routePath === "/auth/verify-email/resend") return h.handleAuthVerifyEmailResend(req, res);
  if (method === "GET" && routePath === "/audit/events") return h.handleAuditEventsGet(req, res);
  if (method === "GET" && routePath === "/workspaces") return h.handleWorkspacesGet(req, res);
  if (method === "GET" && routePath === "/team") return h.handleTeamGet(req, res);
  if (method === "GET" && routePath === "/team/invitations/preview") return h.handleTeamInvitationPreview(req, res);
  if (method === "POST" && routePath === "/team/invitations") return h.handleTeamInvitationCreate(req, res);
  if (method === "POST" && routePath === "/team/invitations/accept") return h.handleTeamInvitationAccept(req, res);
  {
    const invitationDeclineMatch = routePath.match(/^\/team\/invitations\/([^/]+)\/decline$/);
    if (method === "POST" && invitationDeclineMatch) {
      return h.handleTeamInvitationDecline(req, res, invitationDeclineMatch[1]);
    }
  }
  {
    const invitationDeleteMatch = routePath.match(/^\/team\/invitations\/([^/]+)$/);
    if (method === "DELETE" && invitationDeleteMatch) {
      return h.handleTeamInvitationDelete(req, res, invitationDeleteMatch[1]);
    }
  }
  {
    const memberMatch = routePath.match(/^\/team\/members\/([^/]+)$/);
    if (method === "PUT" && memberMatch) return h.handleTeamMemberUpdate(req, res, memberMatch[1]);
    if (method === "DELETE" && memberMatch) return h.handleTeamMemberDelete(req, res, memberMatch[1]);
  }

  if (method === "GET" && routePath === "/folders") return h.handleFoldersGet(req, res);
  if (method === "POST" && routePath === "/folders") return h.handleFoldersCreate(req, res);
  {
    const match = routePath.match(/^\/folders\/([^/]+)$/);
    if (method === "PUT" && match) return h.handleFoldersRename(req, res, match[1]);
    if (method === "DELETE" && match) return h.handleFoldersDelete(req, res, match[1]);
  }

  if (method === "POST" && routePath === "/pdfs/upload") return h.handlePdfsUpload(req, res);
  if (method === "GET" && routePath === "/pdfs") return h.handlePdfsGet(req, res);
  if (method === "GET" && routePath === "/pdfs/workspace") return h.handlePdfsWorkspaceGet(req, res);
  {
    const fileMatch = routePath.match(/^\/pdfs\/([^/]+)\/file$/);
    if (method === "GET" && fileMatch) return h.handlePdfsFileGet(req, res, fileMatch[1]);
  }
  {
    const renameMatch = routePath.match(/^\/pdfs\/([^/]+)\/rename$/);
    if (method === "PUT" && renameMatch) return h.handlePdfsRename(req, res, renameMatch[1]);
  }
  {
    const moveMatch = routePath.match(/^\/pdfs\/([^/]+)\/move$/);
    if (method === "PUT" && moveMatch) return h.handlePdfsMove(req, res, moveMatch[1]);
  }
  {
    const directAccessMatch = routePath.match(/^\/pdfs\/([^/]+)\/direct-access$/);
    if (method === "PUT" && directAccessMatch) {
      return h.handlePdfsDirectAccessUpdate(req, res, directAccessMatch[1]);
    }
  }
  {
    const deleteMatch = routePath.match(/^\/pdfs\/([^/]+)$/);
    if (method === "DELETE" && deleteMatch) return h.handlePdfsDelete(req, res, deleteMatch[1]);
  }

  if (method === "POST" && routePath === "/links") return h.handleLinksCreate(req, res);
  if (method === "GET" && routePath === "/links") return h.handleLinksGet(req, res);
  {
    const statsMatch = routePath.match(/^\/links\/([^/]+)\/stats$/);
    if (method === "GET" && statsMatch) return h.handleLinksStats(req, res, statsMatch[1]);
  }
  {
    const revokeMatch = routePath.match(/^\/links\/([^/]+)\/revoke$/);
    if (method === "POST" && revokeMatch) return h.handleLinksRevoke(req, res, revokeMatch[1]);
  }
  {
    const deleteMatch = routePath.match(/^\/links\/([^/]+)$/);
    if (method === "PUT" && deleteMatch) return h.handleLinksUpdate(req, res, deleteMatch[1]);
    if (method === "DELETE" && deleteMatch) return h.handleLinksDelete(req, res, deleteMatch[1]);
  }

  {
    const directMatch = routePath.match(/^\/direct\/([^/]+)$/);
    if (method === "GET" && directMatch) return h.handleDirectTokenPdf(req, res, directMatch[1]);
  }
  {
    const ndaAcceptMatch = routePath.match(/^\/view\/([^/]+)\/nda-accept$/);
    if (method === "POST" && ndaAcceptMatch) return h.handleViewTokenNdaAccept(req, res, ndaAcceptMatch[1]);
  }
  {
    const heartbeatMatch = routePath.match(/^\/view\/([^/]+)\/heartbeat$/);
    if (method === "POST" && heartbeatMatch) return h.handleViewTokenHeartbeat(req, res, heartbeatMatch[1]);
  }
  {
    const pdfMatch = routePath.match(/^\/view\/([^/]+)\/pdf$/);
    if (method === "GET" && pdfMatch) return h.handleViewTokenPdf(req, res, pdfMatch[1]);
  }
  {
    const viewMatch = routePath.match(/^\/view\/([^/]+)$/);
    if (method === "GET" && viewMatch) return h.handleViewToken(req, res, viewMatch[1]);
  }

  if (method === "POST" && routePath === "/subscription/checkout") return h.handleSubscriptionCheckout(req, res);
  {
    const statusMatch = routePath.match(/^\/subscription\/status\/([^/]+)$/);
    if (method === "GET" && statusMatch) return h.handleSubscriptionStatus(req, res, statusMatch[1]);
  }
  if (method === "GET" && routePath === "/subscription/overview") return h.handleSubscriptionOverview(req, res);
  if (method === "POST" && routePath === "/subscription/billing-portal") return h.handleSubscriptionBillingPortal(req, res);
  {
    const invoiceDownloadMatch = routePath.match(/^\/subscription\/invoices\/([^/]+)\/download$/);
    if (method === "GET" && invoiceDownloadMatch) return h.handleSubscriptionInvoiceDownload(req, res, invoiceDownloadMatch[1]);
  }
  if (method === "POST" && routePath === "/webhook/stripe") return h.handleStripeWebhook(req, res);
  if (method === "GET" && routePath === "/subscription/plans") return h.handleSubscriptionPlans(req, res);
  if (method === "GET" && routePath === "/branding") return h.handleBrandingGet(req, res);
  if (method === "GET" && routePath === "/localization") return h.handleLocalizationGet(req, res);
  if (method === "GET" && routePath === "/public-site") return h.handlePublicSiteGet(req, res);
  if (method === "GET" && routePath === "/seo") return h.handleSeoGet(req, res);

  if (method === "GET" && routePath === "/admin/users") return h.handleAdminUsersGet(req, res);
  if (method === "POST" && routePath === "/admin/users") return h.handleAdminUsersCreate(req, res);
  {
    const userMatch = routePath.match(/^\/admin\/users\/([^/]+)$/);
    if (method === "PUT" && userMatch) return h.handleAdminUsersUpdate(req, res, userMatch[1]);
    if (method === "DELETE" && userMatch) return h.handleAdminUsersDelete(req, res, userMatch[1]);
  }

  if (method === "GET" && routePath === "/admin/links") return h.handleAdminLinksGet(req, res);
  {
    const revokeMatch = routePath.match(/^\/admin\/links\/([^/]+)\/revoke$/);
    if (method === "POST" && revokeMatch) return h.handleAdminLinksRevoke(req, res, revokeMatch[1]);
  }
  {
    const deleteMatch = routePath.match(/^\/admin\/links\/([^/]+)$/);
    if (method === "DELETE" && deleteMatch) return h.handleAdminLinksDelete(req, res, deleteMatch[1]);
  }

  if (method === "GET" && routePath === "/admin/stats") return h.handleAdminStats(req, res);
  if (method === "GET" && routePath === "/admin/billing/customers") return h.handleAdminBillingCustomersGet(req, res);
  {
    const adminBillingCustomerMatch = routePath.match(/^\/admin\/billing\/customers\/([^/]+)$/);
    if (method === "GET" && adminBillingCustomerMatch) {
      return h.handleAdminBillingCustomerGet(req, res, adminBillingCustomerMatch[1]);
    }
  }
  {
    const adminBillingRefundMatch = routePath.match(/^\/admin\/billing\/refunds\/([^/]+)$/);
    if (method === "POST" && adminBillingRefundMatch) {
      return h.handleAdminBillingRefundCreate(req, res, adminBillingRefundMatch[1]);
    }
  }
  {
    const adminInvoiceDownloadMatch = routePath.match(/^\/admin\/invoices\/([^/]+)\/download$/);
    if (method === "GET" && adminInvoiceDownloadMatch) {
      return h.handleAdminInvoiceDownload(req, res, adminInvoiceDownloadMatch[1]);
    }
  }
  {
    const adminInvoiceUpdateMatch = routePath.match(/^\/admin\/invoices\/([^/]+)$/);
    if (method === "PUT" && adminInvoiceUpdateMatch) {
      return h.handleAdminInvoiceUpdate(req, res, adminInvoiceUpdateMatch[1]);
    }
  }
  if (method === "GET" && routePath === "/admin/audit/events") return h.handleAdminAuditEventsGet(req, res);
  if (method === "GET" && routePath === "/admin/operations/health") return h.handleAdminOperationsHealthGet(req, res);
  if (method === "GET" && routePath === "/admin/jobs") return h.handleAdminJobsGet(req, res);
  if (method === "POST" && routePath === "/admin/jobs/run") return h.handleAdminJobsRun(req, res);
  if (method === "POST" && routePath === "/admin/jobs/storage-migration") return h.handleAdminStorageMigrationCreate(req, res);
  if (method === "GET" && routePath === "/admin/settings/permissions") return h.handleAdminSettingsPermissionsGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/permissions") return h.handleAdminSettingsPermissionsPut(req, res);
  if (method === "GET" && routePath === "/admin/settings/history") return h.handleAdminSettingsHistoryGet(req, res);
  if (method === "GET" && routePath === "/admin/settings/stripe") return h.handleAdminStripeGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/stripe") return h.handleAdminStripePut(req, res);
  if (method === "GET" && routePath === "/admin/settings/email-delivery") return h.handleAdminEmailDeliveryGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/email-delivery") return h.handleAdminEmailDeliveryPut(req, res);
  if (method === "GET" && routePath === "/admin/settings/email-delivery/gmail/start") return h.handleAdminGmailStart(req, res);
  if (method === "GET" && routePath === "/admin/settings/email-delivery/gmail/callback") return h.handleAdminGmailCallback(req, res);
  if (method === "POST" && routePath === "/admin/settings/email-delivery/gmail/disconnect") {
    return h.handleAdminEmailProviderDisconnect(req, res, emailProviders.gmail);
  }
  if (method === "GET" && routePath === "/admin/settings/email-delivery/outlook/start") return h.handleAdminOutlookStart(req, res);
  if (method === "GET" && routePath === "/admin/settings/email-delivery/outlook/callback") return h.handleAdminOutlookCallback(req, res);
  if (method === "POST" && routePath === "/admin/settings/email-delivery/outlook/disconnect") {
    return h.handleAdminEmailProviderDisconnect(req, res, emailProviders.outlook);
  }
  if (method === "POST" && routePath === "/admin/settings/email-delivery/test") return h.handleAdminEmailDeliveryTest(req, res);
  if (method === "GET" && routePath === "/admin/settings/auth-email-template") return h.handleAdminAuthEmailTemplateGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/auth-email-template") return h.handleAdminAuthEmailTemplatePut(req, res);
  if (method === "GET" && routePath === "/admin/settings/storage") return h.handleAdminStorageGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/storage") return h.handleAdminStoragePut(req, res);
  if (method === "GET" && routePath === "/admin/settings/vercel") return h.handleAdminVercelGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/vercel") return h.handleAdminVercelPut(req, res);
  if (method === "GET" && routePath === "/admin/settings/localization") return h.handleAdminLocalizationGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/localization") return h.handleAdminLocalizationPut(req, res);
  if (method === "GET" && routePath === "/admin/settings/public-site") return h.handleAdminPublicSiteGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/public-site") return h.handleAdminPublicSitePut(req, res);
  if (method === "GET" && routePath === "/admin/settings/branding") return h.handleAdminBrandingGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/branding") return h.handleAdminBrandingPut(req, res);
  if (method === "GET" && routePath === "/admin/settings/seo") return h.handleAdminSeoGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/seo") return h.handleAdminSeoPut(req, res);
  if (method === "GET" && routePath === "/admin/settings/subscription-plans") return h.handleAdminSubscriptionPlansGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/subscription-plans") return h.handleAdminSubscriptionPlansPut(req, res);
  if (method === "GET" && routePath === "/admin/settings/invoice-template") return h.handleAdminInvoiceTemplateGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/invoice-template") return h.handleAdminInvoiceTemplatePut(req, res);

  if (method === "POST" && routePath === "/domains") return h.handleDomainsCreate(req, res);
  if (method === "GET" && routePath === "/domains") return h.handleDomainsGet(req, res);
  if (method === "PUT" && routePath === "/domains/default") return h.handleDomainsDefaultPut(req, res);
  {
    const domainMatch = routePath.match(/^\/domains\/([^/]+)$/);
    if (method === "DELETE" && domainMatch) return h.handleDomainsDelete(req, res, domainMatch[1]);
    if (method === "POST" && domainMatch) return h.handleDomainsVerify(req, res, domainMatch[1]);
  }

  if (method === "GET" && routePath === "/dashboard/stats") return h.handleDashboardStats(req, res);

  throw new HttpError(404, "Not found");
}
