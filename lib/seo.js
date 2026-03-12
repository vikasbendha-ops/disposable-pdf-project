const DEFAULT_SITE_NAME = "Autodestroy PDF Platform";

export const DEFAULT_SEO_SETTINGS = Object.freeze({
  site_name: DEFAULT_SITE_NAME,
  default_title: "Secure PDF Sharing with Expiring Access Links",
  default_description:
    "Share sensitive PDFs with expiring links, view tracking, watermarking, and full access control.",
  default_keywords:
    "secure pdf sharing, expiring links, document protection, pdf watermark, secure viewer",
  og_image_url: "/og-image.svg",
  favicon_url: "/favicon.svg",
  canonical_base_url: "",
  twitter_handle: "",
  noindex: false,
});

const ROUTE_META = [
  {
    match: "/",
    title: "Secure PDF Sharing with Expiring Access Links",
    description:
      "Control access to sensitive PDFs with expiry timers, revocation, watermarking, and viewer analytics.",
    indexable: true,
  },
  {
    match: "/pricing",
    title: "Pricing Plans for Secure PDF Sharing",
    description:
      "Choose a plan for secure PDF hosting, expiring links, and advanced document analytics.",
    indexable: true,
  },
  {
    match: "/login",
    title: "Sign In",
    description: "Sign in to manage secure PDFs, links, and document access controls.",
    indexable: false,
  },
  {
    match: "/register",
    title: "Create Account",
    description: "Create your account to share protected PDFs with expiring secure links.",
    indexable: false,
  },
  {
    match: "/forgot-password",
    title: "Reset Password",
    description: "Request a password reset link to regain access to your account.",
    indexable: false,
  },
  {
    match: "/reset-password",
    title: "Set New Password",
    description: "Set a new account password securely.",
    indexable: false,
  },
  {
    match: "/verify-email",
    title: "Verify Email",
    description: "Verify your email to activate your account.",
    indexable: false,
  },
  {
    match: "/dashboard",
    title: "Dashboard",
    description: "Manage your secure PDFs, links, and access activity.",
    indexable: false,
  },
  {
    match: "/pdfs",
    title: "My PDFs",
    description: "Upload and manage PDF documents in your secure vault.",
    indexable: false,
  },
  {
    match: "/links",
    title: "My Secure Links",
    description: "Create, track, and revoke secure links for your documents.",
    indexable: false,
  },
  {
    match: "/links/create",
    title: "Create Secure Link",
    description: "Generate expiring secure links for your PDFs with custom controls.",
    indexable: false,
  },
  {
    match: "/settings",
    title: "Account Settings",
    description: "Manage account security, language preferences, and profile settings.",
    indexable: false,
  },
  {
    match: "/admin",
    title: "Admin Dashboard",
    description: "Platform administration dashboard for users, links, and settings.",
    indexable: false,
  },
  {
    match: "/admin/users",
    title: "Admin Users",
    description: "Manage platform user accounts and subscription access.",
    indexable: false,
  },
  {
    match: "/admin/links",
    title: "Admin Links",
    description: "Audit and manage all generated secure links.",
    indexable: false,
  },
  {
    match: "/admin/audit-events",
    title: "Admin Audit Logs",
    description: "Review platform audit events and security activities.",
    indexable: false,
  },
  {
    match: "/admin/settings",
    title: "Platform Settings",
    description: "Configure billing, storage, branding, and SEO settings.",
    indexable: false,
  },
  {
    prefix: "/view/",
    title: "Secure PDF Viewer",
    description: "Secure viewer for protected documents.",
    indexable: false,
    allowCanonical: false,
  },
  {
    match: "/expired",
    title: "Secure Link Expired",
    description: "This secure link has expired or access has been revoked.",
    indexable: false,
    allowCanonical: false,
  },
];

function normalizePathname(input) {
  const raw = String(input || "/").trim();
  if (!raw) return "/";
  const clean = raw.split("?")[0].split("#")[0] || "/";
  if (clean === "/") return "/";
  return clean.endsWith("/") ? clean.slice(0, -1) : clean;
}

function cleanText(value, fallback, maxLength) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function normalizeHttpUrl(urlValue) {
  const raw = String(urlValue || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function normalizeUrlOrPath(urlValue) {
  const raw = String(urlValue || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return raw;
  const absolute = normalizeHttpUrl(raw);
  return absolute;
}

function resolveRouteMeta(pathname) {
  const normalized = normalizePathname(pathname);
  for (const entry of ROUTE_META) {
    if (entry.match && entry.match === normalized) return entry;
  }
  for (const entry of ROUTE_META) {
    if (entry.prefix && normalized.startsWith(entry.prefix)) return entry;
  }
  return null;
}

function toAbsoluteUrl(urlValue, canonicalBaseUrl) {
  const normalized = normalizeUrlOrPath(urlValue);
  if (!normalized) return "";
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }
  if (!canonicalBaseUrl) return normalized;
  return `${canonicalBaseUrl}${normalized}`;
}

function withSiteSuffix(title, siteName) {
  if (!title) return siteName;
  if (!siteName) return title;
  if (title.toLowerCase().includes(siteName.toLowerCase())) return title;
  return `${title} | ${siteName}`;
}

export function normalizeSeoConfig(rawSeo = {}, rawBranding = {}) {
  const seo = rawSeo || {};
  const branding = rawBranding || {};
  const siteNameFallback = cleanText(
    branding.product_name || branding.app_name || DEFAULT_SEO_SETTINGS.site_name,
    DEFAULT_SITE_NAME,
    80,
  );

  return {
    site_name: cleanText(seo.site_name, siteNameFallback, 80),
    default_title: cleanText(seo.default_title, DEFAULT_SEO_SETTINGS.default_title, 120),
    default_description: cleanText(
      seo.default_description,
      DEFAULT_SEO_SETTINGS.default_description,
      320,
    ),
    default_keywords: cleanText(seo.default_keywords, DEFAULT_SEO_SETTINGS.default_keywords, 320),
    og_image_url: normalizeUrlOrPath(seo.og_image_url) || DEFAULT_SEO_SETTINGS.og_image_url,
    favicon_url: normalizeUrlOrPath(seo.favicon_url) || DEFAULT_SEO_SETTINGS.favicon_url,
    canonical_base_url: normalizeHttpUrl(seo.canonical_base_url),
    twitter_handle: cleanText(seo.twitter_handle, "", 64),
    noindex: Boolean(seo.noindex),
  };
}

export function buildSeoMetadata(pathname, rawSeo = {}, rawBranding = {}) {
  const seo = normalizeSeoConfig(rawSeo, rawBranding);
  const normalizedPathname = normalizePathname(pathname);
  const routeMeta = resolveRouteMeta(normalizedPathname);

  const title = routeMeta?.title
    ? withSiteSuffix(routeMeta.title, seo.site_name)
    : withSiteSuffix(seo.default_title, seo.site_name);
  const description = routeMeta?.description || seo.default_description;
  const keywords = seo.default_keywords;
  const indexable = routeMeta?.indexable !== false && !seo.noindex;
  const robots = indexable ? "index, follow" : "noindex, nofollow";
  const canonicalAllowed = routeMeta?.allowCanonical !== false;
  const canonicalUrl =
    canonicalAllowed && seo.canonical_base_url
      ? `${seo.canonical_base_url}${normalizedPathname}`
      : "";
  const ogImageUrl = toAbsoluteUrl(seo.og_image_url, seo.canonical_base_url);
  const faviconUrl = toAbsoluteUrl(seo.favicon_url, seo.canonical_base_url);

  return {
    siteName: seo.site_name,
    title,
    description,
    keywords,
    robots,
    canonicalUrl,
    ogImageUrl,
    ogUrl: canonicalUrl,
    twitterCard: "summary_large_image",
    twitterHandle: seo.twitter_handle,
    faviconUrl,
    path: normalizedPathname,
  };
}
