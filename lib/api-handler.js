import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import { parse as parseCookie, serialize as serializeCookie } from "cookie";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import bcrypt from "bcryptjs";
import formidable from "formidable";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { routeApiRequest } from "./api/router";
import { getStore } from "./store";
import { normalizeSeoConfig } from "./seo";

const db = getStore();

const DEFAULT_SUBSCRIPTION_PLANS = Object.freeze({
  basic: {
    plan_id: "basic",
    price: 5.0,
    name: "Basic",
    description: "Perfect for individuals",
    badge: "",
    storage_mb: 500,
    links_per_month: 50,
    featured: false,
    active: true,
    public_visible: true,
    sort_order: 10,
    features: [
      "500 MB storage",
      "50 links per month",
      "All expiry modes",
      "View tracking",
      "Watermarking",
      "Email support",
    ],
  },
  pro: {
    plan_id: "pro",
    price: 15.0,
    name: "Pro",
    description: "For growing teams",
    badge: "Most Popular",
    storage_mb: 2000,
    links_per_month: 200,
    featured: true,
    active: true,
    public_visible: true,
    sort_order: 20,
    features: [
      "2 GB storage",
      "200 links per month",
      "All expiry modes",
      "Advanced analytics",
      "Priority support",
      "Custom branding",
    ],
  },
  enterprise: {
    plan_id: "enterprise",
    price: 49.0,
    name: "Enterprise",
    description: "For large organizations",
    badge: "",
    storage_mb: 10000,
    links_per_month: 1000,
    featured: false,
    active: true,
    public_visible: true,
    sort_order: 30,
    features: [
      "10 GB storage",
      "1000 links per month",
      "All expiry modes",
      "Custom domains",
      "API access",
      "Dedicated support",
      "SLA guarantee",
    ],
  },
});
const DEFAULT_SUBSCRIPTION_PLAN_KEYS = Object.freeze(Object.keys(DEFAULT_SUBSCRIPTION_PLANS));
const SUBSCRIPTION_PLAN_ID_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;

function isValidSubscriptionPlanId(value) {
  return SUBSCRIPTION_PLAN_ID_RE.test(String(value || "").trim());
}

function toDefaultPlanName(planId) {
  return String(planId || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Custom Plan";
}

function getGenericDefaultSubscriptionPlan(planId, index = 0) {
  return {
    plan_id: planId,
    price: 0,
    name: toDefaultPlanName(planId),
    description: "",
    badge: "",
    storage_mb: 0,
    links_per_month: 0,
    featured: false,
    active: true,
    public_visible: false,
    sort_order: 100 + index,
    features: [],
  };
}

function getConfiguredSubscriptionPlanIds(sourcePlans = {}) {
  const dynamicPlanIds = Object.keys(sourcePlans || {}).filter((planId) =>
    isValidSubscriptionPlanId(planId),
  );
  return Array.from(new Set([
    ...DEFAULT_SUBSCRIPTION_PLAN_KEYS,
    ...dynamicPlanIds,
  ]));
}

function sortSubscriptionPlanEntries(planMap = {}) {
  return Object.entries(planMap).sort((left, right) => {
    const leftPlan = left[1] || {};
    const rightPlan = right[1] || {};
    const orderDelta =
      Number(leftPlan.sort_order || 0) - Number(rightPlan.sort_order || 0);
    if (orderDelta !== 0) return orderDelta;
    const featuredDelta = Number(Boolean(rightPlan.featured)) - Number(Boolean(leftPlan.featured));
    if (featuredDelta !== 0) return featuredDelta;
    return String(leftPlan.name || left[0]).localeCompare(String(rightPlan.name || right[0]));
  });
}

const VALID_LANGUAGES = ["en", "es", "fr", "de", "it", "hi", "sl"];
const DEFAULT_PLATFORM_LANGUAGE = VALID_LANGUAGES.includes(
  String(process.env.DEFAULT_PLATFORM_LANGUAGE || "").trim(),
)
  ? String(process.env.DEFAULT_PLATFORM_LANGUAGE || "").trim()
  : "en";
const TWO_FACTOR_CHALLENGE_EXPIRE_MINUTES = 10;
const TOTP_TIME_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_LOCALIZATION_TIMEZONE = String(process.env.DEFAULT_SITE_TIMEZONE || "").trim() || "UTC";
const DEFAULT_LOCALIZATION_CURRENCY = String(process.env.DEFAULT_SITE_CURRENCY || "").trim().toUpperCase() || "EUR";
const TRANSLATION_OVERRIDE_PATH_RE = /^[a-zA-Z0-9_.-]{1,200}$/;

const ALGORITHM = "HS256";
const ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7;
const SECRET_KEY = process.env.JWT_SECRET_KEY || "change-this-in-production";
const STRIPE_API_KEY = process.env.STRIPE_API_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "onboarding@resend.dev";
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || "").trim();
const SUPABASE_PUBLISHABLE_KEY = String(
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "",
).trim();
const SUPABASE_AUTH_CLIENT_KEY = (
  SUPABASE_PUBLISHABLE_KEY ||
  SUPABASE_SECRET_KEY ||
  SUPABASE_SERVICE_ROLE_KEY
).trim();
const SUPABASE_AUTH_ADMIN_KEY = (
  SUPABASE_SERVICE_ROLE_KEY ||
  SUPABASE_SECRET_KEY ||
  SUPABASE_AUTH_CLIENT_KEY
).trim();
const APP_BASE_URL = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
const EMAIL_VERIFICATION_EXPIRE_HOURS = Number(process.env.EMAIL_VERIFICATION_EXPIRE_HOURS || "24");
const PASSWORD_RESET_EXPIRE_MINUTES = Number(process.env.PASSWORD_RESET_EXPIRE_MINUTES || "60");
const EMAIL_CHANGE_EXPIRE_HOURS = Number(process.env.EMAIL_CHANGE_EXPIRE_HOURS || "24");
const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || "587");
const SMTP_SECURE = ["1", "true", "yes", "on"].includes(
  String(process.env.SMTP_SECURE || "").toLowerCase(),
);
const SMTP_USERNAME = String(process.env.SMTP_USERNAME || "").trim();
const SMTP_PASSWORD = String(process.env.SMTP_PASSWORD || "").trim();
const SMTP_FROM_EMAIL = String(process.env.SMTP_FROM_EMAIL || "").trim();
const SMTP_FROM_NAME = String(process.env.SMTP_FROM_NAME || "").trim();
const SMTP_REPLY_TO = String(process.env.SMTP_REPLY_TO || "").trim();
const EMAIL_DELIVERY_PROVIDER = String(process.env.EMAIL_DELIVERY_PROVIDER || "").trim();
const EMAIL_PROVIDER_SUPABASE = "supabase";
const EMAIL_PROVIDER_GMAIL = "gmail";
const EMAIL_PROVIDER_MAILGUN = "mailgun";
const EMAIL_PROVIDER_OUTLOOK = "outlook";
const EMAIL_PROVIDER_SMTP = "smtp";
const EMAIL_PROVIDER_RESEND = "resend";
const VALID_EMAIL_DELIVERY_PROVIDERS = [
  EMAIL_PROVIDER_SUPABASE,
  EMAIL_PROVIDER_GMAIL,
  EMAIL_PROVIDER_MAILGUN,
  EMAIL_PROVIDER_OUTLOOK,
  EMAIL_PROVIDER_SMTP,
  EMAIL_PROVIDER_RESEND,
];
const GOOGLE_GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const GOOGLE_OAUTH_SCOPES = [
  GOOGLE_GMAIL_SEND_SCOPE,
];
const MICROSOFT_DEFAULT_TENANT = "common";
const MICROSOFT_GRAPH_SENDMAIL_SCOPE = "https://graph.microsoft.com/Mail.Send";
const MICROSOFT_OAUTH_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  MICROSOFT_GRAPH_SENDMAIL_SCOPE,
];
const MAILGUN_API_BASE = Object.freeze({
  us: "https://api.mailgun.net",
  eu: "https://api.eu.mailgun.net",
});
const WASABI_ENDPOINT = process.env.WASABI_ENDPOINT || "";
const WASABI_REGION = process.env.WASABI_REGION || "us-east-1";
const WASABI_BUCKET = process.env.WASABI_BUCKET || "";
const WASABI_ACCESS_KEY_ID = process.env.WASABI_ACCESS_KEY_ID || "";
const WASABI_SECRET_ACCESS_KEY = process.env.WASABI_SECRET_ACCESS_KEY || "";
const WASABI_FORCE_PATH_STYLE = ["1", "true", "yes", "on"].includes(
  String(process.env.WASABI_FORCE_PATH_STYLE || "true").toLowerCase(),
);
const STORAGE_PROVIDER_SUPABASE = "supabase_db";
const STORAGE_PROVIDER_WASABI = "wasabi_s3";
const VALID_STORAGE_PROVIDERS = [STORAGE_PROVIDER_SUPABASE, STORAGE_PROVIDER_WASABI];
const DEFAULT_STORAGE_PROVIDER = VALID_STORAGE_PROVIDERS.includes(process.env.DEFAULT_STORAGE_PROVIDER)
  ? process.env.DEFAULT_STORAGE_PROVIDER
  : STORAGE_PROVIDER_SUPABASE;
const DEFAULT_BRANDING_SETTINGS = Object.freeze({
  app_name: process.env.BRANDING_APP_NAME || "Autodestroy",
  product_name: process.env.BRANDING_PRODUCT_NAME || "Autodestroy PDF Platform",
  tagline: process.env.BRANDING_TAGLINE || "Secure Document Sharing",
  primary_color: process.env.BRANDING_PRIMARY_COLOR || "#064e3b",
  accent_color: process.env.BRANDING_ACCENT_COLOR || "#10b981",
  footer_text: process.env.BRANDING_FOOTER_TEXT || "All rights reserved.",
});
const DEFAULT_PUBLIC_SITE_SETTINGS = Object.freeze({
  key: "public_site",
  about_url: String(process.env.PUBLIC_ABOUT_URL || "").trim(),
  contact_url: String(process.env.PUBLIC_CONTACT_URL || "").trim(),
  blog_url: String(process.env.PUBLIC_BLOG_URL || "").trim(),
  privacy_url: String(process.env.PUBLIC_PRIVACY_URL || "").trim(),
  terms_url: String(process.env.PUBLIC_TERMS_URL || "").trim(),
  gdpr_url: String(process.env.PUBLIC_GDPR_URL || "").trim(),
  auth_portal_url: String(process.env.AUTH_PORTAL_URL || process.env.NEXT_PUBLIC_AUTH_PORTAL_URL || "")
    .trim()
    .replace(/\/$/, ""),
});
const DEFAULT_SUBSCRIPTION_PLAN_SETTINGS = Object.freeze({
  key: "subscription_plans",
  currency: normalizeCurrencyCode(process.env.SUBSCRIPTION_CURRENCY || "eur", "eur"),
  interval: String(process.env.SUBSCRIPTION_INTERVAL || "month").trim().toLowerCase() === "year"
    ? "year"
    : "month",
  plans: DEFAULT_SUBSCRIPTION_PLANS,
});
const DEFAULT_INVOICE_TEMPLATE_SETTINGS = Object.freeze({
  key: "invoice_template",
  company_name: process.env.INVOICE_COMPANY_NAME || "Autodestroy PDF Platform",
  company_address: process.env.INVOICE_COMPANY_ADDRESS || "Business Address, City, Country",
  company_email: process.env.INVOICE_COMPANY_EMAIL || "billing@autodestroy.app",
  company_phone: process.env.INVOICE_COMPANY_PHONE || "",
  company_website: process.env.INVOICE_COMPANY_WEBSITE || APP_BASE_URL || "",
  tax_label: process.env.INVOICE_TAX_LABEL || "Tax ID",
  tax_id: process.env.INVOICE_TAX_ID || "",
  invoice_prefix: process.env.INVOICE_PREFIX || "INV",
  notes: process.env.INVOICE_NOTES || "Thank you for your business.",
  terms: process.env.INVOICE_TERMS || "Payments are processed securely by Stripe.",
  footer_text:
    process.env.INVOICE_FOOTER_TEXT ||
    "This invoice is system generated and valid without signature.",
  primary_color: process.env.INVOICE_PRIMARY_COLOR || "#064e3b",
  accent_color: process.env.INVOICE_ACCENT_COLOR || "#10b981",
  logo_url: process.env.INVOICE_LOGO_URL || "",
  show_logo: ["1", "true", "yes", "on"].includes(
    String(process.env.INVOICE_SHOW_LOGO || "true").toLowerCase(),
  ),
});
const DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS = Object.freeze({
  key: "auth_email_template",
  verify_email_subject: process.env.VERIFY_EMAIL_SUBJECT || "Verify your email address",
  verify_email_preview_text:
    process.env.VERIFY_EMAIL_PREVIEW ||
    "Use the secure link below to verify your email and activate your account.",
  verify_email_heading: process.env.VERIFY_EMAIL_HEADING || "Verify your email address",
  verify_email_body:
    process.env.VERIFY_EMAIL_BODY ||
    "Welcome to {{app_name}}.\n\nUse the secure button below to verify your email address and activate your account.",
  verify_email_button_label: process.env.VERIFY_EMAIL_BUTTON_LABEL || "Verify email",
  verify_email_expiry_notice:
    process.env.VERIFY_EMAIL_EXPIRY_NOTICE ||
    "This secure link expires in {{expiry_hours}} hours.",
  verify_email_footer:
    process.env.VERIFY_EMAIL_FOOTER ||
    "If you did not create this account, you can safely ignore this email.",
  password_reset_subject: process.env.PASSWORD_RESET_EMAIL_SUBJECT || "Reset your password",
  password_reset_preview_text:
    process.env.PASSWORD_RESET_EMAIL_PREVIEW ||
    "Use the secure link below to choose a new password for your account.",
  password_reset_heading: process.env.PASSWORD_RESET_EMAIL_HEADING || "Reset your password",
  password_reset_body:
    process.env.PASSWORD_RESET_EMAIL_BODY ||
    "We received a request to reset the password for your {{app_name}} account.\n\nUse the secure button below to choose a new password.",
  password_reset_button_label: process.env.PASSWORD_RESET_EMAIL_BUTTON_LABEL || "Reset password",
  password_reset_expiry_notice:
    process.env.PASSWORD_RESET_EMAIL_EXPIRY_NOTICE ||
    "This secure link expires in {{expiry_minutes}} minutes.",
  password_reset_footer:
    process.env.PASSWORD_RESET_EMAIL_FOOTER ||
    "If you did not request a password reset, you can safely ignore this email.",
});
const DEFAULT_SECURE_LINK_DEFAULTS = Object.freeze({
  focus_lock_enabled: true,
  idle_timeout_seconds: null,
  nda_required: false,
  nda_title: "Confidentiality agreement",
  nda_text:
    "This document contains confidential information. By continuing, you agree not to copy, share, capture, or distribute any part of this material without authorization.",
  nda_accept_label: "I agree and continue",
  strict_security_mode: false,
  require_fullscreen: false,
  enhanced_watermark: false,
  watermark_mode: "basic",
  watermark_text: "",
  watermark_logo_url: "",
  single_viewer_session: false,
  lock_to_first_ip: false,
  allowed_ip_addresses: [],
  geo_restriction_mode: "off",
  geo_country_codes: [],
});
const ACTIVE_VIEWER_SESSION_TTL_MS = Math.max(
  15000,
  Number.parseInt(String(process.env.ACTIVE_VIEWER_SESSION_TTL_SECONDS || "90"), 10) * 1000 || 90000,
);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const SUPER_ADMIN_EMAILS = _envCsv("SUPER_ADMIN_EMAILS", "connect@vikasbendha.com").map((email) =>
  String(email).trim().toLowerCase(),
);
const AUTH_DEBUG_TOKENS = ["1", "true", "yes", "on"].includes(
  String(process.env.AUTH_DEBUG_TOKENS || "").toLowerCase(),
);
const DEFAULT_DOMAIN_TXT_PREFIX = process.env.CUSTOM_DOMAIN_TXT_PREFIX || "_autodestroy";
const DEFAULT_VERCEL_CNAME_TARGET = normalizeDnsHost(
  process.env.CUSTOM_DOMAIN_VERCEL_CNAME_TARGET || "cname.vercel-dns.com",
);
const EXTRA_CUSTOM_DOMAIN_CNAME_TARGETS = _envCsv("CUSTOM_DOMAIN_CNAME_TARGETS", "")
  .map((item) => normalizeDnsHost(item))
  .filter(Boolean);
const CUSTOM_DOMAIN_A_TARGETS = _envCsv("CUSTOM_DOMAIN_A_TARGETS", "76.76.21.21")
  .map((item) => String(item || "").trim())
  .filter(Boolean);
const DOMAIN_VERIFY_TIMEOUT_MS = Number(process.env.CUSTOM_DOMAIN_VERIFY_TIMEOUT_MS || "6000");
const VERCEL_API_BASE_URL = "https://api.vercel.com";
const VERCEL_API_TOKEN = String(process.env.VERCEL_API_TOKEN || process.env.VERCEL_TOKEN || "").trim();
const VERCEL_PROJECT_ID = String(process.env.VERCEL_PROJECT_ID || "").trim();
const VERCEL_TEAM_ID = String(process.env.VERCEL_TEAM_ID || "").trim();
const VERCEL_AUTO_DOMAIN_ATTACH = ["1", "true", "yes", "on"].includes(
  String(process.env.VERCEL_AUTO_DOMAIN_ATTACH || "true").toLowerCase(),
);
const PLATFORM_SETTINGS_CACHE_TTL_MS = Number(process.env.PLATFORM_SETTINGS_CACHE_TTL_MS || "60000");
const platformSettingsCache = new Map();
const ROLE_RANKS = Object.freeze({
  user: 0,
  admin: 1,
  super_admin: 2,
});
const SETTINGS_SECTION_DEFINITIONS = Object.freeze({
  payments: Object.freeze({
    label: "Payments",
    read_role: "admin",
    write_role: "admin",
    setting_keys: ["stripe"],
  }),
  localization: Object.freeze({
    label: "Localization",
    read_role: "admin",
    write_role: "admin",
    setting_keys: ["localization"],
  }),
  email: Object.freeze({
    label: "Email",
    read_role: "super_admin",
    write_role: "super_admin",
    setting_keys: ["email_delivery", "auth_email_template"],
  }),
  public_site: Object.freeze({
    label: "Public Site",
    read_role: "super_admin",
    write_role: "super_admin",
    setting_keys: ["public_site"],
  }),
  plans: Object.freeze({
    label: "Plans",
    read_role: "super_admin",
    write_role: "super_admin",
    setting_keys: ["subscription_plans"],
  }),
  storage: Object.freeze({
    label: "Storage",
    read_role: "super_admin",
    write_role: "super_admin",
    setting_keys: ["storage"],
  }),
  domains: Object.freeze({
    label: "Domains",
    read_role: "super_admin",
    write_role: "super_admin",
    setting_keys: ["vercel"],
  }),
  branding: Object.freeze({
    label: "Branding",
    read_role: "super_admin",
    write_role: "super_admin",
    setting_keys: ["branding"],
  }),
  seo: Object.freeze({
    label: "SEO",
    read_role: "super_admin",
    write_role: "super_admin",
    setting_keys: ["seo"],
  }),
  invoice: Object.freeze({
    label: "Invoice",
    read_role: "super_admin",
    write_role: "super_admin",
    setting_keys: ["invoice_template"],
  }),
});
const SETTINGS_SECTION_KEYS = Object.freeze(Object.keys(SETTINGS_SECTION_DEFINITIONS));
const SETTING_KEY_TO_SECTION = Object.freeze(
  SETTINGS_SECTION_KEYS.reduce((accumulator, sectionKey) => {
    for (const settingKey of SETTINGS_SECTION_DEFINITIONS[sectionKey].setting_keys) {
      accumulator[settingKey] = sectionKey;
    }
    return accumulator;
  }, {}),
);
const JOB_STATUS_QUEUED = "queued";
const JOB_STATUS_RUNNING = "running";
const JOB_STATUS_COMPLETED = "completed";
const JOB_STATUS_FAILED = "failed";
const VALID_JOB_STATUSES = Object.freeze([
  JOB_STATUS_QUEUED,
  JOB_STATUS_RUNNING,
  JOB_STATUS_COMPLETED,
  JOB_STATUS_FAILED,
]);
const JOB_TYPE_STORAGE_MIGRATION = "storage.migration";
const WORKSPACE_HEADER_NAME = "x-workspace-id";
const TEAM_ROLE_OWNER = "owner";
const TEAM_ROLE_ADMIN = "admin";
const TEAM_ROLE_MEMBER = "member";
const TEAM_ROLE_DEFINITIONS = Object.freeze({
  [TEAM_ROLE_OWNER]: Object.freeze({
    label: "Owner",
    rank: 3,
    permissions: Object.freeze([
      "view_workspace",
      "manage_documents",
      "manage_links",
      "manage_domains",
      "manage_team",
    ]),
  }),
  [TEAM_ROLE_ADMIN]: Object.freeze({
    label: "Admin",
    rank: 2,
    permissions: Object.freeze([
      "view_workspace",
      "manage_documents",
      "manage_links",
      "manage_domains",
      "manage_team",
    ]),
  }),
  [TEAM_ROLE_MEMBER]: Object.freeze({
    label: "Member",
    rank: 1,
    permissions: Object.freeze([
      "view_workspace",
      "manage_documents",
      "manage_links",
    ]),
  }),
});
const VALID_TEAM_ROLES = Object.freeze(Object.keys(TEAM_ROLE_DEFINITIONS));
const TEAM_INVITATION_EXPIRE_DAYS = Math.max(
  1,
  Number.parseInt(String(process.env.TEAM_INVITATION_EXPIRE_DAYS || "14"), 10) || 14,
);

class HttpError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

function _envCsv(name, fallback) {
  return String(process.env[name] || fallback)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeDnsHost(value) {
  let host = String(value || "").trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "");
  host = host.replace(/\/.*$/, "");
  host = host.replace(/\.$/, "");
  if (host.includes(":")) {
    host = host.split(":", 1)[0];
  }
  return host;
}

const CORS_ORIGINS = _envCsv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000");

function nowUtc() {
  return new Date();
}

function isoNow() {
  return nowUtc().toISOString();
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function ensureDate(value, message = "Invalid datetime") {
  const parsed = parseDate(value);
  if (!parsed) {
    throw new HttpError(400, message);
  }
  return parsed;
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function tokenUrlSafe(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function tokenHex(bytes = 8) {
  return crypto.randomBytes(bytes).toString("hex");
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return JSON.parse(JSON.stringify(value));
}

function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(secret) {
  const normalized = String(secret || "").toUpperCase().replace(/=+$/g, "").replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotpSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

function normalizeOtpCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, TOTP_DIGITS);
}

function generateTotpCode(secret, timestampMs = Date.now()) {
  const key = decodeBase32(secret);
  if (!key.length) {
    throw new Error("two_factor_secret_invalid");
  }
  const counter = Math.floor(timestampMs / 1000 / TOTP_TIME_STEP_SECONDS);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary =
    ((digest[offset] & 127) << 24) |
    ((digest[offset + 1] & 255) << 16) |
    ((digest[offset + 2] & 255) << 8) |
    (digest[offset + 3] & 255);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function verifyTotpCode(secret, code, window = 1) {
  const normalizedCode = normalizeOtpCode(code);
  if (normalizedCode.length !== TOTP_DIGITS) {
    return false;
  }
  const now = Date.now();
  for (let offset = -window; offset <= window; offset += 1) {
    if (generateTotpCode(secret, now + offset * TOTP_TIME_STEP_SECONDS * 1000) === normalizedCode) {
      return true;
    }
  }
  return false;
}

function getNormalizedTwoFactorSettings(source = {}) {
  const input = source && typeof source === "object" ? source : {};
  return {
    enabled: Boolean(input.enabled && input.secret),
    setup_pending: Boolean(input.pending_secret),
    configured_at: input.configured_at || null,
    last_verified_at: input.last_verified_at || null,
  };
}

async function getPlatformSettingDoc(key) {
  const cacheKey = String(key || "").trim();
  const cached = platformSettingsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cloneJson(cached.value);
  }

  const doc = await db.platform_settings.findOne({ key: cacheKey }, { _id: 0 });
  platformSettingsCache.set(cacheKey, {
    value: cloneJson(doc || null),
    expiresAt: Date.now() + Math.max(1000, PLATFORM_SETTINGS_CACHE_TTL_MS),
  });
  return doc;
}

function invalidatePlatformSettingCache(...keys) {
  for (const key of keys) {
    platformSettingsCache.delete(String(key || "").trim());
  }
}

function hashToken(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function getFirstHeaderValue(value) {
  if (Array.isArray(value)) {
    return String(value[0] || "").trim();
  }
  return String(value || "")
    .split(",")[0]
    .trim();
}

function getRequestHost(req) {
  const forwardedHost = getFirstHeaderValue(req.headers["x-forwarded-host"]);
  if (forwardedHost) {
    try {
      return normalizeDomainHost(forwardedHost);
    } catch {
      // fall through to host header
    }
  }

  const host = getFirstHeaderValue(req.headers.host);
  if (!host) return "";
  try {
    return normalizeDomainHost(host);
  } catch {
    return "";
  }
}

function getRequestProtocol(req, host = "") {
  const forwardedProto = getFirstHeaderValue(req.headers["x-forwarded-proto"]).toLowerCase();
  if (forwardedProto === "http" || forwardedProto === "https") {
    return forwardedProto;
  }
  return isLocalDomainHost(host) ? "http" : "https";
}

function buildRequestBaseUrl(req) {
  const host = getRequestHost(req);
  if (!host) return "";
  return `${getRequestProtocol(req, host)}://${host}`;
}

function buildPublicBaseUrl(req) {
  const requestBaseUrl = buildRequestBaseUrl(req);
  if (requestBaseUrl) return requestBaseUrl;
  if (APP_BASE_URL) return APP_BASE_URL;
  return "";
}

function normalizeOriginUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new HttpError(400, "origin_url must be a valid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new HttpError(400, "origin_url must use http or https");
  }
  return parsed.toString().replace(/\/$/, "");
}

function resolvePublicBaseUrl(req, originUrl = "") {
  const normalizedOrigin = normalizeOriginUrl(originUrl);
  const requestHost = getRequestHost(req);
  if (normalizedOrigin) {
    let originHost = "";
    try {
      originHost = normalizeDomainHost(new URL(normalizedOrigin).host);
    } catch {
      originHost = "";
    }

    if (requestHost && originHost === requestHost) {
      return normalizedOrigin;
    }
    if (CORS_ORIGINS.includes(normalizedOrigin)) {
      return normalizedOrigin;
    }
  }

  const requestBaseUrl = buildRequestBaseUrl(req);
  if (requestBaseUrl) {
    return requestBaseUrl.replace(/\/$/, "");
  }

  return String(APP_BASE_URL || "").replace(/\/$/, "");
}

function isSupabaseAuthEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_AUTH_CLIENT_KEY);
}

function isSupabaseAuthAdminEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_AUTH_ADMIN_KEY);
}

function buildSupabaseAuthRedirectUrl(req, pathName, originUrl = "") {
  const baseUrl = resolvePublicBaseUrl(req, originUrl);
  if (!baseUrl) return "";
  const normalizedPath = String(pathName || "").startsWith("/")
    ? String(pathName || "")
    : `/${String(pathName || "")}`;
  return `${baseUrl}${normalizedPath}`;
}

function sanitizeAuthNextPath(value, fallback = "/dashboard") {
  const nextPath = String(value || "").trim();
  if (!nextPath) return fallback;
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) return fallback;
  return nextPath;
}

function buildSupabaseOAuthAuthorizeUrl(req, provider, { originUrl = "", nextPath = "/dashboard" } = {}) {
  if (!isSupabaseAuthEnabled()) {
    throw new HttpError(503, "Supabase auth is not configured");
  }
  const redirectTo = buildSupabaseAuthRedirectUrl(
    req,
    `/auth/callback?next=${encodeURIComponent(sanitizeAuthNextPath(nextPath))}`,
    originUrl,
  );
  const url = new URL("/auth/v1/authorize", SUPABASE_URL);
  url.searchParams.set("provider", String(provider || "").trim());
  if (redirectTo) {
    url.searchParams.set("redirect_to", redirectTo);
  }
  return url.toString();
}

function getSupabaseAuthErrorMessage(payload, fallback) {
  if (!payload || typeof payload !== "object") return fallback;
  return (
    payload.error_description ||
    payload.msg ||
    payload.message ||
    payload.error ||
    fallback
  );
}

async function supabaseAuthRequest({
  method,
  pathName,
  body = null,
  query = null,
  useAdminKey = false,
  accessToken = "",
}) {
  if (!SUPABASE_URL) {
    throw new Error("Supabase URL is not configured");
  }
  const apiKey = useAdminKey ? SUPABASE_AUTH_ADMIN_KEY : SUPABASE_AUTH_CLIENT_KEY;
  if (!apiKey) {
    throw new Error(
      useAdminKey
        ? "Supabase service role key is not configured"
        : "Supabase auth client key is not configured",
    );
  }

  const url = new URL(pathName, SUPABASE_URL);
  if (query && typeof query === "object") {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && String(value).trim()) {
        url.searchParams.set(key, String(value).trim());
      }
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      apikey: apiKey,
      Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = {};
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  try {
    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = text ? { message: text } : {};
    }
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message = getSupabaseAuthErrorMessage(
      payload,
      `Supabase auth request failed (${response.status})`,
    );
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function normalizeSupabaseAuthUser(rawUser, fallbackEmail = "") {
  if (!rawUser || typeof rawUser !== "object") return null;
  const metadata = rawUser.user_metadata || rawUser.raw_user_meta_data || {};
  const email = String(rawUser.email || fallbackEmail || "")
    .trim()
    .toLowerCase();
  const fallbackName = email ? email.split("@")[0] : "User";
  const name = String(metadata.name || metadata.full_name || fallbackName || "User").trim();
  const confirmedAt = rawUser.email_confirmed_at || rawUser.confirmed_at || null;
  return {
    id: rawUser.id ? String(rawUser.id) : "",
    email,
    name: name || "User",
    email_confirmed: Boolean(confirmedAt),
    email_confirmed_at: confirmedAt,
    metadata,
  };
}

async function supabaseAuthSignUp(req, { email, password, name, originUrl = "" }) {
  if (!isSupabaseAuthEnabled()) {
    return { enabled: false, user: null };
  }
  const redirectTo = buildSupabaseAuthRedirectUrl(req, "/verify-email", originUrl);
  const payload = await supabaseAuthRequest({
    method: "POST",
    pathName: "/auth/v1/signup",
    query: { redirect_to: redirectTo },
    body: {
      email,
      password,
      data: { name },
    },
  });
  return {
    enabled: true,
    user: normalizeSupabaseAuthUser(payload?.user, email),
    payload,
  };
}

async function supabaseAuthSignInWithPassword(email, password) {
  if (!isSupabaseAuthEnabled()) {
    return { enabled: false, user: null, payload: null };
  }
  const payload = await supabaseAuthRequest({
    method: "POST",
    pathName: "/auth/v1/token",
    query: { grant_type: "password" },
    body: { email, password },
  });
  return {
    enabled: true,
    user: normalizeSupabaseAuthUser(payload?.user, email),
    payload,
  };
}

async function supabaseAuthSendPasswordReset(req, email, { originUrl = "" } = {}) {
  if (!isSupabaseAuthEnabled()) {
    return { enabled: false };
  }
  const redirectTo = buildSupabaseAuthRedirectUrl(req, "/reset-password", originUrl);
  await supabaseAuthRequest({
    method: "POST",
    pathName: "/auth/v1/recover",
    query: { redirect_to: redirectTo },
    body: { email },
  });
  return { enabled: true };
}

async function supabaseAuthResendVerification(req, email, { originUrl = "" } = {}) {
  if (!isSupabaseAuthEnabled()) {
    return { enabled: false };
  }
  const redirectTo = buildSupabaseAuthRedirectUrl(req, "/verify-email", originUrl);
  await supabaseAuthRequest({
    method: "POST",
    pathName: "/auth/v1/resend",
    query: { redirect_to: redirectTo },
    body: { type: "signup", email },
  });
  return { enabled: true };
}

async function supabaseAuthGetUserByAccessToken(accessToken) {
  if (!isSupabaseAuthEnabled()) {
    throw new Error("Supabase auth is not configured");
  }
  const payload = await supabaseAuthRequest({
    method: "GET",
    pathName: "/auth/v1/user",
    accessToken,
  });
  return normalizeSupabaseAuthUser(payload, payload?.email || "");
}

async function supabaseAuthUpdatePassword(accessToken, newPassword) {
  if (!isSupabaseAuthEnabled()) {
    throw new Error("Supabase auth is not configured");
  }
  await supabaseAuthRequest({
    method: "PUT",
    pathName: "/auth/v1/user",
    accessToken,
    body: { password: newPassword },
  });
}

function isSupabaseAlreadyExistsError(error) {
  const message = `${error?.message || ""} ${JSON.stringify(error?.payload || {})}`.toLowerCase();
  return message.includes("already") || message.includes("exists") || Number(error?.status || 0) === 422;
}

async function supabaseAuthAdminCreateUser({ email, password, name, emailConfirmed }) {
  if (!isSupabaseAuthAdminEnabled()) {
    throw new Error("Supabase auth admin is not configured");
  }
  const payload = await supabaseAuthRequest({
    method: "POST",
    pathName: "/auth/v1/admin/users",
    useAdminKey: true,
    body: {
      email,
      password,
      email_confirm: Boolean(emailConfirmed),
      user_metadata: {
        name: String(name || "").trim() || "User",
      },
    },
  });
  return normalizeSupabaseAuthUser(payload?.user || payload, email);
}

async function supabaseAuthAdminListUsers({ page = 1, perPage = 200 } = {}) {
  if (!isSupabaseAuthAdminEnabled()) {
    throw new Error("Supabase auth admin is not configured");
  }
  const payload = await supabaseAuthRequest({
    method: "GET",
    pathName: "/auth/v1/admin/users",
    useAdminKey: true,
    query: {
      page,
      per_page: perPage,
    },
  });
  return Array.isArray(payload?.users) ? payload.users : [];
}

async function supabaseAuthAdminFindUserByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !isSupabaseAuthAdminEnabled()) return null;

  const perPage = 200;
  for (let page = 1; page <= 10; page += 1) {
    const users = await supabaseAuthAdminListUsers({ page, perPage });
    if (!users.length) break;
    const match = users.find(
      (user) => String(user?.email || "").trim().toLowerCase() === normalizedEmail,
    );
    if (match) {
      return normalizeSupabaseAuthUser(match, normalizedEmail);
    }
    if (users.length < perPage) break;
  }

  return null;
}

async function supabaseAuthAdminUpdateUserById(userId, updates = {}) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    throw new Error("Supabase user id is required");
  }
  if (!isSupabaseAuthAdminEnabled()) {
    throw new Error("Supabase auth admin is not configured");
  }
  const payload = await supabaseAuthRequest({
    method: "PUT",
    pathName: `/auth/v1/admin/users/${encodeURIComponent(normalizedUserId)}`,
    useAdminKey: true,
    body: updates,
  });
  return normalizeSupabaseAuthUser(payload?.user || payload, updates?.email || "");
}

function buildTemporarySupabasePassword() {
  return `Tmp-${tokenUrlSafe(18)}aA1!`;
}

async function ensureSupabaseAuthAccountForLocalUser(localUser, options = {}) {
  const user = localUser || null;
  if (!user || !isSupabaseAuthAdminEnabled()) {
    return { ensured: false, created: false, error: null, user: null };
  }

  const emailConfirmed =
    options.emailConfirmed !== undefined
      ? Boolean(options.emailConfirmed)
      : user.email_verified !== false;

  try {
    const created = await supabaseAuthAdminCreateUser({
      email: String(user.email || "").trim().toLowerCase(),
      password: buildTemporarySupabasePassword(),
      name: user.name || String(user.email || "").split("@")[0] || "User",
      emailConfirmed,
    });

    if (created?.id && created.id !== user.supabase_user_id) {
      await db.users.updateOne(
        { user_id: user.user_id },
        { $set: { supabase_user_id: created.id } },
      );
    }
    return { ensured: true, created: true, error: null, user: created || null };
  } catch (error) {
    if (isSupabaseAlreadyExistsError(error)) {
      if (!user.supabase_user_id) {
        try {
          const existing = await supabaseAuthAdminFindUserByEmail(user.email);
          if (existing?.id) {
            await db.users.updateOne(
              { user_id: user.user_id },
              { $set: { supabase_user_id: existing.id } },
            );
            return { ensured: true, created: false, error: null, user: existing };
          }
        } catch {
          // Ignore lookup failures and keep legacy record as-is.
        }
      }
      return { ensured: true, created: false, error: null, user: null };
    }
    return {
      ensured: false,
      created: false,
      error: error?.message || "supabase_user_sync_failed",
      user: null,
    };
  }
}

async function ensureLocalUserFromSupabase({
  email,
  supabaseUserId = "",
  name = "",
  language = "en",
  emailConfirmed = false,
  emailConfirmedAt = null,
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw new HttpError(400, "Supabase user email is required");
  }

  let existing = null;
  if (supabaseUserId) {
    existing = await db.users.findOne({ supabase_user_id: supabaseUserId }, { _id: 0 });
  }
  if (!existing) {
    existing = await db.users.findOne({ email: normalizedEmail }, { _id: 0 });
  }

  const resolvedRole = isConfiguredSuperAdminEmail(normalizedEmail)
    ? "super_admin"
    : existing?.role || "user";
  const resolvedPlan =
    resolvedRole === "super_admin" ? "enterprise" : existing?.plan || "none";
  const resolvedSubscriptionStatus =
    resolvedRole === "super_admin"
      ? "active"
      : existing?.subscription_status || "inactive";
  const resolvedName =
    String(name || "").trim() ||
    existing?.name ||
    normalizedEmail.split("@")[0] ||
    "User";
  const resolvedLanguageCandidate = String(language || "").trim();
  const resolvedLanguage = VALID_LANGUAGES.includes(resolvedLanguageCandidate)
    ? resolvedLanguageCandidate
    : await getPlatformDefaultLanguage();
  const now = isoNow();

  if (existing) {
    const update = {
      name: resolvedName,
      email: normalizedEmail,
      role: resolvedRole,
      plan: resolvedPlan,
      subscription_status: resolvedSubscriptionStatus,
      email_verified: Boolean(emailConfirmed),
      supabase_user_id: supabaseUserId || existing.supabase_user_id || null,
      billing_profile: existing.billing_profile || {},
    };
    if (emailConfirmed && emailConfirmedAt) {
      update.email_verified_at = emailConfirmedAt;
    }
    await db.users.updateOne({ user_id: existing.user_id }, { $set: update });
    return ensureSuperAdminRole({ ...existing, ...update });
  }

  const userDoc = {
    user_id: makeId("user"),
    name: resolvedName,
    email: normalizedEmail,
    role: resolvedRole,
    subscription_status: resolvedSubscriptionStatus,
    plan: resolvedPlan,
    storage_used: 0,
    language: resolvedLanguage,
    billing_profile: {},
    email_verified: Boolean(emailConfirmed),
    email_verified_at: emailConfirmed && emailConfirmedAt ? emailConfirmedAt : null,
    supabase_user_id: supabaseUserId || null,
    created_at: now,
  };
  await db.users.insertOne(userDoc);
  return ensureSuperAdminRole(userDoc);
}


function normalizeDomainHost(value) {
  let domain = String(value || "").trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.replace(/\/.*$/, "");
  domain = domain.replace(/\.$/, "");
  if (!domain) {
    throw new HttpError(400, "Domain is required");
  }
  if (domain.includes("..")) {
    throw new HttpError(400, "Invalid domain format");
  }
  if (!/^[a-z0-9.-]+(?::\d{2,5})?$/.test(domain)) {
    throw new HttpError(400, "Domain contains invalid characters");
  }
  return domain;
}

function isLocalDomainHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (host.startsWith("localhost") || host.endsWith(".local")) return true;
  if (/^127\.0\.0\.1(?::\d+)?$/.test(host)) return true;
  if (/^0\.0\.0\.0(?::\d+)?$/.test(host)) return true;
  return false;
}

function getOriginForDomainHost(domainHost, req) {
  const normalized = normalizeDomainHost(domainHost);
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "https")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const protocol = isLocalDomainHost(normalized) ? "http" : (forwardedProto || "https");
  return `${protocol}://${normalized}`;
}

function buildSecureViewUrl(origin, token) {
  return `${String(origin || "").replace(/\/$/, "")}/view/${token}`;
}

function buildDirectAccessPath(token) {
  return `/direct/${token}`;
}

function buildDirectAccessUrl(origin, token) {
  return `${String(origin || "").replace(/\/$/, "")}${buildDirectAccessPath(token)}`;
}

function isDomainReadyForLinks(domainDoc) {
  return domainDoc?.verification_status === "verified" && domainDoc?.ssl_status === "active";
}

function getPlatformDomainHost(req) {
  if (APP_BASE_URL) {
    try {
      const url = new URL(APP_BASE_URL);
      return normalizeDnsHost(url.host);
    } catch {
      // fallback below
    }
  }
  return normalizeDnsHost(req.headers.host || "");
}

function getDomainVerificationTargets(req) {
  const platformHost = getPlatformDomainHost(req);
  const acceptedCnameTargets = new Set([
    DEFAULT_VERCEL_CNAME_TARGET,
    ...EXTRA_CUSTOM_DOMAIN_CNAME_TARGETS,
  ]);
  if (platformHost) {
    acceptedCnameTargets.add(platformHost);
  }
  return {
    platformHost,
    acceptedCnameTargets: [...acceptedCnameTargets].filter(Boolean),
    recommendedCnameTarget: DEFAULT_VERCEL_CNAME_TARGET || platformHost || "cname.vercel-dns.com",
    aTargets: CUSTOM_DOMAIN_A_TARGETS,
  };
}

function flattenTxtRecords(records) {
  const values = [];
  for (const record of records || []) {
    if (Array.isArray(record)) {
      values.push(record.join("").trim());
    } else if (record !== undefined && record !== null) {
      values.push(String(record).trim());
    }
  }
  return values.filter(Boolean);
}

async function safeResolveCname(hostname) {
  try {
    return await dns.resolveCname(hostname);
  } catch {
    return [];
  }
}

async function safeResolveA(hostname) {
  try {
    return await dns.resolve4(hostname);
  } catch {
    return [];
  }
}

async function safeResolveTxt(hostname) {
  try {
    return await dns.resolveTxt(hostname);
  } catch {
    return [];
  }
}

function getDomainVerificationTxtName(domain) {
  const host = normalizeDnsHost(domain);
  return `${DEFAULT_DOMAIN_TXT_PREFIX}.${host}`;
}

async function checkDomainDnsVerification(req, domainDoc) {
  const domainHost = normalizeDnsHost(domainDoc?.domain || "");
  if (!domainHost) {
    return {
      dns_verified: false,
      routing_ok: false,
      txt_ok: false,
      cname_records: [],
      a_records: [],
      txt_records: [],
      verification_error: "Invalid domain host",
    };
  }

  const targetInfo = getDomainVerificationTargets(req);
  const txtName = domainDoc?.verification_txt_name || getDomainVerificationTxtName(domainHost);
  const token = String(domainDoc?.verification_token || "").trim();

  const [rawCnameRecords, rawARecords, rawTxtRecords] = await Promise.all([
    safeResolveCname(domainHost),
    safeResolveA(domainHost),
    safeResolveTxt(txtName),
  ]);

  const cnameRecords = (rawCnameRecords || []).map((item) => normalizeDnsHost(item)).filter(Boolean);
  const aRecords = (rawARecords || []).map((item) => String(item || "").trim()).filter(Boolean);
  const txtRecords = flattenTxtRecords(rawTxtRecords);

  const acceptedCnameTargets = new Set(
    targetInfo.acceptedCnameTargets.map((item) => normalizeDnsHost(item)).filter(Boolean),
  );
  const cnameMatches = cnameRecords.filter(
    (record) => acceptedCnameTargets.has(record) || record.endsWith(".vercel-dns.com"),
  );
  const aMatches = aRecords.filter((record) => targetInfo.aTargets.includes(record));
  const routingOk = cnameMatches.length > 0 || aMatches.length > 0;
  const txtOk = token ? txtRecords.includes(token) : false;
  const dnsVerified = routingOk && txtOk;

  let verificationError = null;
  if (!routingOk && !txtOk) {
    verificationError = "Missing routing DNS (CNAME/A) and verification TXT record";
  } else if (!routingOk) {
    verificationError = "Missing routing DNS record (CNAME/A)";
  } else if (!txtOk) {
    verificationError = "Missing verification TXT record";
  }

  return {
    dns_verified: dnsVerified,
    routing_ok: routingOk,
    txt_ok: txtOk,
    cname_records: cnameRecords,
    a_records: aRecords,
    txt_records: txtRecords,
    cname_matches: cnameMatches,
    a_matches: aMatches,
    verification_error: verificationError,
    cname_target: targetInfo.recommendedCnameTarget,
    accepted_cname_targets: targetInfo.acceptedCnameTargets,
    expected_a_targets: targetInfo.aTargets,
    txt_name: txtName,
  };
}

async function checkDomainSslStatus(domainHost) {
  const normalizedHost = normalizeDnsHost(domainHost);
  if (!normalizedHost) {
    return {
      ssl_status: "pending",
      ssl_error: "Invalid domain host",
    };
  }

  return new Promise((resolve) => {
    let done = false;
    let socket = null;

    const finish = (payload) => {
      if (done) return;
      done = true;
      if (socket && !socket.destroyed) {
        socket.destroy();
      }
      resolve(payload);
    };

    try {
      socket = tls.connect({
        host: normalizedHost,
        port: 443,
        servername: normalizedHost,
        rejectUnauthorized: false,
      });
    } catch (error) {
      finish({
        ssl_status: "pending",
        ssl_error: error?.message || "TLS connection failed",
      });
      return;
    }

    socket.setTimeout(DOMAIN_VERIFY_TIMEOUT_MS, () => {
      finish({
        ssl_status: "pending",
        ssl_error: "SSL check timed out",
      });
    });

    socket.once("error", (error) => {
      finish({
        ssl_status: "pending",
        ssl_error: error?.message || "TLS handshake failed",
      });
    });

    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      if (!cert || Object.keys(cert).length === 0) {
        finish({
          ssl_status: "pending",
          ssl_error: "Certificate is not ready",
        });
        return;
      }

      const identityError = tls.checkServerIdentity(normalizedHost, cert);
      const validFrom = parseDate(cert.valid_from);
      const validTo = parseDate(cert.valid_to);
      const now = nowUtc();
      const datesValid = Boolean(validFrom && validTo && now >= validFrom && now <= validTo);
      const authError = socket.authorizationError || null;
      const isActive = !identityError && !authError && datesValid;

      finish({
        ssl_status: isActive ? "active" : "invalid",
        ssl_error: isActive
          ? null
          : identityError?.message || authError || "Certificate is invalid or expired",
        certificate: {
          issuer: cert.issuer?.O || cert.issuer?.CN || null,
          subject: cert.subject?.CN || null,
          valid_from: cert.valid_from || null,
          valid_to: cert.valid_to || null,
        },
      });
    });
  });
}

function buildDomainResponse(domainDoc, req, preferredDomainId = null) {
  const targetInfo = getDomainVerificationTargets(req);
  const txtName =
    domainDoc?.verification_txt_name || getDomainVerificationTxtName(domainDoc?.domain || "");
  const verificationStatus = String(domainDoc?.verification_status || "pending");
  const sslStatus = String(domainDoc?.ssl_status || "pending");
  const vercelStatus = String(domainDoc?.vercel_status || "not_configured");
  let origin = "";
  try {
    origin = getOriginForDomainHost(domainDoc?.domain || "", req);
  } catch {
    origin = "";
  }

  return {
    ...domainDoc,
    verification_status: verificationStatus,
    ssl_status: sslStatus,
    vercel_status: vercelStatus,
    vercel_error: domainDoc?.vercel_error || null,
    vercel_checked_at: domainDoc?.vercel_checked_at || null,
    vercel_verified: Boolean(domainDoc?.vercel_verified),
    verification_txt_name: txtName,
    cname_target: targetInfo.recommendedCnameTarget,
    expected_a_targets: targetInfo.aTargets,
    accepted_cname_targets: targetInfo.acceptedCnameTargets,
    is_default: preferredDomainId === domainDoc?.domain_id,
    is_ready: verificationStatus === "verified" && sslStatus === "active",
    origin,
    instructions:
      "1) Add TXT and CNAME/A DNS records. 2) Add this domain in Vercel. 3) Run Verify to confirm DNS + Let's Encrypt SSL.",
  };
}

async function getUserDomainMap(userId) {
  const domains = await db.domains.find(
    { user_id: userId },
    { _id: 0, domain_id: 1, domain: 1 },
  );
  const domainById = new Map();
  for (const domain of domains) {
    if (domain?.domain_id) {
      domainById.set(domain.domain_id, domain);
    }
  }
  return { domains, domainById };
}

async function getPreferredUserOrigin(req, user, domainById = null) {
  const fallback = buildPublicBaseUrl(req);
  if (!user?.preferred_domain_id) return fallback;

  let domainDoc = null;
  if (domainById && domainById.has(user.preferred_domain_id)) {
    domainDoc = domainById.get(user.preferred_domain_id);
  } else {
    domainDoc = await db.domains.findOne(
      { domain_id: user.preferred_domain_id, user_id: user.user_id },
      { _id: 0 },
    );
  }
  if (!domainDoc?.domain) return fallback;

  try {
    return getOriginForDomainHost(domainDoc.domain, req);
  } catch {
    return fallback;
  }
}

function buildEmailSender(fromName, fromEmail) {
  const email = String(fromEmail || "").trim();
  if (!email) return "";
  const name = String(fromName || "").trim().replace(/"/g, '\\"');
  return name ? `"${name}" <${email}>` : email;
}

function encodeMimeHeader(value) {
  const clean = String(value || "").replace(/\r?\n/g, " ").trim();
  if (!clean) return "";
  if (/^[\x20-\x7E]+$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf-8").toString("base64")}?=`;
}

function htmlToPlainText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMimeMessage({ from, to, subject, html, text, replyTo = "" }) {
  const boundary = `boundary_${tokenHex(12)}`;
  const lines = [
    `From: ${buildEmailSender(from.name, from.email)}`,
    `To: ${String(to || "").trim()}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
  ];
  if (replyTo) {
    lines.push(`Reply-To: ${String(replyTo).trim()}`);
  }
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, "", `--${boundary}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: 8bit", "", String(text || "").trim(), "", `--${boundary}`);
  lines.push('Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: 8bit", "", String(html || "").trim(), "", `--${boundary}--`, "");
  return lines.join("\r\n");
}

async function fetchJsonUrlEncoded(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(body).toString(),
  });
  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error?.message || payload.error || raw || "request_failed");
  }
  return payload;
}

async function refreshGmailAccessToken(gmailConfig) {
  if (!gmailConfig?.client_id || !gmailConfig?.client_secret || !gmailConfig?.refresh_token) {
    throw new Error("gmail_not_connected");
  }
  const payload = await fetchJsonUrlEncoded("https://oauth2.googleapis.com/token", {
    client_id: gmailConfig.client_id,
    client_secret: gmailConfig.client_secret,
    refresh_token: gmailConfig.refresh_token,
    grant_type: "refresh_token",
  });
  if (!payload.access_token) {
    throw new Error("gmail_access_token_missing");
  }
  return payload.access_token;
}

async function refreshMicrosoftAccessToken(outlookConfig) {
  if (!outlookConfig?.client_id || !outlookConfig?.client_secret || !outlookConfig?.refresh_token) {
    throw new Error("outlook_not_connected");
  }
  const tenantId = String(outlookConfig.tenant_id || MICROSOFT_DEFAULT_TENANT).trim() || MICROSOFT_DEFAULT_TENANT;
  const payload = await fetchJsonUrlEncoded(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      client_id: outlookConfig.client_id,
      client_secret: outlookConfig.client_secret,
      refresh_token: outlookConfig.refresh_token,
      grant_type: "refresh_token",
      scope: MICROSOFT_OAUTH_SCOPES.join(" "),
    },
  );
  if (!payload.access_token) {
    throw new Error("outlook_access_token_missing");
  }
  return payload.access_token;
}

async function fetchMicrosoftProfile(accessToken) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || "outlook_profile_failed");
  }
  return {
    email: String(payload.mail || payload.userPrincipalName || "").trim().toLowerCase(),
    name: String(payload.displayName || "").trim(),
  };
}

async function sendViaSmtp({ recipient, subject, html, text, smtpConfig }) {
  if (!smtpConfig.from_email) {
    return { delivered: false, provider: EMAIL_PROVIDER_SMTP, error: "missing_smtp_from_email" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      requireTLS: smtpConfig.require_tls,
      ignoreTLS: smtpConfig.encryption === "none",
      ...(smtpConfig.auth_enabled && smtpConfig.username && smtpConfig.password
        ? {
            auth: {
              user: smtpConfig.username,
              pass: smtpConfig.password,
            },
          }
        : {}),
    });

    const info = await transporter.sendMail({
      from: buildEmailSender(smtpConfig.from_name, smtpConfig.from_email),
      to: recipient,
      replyTo: smtpConfig.reply_to || undefined,
      subject,
      html,
      text,
      envelope: smtpConfig.force_return_path
        ? {
            from: smtpConfig.from_email,
            to: [recipient],
          }
        : undefined,
    });

    return {
      delivered: true,
      provider: EMAIL_PROVIDER_SMTP,
      message_id: info?.messageId || null,
    };
  } catch (error) {
    return {
      delivered: false,
      provider: EMAIL_PROVIDER_SMTP,
      error: error?.message || "smtp_send_failed",
    };
  }
}

async function sendViaGmail({ recipient, subject, html, text, gmailConfig }) {
  try {
    const accessToken = await refreshGmailAccessToken(gmailConfig);
    const rawMime = buildMimeMessage({
      from: {
        name: gmailConfig.from_name || DEFAULT_BRANDING_SETTINGS.app_name,
        email: gmailConfig.from_email || gmailConfig.email,
      },
      to: recipient,
      subject,
      html,
      text,
      replyTo: gmailConfig.reply_to || "",
    });
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodeBase64Url(rawMime),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        delivered: false,
        provider: EMAIL_PROVIDER_GMAIL,
        error: payload.error?.message || "gmail_send_failed",
      };
    }
    return {
      delivered: true,
      provider: EMAIL_PROVIDER_GMAIL,
      message_id: payload.id || null,
    };
  } catch (error) {
    return {
      delivered: false,
      provider: EMAIL_PROVIDER_GMAIL,
      error: error?.message || "gmail_send_failed",
    };
  }
}

async function sendViaMailgun({ recipient, subject, html, text, mailgunConfig }) {
  try {
    const endpointBase = MAILGUN_API_BASE[mailgunConfig.region] || MAILGUN_API_BASE.us;
    const endpoint = `${endpointBase}/v3/${encodeURIComponent(mailgunConfig.domain)}/messages`;
    const form = new FormData();
    form.append("from", buildEmailSender(mailgunConfig.from_name, mailgunConfig.from_email));
    form.append("to", recipient);
    form.append("subject", String(subject || ""));
    form.append("text", String(text || ""));
    if (html) {
      form.append("html", String(html));
    }
    if (mailgunConfig.reply_to) {
      form.append("h:Reply-To", String(mailgunConfig.reply_to));
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${mailgunConfig.api_key}`, "utf-8").toString("base64")}`,
      },
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        delivered: false,
        provider: EMAIL_PROVIDER_MAILGUN,
        error: payload.message || "mailgun_send_failed",
      };
    }
    return {
      delivered: true,
      provider: EMAIL_PROVIDER_MAILGUN,
      message_id: payload.id || null,
    };
  } catch (error) {
    return {
      delivered: false,
      provider: EMAIL_PROVIDER_MAILGUN,
      error: error?.message || "mailgun_send_failed",
    };
  }
}

async function sendViaOutlook({ recipient, subject, html, text, outlookConfig }) {
  try {
    const accessToken = await refreshMicrosoftAccessToken(outlookConfig);
    const message = {
      subject: String(subject || ""),
      body: {
        contentType: html ? "HTML" : "Text",
        content: html || text || "",
      },
      toRecipients: [
        {
          emailAddress: {
            address: recipient,
          },
        },
      ],
    };
    if (outlookConfig.reply_to) {
      message.replyTo = [
        {
          emailAddress: {
            address: outlookConfig.reply_to,
          },
        },
      ];
    }
    if (outlookConfig.from_email) {
      message.from = {
        emailAddress: {
          address: outlookConfig.from_email,
          name: outlookConfig.from_name || undefined,
        },
      };
    }

    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        saveToSentItems: outlookConfig.save_to_sent_items !== false,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return {
        delivered: false,
        provider: EMAIL_PROVIDER_OUTLOOK,
        error: payload.error?.message || "outlook_send_failed",
      };
    }
    return {
      delivered: true,
      provider: EMAIL_PROVIDER_OUTLOOK,
      message_id: null,
    };
  } catch (error) {
    return {
      delivered: false,
      provider: EMAIL_PROVIDER_OUTLOOK,
      error: error?.message || "outlook_send_failed",
    };
  }
}

async function sendViaResend({ recipient, subject, html, text, resendConfig }) {
  const sender = String(resendConfig.from_email || EMAIL_FROM || "").trim();
  if (!RESEND_API_KEY) {
    return { delivered: false, provider: EMAIL_PROVIDER_RESEND, error: "missing_resend_api_key" };
  }
  if (!sender) {
    return { delivered: false, provider: EMAIL_PROVIDER_RESEND, error: "missing_email_from" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: [recipient],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { delivered: false, provider: EMAIL_PROVIDER_RESEND, error: body || "request_failed" };
    }
    return { delivered: true, provider: EMAIL_PROVIDER_RESEND };
  } catch (error) {
    return {
      delivered: false,
      provider: EMAIL_PROVIDER_RESEND,
      error: error?.message || "request_failed",
    };
  }
}

async function sendTransactionalEmail({ to, subject, html, text }) {
  const recipient = String(to || "").trim();
  if (!recipient) {
    return { delivered: false, provider: "none", error: "missing_recipient_email" };
  }
  const emailConfig = await getActiveEmailDeliveryConfig();
  const safeText = String(text || "").trim() || htmlToPlainText(html);
  const safeHtml = String(html || "").trim() || `<p>${safeText || ""}</p>`;

  if (emailConfig.active_provider === EMAIL_PROVIDER_GMAIL) {
    return sendViaGmail({
      recipient,
      subject,
      html: safeHtml,
      text: safeText,
      gmailConfig: emailConfig.gmail,
    });
  }

  if (emailConfig.active_provider === EMAIL_PROVIDER_MAILGUN) {
    return sendViaMailgun({
      recipient,
      subject,
      html: safeHtml,
      text: safeText,
      mailgunConfig: emailConfig.mailgun,
    });
  }

  if (emailConfig.active_provider === EMAIL_PROVIDER_OUTLOOK) {
    return sendViaOutlook({
      recipient,
      subject,
      html: safeHtml,
      text: safeText,
      outlookConfig: emailConfig.outlook,
    });
  }

  if (emailConfig.active_provider === EMAIL_PROVIDER_SMTP) {
    return sendViaSmtp({
      recipient,
      subject,
      html: safeHtml,
      text: safeText,
      smtpConfig: emailConfig.smtp,
    });
  }

  if (emailConfig.active_provider === EMAIL_PROVIDER_RESEND) {
    return sendViaResend({
      recipient,
      subject,
      html: safeHtml,
      text: safeText,
      resendConfig: emailConfig.resend,
    });
  }

  return { delivered: false, provider: "none", error: "no_email_delivery_provider" };
}

async function sendEmailVerificationEmail({ req, email, name, token, originUrl = "" }) {
  const baseUrl = resolvePublicBaseUrl(req, originUrl);
  const verifyUrl = baseUrl
    ? `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`
    : "";
  if (!verifyUrl) {
    return sendTransactionalEmail({
      to: email,
      subject: DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.verify_email_subject,
      text: "APP_BASE_URL is missing, so verification URL could not be generated.",
      html: "<p>APP_BASE_URL is missing, so verification URL could not be generated.</p>",
    });
  }

  const [branding, authEmailTemplate] = await Promise.all([
    getActiveBrandingConfig(),
    getActiveAuthEmailTemplateConfig(),
  ]);
  const variables = {
    app_name: branding?.app_name || DEFAULT_BRANDING_SETTINGS.app_name,
    verify_url: verifyUrl,
    expiry_hours: EMAIL_VERIFICATION_EXPIRE_HOURS,
    recipient_email: email,
    recipient_name: name || "there",
  };
  const subject = interpolateEmailTemplateText(authEmailTemplate.verify_email_subject, variables);
  const introText = interpolateEmailTemplateText(authEmailTemplate.verify_email_body, variables);
  const expiryText = interpolateEmailTemplateText(authEmailTemplate.verify_email_expiry_notice, variables);
  const footerText = interpolateEmailTemplateText(authEmailTemplate.verify_email_footer, variables);
  const buttonLabel = interpolateEmailTemplateText(authEmailTemplate.verify_email_button_label, variables);
  const text = [
    subject,
    introText,
    `${buttonLabel}: ${verifyUrl}`,
    expiryText,
    footerText,
  ].filter(Boolean).join("\n\n");
  const html = renderActionEmailHtml({
    branding,
    previewText: authEmailTemplate.verify_email_preview_text,
    heading: authEmailTemplate.verify_email_heading,
    body: authEmailTemplate.verify_email_body,
    buttonLabel: authEmailTemplate.verify_email_button_label,
    actionUrl: verifyUrl,
    expiryNotice: authEmailTemplate.verify_email_expiry_notice,
    footer: authEmailTemplate.verify_email_footer,
    variables,
  });

  return sendTransactionalEmail({ to: email, subject, text, html });
}

async function sendPasswordResetEmail({ req, email, token, originUrl = "" }) {
  const baseUrl = resolvePublicBaseUrl(req, originUrl);
  const resetUrl = baseUrl
    ? `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`
    : "";
  if (!resetUrl) {
    return sendTransactionalEmail({
      to: email,
      subject: DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.password_reset_subject,
      text: "APP_BASE_URL is missing, so reset URL could not be generated.",
      html: "<p>APP_BASE_URL is missing, so reset URL could not be generated.</p>",
    });
  }

  const [branding, authEmailTemplate] = await Promise.all([
    getActiveBrandingConfig(),
    getActiveAuthEmailTemplateConfig(),
  ]);
  const variables = {
    app_name: branding?.app_name || DEFAULT_BRANDING_SETTINGS.app_name,
    reset_url: resetUrl,
    expiry_minutes: PASSWORD_RESET_EXPIRE_MINUTES,
    recipient_email: email,
  };
  const subject = interpolateEmailTemplateText(authEmailTemplate.password_reset_subject, variables);
  const introText = interpolateEmailTemplateText(authEmailTemplate.password_reset_body, variables);
  const expiryText = interpolateEmailTemplateText(authEmailTemplate.password_reset_expiry_notice, variables);
  const footerText = interpolateEmailTemplateText(authEmailTemplate.password_reset_footer, variables);
  const buttonLabel = interpolateEmailTemplateText(authEmailTemplate.password_reset_button_label, variables);
  const text = [
    subject,
    introText,
    `${buttonLabel}: ${resetUrl}`,
    expiryText,
    footerText,
  ].filter(Boolean).join("\n\n");
  const html = renderActionEmailHtml({
    branding,
    previewText: authEmailTemplate.password_reset_preview_text,
    heading: authEmailTemplate.password_reset_heading,
    body: authEmailTemplate.password_reset_body,
    buttonLabel: authEmailTemplate.password_reset_button_label,
    actionUrl: resetUrl,
    expiryNotice: authEmailTemplate.password_reset_expiry_notice,
    footer: authEmailTemplate.password_reset_footer,
    variables,
  });

  return sendTransactionalEmail({ to: email, subject, text, html });
}

async function sendEmailChangeVerificationEmail({ req, email, currentEmail, name, token, originUrl = "" }) {
  const baseUrl = resolvePublicBaseUrl(req, originUrl);
  const verifyUrl = baseUrl
    ? `${baseUrl}/verify-email-change?token=${encodeURIComponent(token)}`
    : "";
  const subject = "Confirm your new email address";
  const text = verifyUrl
    ? `Hi ${name || "there"}, confirm your new email address for ${currentEmail}: ${verifyUrl}`
    : "APP_BASE_URL is missing, so email change URL could not be generated.";
  const html = verifyUrl
    ? `<p>Hi ${name || "there"},</p><p>Confirm your new email address for ${currentEmail}:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in ${EMAIL_CHANGE_EXPIRE_HOURS} hours.</p>`
    : "<p>APP_BASE_URL is missing, so email change URL could not be generated.</p>";

  return sendTransactionalEmail({ to: email, subject, text, html });
}

async function logAuditEvent(
  req,
  {
    eventType,
    actorUserId = null,
    targetUserId = null,
    accountId = null,
    accountOwnerUserId = null,
    actorWorkspaceRole = null,
    actorMembershipId = null,
    resourceType = null,
    resourceId = null,
    success = true,
    message = "",
    metadata = {},
  },
) {
  if (!eventType) return;
  try {
    await db.audit_events.insertOne({
      event_id: makeId("evt"),
      event_type: eventType,
      actor_user_id: actorUserId,
      target_user_id: targetUserId,
      account_id: accountId,
      account_owner_user_id: accountOwnerUserId,
      actor_workspace_role: actorWorkspaceRole,
      actor_membership_id: actorMembershipId,
      resource_type: resourceType,
      resource_id: resourceId,
      success: Boolean(success),
      message: message ? String(message).slice(0, 300) : null,
      ip: getClientIp(req),
      user_agent: String(req.headers["user-agent"] || "unknown").slice(0, 300),
      metadata: metadata || {},
      created_at: isoNow(),
    });
  } catch (error) {
    // Do not block API on audit write failures.
    console.error("Audit log failure", error?.message || error);
  }
}

function buildWorkspaceSummaryPayload(workspace) {
  if (!workspace?.ownerUser) return null;
  return {
    workspace_id: workspace.accountId,
    owner_user_id: workspace.ownerUser.user_id,
    owner_name: workspace.ownerUser.name || workspace.ownerUser.email || "Workspace",
    owner_email: workspace.ownerUser.email || null,
    label: workspace.ownerUser.name || workspace.ownerUser.email || "Workspace",
    role: workspace.role,
    role_label: getTeamRoleDefinition(workspace.role).label,
    membership_id: workspace.membership?.membership_id || null,
    is_owner: workspace.actor?.user_id === workspace.ownerUser.user_id,
    permissions: workspace.permissions,
    plan: workspace.ownerUser.plan || "none",
    subscription_status: workspace.ownerUser.subscription_status || "inactive",
    preferred_domain_id: workspace.ownerUser.preferred_domain_id || null,
  };
}

function getWorkspaceAuditFields(workspace, metadata = {}) {
  return {
    actorUserId: workspace?.actor?.user_id || null,
    targetUserId: workspace?.ownerUser?.user_id || null,
    accountId: workspace?.accountId || null,
    accountOwnerUserId: workspace?.ownerUser?.user_id || null,
    actorWorkspaceRole: workspace?.role || null,
    actorMembershipId: workspace?.membership?.membership_id || null,
    metadata: {
      account_id: workspace?.accountId || null,
      account_owner_user_id: workspace?.ownerUser?.user_id || null,
      actor_workspace_role: workspace?.role || null,
      actor_membership_id: workspace?.membership?.membership_id || null,
      ...metadata,
    },
  };
}

async function getWorkspaceAccessForUser(actor, accountId) {
  const normalizedAccountId = String(accountId || "").trim();
  if (!actor?.user_id || !normalizedAccountId) {
    throw new HttpError(400, "Workspace account is required");
  }

  let membership = null;
  let role = TEAM_ROLE_OWNER;

  if (normalizedAccountId !== actor.user_id) {
    membership = await db.team_memberships.findOne(
      {
        account_id: normalizedAccountId,
        user_id: actor.user_id,
        status: "active",
      },
      { _id: 0 },
    );
    if (!membership) {
      throw new HttpError(403, "Workspace access denied");
    }
    role = normalizeTeamRole(membership.account_role, TEAM_ROLE_MEMBER);
  }

  const ownerUser =
    normalizedAccountId === actor.user_id
      ? actor
      : await db.users.findOne({ user_id: normalizedAccountId }, { _id: 0 });
  if (!ownerUser) {
    throw new HttpError(404, "Workspace owner not found");
  }

  return {
    actor,
    ownerUser,
    accountId: normalizedAccountId,
    role,
    membership,
    permissions: buildWorkspacePermissions(role),
  };
}

async function getCurrentWorkspace(req, { requiredPermission = null, accountId = null } = {}) {
  const actor = await getCurrentUser(req);
  const requestedAccountId = String(accountId || getRequestedWorkspaceId(req, actor.user_id)).trim() || actor.user_id;
  const workspace = await getWorkspaceAccessForUser(actor, requestedAccountId);
  if (requiredPermission && !workspace.permissions[String(requiredPermission || "").trim()]) {
    throw new HttpError(403, "You do not have access to this workspace action");
  }
  return workspace;
}

async function listAvailableWorkspacesForUser(actor) {
  const activeMemberships = await db.team_memberships.find(
    { user_id: actor.user_id, status: "active" },
    { _id: 0 },
    { sort: { created_at: 1 } },
  );

  const ownerIds = Array.from(
    new Set([
      actor.user_id,
      ...activeMemberships.map((membership) => String(membership.account_id || "").trim()).filter(Boolean),
    ]),
  );
  const ownerUsers = ownerIds.length
    ? await db.users.find(
      { user_id: { $in: ownerIds } },
      { _id: 0, user_id: 1, name: 1, email: 1, preferred_domain_id: 1, plan: 1, subscription_status: 1 },
      { limit: ownerIds.length },
    )
    : [];
  const ownerMap = new Map(ownerUsers.map((user) => [user.user_id, user]));

  const workspaces = [];
  const ownWorkspace = ownerMap.get(actor.user_id) || actor;
  workspaces.push(
    buildWorkspaceSummaryPayload({
      actor,
      ownerUser: ownWorkspace,
      accountId: actor.user_id,
      role: TEAM_ROLE_OWNER,
      membership: null,
      permissions: buildWorkspacePermissions(TEAM_ROLE_OWNER),
    }),
  );

  for (const membership of activeMemberships) {
    const accountId = String(membership.account_id || "").trim();
    if (!accountId || accountId === actor.user_id) continue;
    const ownerUser = ownerMap.get(accountId);
    if (!ownerUser) continue;
    const role = normalizeTeamRole(membership.account_role, TEAM_ROLE_MEMBER);
    workspaces.push(
      buildWorkspaceSummaryPayload({
        actor,
        ownerUser,
        accountId,
        role,
        membership,
        permissions: buildWorkspacePermissions(role),
      }),
    );
  }

  return workspaces.sort((left, right) => {
    if (left.is_owner && !right.is_owner) return -1;
    if (!left.is_owner && right.is_owner) return 1;
    return String(left.label || "").localeCompare(String(right.label || ""));
  });
}

function buildTeamInvitationUrl(req, token, originUrl = "") {
  const baseUrl = resolvePublicBaseUrl(req, originUrl);
  if (!baseUrl || !token) return "";
  return `${baseUrl}/team-invite?token=${encodeURIComponent(token)}`;
}

async function sendTeamInvitationEmail({
  req,
  invitation,
  workspaceOwner,
  inviter,
  originUrl = "",
}) {
  const inviteUrl = buildTeamInvitationUrl(req, invitation?.token, originUrl);
  if (!inviteUrl) {
    return {
      delivered: false,
      provider: "none",
      error: "Invitation URL could not be generated",
    };
  }

  const inviterName = inviter?.name || inviter?.email || "A teammate";
  const ownerName = workspaceOwner?.name || workspaceOwner?.email || "workspace";
  const roleLabel = getTeamRoleDefinition(invitation?.account_role).label;
  const subject = `${inviterName} invited you to ${ownerName}`;
  const text =
    `${inviterName} invited you to join ${ownerName} as ${roleLabel}.\n\n` +
    `Accept the invitation: ${inviteUrl}\n\n` +
    `This link expires in ${TEAM_INVITATION_EXPIRE_DAYS} days.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
      <p>Hello,</p>
      <p><strong>${escapeHtml(inviterName)}</strong> invited you to join <strong>${escapeHtml(ownerName)}</strong> as <strong>${escapeHtml(roleLabel)}</strong>.</p>
      <p><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:12px 18px;background:#064e3b;color:#ffffff;text-decoration:none;border-radius:8px;">Accept invitation</a></p>
      <p style="font-size:14px;color:#4b5563;">This invitation expires in ${TEAM_INVITATION_EXPIRE_DAYS} days.</p>
      <p style="font-size:14px;color:#4b5563;">If the button does not work, copy this link:<br /><a href="${escapeHtml(inviteUrl)}">${escapeHtml(inviteUrl)}</a></p>
    </div>
  `;

  return sendTransactionalEmail({
    to: invitation.email,
    subject,
    text,
    html,
  });
}

function sanitizeUser(user) {
  if (!user) return null;
  const clean = { ...user };
  delete clean.password_hash;
  if (clean.created_at instanceof Date) {
    clean.created_at = clean.created_at.toISOString();
  }
  clean.billing_profile = getNormalizedBillingProfile(clean.billing_profile || {});
  clean.secure_link_defaults = getNormalizedSecureLinkDefaults(clean.secure_link_defaults || {});
  clean.two_factor = getNormalizedTwoFactorSettings(clean.two_factor || {});
  return clean;
}

function normalizeEmailAddress(value, fieldName = "Email") {
  const email = String(value || "").trim().toLowerCase();
  if (!email) {
    throw new HttpError(400, `${fieldName} is required`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, `${fieldName} is invalid`);
  }
  if (email.length > 160) {
    throw new HttpError(400, `${fieldName} must be 160 characters or fewer`);
  }
  return email;
}

function normalizeOptionalText(value, { maxLength = 255 } = {}) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function getNormalizedBillingProfile(source = {}) {
  const input = source && typeof source === "object" ? source : {};
  return {
    full_name: normalizeOptionalText(input.full_name, { maxLength: 120 }),
    company_name: normalizeOptionalText(input.company_name, { maxLength: 120 }),
    email: normalizeOptionalText(input.email, { maxLength: 160 }),
    phone: normalizeOptionalText(input.phone, { maxLength: 64 }),
    tax_id: normalizeOptionalText(input.tax_id, { maxLength: 80 }),
    tax_label: normalizeOptionalText(input.tax_label, { maxLength: 40 }) || "Tax ID",
    address_line_1: normalizeOptionalText(input.address_line_1, { maxLength: 160 }),
    address_line_2: normalizeOptionalText(input.address_line_2, { maxLength: 160 }),
    city: normalizeOptionalText(input.city, { maxLength: 80 }),
    state: normalizeOptionalText(input.state, { maxLength: 80 }),
    postal_code: normalizeOptionalText(input.postal_code, { maxLength: 40 }),
    country: normalizeOptionalText(input.country, { maxLength: 80 }),
  };
}

function normalizeIdleTimeoutSeconds(value, fieldName = "idle_timeout_seconds", fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    throw new HttpError(400, `${fieldName} must be a whole number`);
  }
  if (parsed <= 0) return null;
  if (parsed < 15 || parsed > 86400) {
    throw new HttpError(400, `${fieldName} must be between 15 and 86400 seconds`);
  }
  return parsed;
}

function normalizeAllowedIpAddresses(value, fieldName = "allowed_ip_addresses", { strict = false } = {}) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value ?? "")
      .split(/[\n,;]+/)
      .map((item) => item.trim());

  const seen = new Set();
  const allowed = [];

  for (const rawItem of rawItems) {
    const trimmed = String(rawItem || "").trim();
    if (!trimmed) continue;
    const candidate = normalizeClientIp(trimmed);
    if (!candidate || candidate === "unknown") continue;
    if (!net.isIP(candidate)) {
      if (strict) {
        throw new HttpError(400, `${fieldName} must contain valid IPv4 or IPv6 addresses`);
      }
      continue;
    }
    if (!seen.has(candidate)) {
      seen.add(candidate);
      allowed.push(candidate);
    }
  }

  return allowed;
}

function normalizeGeoRestrictionMode(value, fieldName = "geo_restriction_mode", fallback = "off") {
  const normalized = String(value ?? fallback)
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  if (["off", "allow", "block"].includes(normalized)) {
    return normalized;
  }
  throw new HttpError(400, `${fieldName} must be one of: off, allow, block`);
}

function normalizeCountryCode(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (!normalized) return null;
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeCountryCodeList(value, fieldName = "geo_country_codes", { strict = false } = {}) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value ?? "")
      .split(/[\n,;]+/)
      .map((item) => item.trim());

  const seen = new Set();
  const countries = [];

  for (const rawItem of rawItems) {
    const normalized = normalizeCountryCode(rawItem);
    if (!normalized) {
      if (strict && String(rawItem || "").trim()) {
        throw new HttpError(400, `${fieldName} must contain valid 2-letter country codes`);
      }
      continue;
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      countries.push(normalized);
    }
  }

  return countries;
}

function getNormalizedSecureLinkDefaults(source = {}) {
  const input = source && typeof source === "object" ? source : {};
  let idleTimeoutSeconds = DEFAULT_SECURE_LINK_DEFAULTS.idle_timeout_seconds;
  let allowedIpAddresses = DEFAULT_SECURE_LINK_DEFAULTS.allowed_ip_addresses;
  let geoRestrictionMode = DEFAULT_SECURE_LINK_DEFAULTS.geo_restriction_mode;
  let geoCountryCodes = DEFAULT_SECURE_LINK_DEFAULTS.geo_country_codes;
  const watermarkConfig = getNormalizedWatermarkConfig(input);

  try {
    idleTimeoutSeconds = normalizeIdleTimeoutSeconds(
      input.idle_timeout_seconds,
      "idle_timeout_seconds",
      DEFAULT_SECURE_LINK_DEFAULTS.idle_timeout_seconds,
    );
  } catch {
    idleTimeoutSeconds = DEFAULT_SECURE_LINK_DEFAULTS.idle_timeout_seconds;
  }

  try {
    allowedIpAddresses = normalizeAllowedIpAddresses(
      input.allowed_ip_addresses,
      "allowed_ip_addresses",
      { strict: false },
    );
  } catch {
    allowedIpAddresses = DEFAULT_SECURE_LINK_DEFAULTS.allowed_ip_addresses;
  }

  try {
    geoRestrictionMode = normalizeGeoRestrictionMode(
      input.geo_restriction_mode,
      "geo_restriction_mode",
      DEFAULT_SECURE_LINK_DEFAULTS.geo_restriction_mode,
    );
  } catch {
    geoRestrictionMode = DEFAULT_SECURE_LINK_DEFAULTS.geo_restriction_mode;
  }

  try {
    geoCountryCodes = normalizeCountryCodeList(
      input.geo_country_codes,
      "geo_country_codes",
      { strict: false },
    );
  } catch {
    geoCountryCodes = DEFAULT_SECURE_LINK_DEFAULTS.geo_country_codes;
  }

  if (geoRestrictionMode !== "off" && geoCountryCodes.length === 0) {
    geoRestrictionMode = "off";
  }

  return {
    focus_lock_enabled:
      input.focus_lock_enabled !== undefined
        ? Boolean(input.focus_lock_enabled)
        : DEFAULT_SECURE_LINK_DEFAULTS.focus_lock_enabled,
    idle_timeout_seconds: idleTimeoutSeconds,
    nda_required:
      input.nda_required !== undefined
        ? Boolean(input.nda_required)
        : DEFAULT_SECURE_LINK_DEFAULTS.nda_required,
    nda_title:
      normalizeOptionalText(input.nda_title, { maxLength: 120 }) || DEFAULT_SECURE_LINK_DEFAULTS.nda_title,
    nda_text:
      normalizeOptionalText(input.nda_text, { maxLength: 4000 }) || DEFAULT_SECURE_LINK_DEFAULTS.nda_text,
    nda_accept_label:
      normalizeOptionalText(input.nda_accept_label, { maxLength: 60 }) || DEFAULT_SECURE_LINK_DEFAULTS.nda_accept_label,
    strict_security_mode:
      input.strict_security_mode !== undefined
        ? Boolean(input.strict_security_mode)
        : DEFAULT_SECURE_LINK_DEFAULTS.strict_security_mode,
    require_fullscreen:
      input.require_fullscreen !== undefined
        ? Boolean(input.require_fullscreen)
        : DEFAULT_SECURE_LINK_DEFAULTS.require_fullscreen,
    enhanced_watermark:
      input.enhanced_watermark !== undefined
        ? Boolean(input.enhanced_watermark)
        : DEFAULT_SECURE_LINK_DEFAULTS.enhanced_watermark,
    watermark_mode: watermarkConfig.mode,
    watermark_text: watermarkConfig.text,
    watermark_logo_url: watermarkConfig.logo_url,
    single_viewer_session:
      input.single_viewer_session !== undefined
        ? Boolean(input.single_viewer_session)
        : DEFAULT_SECURE_LINK_DEFAULTS.single_viewer_session,
    lock_to_first_ip:
      input.lock_to_first_ip !== undefined
        ? Boolean(input.lock_to_first_ip)
        : DEFAULT_SECURE_LINK_DEFAULTS.lock_to_first_ip,
    allowed_ip_addresses: allowedIpAddresses,
    geo_restriction_mode: geoRestrictionMode,
    geo_country_codes: geoCountryCodes,
  };
}

function sanitizeSecureLinkDefaultsInput(source = {}) {
  const input = source && typeof source === "object" ? source : {};
  const geoRestrictionMode = normalizeGeoRestrictionMode(
    input.geo_restriction_mode,
    "geo_restriction_mode",
    DEFAULT_SECURE_LINK_DEFAULTS.geo_restriction_mode,
  );
  const geoCountryCodes = normalizeCountryCodeList(
    input.geo_country_codes,
    "geo_country_codes",
    { strict: true },
  );
  const watermarkConfig = getNormalizedWatermarkConfig(input, { strict: true });
  if (geoRestrictionMode !== "off" && geoCountryCodes.length === 0) {
    throw new HttpError(
      400,
      "geo_country_codes must contain at least one 2-letter country code when geo restriction is enabled",
    );
  }
  return {
    focus_lock_enabled:
      input.focus_lock_enabled !== undefined
        ? Boolean(input.focus_lock_enabled)
        : DEFAULT_SECURE_LINK_DEFAULTS.focus_lock_enabled,
    idle_timeout_seconds: normalizeIdleTimeoutSeconds(input.idle_timeout_seconds, "idle_timeout_seconds", null),
    nda_required:
      input.nda_required !== undefined
        ? Boolean(input.nda_required)
        : DEFAULT_SECURE_LINK_DEFAULTS.nda_required,
    nda_title:
      normalizeOptionalText(input.nda_title, { maxLength: 120 }) || DEFAULT_SECURE_LINK_DEFAULTS.nda_title,
    nda_text:
      normalizeOptionalText(input.nda_text, { maxLength: 4000 }) || DEFAULT_SECURE_LINK_DEFAULTS.nda_text,
    nda_accept_label:
      normalizeOptionalText(input.nda_accept_label, { maxLength: 60 }) || DEFAULT_SECURE_LINK_DEFAULTS.nda_accept_label,
    strict_security_mode:
      input.strict_security_mode !== undefined
        ? Boolean(input.strict_security_mode)
        : DEFAULT_SECURE_LINK_DEFAULTS.strict_security_mode,
    require_fullscreen:
      input.require_fullscreen !== undefined
        ? Boolean(input.require_fullscreen)
        : DEFAULT_SECURE_LINK_DEFAULTS.require_fullscreen,
    enhanced_watermark:
      input.enhanced_watermark !== undefined
        ? Boolean(input.enhanced_watermark)
        : DEFAULT_SECURE_LINK_DEFAULTS.enhanced_watermark,
    watermark_mode: watermarkConfig.mode,
    watermark_text: watermarkConfig.text,
    watermark_logo_url: watermarkConfig.logo_url,
    single_viewer_session:
      input.single_viewer_session !== undefined
        ? Boolean(input.single_viewer_session)
        : DEFAULT_SECURE_LINK_DEFAULTS.single_viewer_session,
    lock_to_first_ip:
      input.lock_to_first_ip !== undefined
        ? Boolean(input.lock_to_first_ip)
        : DEFAULT_SECURE_LINK_DEFAULTS.lock_to_first_ip,
    allowed_ip_addresses: normalizeAllowedIpAddresses(input.allowed_ip_addresses, "allowed_ip_addresses", { strict: true }),
    geo_restriction_mode: geoRestrictionMode,
    geo_country_codes: geoCountryCodes,
  };
}

function sanitizeBillingProfileInput(source = {}, { allowEmptyObject = true } = {}) {
  const normalized = getNormalizedBillingProfile(source);
  const hasAnyValue = Object.values(normalized).some((value) => value !== null);
  if (!hasAnyValue && !allowEmptyObject) {
    throw new HttpError(400, "At least one billing profile field is required");
  }
  return normalized;
}

function normalizeClientIp(ipValue) {
  if (!ipValue) return "unknown";
  const value = String(ipValue).trim();
  if (value === "::1" || value === "0:0:0:0:0:0:0:1") return "127.0.0.1";
  if (value.startsWith("::ffff:")) return value.split("::ffff:", 2)[1];
  return value;
}

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    return normalizeClientIp(String(xff).split(",")[0]);
  }
  const xri = req.headers["x-real-ip"];
  if (xri) {
    return normalizeClientIp(String(xri));
  }
  return normalizeClientIp(req.socket?.remoteAddress || "unknown");
}

function getClientGeo(req) {
  const vercelCountry = normalizeCountryCode(req.headers["x-vercel-ip-country"]);
  const cloudflareCountry = normalizeCountryCode(req.headers["cf-ipcountry"]);
  const country = vercelCountry || cloudflareCountry || null;
  const region = normalizeOptionalText(req.headers["x-vercel-ip-country-region"], { maxLength: 80 }) || null;
  const city = normalizeOptionalText(req.headers["x-vercel-ip-city"], { maxLength: 120 }) || null;
  let source = null;
  if (vercelCountry) source = "vercel";
  else if (cloudflareCountry) source = "cloudflare";
  return {
    country,
    region,
    city,
    source,
  };
}

function isLocalRequest(req) {
  const hostHeader = String(req.headers.host || "").toLowerCase();
  return (
    hostHeader.includes("localhost") ||
    hostHeader.includes("127.0.0.1") ||
    hostHeader.includes("[::1]")
  );
}

function normalizeViewerSessionId(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(trimmed)) return null;
  return trimmed;
}

function getViewerSessionId(req) {
  const headerValue = req.headers["x-viewer-session"] || req.headers["x-viewer-session-id"];
  if (Array.isArray(headerValue)) {
    return normalizeViewerSessionId(headerValue[0]);
  }
  return normalizeViewerSessionId(headerValue);
}

function ipSessionKey(clientIp) {
  return crypto.createHash("sha256").update(clientIp).digest("hex").slice(0, 24);
}

function getViewerSessionByIp(link, sessionKey, clientIp) {
  const ipSessions = link?.ip_sessions && typeof link.ip_sessions === "object" ? link.ip_sessions : {};
  if (ipSessions[sessionKey] && typeof ipSessions[sessionKey] === "object") {
    return ipSessions[sessionKey];
  }
  for (const value of Object.values(ipSessions)) {
    if (value && typeof value === "object" && value.ip === clientIp) {
      return value;
    }
  }
  return null;
}

function getLinkAccessBlockMessage(link, securityOptions, clientIp, clientGeo = null, req = null) {
  const normalizedIp = normalizeClientIp(clientIp);
  if (securityOptions.allowed_ip_addresses.length > 0 && !securityOptions.allowed_ip_addresses.includes(normalizedIp)) {
    return "Access to this secure link is limited to approved IP addresses";
  }
  if (securityOptions.lock_to_first_ip && link.first_viewer_ip && link.first_viewer_ip !== normalizedIp) {
    return "This secure link is locked to the first approved viewer session";
  }
  if (securityOptions.geo_restriction_mode !== "off") {
    const viewerCountry = normalizeCountryCode(clientGeo?.country);
    if (!viewerCountry) {
      if (!isLocalRequest(req)) {
        return "We could not verify the viewer country for this secure link";
      }
    } else if (
      securityOptions.geo_restriction_mode === "allow" &&
      !securityOptions.geo_country_codes.includes(viewerCountry)
    ) {
      return "Access to this secure link is limited to approved countries";
    } else if (
      securityOptions.geo_restriction_mode === "block" &&
      securityOptions.geo_country_codes.includes(viewerCountry)
    ) {
      return "Access from your country is blocked for this secure link";
    }
  }
  return null;
}

function isStrictSecurityModeEnabled(securityOptions = {}) {
  return Boolean(securityOptions.strict_security_mode);
}

function isRequireFullscreenEnabled(securityOptions = {}) {
  return Boolean(securityOptions.require_fullscreen || isStrictSecurityModeEnabled(securityOptions));
}

function isEnhancedWatermarkEnabled(securityOptions = {}) {
  return Boolean(securityOptions.enhanced_watermark || isStrictSecurityModeEnabled(securityOptions));
}

function normalizeWatermarkMode(
  value,
  fieldName = "watermark_mode",
  fallback = DEFAULT_SECURE_LINK_DEFAULTS.watermark_mode,
) {
  const mode = String(value || "").trim().toLowerCase();
  if (!mode) return fallback;
  if (["basic", "text", "logo"].includes(mode)) {
    return mode;
  }
  throw new HttpError(400, `${fieldName} must be one of: basic, text, logo`);
}

function normalizeWatermarkLogoUrl(value, fieldName = "watermark_logo_url", { strict = false } = {}) {
  const text = String(value || "").trim();
  if (!text) return "";
  const imageDataUrlPattern = /^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i;
  if (imageDataUrlPattern.test(text)) {
    if (text.length > 220000) {
      if (strict) {
        throw new HttpError(400, `${fieldName} is too large after image compression`);
      }
      return "";
    }
    return text;
  }
  try {
    return sanitizeSeoUrlOrPath(text, fieldName, { allowRelativePath: true, allowEmpty: true });
  } catch (error) {
    if (strict) throw error;
    return "";
  }
}

function getNormalizedWatermarkConfig(source = {}, { strict = false } = {}) {
  const input = source && typeof source === "object" ? source : {};
  let mode = DEFAULT_SECURE_LINK_DEFAULTS.watermark_mode;
  if (strict) {
    mode = normalizeWatermarkMode(input.watermark_mode, "watermark_mode", DEFAULT_SECURE_LINK_DEFAULTS.watermark_mode);
  } else {
    try {
      mode = normalizeWatermarkMode(
        input.watermark_mode,
        "watermark_mode",
        DEFAULT_SECURE_LINK_DEFAULTS.watermark_mode,
      );
    } catch {
      mode = DEFAULT_SECURE_LINK_DEFAULTS.watermark_mode;
    }
  }

  const text = normalizeOptionalText(input.watermark_text, { maxLength: 160 }) || "";
  const logoUrl = normalizeWatermarkLogoUrl(input.watermark_logo_url, "watermark_logo_url", { strict });

  if (strict && mode === "text" && !text) {
    throw new HttpError(400, "watermark_text is required when watermark_mode is text");
  }
  if (strict && mode === "logo" && !logoUrl) {
    throw new HttpError(400, "watermark_logo_url is required when watermark_mode is logo");
  }

  let resolvedMode = mode;
  if (resolvedMode === "text" && !text) {
    resolvedMode = "basic";
  }
  if (resolvedMode === "logo" && !logoUrl) {
    resolvedMode = "basic";
  }

  return {
    mode: resolvedMode,
    text,
    logo_url: logoUrl,
  };
}

function isSingleViewerSessionEnabled(securityOptions = {}) {
  return Boolean(securityOptions.single_viewer_session || isStrictSecurityModeEnabled(securityOptions));
}

function getActiveViewerSession(link) {
  const activeViewerSession =
    link?.active_viewer_session && typeof link.active_viewer_session === "object"
      ? link.active_viewer_session
      : null;
  if (!activeViewerSession?.session_id) return null;
  return activeViewerSession;
}

function isActiveViewerSessionFresh(activeViewerSession, now = nowUtc()) {
  if (!activeViewerSession?.last_seen_at) return false;
  try {
    const lastSeenAt = ensureDate(activeViewerSession.last_seen_at, "Invalid active viewer session timing");
    return now.getTime() - lastSeenAt.getTime() <= ACTIVE_VIEWER_SESSION_TTL_MS;
  } catch {
    return false;
  }
}

function getViewerSessionConflictMessage(link, securityOptions, viewerSessionId, now = nowUtc()) {
  if (!isSingleViewerSessionEnabled(securityOptions)) return null;
  if (!viewerSessionId) {
    return "This secure link requires the secure viewer to establish a verified session";
  }
  const activeViewerSession = getActiveViewerSession(link);
  if (!activeViewerSession || !isActiveViewerSessionFresh(activeViewerSession, now)) {
    return null;
  }
  if (activeViewerSession.session_id === viewerSessionId) {
    return null;
  }
  return "This secure link is already open in another active session";
}

function buildActiveViewerSessionRecord(viewerSessionId, clientIp, now = nowUtc()) {
  if (!viewerSessionId) return null;
  return {
    session_id: viewerSessionId,
    ip: normalizeClientIp(clientIp),
    last_seen_at: now.toISOString(),
  };
}

function buildSecureViewerPayload(securityOptions = {}) {
  const watermarkConfig = getNormalizedWatermarkConfig(securityOptions);
  return {
    focus_lock_enabled: securityOptions.focus_lock_enabled,
    idle_timeout_seconds: securityOptions.idle_timeout_seconds,
    strict_security_mode: Boolean(securityOptions.strict_security_mode),
    require_fullscreen: isRequireFullscreenEnabled(securityOptions),
    enhanced_watermark: isEnhancedWatermarkEnabled(securityOptions),
    watermark_mode: watermarkConfig.mode,
    watermark_text: watermarkConfig.text,
    watermark_logo_url: watermarkConfig.logo_url,
    single_viewer_session: isSingleViewerSessionEnabled(securityOptions),
    lock_to_first_ip: securityOptions.lock_to_first_ip,
    allowed_ip_count: securityOptions.allowed_ip_addresses.length,
    geo_restriction_mode: securityOptions.geo_restriction_mode,
    geo_country_count: securityOptions.geo_country_codes.length,
  };
}

function stripeKeyType(apiKey) {
  if (!apiKey) return "none";
  if (apiKey.startsWith("sk_live_")) return "live";
  if (apiKey.startsWith("sk_test_")) return "sandbox";
  return "unknown";
}

function stripeKeyPreview(apiKey) {
  if (!apiKey) return "Not configured";
  return `sk_...${apiKey.slice(-4)}`;
}

function appendSetCookie(res, cookieValue) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookieValue]);
    return;
  }
  res.setHeader("Set-Cookie", [existing, cookieValue]);
}

function setSessionCookie(res, token) {
  const isProduction = process.env.NODE_ENV === "production";
  appendSetCookie(
    res,
    serializeCookie("session_token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    }),
  );
}

function clearSessionCookie(res) {
  const isProduction = process.env.NODE_ENV === "production";
  appendSetCookie(
    res,
    serializeCookie("session_token", "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 0,
      expires: new Date(0),
      path: "/",
    }),
  );
}

function getCookieValue(req, key) {
  const cookieHeader = req.headers.cookie || "";
  const cookies = parseCookie(cookieHeader);
  return cookies[key];
}

function createAccessToken(payload) {
  return jwt.sign(payload, SECRET_KEY, {
    algorithm: ALGORITHM,
    expiresIn: `${ACCESS_TOKEN_EXPIRE_MINUTES}m`,
  });
}

async function getRawBody(req) {
  if (req._rawBody !== undefined) {
    return req._rawBody;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  req._rawBody = Buffer.concat(chunks);
  return req._rawBody;
}

async function getJsonBody(req) {
  if (req._jsonBody !== undefined) {
    return req._jsonBody;
  }

  const raw = await getRawBody(req);
  if (!raw.length) {
    req._jsonBody = {};
    return req._jsonBody;
  }

  try {
    req._jsonBody = JSON.parse(raw.toString("utf-8"));
    return req._jsonBody;
  } catch {
    throw new HttpError(400, "Invalid JSON payload");
  }
}

async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      multiples: false,
      maxFileSize: 50 * 1024 * 1024,
      keepExtensions: true,
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(new HttpError(400, "Invalid upload payload"));
        return;
      }
      resolve({ fields, files });
    });
  });
}

function sendJson(res, status, payload) {
  if (res.writableEnded) return;
  res.status(status).json(payload);
}

function sendRedirect(res, location, status = 302) {
  if (res.writableEnded) return;
  res.writeHead(status, { Location: location });
  res.end();
}

function sendBuffer(res, status, buffer, contentType, extraHeaders = {}) {
  if (res.writableEnded) return;
  res.status(status);
  res.setHeader("Content-Type", contentType);
  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, value);
  }
  res.send(buffer);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Stripe-Signature");
}

function verifyStripeSignature(payload, signatureHeader, webhookSecret) {
  if (!signatureHeader || !webhookSecret) {
    return false;
  }

  const sigParts = {};
  for (const item of String(signatureHeader).split(",")) {
    if (!item.includes("=")) continue;
    const [key, value] = item.split("=", 2);
    if (!sigParts[key]) sigParts[key] = [];
    sigParts[key].push(value);
  }

  const timestamp = (sigParts.t || [null])[0];
  const signatures = sigParts.v1 || [];
  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const signedPayload = Buffer.from(`${timestamp}.${payload.toString("utf-8")}`, "utf-8");
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload)
    .digest("hex");

  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    } catch {
      return false;
    }
  });
}

async function stripeApiRequest(method, endpointPath, apiKey, data = null) {
  if (!apiKey) {
    throw new HttpError(400, "Stripe key is not configured");
  }

  const url = `https://api.stripe.com${endpointPath}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };

  let body;
  if (data && ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      params.append(key, String(value));
    }
    body = params.toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
    });
  } catch {
    throw new HttpError(502, "Unable to reach Stripe API");
  }

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const detail = payload?.error?.message || text || "Stripe API request failed";
    throw new HttpError(400, `Stripe error: ${detail}`);
  }

  return payload;
}

async function getActiveStripeConfig() {
  const doc = await db.platform_settings.findOne({ key: "stripe" }, { _id: 0 });
  let liveKey = (doc || {}).live_key || "";
  let sandboxKey = (doc || {}).sandbox_key || "";
  const legacyKey = (doc || {}).stripe_key || "";
  const envKey = STRIPE_API_KEY || "";

  const envType = stripeKeyType(envKey);
  const legacyType = stripeKeyType(legacyKey);

  if (!liveKey && legacyType === "live") {
    liveKey = legacyKey;
  }
  if (!sandboxKey && legacyType === "sandbox") {
    sandboxKey = legacyKey;
  }

  let mode = (doc || {}).mode;
  if (mode !== "sandbox" && mode !== "live") {
    mode = envType === "live" ? "live" : "sandbox";
  }

  let activeKey;
  if (mode === "live") {
    activeKey = liveKey || (envType === "live" ? envKey : "");
  } else {
    activeKey = sandboxKey || (envType === "sandbox" ? envKey : "");
  }

  return {
    mode,
    active_key: activeKey,
    active_key_type: stripeKeyType(activeKey),
    has_live_key: Boolean(liveKey) || envType === "live",
    has_sandbox_key: Boolean(sandboxKey) || envType === "sandbox",
    sandbox_active: mode === "sandbox",
    key_preview: stripeKeyPreview(activeKey),
  };
}

function normalizeEmailDeliveryProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (VALID_EMAIL_DELIVERY_PROVIDERS.includes(provider)) {
    return provider;
  }
  return "";
}

function normalizeSmtpEncryption(value, fallback = "tls") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["none", "tls", "ssl"].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeSmtpPort(value, fallback = 587) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function normalizeMailgunRegion(value, fallback = "us") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "eu") return "eu";
  if (normalized === "us") return "us";
  return fallback;
}

function maskEmailLike(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const atIndex = text.indexOf("@");
  if (atIndex <= 1) return maskSecret(text);
  return `${text.slice(0, 2)}***${text.slice(atIndex)}`;
}

function encodeBase64Url(value) {
  return Buffer.from(String(value || ""), "utf-8").toString("base64url");
}

function buildAdminSettingsRedirectUrl(req, params = {}) {
  const baseUrl = buildPublicBaseUrl(req) || APP_BASE_URL;
  if (!baseUrl) {
    return "/admin/settings";
  }
  const url = new URL("/admin/settings", `${baseUrl}/`);
  url.searchParams.set("tab", "email");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildEmailDeliveryCallbackUrl(req, provider) {
  const baseUrl = buildPublicBaseUrl(req);
  if (!baseUrl) {
    throw new HttpError(500, "APP_BASE_URL is required for OAuth mail providers");
  }
  return `${baseUrl}/api/admin/settings/email-delivery/${provider}/callback`;
}

function createEmailProviderStateToken(provider, userId) {
  return jwt.sign(
    {
      type: "email_delivery_oauth",
      provider,
      sub: String(userId || ""),
      nonce: tokenHex(8),
    },
    SECRET_KEY,
    {
      algorithm: ALGORITHM,
      expiresIn: "10m",
    },
  );
}

function verifyEmailProviderStateToken(state, provider) {
  let payload;
  try {
    payload = jwt.verify(String(state || ""), SECRET_KEY, { algorithms: [ALGORITHM] });
  } catch {
    throw new HttpError(400, "Invalid or expired email provider state");
  }

  if (payload?.type !== "email_delivery_oauth" || payload?.provider !== provider || !payload?.sub) {
    throw new HttpError(400, "Invalid email provider state");
  }
  return payload;
}

async function getActiveEmailDeliveryConfig() {
  const doc = await getPlatformSettingDoc("email_delivery");
  const requestedProvider =
    normalizeEmailDeliveryProvider(doc?.active_provider) ||
    normalizeEmailDeliveryProvider(EMAIL_DELIVERY_PROVIDER) ||
    ((doc?.gmail_refresh_token && doc?.gmail_email)
      ? EMAIL_PROVIDER_GMAIL
      : (doc?.mailgun_api_key && doc?.mailgun_domain)
        ? EMAIL_PROVIDER_MAILGUN
        : (doc?.outlook_refresh_token && doc?.outlook_email)
          ? EMAIL_PROVIDER_OUTLOOK
          : (SMTP_HOST || SMTP_FROM_EMAIL || doc?.smtp_host)
            ? EMAIL_PROVIDER_SMTP
            : (RESEND_API_KEY ? EMAIL_PROVIDER_RESEND : EMAIL_PROVIDER_SUPABASE));

  const smtpEncryption = normalizeSmtpEncryption(
    doc?.smtp_encryption,
    doc?.smtp_secure !== undefined
      ? (Boolean(doc.smtp_secure) ? "ssl" : "tls")
      : (SMTP_SECURE ? "ssl" : "tls"),
  );
  const smtpAuthEnabled =
    doc?.smtp_auth_enabled !== undefined
      ? Boolean(doc.smtp_auth_enabled)
      : Boolean((doc?.smtp_username || SMTP_USERNAME || "").trim() || (doc?.smtp_password || SMTP_PASSWORD || "").trim());

  const smtp = {
    host: String(doc?.smtp_host || SMTP_HOST || "").trim(),
    port: normalizeSmtpPort(doc?.smtp_port ?? SMTP_PORT, normalizeSmtpPort(SMTP_PORT, 587)),
    encryption: smtpEncryption,
    secure: smtpEncryption === "ssl",
    require_tls: smtpEncryption === "tls",
    auth_enabled: smtpAuthEnabled,
    username: String(doc?.smtp_username || SMTP_USERNAME || "").trim(),
    password: String(doc?.smtp_password || SMTP_PASSWORD || "").trim(),
    from_email: String(doc?.smtp_from_email || SMTP_FROM_EMAIL || EMAIL_FROM || "").trim(),
    from_name: String(doc?.smtp_from_name || SMTP_FROM_NAME || DEFAULT_BRANDING_SETTINGS.app_name).trim(),
    reply_to: String(doc?.smtp_reply_to || SMTP_REPLY_TO || "").trim(),
    force_return_path:
      doc?.smtp_force_return_path !== undefined
        ? Boolean(doc.smtp_force_return_path)
        : Boolean(doc?.force_return_path),
  };

  const smtpConfigured = Boolean(
    smtp.host &&
    smtp.port &&
    smtp.from_email &&
    (!smtp.auth_enabled || (smtp.username && smtp.password)),
  );
  const smtpAuthConfigured = Boolean(smtp.username && smtp.password);
  const gmail = {
    client_id: String(doc?.gmail_client_id || "").trim(),
    client_secret: String(doc?.gmail_client_secret || "").trim(),
    refresh_token: String(doc?.gmail_refresh_token || "").trim(),
    email: String(doc?.gmail_email || doc?.gmail_from_email || "").trim().toLowerCase(),
    from_email: String(doc?.gmail_from_email || doc?.gmail_email || "").trim().toLowerCase(),
    from_name: String(doc?.gmail_from_name || DEFAULT_BRANDING_SETTINGS.app_name).trim(),
    reply_to: String(doc?.gmail_reply_to || "").trim(),
    force_return_path:
      doc?.gmail_force_return_path !== undefined
        ? Boolean(doc.gmail_force_return_path)
        : Boolean(doc?.force_return_path),
    token_scope: String(doc?.gmail_token_scope || "").trim(),
    connected_at: String(doc?.gmail_connected_at || "").trim(),
  };
  const gmailConnected = Boolean(gmail.refresh_token);
  const gmailConfigured = Boolean(gmail.client_id && gmail.client_secret && gmailConnected && (gmail.from_email || gmail.email));
  const mailgun = {
    api_key: String(doc?.mailgun_api_key || "").trim(),
    domain: String(doc?.mailgun_domain || "").trim().toLowerCase(),
    region: normalizeMailgunRegion(doc?.mailgun_region, "us"),
    from_email: String(doc?.mailgun_from_email || "").trim().toLowerCase(),
    from_name: String(doc?.mailgun_from_name || DEFAULT_BRANDING_SETTINGS.app_name).trim(),
    reply_to: String(doc?.mailgun_reply_to || "").trim(),
    force_return_path:
      doc?.mailgun_force_return_path !== undefined
        ? Boolean(doc.mailgun_force_return_path)
        : Boolean(doc?.force_return_path),
  };
  const mailgunConfigured = Boolean(mailgun.api_key && mailgun.domain && mailgun.from_email);
  const outlook = {
    tenant_id: String(doc?.outlook_tenant_id || MICROSOFT_DEFAULT_TENANT).trim() || MICROSOFT_DEFAULT_TENANT,
    client_id: String(doc?.outlook_client_id || "").trim(),
    client_secret: String(doc?.outlook_client_secret || "").trim(),
    refresh_token: String(doc?.outlook_refresh_token || "").trim(),
    email: String(doc?.outlook_email || "").trim().toLowerCase(),
    from_email: String(doc?.outlook_from_email || doc?.outlook_email || "").trim().toLowerCase(),
    from_name: String(doc?.outlook_from_name || DEFAULT_BRANDING_SETTINGS.app_name).trim(),
    reply_to: String(doc?.outlook_reply_to || "").trim(),
    save_to_sent_items:
      doc?.outlook_save_to_sent_items !== undefined
        ? Boolean(doc.outlook_save_to_sent_items)
        : true,
    connected_at: String(doc?.outlook_connected_at || "").trim(),
  };
  const outlookConnected = Boolean(outlook.refresh_token && outlook.email);
  const outlookConfigured = Boolean(outlook.client_id && outlook.client_secret && outlookConnected);
  const resendConfigured = Boolean(RESEND_API_KEY && String(EMAIL_FROM || "").trim());

  let activeProvider = requestedProvider;
  if (activeProvider === EMAIL_PROVIDER_GMAIL && !gmailConfigured) {
    activeProvider = outlookConfigured
      ? EMAIL_PROVIDER_OUTLOOK
      : mailgunConfigured
        ? EMAIL_PROVIDER_MAILGUN
        : smtpConfigured
          ? EMAIL_PROVIDER_SMTP
          : resendConfigured
            ? EMAIL_PROVIDER_RESEND
            : EMAIL_PROVIDER_SUPABASE;
  } else if (activeProvider === EMAIL_PROVIDER_MAILGUN && !mailgunConfigured) {
    activeProvider = gmailConfigured
      ? EMAIL_PROVIDER_GMAIL
      : outlookConfigured
        ? EMAIL_PROVIDER_OUTLOOK
        : smtpConfigured
          ? EMAIL_PROVIDER_SMTP
          : resendConfigured
            ? EMAIL_PROVIDER_RESEND
            : EMAIL_PROVIDER_SUPABASE;
  } else if (activeProvider === EMAIL_PROVIDER_OUTLOOK && !outlookConfigured) {
    activeProvider = gmailConfigured
      ? EMAIL_PROVIDER_GMAIL
      : mailgunConfigured
        ? EMAIL_PROVIDER_MAILGUN
        : smtpConfigured
          ? EMAIL_PROVIDER_SMTP
          : resendConfigured
            ? EMAIL_PROVIDER_RESEND
            : EMAIL_PROVIDER_SUPABASE;
  } else if (activeProvider === EMAIL_PROVIDER_SMTP && !smtpConfigured) {
    activeProvider = gmailConfigured
      ? EMAIL_PROVIDER_GMAIL
      : mailgunConfigured
        ? EMAIL_PROVIDER_MAILGUN
        : outlookConfigured
          ? EMAIL_PROVIDER_OUTLOOK
          : resendConfigured
            ? EMAIL_PROVIDER_RESEND
            : EMAIL_PROVIDER_SUPABASE;
  } else if (activeProvider === EMAIL_PROVIDER_RESEND && !resendConfigured) {
    activeProvider = gmailConfigured
      ? EMAIL_PROVIDER_GMAIL
      : mailgunConfigured
        ? EMAIL_PROVIDER_MAILGUN
        : outlookConfigured
          ? EMAIL_PROVIDER_OUTLOOK
          : smtpConfigured
            ? EMAIL_PROVIDER_SMTP
            : EMAIL_PROVIDER_SUPABASE;
  }

  return {
    key: "email_delivery",
    requested_provider: requestedProvider,
    active_provider: activeProvider,
    custom_delivery_enabled: [
      EMAIL_PROVIDER_GMAIL,
      EMAIL_PROVIDER_MAILGUN,
      EMAIL_PROVIDER_OUTLOOK,
      EMAIL_PROVIDER_SMTP,
      EMAIL_PROVIDER_RESEND,
    ].includes(activeProvider),
    available_providers: VALID_EMAIL_DELIVERY_PROVIDERS,
    gmail: {
      client_id: gmail.client_id,
      client_secret: gmail.client_secret,
      refresh_token: gmail.refresh_token,
      email: gmail.email,
      from_email: gmail.from_email,
      from_name: gmail.from_name,
      reply_to: gmail.reply_to,
      force_return_path: gmail.force_return_path,
      connected: gmailConnected,
      configured: gmailConfigured,
      client_id_set: Boolean(gmail.client_id),
      client_secret_set: Boolean(gmail.client_secret),
      refresh_token_set: Boolean(gmail.refresh_token),
      token_scope: gmail.token_scope,
      connected_at: gmail.connected_at || null,
      email_preview: maskEmailLike(gmail.email),
    },
    mailgun: {
      api_key: mailgun.api_key,
      domain: mailgun.domain,
      region: mailgun.region,
      from_email: mailgun.from_email,
      from_name: mailgun.from_name,
      reply_to: mailgun.reply_to,
      force_return_path: mailgun.force_return_path,
      configured: mailgunConfigured,
      api_key_set: Boolean(mailgun.api_key),
      api_key_preview: maskSecret(mailgun.api_key),
    },
    outlook: {
      client_id: outlook.client_id,
      client_secret: outlook.client_secret,
      refresh_token: outlook.refresh_token,
      tenant_id: outlook.tenant_id,
      email: outlook.email,
      from_email: outlook.from_email,
      from_name: outlook.from_name,
      reply_to: outlook.reply_to,
      save_to_sent_items: outlook.save_to_sent_items,
      connected: outlookConnected,
      configured: outlookConfigured,
      client_id_set: Boolean(outlook.client_id),
      client_secret_set: Boolean(outlook.client_secret),
      refresh_token_set: Boolean(outlook.refresh_token),
      connected_at: outlook.connected_at || null,
      email_preview: maskEmailLike(outlook.email),
    },
    smtp: {
      host: smtp.host,
      port: smtp.port,
      encryption: smtp.encryption,
      secure: smtp.secure,
      require_tls: smtp.require_tls,
      auth_enabled: smtp.auth_enabled,
      username: smtp.username,
      password: smtp.password,
      from_email: smtp.from_email,
      from_name: smtp.from_name,
      reply_to: smtp.reply_to,
      force_return_path: smtp.force_return_path,
      configured: smtpConfigured,
      auth_configured: smtpAuthConfigured,
      username_set: Boolean(smtp.username),
      password_set: Boolean(smtp.password),
      username_preview: maskEmailLike(smtp.username),
      password_preview: maskSecret(smtp.password),
    },
    resend: {
      configured: resendConfigured,
      from_email: String(EMAIL_FROM || "").trim(),
      api_key_set: Boolean(RESEND_API_KEY),
      from_preview: maskEmailLike(EMAIL_FROM),
    },
    supabase: {
      configured: Boolean(SUPABASE_URL && SUPABASE_AUTH_CLIENT_KEY),
      url_set: Boolean(SUPABASE_URL),
      publishable_key_set: Boolean(SUPABASE_PUBLISHABLE_KEY),
      service_role_key_set: Boolean(SUPABASE_SERVICE_ROLE_KEY),
    },
  };
}

async function hasTransactionalEmailDelivery() {
  const config = await getActiveEmailDeliveryConfig();
  return Boolean(config.custom_delivery_enabled && config.active_provider !== EMAIL_PROVIDER_SUPABASE);
}

function isStripeSubscriptionActiveStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return ["active", "trialing", "past_due", "unpaid"].includes(normalized);
}

function computeInternalSubscriptionStatus(stripeSubscriptionStatus, paymentStatus) {
  if (isStripeSubscriptionActiveStatus(stripeSubscriptionStatus)) return "active";
  if (String(paymentStatus || "").toLowerCase() === "paid") return "active";
  return "inactive";
}

async function findUserByStripeReferences({
  userId = "",
  stripeCustomerId = "",
  stripeSubscriptionId = "",
} = {}) {
  if (userId) {
    const byId = await db.users.findOne({ user_id: userId }, { _id: 0 });
    if (byId) return byId;
  }
  if (stripeCustomerId) {
    const byCustomer = await db.users.findOne({ stripe_customer_id: stripeCustomerId }, { _id: 0 });
    if (byCustomer) return byCustomer;
  }
  if (stripeSubscriptionId) {
    const bySubscription = await db.users.findOne(
      { stripe_subscription_id: stripeSubscriptionId },
      { _id: 0 },
    );
    if (bySubscription) return bySubscription;
  }
  return null;
}

function normalizeStripeInvoice(invoice) {
  if (!invoice || typeof invoice !== "object") return null;
  const periodLine = Array.isArray(invoice.lines?.data) ? invoice.lines.data[0] : null;
  return {
    id: invoice.id || null,
    number: invoice.number || null,
    hosted_invoice_url: invoice.hosted_invoice_url || null,
    invoice_pdf: invoice.invoice_pdf || null,
    amount_paid: amountFromStripeMinor(invoice.amount_paid, 0),
    amount_due: amountFromStripeMinor(invoice.amount_due, 0),
    amount_subtotal: amountFromStripeMinor(invoice.subtotal, 0),
    amount_tax: amountFromStripeMinor(invoice.tax, 0),
    currency: normalizeCurrencyCode(invoice.currency || "eur", "eur"),
    paid_at: fromStripeTimestampToIso(invoice.status_transitions?.paid_at),
    period_start: fromStripeTimestampToIso(periodLine?.period?.start),
    period_end: fromStripeTimestampToIso(periodLine?.period?.end),
    payment_intent_id:
      typeof invoice.payment_intent === "string"
        ? invoice.payment_intent
        : invoice.payment_intent?.id || null,
  };
}

function normalizeStripeSubscription(subscription) {
  if (!subscription || typeof subscription !== "object") return null;
  return {
    id: subscription.id || null,
    status: subscription.status || null,
    start_date: fromStripeTimestampToIso(subscription.start_date),
    current_period_start: fromStripeTimestampToIso(subscription.current_period_start),
    current_period_end: fromStripeTimestampToIso(subscription.current_period_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
  };
}

async function hydrateStripeCheckoutData(stripeKey, stripeSessionRaw) {
  const session = stripeSessionRaw || {};
  let subscriptionObj =
    typeof session.subscription === "object" ? session.subscription : null;
  let subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : subscriptionObj?.id || null;

  if (subscriptionId && (!subscriptionObj || !subscriptionObj.current_period_end)) {
    subscriptionObj = await stripeApiRequest(
      "GET",
      `/v1/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=latest_invoice.payment_intent`,
      stripeKey,
    );
  }

  let invoiceObj =
    typeof session.invoice === "object"
      ? session.invoice
      : typeof subscriptionObj?.latest_invoice === "object"
        ? subscriptionObj.latest_invoice
        : null;
  let invoiceId =
    typeof session.invoice === "string"
      ? session.invoice
      : typeof subscriptionObj?.latest_invoice === "string"
        ? subscriptionObj.latest_invoice
        : invoiceObj?.id || null;

  if (invoiceId && (!invoiceObj || !invoiceObj.status)) {
    invoiceObj = await stripeApiRequest(
      "GET",
      `/v1/invoices/${encodeURIComponent(invoiceId)}?expand[]=payment_intent`,
      stripeKey,
    );
  }

  const normalizedSubscription = normalizeStripeSubscription(subscriptionObj);
  const normalizedInvoice = normalizeStripeInvoice(invoiceObj);
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id || null;

  const paymentStatus = String(
    session.payment_status ||
      (normalizedInvoice?.paid_at ? "paid" : "") ||
      (isStripeSubscriptionActiveStatus(normalizedSubscription?.status) ? "paid" : "unpaid"),
  )
    .trim()
    .toLowerCase();
  const checkoutStatus = String(session.status || "open").trim().toLowerCase();
  const amount = amountFromStripeMinor(
    session.amount_total,
    normalizedInvoice?.amount_paid || normalizedInvoice?.amount_due || 0,
  );
  const currency = normalizeCurrencyCode(
    session.currency || normalizedInvoice?.currency || "eur",
    "eur",
  );

  return {
    checkout_status: checkoutStatus,
    payment_status: paymentStatus,
    amount,
    currency,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription: normalizedSubscription,
    stripe_invoice: normalizedInvoice,
    stripe_subscription_id: normalizedSubscription?.id || subscriptionId || null,
    stripe_invoice_id: normalizedInvoice?.id || invoiceId || null,
  };
}

async function applyUserSubscriptionState({
  userId,
  plan,
  stripeCustomerId,
  stripeSubscription,
  paymentStatus,
}) {
  if (!userId) return;
  const subscriptionStatus = computeInternalSubscriptionStatus(
    stripeSubscription?.status,
    paymentStatus,
  );
  const currentPeriodEnd =
    stripeSubscription?.current_period_end ||
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const currentPeriodStart =
    stripeSubscription?.current_period_start ||
    new Date(Date.now()).toISOString();

  const update = {
    subscription_status: subscriptionStatus,
    plan: plan || "basic",
    stripe_customer_id: stripeCustomerId || null,
    stripe_subscription_id: stripeSubscription?.id || null,
    stripe_subscription_status: stripeSubscription?.status || null,
    subscription_started_at: stripeSubscription?.start_date || currentPeriodStart,
    subscription_current_period_start: currentPeriodStart,
    subscription_current_period_end: currentPeriodEnd,
    subscription_expires_at: currentPeriodEnd,
    next_renewal_at: currentPeriodEnd,
  };

  await db.users.updateOne(
    { user_id: userId },
    {
      $set: update,
    },
  );
}

function maskSecret(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.length <= 8) return "********";
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

function getSettingsHistorySnapshot(key, doc) {
  if (!doc || typeof doc !== "object") return null;

  if (key === "stripe") {
    return {
      key: "stripe",
      mode: String(doc.mode || "").trim() || null,
      key_preview: stripeKeyPreview(doc.live_key || doc.sandbox_key || doc.stripe_key || ""),
      live_key_set: Boolean(String(doc.live_key || "").trim()),
      sandbox_key_set: Boolean(String(doc.sandbox_key || "").trim()),
      updated_at: doc.updated_at || null,
    };
  }

  if (key === "storage") {
    return {
      key: "storage",
      active_provider: normalizeStorageProvider(doc.active_provider || DEFAULT_STORAGE_PROVIDER),
      wasabi: {
        endpoint: String(doc.wasabi_endpoint || "").trim(),
        region: String(doc.wasabi_region || "").trim(),
        bucket: String(doc.wasabi_bucket || "").trim(),
        force_path_style:
          doc.wasabi_force_path_style !== undefined ? Boolean(doc.wasabi_force_path_style) : true,
        access_key_set: Boolean(String(doc.wasabi_access_key_id || "").trim()),
        secret_key_set: Boolean(String(doc.wasabi_secret_access_key || "").trim()),
        access_key_preview: maskSecret(doc.wasabi_access_key_id || ""),
        secret_key_preview: maskSecret(doc.wasabi_secret_access_key || ""),
      },
      updated_at: doc.updated_at || null,
    };
  }

  if (key === "email_delivery") {
    const config = {
      key: "email_delivery",
      active_provider: normalizeEmailDeliveryProvider(doc.active_provider) || EMAIL_PROVIDER_SUPABASE,
      gmail: {
        connected: Boolean(String(doc.gmail_refresh_token || "").trim()),
        client_id_set: Boolean(String(doc.gmail_client_id || "").trim()),
        client_secret_set: Boolean(String(doc.gmail_client_secret || "").trim()),
        from_email: String(doc.gmail_from_email || doc.gmail_email || "").trim(),
      },
      mailgun: {
        configured: Boolean(
          String(doc.mailgun_api_key || "").trim() &&
            String(doc.mailgun_domain || "").trim() &&
            String(doc.mailgun_from_email || "").trim(),
        ),
        domain: String(doc.mailgun_domain || "").trim(),
        from_email: String(doc.mailgun_from_email || "").trim(),
      },
      outlook: {
        connected: Boolean(String(doc.outlook_refresh_token || "").trim()),
        client_id_set: Boolean(String(doc.outlook_client_id || "").trim()),
        client_secret_set: Boolean(String(doc.outlook_client_secret || "").trim()),
        from_email: String(doc.outlook_from_email || doc.outlook_email || "").trim(),
      },
      smtp: {
        host: String(doc.smtp_host || "").trim(),
        port: normalizeSmtpPort(doc.smtp_port, 587),
        auth_enabled: doc.smtp_auth_enabled !== undefined ? Boolean(doc.smtp_auth_enabled) : true,
        username_set: Boolean(String(doc.smtp_username || "").trim()),
        password_set: Boolean(String(doc.smtp_password || "").trim()),
        from_email: String(doc.smtp_from_email || "").trim(),
      },
      updated_at: doc.updated_at || null,
    };
    return config;
  }

  if (key === "vercel") {
    return {
      key: "vercel",
      project_id: normalizeVercelProjectId(doc.project_id),
      team_id: normalizeVercelTeamId(doc.team_id),
      auto_attach: doc.auto_attach !== undefined ? Boolean(doc.auto_attach) : true,
      token_set: Boolean(normalizeVercelApiToken(doc.api_token)),
      token_preview: maskSecret(normalizeVercelApiToken(doc.api_token)),
      updated_at: doc.updated_at || null,
    };
  }

  if (key === "localization") {
    const config = getNormalizedLocalizationConfig(doc);
    return {
      key: "localization",
      default_language: config.default_language,
      enabled_languages: config.enabled_languages,
      automatic_detection: config.automatic_detection,
      site_timezone: config.site_timezone,
      site_currency: config.site_currency,
      manual_override_stats: config.manual_override_stats,
      total_manual_overrides: Object.values(config.manual_override_stats || {}).reduce(
        (sum, value) => sum + Number(value || 0),
        0,
      ),
      updated_at: config.updated_at || null,
    };
  }

  if (key === "subscription_plans") {
    const config = getNormalizedSubscriptionPlansConfig(doc);
    return {
      key: "subscription_plans",
      currency: config.currency,
      interval: config.interval,
      plans: sortSubscriptionPlanEntries(config.plans).map(([planId, plan]) => ({
        plan_id: planId,
        name: plan.name,
        price: plan.price,
        active: Boolean(plan.active),
        public_visible: Boolean(plan.public_visible),
        featured: Boolean(plan.featured),
        sort_order: Number(plan.sort_order || 0),
      })),
      updated_at: config.updated_at || null,
    };
  }

  return cloneJson(doc);
}

async function recordSettingsHistoryEntry({
  key,
  actor,
  updatedFields = [],
  beforeDoc = null,
  afterDoc = null,
  metadata = {},
}) {
  try {
    await db.settings_history.insertOne({
      change_id: makeId("cfg"),
      setting_key: key,
      section_key: SETTING_KEY_TO_SECTION[key] || null,
      actor_user_id: actor?.user_id || null,
      actor_role: actor?.role || null,
      updated_fields: Array.from(new Set((updatedFields || []).map((field) => String(field || "").trim()).filter(Boolean))),
      before_snapshot: getSettingsHistorySnapshot(key, beforeDoc),
      after_snapshot: getSettingsHistorySnapshot(key, afterDoc),
      metadata: cloneJson(metadata || {}),
      created_at: isoNow(),
    });
  } catch (error) {
    console.error("Settings history failure", error?.message || error);
  }
}

async function persistPlatformSettingUpdate(
  req,
  {
    actor,
    key,
    updateData,
    updatedFields = [],
    eventType,
    message,
    metadata = {},
  },
) {
  const settingKey = String(key || "").trim();
  if (!settingKey) {
    throw new HttpError(500, "Missing settings key");
  }

  const beforeDoc = await getPlatformSettingDoc(settingKey);
  const payload = {
    ...(updateData || {}),
    key: settingKey,
  };

  await db.platform_settings.updateOne(
    { key: settingKey },
    { $set: payload },
    { upsert: true },
  );
  invalidatePlatformSettingCache(settingKey);
  const afterDoc = await getPlatformSettingDoc(settingKey);

  await recordSettingsHistoryEntry({
    key: settingKey,
    actor,
    updatedFields,
    beforeDoc,
    afterDoc,
    metadata,
  });

  await logAuditEvent(req, {
    eventType,
    actorUserId: actor?.user_id || null,
    targetUserId: actor?.user_id || null,
    resourceType: "platform_settings",
    resourceId: settingKey,
    success: true,
    message,
    metadata: {
      updated_fields: updatedFields,
      ...cloneJson(metadata || {}),
    },
  });

  return afterDoc;
}

function normalizeJobStatus(value, fallback = JOB_STATUS_QUEUED) {
  const candidate = String(value || "").trim().toLowerCase();
  if (VALID_JOB_STATUSES.includes(candidate)) {
    return candidate;
  }
  return fallback;
}

function getJobSummary(job) {
  if (!job || typeof job !== "object") return null;
  return {
    job_id: job.job_id,
    job_type: job.job_type,
    status: normalizeJobStatus(job.status),
    progress: Math.max(0, Math.min(100, Number(job.progress || 0))),
    attempts: Number(job.attempts || 0),
    max_attempts: Number(job.max_attempts || 1),
    created_by_user_id: job.created_by_user_id || null,
    created_at: job.created_at || null,
    updated_at: job.updated_at || null,
    started_at: job.started_at || null,
    finished_at: job.finished_at || null,
    run_after: job.run_after || null,
    last_error: job.last_error || null,
    payload: cloneJson(job.payload || {}),
    result: cloneJson(job.result || null),
  };
}

async function enqueueBackgroundJob({
  jobType,
  payload = {},
  createdByUserId = null,
  maxAttempts = 1,
  runAfter = null,
}) {
  const now = isoNow();
  const job = {
    job_id: makeId("job"),
    job_type: String(jobType || "").trim(),
    status: JOB_STATUS_QUEUED,
    payload: cloneJson(payload || {}),
    progress: 0,
    attempts: 0,
    max_attempts: Math.max(1, Number.parseInt(String(maxAttempts || "1"), 10) || 1),
    created_by_user_id: createdByUserId || null,
    created_at: now,
    updated_at: now,
    run_after: runAfter || now,
    started_at: null,
    finished_at: null,
    last_error: null,
    result: null,
  };
  await db.jobs.insertOne(job);
  return job;
}

async function updateJobProgress(jobId, patch = {}) {
  const update = {
    updated_at: isoNow(),
    ...patch,
  };
  await db.jobs.updateOne({ job_id: jobId }, { $set: update });
}

function normalizeVercelProjectId(value) {
  return String(value || "").trim();
}

function normalizeVercelTeamId(value) {
  return String(value || "").trim();
}

function normalizeVercelApiToken(value) {
  return String(value || "").trim();
}

function isVercelDomainConflictError(error) {
  const status = Number(error?.status || 0);
  const payloadText = JSON.stringify(error?.payload || {});
  const message = `${error?.message || ""} ${payloadText}`.toLowerCase();
  return status === 409 || message.includes("already exists");
}

async function getActiveVercelConfig() {
  const doc = await db.platform_settings.findOne({ key: "vercel" }, { _id: 0 });
  const apiToken = normalizeVercelApiToken(doc?.api_token || VERCEL_API_TOKEN);
  const projectId = normalizeVercelProjectId(doc?.project_id || VERCEL_PROJECT_ID);
  const teamId = normalizeVercelTeamId(doc?.team_id || VERCEL_TEAM_ID);
  const autoAttach =
    doc?.auto_attach !== undefined
      ? Boolean(doc.auto_attach)
      : VERCEL_AUTO_DOMAIN_ATTACH;

  return {
    key: "vercel",
    api_token: apiToken,
    project_id: projectId,
    team_id: teamId,
    auto_attach: autoAttach,
    configured: Boolean(apiToken && projectId),
    token_set: Boolean(apiToken),
    token_preview: maskSecret(apiToken),
  };
}

async function executeStorageMigrationJob(job, req) {
  const payload = job?.payload && typeof job.payload === "object" ? job.payload : {};
  const destinationProvider = normalizeStorageProvider(payload.destination_provider);
  const explicitSourceProvider = payload.source_provider
    ? normalizeStorageProvider(payload.source_provider)
    : "";
  const candidateLimit = Math.max(
    1,
    Math.min(10000, Number.parseInt(String(payload.limit || "0"), 10) || 0),
  );
  const query =
    explicitSourceProvider && VALID_STORAGE_PROVIDERS.includes(explicitSourceProvider)
      ? { storage_provider: explicitSourceProvider }
      : {};

  const rawPdfs = await db.pdfs.find(
    query,
    {
      _id: 0,
      pdf_id: 1,
      user_id: 1,
      filename: 1,
      storage_provider: 1,
      storage_key: 1,
      created_at: 1,
    },
    {
      sort: { created_at: 1 },
      ...(candidateLimit ? { limit: candidateLimit } : {}),
    },
  );

  const candidates = rawPdfs.filter((pdf) => {
    const currentProvider = normalizeStorageProvider(pdf.storage_provider || STORAGE_PROVIDER_SUPABASE);
    return currentProvider !== destinationProvider;
  });

  let migratedCount = 0;
  let skippedCount = 0;
  let warningCount = 0;
  let failedCount = 0;
  const errors = [];

  for (const [index, pdf] of candidates.entries()) {
    try {
      const result = await migratePdfRecordToProvider(pdf, destinationProvider);
      if (result?.migrated) {
        migratedCount += 1;
        if (result.warning) warningCount += 1;
      } else {
        skippedCount += 1;
      }
    } catch (error) {
      failedCount += 1;
      if (errors.length < 10) {
        errors.push({
          pdf_id: pdf.pdf_id,
          filename: pdf.filename || null,
          error: String(error?.message || "Migration failed").slice(0, 300),
        });
      }
    }

    const progress = Math.round(((index + 1) / Math.max(candidates.length, 1)) * 100);
    await updateJobProgress(job.job_id, { progress });
  }

  await logAuditEvent(req, {
    eventType: "admin.storage_migration_job_completed",
    actorUserId: job?.created_by_user_id || null,
    targetUserId: job?.created_by_user_id || null,
    resourceType: "job",
    resourceId: job?.job_id || null,
    success: failedCount === 0,
    message: "storage_migration_job_processed",
    metadata: {
      destination_provider: destinationProvider,
      source_provider: explicitSourceProvider || null,
      total_candidates: candidates.length,
      migrated: migratedCount,
      skipped: skippedCount,
      warnings: warningCount,
      failed: failedCount,
    },
  });

  return {
    destination_provider: destinationProvider,
    source_provider: explicitSourceProvider || null,
    total_candidates: candidates.length,
    migrated: migratedCount,
    skipped: skippedCount,
    warnings: warningCount,
    failed: failedCount,
    errors,
  };
}

async function executeBackgroundJob(job, req) {
  if (job?.job_type === JOB_TYPE_STORAGE_MIGRATION) {
    return executeStorageMigrationJob(job, req);
  }
  throw new Error(`Unsupported job type: ${job?.job_type || "unknown"}`);
}

async function processQueuedJobs(req, { limit = 1 } = {}) {
  const maxJobs = Math.max(1, Math.min(20, Number(limit || 1) || 1));
  const queuedJobs = await db.jobs.find(
    { status: JOB_STATUS_QUEUED },
    { _id: 0 },
    { sort: { run_after: 1 }, limit: maxJobs * 5 },
  );

  let processedCount = 0;
  let completedCount = 0;
  let failedCount = 0;
  const summaries = [];
  const nowMs = Date.now();

  for (const job of queuedJobs) {
    if (processedCount >= maxJobs) break;
    const dueAt = parseDate(job.run_after)?.getTime() || 0;
    if (dueAt > nowMs) {
      continue;
    }

    processedCount += 1;
    await db.jobs.updateOne(
      { job_id: job.job_id },
      {
        $set: {
          status: JOB_STATUS_RUNNING,
          started_at: isoNow(),
          updated_at: isoNow(),
          last_error: null,
        },
      },
    );

    const runningJob = await db.jobs.findOne({ job_id: job.job_id }, { _id: 0 });
    try {
      const result = await executeBackgroundJob(runningJob, req);
      await db.jobs.updateOne(
        { job_id: job.job_id },
        {
          $set: {
            status: JOB_STATUS_COMPLETED,
            progress: 100,
            result,
            finished_at: isoNow(),
            updated_at: isoNow(),
          },
        },
      );
      completedCount += 1;
    } catch (error) {
      const attempts = Number(runningJob?.attempts || 0) + 1;
      await db.jobs.updateOne(
        { job_id: job.job_id },
        {
          $set: {
            status: JOB_STATUS_FAILED,
            attempts,
            last_error: String(error?.message || "Job failed").slice(0, 600),
            finished_at: isoNow(),
            updated_at: isoNow(),
          },
        },
      );
      failedCount += 1;
    }

    const summary = await db.jobs.findOne({ job_id: job.job_id }, { _id: 0 });
    summaries.push(getJobSummary(summary));
  }

  return {
    processed: processedCount,
    completed: completedCount,
    failed: failedCount,
    jobs: summaries.filter(Boolean),
  };
}

async function getOperationsHealthSummary() {
  let databaseStatus = {
    status: "healthy",
    detail: "Connected",
  };
  try {
    const pool = await db.getPool();
    await pool.query("SELECT 1");
  } catch (error) {
    databaseStatus = {
      status: "warning",
      detail: String(error?.message || "Connection check failed").slice(0, 180),
    };
  }

  const [stripeConfig, storageConfig, emailConfig, vercelConfig, localizationConfig, jobCounts] =
    await Promise.all([
      getActiveStripeConfig(),
      getActiveStorageConfig(),
      getActiveEmailDeliveryConfig(),
      getActiveVercelConfig(),
      getActiveLocalizationConfig(),
      Promise.all([
        db.jobs.countDocuments({}),
        db.jobs.countDocuments({ status: JOB_STATUS_QUEUED }),
        db.jobs.countDocuments({ status: JOB_STATUS_RUNNING }),
        db.jobs.countDocuments({ status: JOB_STATUS_COMPLETED }),
        db.jobs.countDocuments({ status: JOB_STATUS_FAILED }),
      ]),
    ]);

  const totalOverrides = Object.values(localizationConfig.manual_override_stats || {}).reduce(
    (sum, count) => sum + Number(count || 0),
    0,
  );

  return {
    generated_at: isoNow(),
    services: {
      database: databaseStatus,
      stripe: {
        status: stripeConfig.active_key ? "healthy" : "warning",
        detail: stripeConfig.active_key
          ? `${stripeConfig.mode === "live" ? "Live" : "Sandbox"} mode with ${stripeConfig.key_preview}`
          : "No active Stripe key configured",
      },
      storage: {
        status:
          storageConfig.active_provider === STORAGE_PROVIDER_WASABI
            ? storageConfig.wasabi.configured
              ? "healthy"
              : "warning"
            : "healthy",
        detail:
          storageConfig.active_provider === STORAGE_PROVIDER_WASABI
            ? storageConfig.wasabi.configured
              ? `Wasabi bucket ${storageConfig.wasabi.bucket}`
              : "Wasabi is selected but not fully configured"
            : "Supabase database storage active",
      },
      email: {
        status:
          emailConfig.custom_delivery_enabled || emailConfig.supabase.publishable_key_set
            ? "healthy"
            : "warning",
        detail: `${emailConfig.active_provider} provider active`,
      },
      domains: {
        status: vercelConfig.configured ? "healthy" : "warning",
        detail: vercelConfig.configured
          ? `Project ${vercelConfig.project_id}${vercelConfig.team_id ? ` / team ${vercelConfig.team_id}` : ""}`
          : "Vercel domain automation is not configured",
      },
      localization: {
        status: "healthy",
        detail: `${localizationConfig.enabled_languages.length} enabled languages, ${totalOverrides} manual overrides`,
      },
    },
    jobs: {
      total: jobCounts[0],
      queued: jobCounts[1],
      running: jobCounts[2],
      completed: jobCounts[3],
      failed: jobCounts[4],
    },
  };
}

async function vercelApiRequest(config, method, endpointPath, data = null) {
  if (!config?.api_token || !config?.project_id) {
    throw new HttpError(400, "Vercel domain automation is not configured");
  }

  const url = new URL(endpointPath, VERCEL_API_BASE_URL);
  if (config.team_id) {
    url.searchParams.set("teamId", config.team_id);
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${config.api_token}`,
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  let payload = null;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  try {
    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = text ? { message: text } : {};
    }
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      payload?.error ||
      `Vercel API request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload || {};
}

async function getVercelDomainDetails(config, domain) {
  return vercelApiRequest(
    config,
    "GET",
    `/v9/projects/${encodeURIComponent(config.project_id)}/domains/${encodeURIComponent(domain)}`,
  );
}

async function ensureDomainAttachedOnVercel(config, domain) {
  if (!config?.configured) {
    return {
      configured: false,
      attached: false,
      verified: false,
      status: "not_configured",
      error: null,
      details: null,
    };
  }
  if (!config.auto_attach) {
    return {
      configured: true,
      attached: false,
      verified: false,
      status: "disabled",
      error: null,
      details: null,
    };
  }

  try {
    await vercelApiRequest(
      config,
      "POST",
      `/v10/projects/${encodeURIComponent(config.project_id)}/domains`,
      { name: domain },
    );
  } catch (error) {
    if (!isVercelDomainConflictError(error)) {
      return {
        configured: true,
        attached: false,
        verified: false,
        status: "error",
        error: error?.message || "Failed to attach domain in Vercel",
        details: error?.payload || null,
      };
    }
  }

  try {
    const details = await getVercelDomainDetails(config, domain);
    const verified = Boolean(details?.verified);
    const status = verified ? "verified" : "pending";
    return {
      configured: true,
      attached: true,
      verified,
      status,
      error: details?.misconfigured ? "Domain is misconfigured in Vercel" : null,
      details,
    };
  } catch (error) {
    return {
      configured: true,
      attached: true,
      verified: false,
      status: "unknown",
      error: error?.message || "Failed to fetch Vercel domain details",
      details: error?.payload || null,
    };
  }
}

async function verifyDomainOnVercel(config, domain) {
  const attached = await ensureDomainAttachedOnVercel(config, domain);
  if (!attached.configured || !attached.attached) {
    return attached;
  }

  let verifyError = null;
  try {
    await vercelApiRequest(
      config,
      "POST",
      `/v9/projects/${encodeURIComponent(config.project_id)}/domains/${encodeURIComponent(domain)}/verify`,
      {},
    );
  } catch (error) {
    verifyError = error?.message || "Vercel verify API call failed";
  }

  try {
    const details = await getVercelDomainDetails(config, domain);
    const verified = Boolean(details?.verified);
    return {
      configured: true,
      attached: true,
      verified,
      status: verified ? "verified" : "pending",
      error:
        verifyError ||
        (details?.misconfigured ? "Domain is misconfigured in Vercel" : null),
      details,
    };
  } catch (error) {
    return {
      configured: true,
      attached: true,
      verified: false,
      status: "unknown",
      error: verifyError || error?.message || "Failed to refresh Vercel domain status",
      details: error?.payload || null,
    };
  }
}

function normalizeStorageProvider(provider) {
  const candidate = String(provider || "").trim();
  if (!VALID_STORAGE_PROVIDERS.includes(candidate)) {
    return STORAGE_PROVIDER_SUPABASE;
  }
  return candidate;
}

function isConfiguredSuperAdminEmail(email) {
  return SUPER_ADMIN_EMAILS.includes(String(email || "").trim().toLowerCase());
}

function isSuperAdminUser(user) {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  return isConfiguredSuperAdminEmail(user.email);
}

function isAdminRole(role) {
  return role === "admin" || role === "super_admin";
}

function getRoleRank(role) {
  return ROLE_RANKS[String(role || "").trim()] ?? 0;
}

function hasRequiredRole(userRole, requiredRole) {
  return getRoleRank(userRole) >= getRoleRank(requiredRole);
}

function normalizeTeamRole(value, fallback = TEAM_ROLE_MEMBER) {
  const candidate = String(value || "").trim().toLowerCase();
  if (VALID_TEAM_ROLES.includes(candidate)) {
    return candidate;
  }
  return fallback;
}

function getTeamRoleDefinition(role) {
  return TEAM_ROLE_DEFINITIONS[normalizeTeamRole(role, TEAM_ROLE_MEMBER)];
}

function getTeamRoleRank(role) {
  return getTeamRoleDefinition(role).rank;
}

function hasWorkspacePermissionForRole(role, permission) {
  return getTeamRoleDefinition(role).permissions.includes(String(permission || "").trim());
}

function buildWorkspacePermissions(role) {
  return {
    view_workspace: hasWorkspacePermissionForRole(role, "view_workspace"),
    manage_documents: hasWorkspacePermissionForRole(role, "manage_documents"),
    manage_links: hasWorkspacePermissionForRole(role, "manage_links"),
    manage_domains: hasWorkspacePermissionForRole(role, "manage_domains"),
    manage_team: hasWorkspacePermissionForRole(role, "manage_team"),
  };
}

function isTeamInvitationExpired(invitation) {
  const expiresAt = invitation?.expires_at ? parseDate(invitation.expires_at) : null;
  if (!expiresAt) return false;
  return expiresAt.getTime() <= Date.now();
}

function getRequestedWorkspaceId(req, fallbackUserId = "") {
  const headerValue = String(req.headers[WORKSPACE_HEADER_NAME] || "").trim();
  if (headerValue) return headerValue;
  const queryValue = String(req.query?.workspace_id || "").trim();
  if (queryValue) return queryValue;
  return String(fallbackUserId || "").trim();
}

function normalizeSettingsPermissionRole(value, fallback = "super_admin") {
  const candidate = String(value || "").trim();
  if (candidate === "admin" || candidate === "super_admin") {
    return candidate;
  }
  return fallback;
}

function getNormalizedSettingsPermissionsConfig(doc = {}) {
  const source = doc && typeof doc === "object" ? doc : {};
  const sourceSections =
    source.sections && typeof source.sections === "object" && !Array.isArray(source.sections)
      ? source.sections
      : {};

  const sections = SETTINGS_SECTION_KEYS.reduce((accumulator, sectionKey) => {
    const defaults = SETTINGS_SECTION_DEFINITIONS[sectionKey];
    const candidate =
      sourceSections[sectionKey] &&
      typeof sourceSections[sectionKey] === "object" &&
      !Array.isArray(sourceSections[sectionKey])
        ? sourceSections[sectionKey]
        : {};

    accumulator[sectionKey] = {
      key: sectionKey,
      label: defaults.label,
      read_role: normalizeSettingsPermissionRole(candidate.read_role, defaults.read_role),
      write_role: normalizeSettingsPermissionRole(candidate.write_role, defaults.write_role),
      setting_keys: [...defaults.setting_keys],
    };
    return accumulator;
  }, {});

  return {
    key: "settings_permissions",
    sections,
    updated_at: source.updated_at || null,
  };
}

async function getActiveSettingsPermissionsConfig() {
  const doc = await getPlatformSettingDoc("settings_permissions");
  return getNormalizedSettingsPermissionsConfig(doc);
}

function getSettingsSectionDefinition(sectionKey) {
  const normalizedKey = String(sectionKey || "").trim();
  return normalizedKey ? SETTINGS_SECTION_DEFINITIONS[normalizedKey] || null : null;
}

function canUserAccessSettingsSection(user, permissionsConfig, sectionKey, accessMode = "read") {
  const section = permissionsConfig?.sections?.[sectionKey];
  if (!user || !section) return false;
  const requiredRole = accessMode === "write" ? section.write_role : section.read_role;
  return hasRequiredRole(user.role, requiredRole);
}

async function requireSettingsSectionAccess(req, sectionKey, accessMode = "read") {
  const user = await getCurrentAdmin(req);
  const permissions = await getActiveSettingsPermissionsConfig();
  if (!permissions.sections?.[sectionKey]) {
    throw new HttpError(404, "Unknown settings section");
  }
  if (!canUserAccessSettingsSection(user, permissions, sectionKey, accessMode)) {
    throw new HttpError(403, "You do not have access to this settings section");
  }
  return {
    user,
    permissions,
    section: permissions.sections[sectionKey],
  };
}

function isPrivilegedUser(user) {
  return Boolean(user && isAdminRole(user.role));
}

function isTwoFactorEnabledForUser(user) {
  return Boolean(user?.two_factor?.enabled && user?.two_factor?.secret && isPrivilegedUser(user));
}

function assertTwoFactorEligibleUser(user) {
  if (!isPrivilegedUser(user)) {
    throw new HttpError(403, "Two-factor authentication is available for admin accounts only");
  }
}

function buildTwoFactorOtpAuthUri({ issuer, email, secret }) {
  const normalizedIssuer = String(issuer || "Secure PDF").trim() || "Secure PDF";
  const normalizedEmail = String(email || "admin").trim() || "admin";
  return `otpauth://totp/${encodeURIComponent(`${normalizedIssuer}:${normalizedEmail}`)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(normalizedIssuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_TIME_STEP_SECONDS}`;
}

async function issueTwoFactorChallenge(req, res, user, provider = "password") {
  const challengeToken = tokenUrlSafe(24);
  const expiresAt = new Date(Date.now() + TWO_FACTOR_CHALLENGE_EXPIRE_MINUTES * 60 * 1000).toISOString();
  await db.collection("two_factor_challenges").insertOne({
    challenge_id: makeId("challenge"),
    challenge_token: challengeToken,
    user_id: user.user_id,
    provider,
    used: false,
    expires_at: expiresAt,
    created_at: isoNow(),
    requested_ip: getClientIp(req),
  });

  await logAuditEvent(req, {
    eventType: "auth.two_factor_required",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "user",
    resourceId: user.user_id,
    success: true,
    message: "two_factor_challenge_created",
    metadata: {
      provider,
      expires_at: expiresAt,
    },
  });

  sendJson(res, 200, {
    requires_2fa: true,
    challenge_token: challengeToken,
    challenge_expires_at: expiresAt,
    email: user.email,
    role: user.role,
  });
}

async function ensureSuperAdminRole(user) {
  if (!user) return user;
  if (!isConfiguredSuperAdminEmail(user.email)) return user;
  if (
    user.role === "super_admin" &&
    user.plan === "enterprise" &&
    user.subscription_status === "active"
  ) {
    return user;
  }
  await db.users.updateOne(
    { user_id: user.user_id },
    {
      $set: {
        role: "super_admin",
        plan: "enterprise",
        subscription_status: "active",
      },
    },
  );
  return {
    ...user,
    role: "super_admin",
    plan: "enterprise",
    subscription_status: "active",
  };
}

async function getActiveStorageConfig() {
  const doc = await db.platform_settings.findOne({ key: "storage" }, { _id: 0 });

  const activeProvider = normalizeStorageProvider(
    doc?.active_provider || DEFAULT_STORAGE_PROVIDER,
  );

  const wasabi = {
    endpoint: String(doc?.wasabi_endpoint || WASABI_ENDPOINT || "").trim(),
    region: String(doc?.wasabi_region || WASABI_REGION || "us-east-1").trim(),
    bucket: String(doc?.wasabi_bucket || WASABI_BUCKET || "").trim(),
    access_key_id: String(doc?.wasabi_access_key_id || WASABI_ACCESS_KEY_ID || "").trim(),
    secret_access_key: String(
      doc?.wasabi_secret_access_key || WASABI_SECRET_ACCESS_KEY || "",
    ).trim(),
    force_path_style:
      doc?.wasabi_force_path_style !== undefined
        ? Boolean(doc.wasabi_force_path_style)
        : WASABI_FORCE_PATH_STYLE,
  };

  const wasabiConfigured = Boolean(
    wasabi.endpoint && wasabi.region && wasabi.bucket && wasabi.access_key_id && wasabi.secret_access_key,
  );

  return {
    key: "storage",
    active_provider: activeProvider,
    providers: VALID_STORAGE_PROVIDERS,
    wasabi: {
      endpoint: wasabi.endpoint,
      region: wasabi.region,
      bucket: wasabi.bucket,
      force_path_style: wasabi.force_path_style,
      configured: wasabiConfigured,
      access_key_preview: maskSecret(wasabi.access_key_id),
      secret_key_preview: maskSecret(wasabi.secret_access_key),
      access_key_set: Boolean(wasabi.access_key_id),
      secret_key_set: Boolean(wasabi.secret_access_key),
      access_key_id: wasabi.access_key_id,
      secret_access_key: wasabi.secret_access_key,
    },
  };
}

async function getActiveAdminEmailDeliveryConfig(req = null) {
  const config = await getActiveEmailDeliveryConfig();
  const gmailStartUrl = req
    ? `${buildPublicBaseUrl(req)}/api/admin/settings/email-delivery/gmail/start`
    : "";
  const outlookStartUrl = req
    ? `${buildPublicBaseUrl(req)}/api/admin/settings/email-delivery/outlook/start`
    : "";
  return {
    key: "email_delivery",
    requested_provider: config.requested_provider,
    active_provider: config.active_provider,
    custom_delivery_enabled: config.custom_delivery_enabled,
    available_providers: config.available_providers,
    gmail: {
      email: config.gmail.email,
      from_email: config.gmail.from_email,
      from_name: config.gmail.from_name,
      reply_to: config.gmail.reply_to,
      force_return_path: config.gmail.force_return_path,
      connected: config.gmail.connected,
      configured: config.gmail.configured,
      oauth_start_url: gmailStartUrl,
      oauth_callback_url: req ? buildEmailDeliveryCallbackUrl(req, "gmail") : "",
      client_id_set: config.gmail.client_id_set,
      client_secret_set: config.gmail.client_secret_set,
      refresh_token_set: config.gmail.refresh_token_set,
      token_scope: config.gmail.token_scope,
      connected_at: config.gmail.connected_at,
      email_preview: config.gmail.email_preview,
    },
    mailgun: {
      domain: config.mailgun.domain,
      region: config.mailgun.region,
      from_email: config.mailgun.from_email,
      from_name: config.mailgun.from_name,
      reply_to: config.mailgun.reply_to,
      force_return_path: config.mailgun.force_return_path,
      configured: config.mailgun.configured,
      api_key_set: config.mailgun.api_key_set,
      api_key_preview: config.mailgun.api_key_preview,
    },
    outlook: {
      tenant_id: config.outlook.tenant_id,
      email: config.outlook.email,
      from_email: config.outlook.from_email,
      from_name: config.outlook.from_name,
      reply_to: config.outlook.reply_to,
      save_to_sent_items: config.outlook.save_to_sent_items,
      connected: config.outlook.connected,
      configured: config.outlook.configured,
      oauth_start_url: outlookStartUrl,
      oauth_callback_url: req ? buildEmailDeliveryCallbackUrl(req, "outlook") : "",
      client_id_set: config.outlook.client_id_set,
      client_secret_set: config.outlook.client_secret_set,
      refresh_token_set: config.outlook.refresh_token_set,
      connected_at: config.outlook.connected_at,
      email_preview: config.outlook.email_preview,
    },
    smtp: {
      host: config.smtp.host,
      port: config.smtp.port,
      encryption: config.smtp.encryption,
      secure: config.smtp.secure,
      require_tls: config.smtp.require_tls,
      auth_enabled: config.smtp.auth_enabled,
      from_email: config.smtp.from_email,
      from_name: config.smtp.from_name,
      reply_to: config.smtp.reply_to,
      force_return_path: config.smtp.force_return_path,
      configured: config.smtp.configured,
      auth_configured: config.smtp.auth_configured,
      username_set: config.smtp.username_set,
      password_set: config.smtp.password_set,
      username_preview: config.smtp.username_preview,
      password_preview: config.smtp.password_preview,
    },
    resend: config.resend,
    supabase: config.supabase,
  };
}

function sanitizeOptionalHost(value, fieldName) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length > 255) {
    throw new HttpError(400, `${fieldName} must be 255 characters or fewer`);
  }
  return text;
}

function sanitizeOptionalEmailValue(value, fieldName) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return normalizeEmailAddress(text, fieldName);
}

function sanitizeOptionalEmailProviderText(value, fieldName, maxLength = 160) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length > maxLength) {
    throw new HttpError(400, `${fieldName} must be ${maxLength} characters or fewer`);
  }
  return text;
}

function sanitizeOptionalMailgunDomain(value, fieldName) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "";
  return normalizeDnsHost(text);
}

function sanitizeBrandingString(value, fieldName, maxLength) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new HttpError(400, `${fieldName} cannot be empty`);
  }
  if (text.length > maxLength) {
    throw new HttpError(400, `${fieldName} must be ${maxLength} characters or fewer`);
  }
  return text;
}

function sanitizeBrandingColor(value, fieldName) {
  const text = String(value ?? "").trim();
  if (!HEX_COLOR_RE.test(text)) {
    throw new HttpError(400, `${fieldName} must be a hex color like #064e3b`);
  }
  return text.toLowerCase();
}

function sanitizeLocalizationTimezone(value, fieldName = "site_timezone") {
  const timezone = String(value ?? "").trim();
  if (!timezone) {
    return DEFAULT_LOCALIZATION_TIMEZONE;
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new HttpError(400, `${fieldName} must be a valid IANA timezone`);
  }
  return timezone;
}

function sanitizeLocalizationCurrency(value, fieldName = "site_currency") {
  const currency = String(value ?? "").trim().toUpperCase();
  if (!currency) {
    return DEFAULT_LOCALIZATION_CURRENCY;
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new HttpError(400, `${fieldName} must be a 3-letter currency code like EUR`);
  }
  return currency;
}

function sanitizeEnabledLanguages(value, defaultLanguage = DEFAULT_PLATFORM_LANGUAGE) {
  const requested = Array.isArray(value) ? value : [];
  const seen = new Set();
  const enabled = [];

  for (const entry of requested) {
    const code = String(entry || "").trim();
    if (!VALID_LANGUAGES.includes(code) || seen.has(code)) {
      continue;
    }
    seen.add(code);
    enabled.push(code);
  }

  if (!enabled.length) {
    return [defaultLanguage];
  }
  if (!seen.has(defaultLanguage)) {
    enabled.unshift(defaultLanguage);
  }
  return enabled;
}

function sanitizeLocalizationManualOverrides(value) {
  if (value === undefined || value === null) {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "manual_overrides must be an object keyed by language code");
  }

  const sanitized = {};
  for (const [languageCode, overrides] of Object.entries(value)) {
    const lang = String(languageCode || "").trim();
    if (!VALID_LANGUAGES.includes(lang)) {
      continue;
    }
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
      throw new HttpError(400, `manual_overrides.${lang} must be an object`);
    }

    const sanitizedLanguageOverrides = {};
    for (const [path, rawText] of Object.entries(overrides)) {
      const normalizedPath = String(path || "").trim();
      if (!TRANSLATION_OVERRIDE_PATH_RE.test(normalizedPath)) {
        throw new HttpError(400, `manual_overrides.${lang} contains an invalid translation path`);
      }
      const text = String(rawText ?? "").trim();
      if (!text) {
        continue;
      }
      if (text.length > 4000) {
        throw new HttpError(400, `manual_overrides.${lang}.${normalizedPath} must be 4000 characters or fewer`);
      }
      sanitizedLanguageOverrides[normalizedPath] = text;
    }

    if (Object.keys(sanitizedLanguageOverrides).length) {
      sanitized[lang] = sanitizedLanguageOverrides;
    }
  }

  return sanitized;
}

function getNormalizedBrandingConfig(doc) {
  const source = doc || {};
  const appName = String(source.app_name || "").trim();
  const productName = String(source.product_name || "").trim();
  const tagline = String(source.tagline || "").trim();
  const footerText = String(source.footer_text || "").trim();
  const primaryColor = String(source.primary_color || "").trim();
  const accentColor = String(source.accent_color || "").trim();

  return {
    key: "branding",
    app_name: appName || DEFAULT_BRANDING_SETTINGS.app_name,
    product_name: productName || DEFAULT_BRANDING_SETTINGS.product_name,
    tagline: tagline || DEFAULT_BRANDING_SETTINGS.tagline,
    primary_color: HEX_COLOR_RE.test(primaryColor)
      ? primaryColor.toLowerCase()
      : DEFAULT_BRANDING_SETTINGS.primary_color,
    accent_color: HEX_COLOR_RE.test(accentColor)
      ? accentColor.toLowerCase()
      : DEFAULT_BRANDING_SETTINGS.accent_color,
    footer_text: footerText || DEFAULT_BRANDING_SETTINGS.footer_text,
    updated_at: source.updated_at || null,
  };
}

function getNormalizedLocalizationConfig(doc) {
  const source = doc || {};
  const candidate = String(source.default_language || "").trim();
  const defaultLanguage = VALID_LANGUAGES.includes(candidate)
    ? candidate
    : DEFAULT_PLATFORM_LANGUAGE;
  const enabledLanguages = sanitizeEnabledLanguages(source.enabled_languages, defaultLanguage);
  const manualOverrides = sanitizeLocalizationManualOverrides(source.manual_overrides || {});
  let siteTimezone = DEFAULT_LOCALIZATION_TIMEZONE;
  let siteCurrency = DEFAULT_LOCALIZATION_CURRENCY;
  try {
    siteTimezone = sanitizeLocalizationTimezone(source.site_timezone);
  } catch {
    siteTimezone = DEFAULT_LOCALIZATION_TIMEZONE;
  }
  try {
    siteCurrency = sanitizeLocalizationCurrency(source.site_currency);
  } catch {
    siteCurrency = DEFAULT_LOCALIZATION_CURRENCY;
  }
  const manualOverrideStats = Object.fromEntries(
    VALID_LANGUAGES.map((languageCode) => [
      languageCode,
      Object.keys(manualOverrides?.[languageCode] || {}).length,
    ]),
  );
  return {
    key: "localization",
    default_language: defaultLanguage,
    available_languages: [...VALID_LANGUAGES],
    enabled_languages: enabledLanguages,
    automatic_detection: Boolean(source.automatic_detection),
    site_timezone: siteTimezone,
    site_currency: siteCurrency,
    manual_overrides: manualOverrides,
    manual_override_stats: manualOverrideStats,
    updated_at: source.updated_at || null,
  };
}

async function getActiveLocalizationConfig() {
  const doc = await getPlatformSettingDoc("localization");
  return getNormalizedLocalizationConfig(doc);
}

async function getPlatformDefaultLanguage() {
  const config = await getActiveLocalizationConfig();
  return config.default_language || DEFAULT_PLATFORM_LANGUAGE;
}

async function getActiveBrandingConfig() {
  const doc = await getPlatformSettingDoc("branding");
  return getNormalizedBrandingConfig(doc);
}

function getNormalizedPublicSiteConfig(doc) {
  const source = doc || {};
  return {
    key: "public_site",
    about_url: String(source.about_url || "").trim() || DEFAULT_PUBLIC_SITE_SETTINGS.about_url,
    contact_url: String(source.contact_url || "").trim() || DEFAULT_PUBLIC_SITE_SETTINGS.contact_url,
    blog_url: String(source.blog_url || "").trim() || DEFAULT_PUBLIC_SITE_SETTINGS.blog_url,
    privacy_url: String(source.privacy_url || "").trim() || DEFAULT_PUBLIC_SITE_SETTINGS.privacy_url,
    terms_url: String(source.terms_url || "").trim() || DEFAULT_PUBLIC_SITE_SETTINGS.terms_url,
    gdpr_url: String(source.gdpr_url || "").trim() || DEFAULT_PUBLIC_SITE_SETTINGS.gdpr_url,
    auth_portal_url:
      String(source.auth_portal_url || "").trim() || DEFAULT_PUBLIC_SITE_SETTINGS.auth_portal_url,
    updated_at: source.updated_at || null,
  };
}

async function getActivePublicSiteConfig() {
  const doc = await getPlatformSettingDoc("public_site");
  return getNormalizedPublicSiteConfig(doc);
}

function sanitizeOptionalUrlSetting(
  value,
  fieldName,
  { allowRelativePath = false, allowEmpty = true } = {},
) {
  return sanitizeSeoUrlOrPath(value, fieldName, { allowRelativePath, allowEmpty });
}

function sanitizePlanText(value, fieldName, maxLength, { allowEmpty = false } = {}) {
  const text = String(value ?? "").trim();
  if (!text) {
    if (allowEmpty) return "";
    throw new HttpError(400, `${fieldName} cannot be empty`);
  }
  if (text.length > maxLength) {
    throw new HttpError(400, `${fieldName} must be ${maxLength} characters or fewer`);
  }
  return text;
}

function sanitizePlanNumber(value, fieldName, { min = 0, max = 1000000, decimals = 0 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, `${fieldName} must be a valid number`);
  }
  if (parsed < min || parsed > max) {
    throw new HttpError(400, `${fieldName} must be between ${min} and ${max}`);
  }
  const factor = 10 ** Math.max(0, decimals);
  return Math.round(parsed * factor) / factor;
}

function sanitizePlanFeatures(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new HttpError(400, `${fieldName} must be an array`);
  }
  const normalized = value
    .map((item) => sanitizePlanText(item, fieldName, 120, { allowEmpty: false }))
    .filter(Boolean);
  if (normalized.length === 0) {
    throw new HttpError(400, `${fieldName} must include at least one feature`);
  }
  if (normalized.length > 12) {
    throw new HttpError(400, `${fieldName} must include 12 features or fewer`);
  }
  return normalized;
}

function getNormalizedSubscriptionPlansConfig(doc) {
  const source = doc || {};
  const sourcePlans = source.plans && typeof source.plans === "object" ? source.plans : {};
  const currency = normalizeCurrencyCode(source.currency || DEFAULT_SUBSCRIPTION_PLAN_SETTINGS.currency, "eur");
  const interval = String(source.interval || DEFAULT_SUBSCRIPTION_PLAN_SETTINGS.interval).trim().toLowerCase() === "year"
    ? "year"
    : "month";
  const plans = {};

  const planIds = getConfiguredSubscriptionPlanIds(sourcePlans);
  for (const [index, planId] of planIds.entries()) {
    const defaults = DEFAULT_SUBSCRIPTION_PLANS[planId] || getGenericDefaultSubscriptionPlan(planId, index);
    const candidate = sourcePlans[planId] && typeof sourcePlans[planId] === "object"
      ? sourcePlans[planId]
      : {};
    const features = Array.isArray(candidate.features)
      ? candidate.features
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .slice(0, 12)
      : defaults.features;

    plans[planId] = {
      plan_id: planId,
      name: String(candidate.name || "").trim() || defaults.name,
      description: String(candidate.description || "").trim() || defaults.description,
      badge: String(candidate.badge || "").trim() || defaults.badge,
      price: Number.isFinite(Number(candidate.price)) ? Number(candidate.price) : defaults.price,
      storage_mb: Number.isFinite(Number(candidate.storage_mb))
        ? Number(candidate.storage_mb)
        : defaults.storage_mb,
      links_per_month: Number.isFinite(Number(candidate.links_per_month))
        ? Number(candidate.links_per_month)
        : defaults.links_per_month,
      featured: candidate.featured !== undefined ? Boolean(candidate.featured) : defaults.featured,
      active: candidate.active !== undefined ? Boolean(candidate.active) : defaults.active,
      public_visible:
        candidate.public_visible !== undefined
          ? Boolean(candidate.public_visible)
          : defaults.public_visible,
      sort_order: Number.isFinite(Number(candidate.sort_order))
        ? Number(candidate.sort_order)
        : defaults.sort_order,
      features: features.length > 0 ? features : defaults.features,
    };
  }

  return {
    key: "subscription_plans",
    currency,
    interval,
    plans,
    updated_at: source.updated_at || null,
  };
}

async function getActiveSubscriptionPlansConfig() {
  const doc = await getPlatformSettingDoc("subscription_plans");
  return getNormalizedSubscriptionPlansConfig(doc);
}

async function getSubscriptionPlanDefinition(planId, { requireActive = false } = {}) {
  const normalizedPlanId = String(planId || "").trim();
  if (!normalizedPlanId || normalizedPlanId === "none") return null;
  const config = await getActiveSubscriptionPlansConfig();
  const plan = config.plans[normalizedPlanId];
  if (!plan) return null;
  if (requireActive && !plan.active) return null;
  return {
    ...plan,
    currency: config.currency,
    interval: config.interval,
  };
}

async function getFallbackSubscriptionPlanDefinition() {
  const config = await getActiveSubscriptionPlansConfig();
  const fallbackEntry =
    sortSubscriptionPlanEntries(config.plans).find(([, plan]) => plan?.active !== false) ||
    sortSubscriptionPlanEntries(config.plans)[0] ||
    ["basic", DEFAULT_SUBSCRIPTION_PLANS.basic];
  return {
    ...(fallbackEntry[1] || DEFAULT_SUBSCRIPTION_PLANS.basic),
    currency: config.currency,
    interval: config.interval,
  };
}

function sanitizeSeoText(value, fieldName, maxLength) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new HttpError(400, `${fieldName} cannot be empty`);
  }
  if (text.length > maxLength) {
    throw new HttpError(400, `${fieldName} must be ${maxLength} characters or fewer`);
  }
  return text;
}

function sanitizeSeoUrlOrPath(
  value,
  fieldName,
  { allowRelativePath = true, allowEmpty = false } = {},
) {
  const text = String(value ?? "").trim();
  if (!text) {
    if (allowEmpty) return "";
    throw new HttpError(400, `${fieldName} cannot be empty`);
  }
  if (allowRelativePath && text.startsWith("/")) {
    return text;
  }
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new HttpError(400, `${fieldName} must be a valid URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpError(400, `${fieldName} must use http or https`);
  }
  if (!allowRelativePath) {
    return parsed.toString().replace(/\/$/, "");
  }
  return parsed.toString();
}

async function getActiveSeoConfig() {
  const [seoDoc, brandingDoc] = await Promise.all([
    getPlatformSettingDoc("seo"),
    getPlatformSettingDoc("branding"),
  ]);
  return normalizeSeoConfig(seoDoc, brandingDoc);
}

function normalizeCurrencyCode(value, fallback = "eur") {
  const currency = String(value || "").trim().toLowerCase();
  if (!currency) return fallback;
  return currency.slice(0, 3);
}

function amountFromStripeMinor(minorUnits, fallback = 0) {
  const raw = Number(minorUnits);
  if (Number.isNaN(raw)) return Number(fallback || 0);
  return raw / 100;
}

function fromStripeTimestampToIso(value) {
  const stamp = Number(value);
  if (!Number.isFinite(stamp) || stamp <= 0) return null;
  return new Date(stamp * 1000).toISOString();
}

function formatMoney(amount, currency = "eur") {
  const safeAmount = Number(amount || 0);
  const safeCurrency = normalizeCurrencyCode(currency, "eur");
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: safeCurrency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    return `${safeAmount.toFixed(2)} ${safeCurrency.toUpperCase()}`;
  }
}

function formatDateTime(value) {
  const parsed = parseDate(value);
  if (!parsed) return "N/A";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsed);
  } catch {
    return parsed.toISOString();
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getNormalizedInvoiceTemplateConfig(doc) {
  const source = doc || {};
  const primaryColor = String(source.primary_color || "").trim();
  const accentColor = String(source.accent_color || "").trim();
  return {
    key: "invoice_template",
    company_name: String(source.company_name || "").trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.company_name,
    company_address:
      String(source.company_address || "").trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.company_address,
    company_email: String(source.company_email || "").trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.company_email,
    company_phone: String(source.company_phone || "").trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.company_phone,
    company_website:
      String(source.company_website || "").trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.company_website,
    tax_label: String(source.tax_label || "").trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.tax_label,
    tax_id: String(source.tax_id || "").trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.tax_id,
    invoice_prefix:
      String(source.invoice_prefix || "").trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.invoice_prefix,
    notes: String(source.notes || "").trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.notes,
    terms: String(source.terms || "").trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.terms,
    footer_text: String(source.footer_text || "").trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.footer_text,
    primary_color: HEX_COLOR_RE.test(primaryColor)
      ? primaryColor.toLowerCase()
      : DEFAULT_INVOICE_TEMPLATE_SETTINGS.primary_color,
    accent_color: HEX_COLOR_RE.test(accentColor)
      ? accentColor.toLowerCase()
      : DEFAULT_INVOICE_TEMPLATE_SETTINGS.accent_color,
    logo_url: String(source.logo_url || "").trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.logo_url,
    show_logo:
      source.show_logo !== undefined
        ? Boolean(source.show_logo)
        : DEFAULT_INVOICE_TEMPLATE_SETTINGS.show_logo,
    updated_at: source.updated_at || null,
  };
}

async function getActiveInvoiceTemplateConfig() {
  const doc = await getPlatformSettingDoc("invoice_template");
  return getNormalizedInvoiceTemplateConfig(doc);
}

function getNormalizedAuthEmailTemplateConfig(source = {}) {
  const safeSource = source && typeof source === "object" ? source : {};
  return {
    key: "auth_email_template",
    verify_email_subject:
      String(safeSource.verify_email_subject || "").trim() || DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.verify_email_subject,
    verify_email_preview_text:
      String(safeSource.verify_email_preview_text || "").trim() || DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.verify_email_preview_text,
    verify_email_heading:
      String(safeSource.verify_email_heading || "").trim() || DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.verify_email_heading,
    verify_email_body:
      String(safeSource.verify_email_body || "").trim() || DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.verify_email_body,
    verify_email_button_label:
      String(safeSource.verify_email_button_label || "").trim() || DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.verify_email_button_label,
    verify_email_expiry_notice:
      String(safeSource.verify_email_expiry_notice || "").trim() || DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.verify_email_expiry_notice,
    verify_email_footer:
      String(safeSource.verify_email_footer || "").trim() || DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.verify_email_footer,
    password_reset_subject:
      String(safeSource.password_reset_subject || "").trim() || DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.password_reset_subject,
    password_reset_preview_text:
      String(safeSource.password_reset_preview_text || "").trim() || DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.password_reset_preview_text,
    password_reset_heading:
      String(safeSource.password_reset_heading || "").trim() || DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.password_reset_heading,
    password_reset_body:
      String(safeSource.password_reset_body || "").trim() || DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.password_reset_body,
    password_reset_button_label:
      String(safeSource.password_reset_button_label || "").trim() || DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.password_reset_button_label,
    password_reset_expiry_notice:
      String(safeSource.password_reset_expiry_notice || "").trim() || DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.password_reset_expiry_notice,
    password_reset_footer:
      String(safeSource.password_reset_footer || "").trim() || DEFAULT_AUTH_EMAIL_TEMPLATE_SETTINGS.password_reset_footer,
    updated_at: safeSource.updated_at || null,
  };
}

async function getActiveAuthEmailTemplateConfig() {
  const doc = await getPlatformSettingDoc("auth_email_template");
  return getNormalizedAuthEmailTemplateConfig(doc);
}

function sanitizeAuthEmailTemplateText(value, fieldName, maxLength, { allowEmpty = false } = {}) {
  const text = String(value ?? "").trim();
  if (!text) {
    if (allowEmpty) return "";
    throw new HttpError(400, `${fieldName} cannot be empty`);
  }
  if (text.length > maxLength) {
    throw new HttpError(400, `${fieldName} must be ${maxLength} characters or fewer`);
  }
  return text;
}

function interpolateEmailTemplateText(template, variables = {}) {
  return String(template || "").replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, rawKey) => {
    const key = String(rawKey || "").trim().toLowerCase();
    const value = variables[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

function renderEmailTemplateParagraphs(template, variables = {}) {
  const resolved = interpolateEmailTemplateText(template, variables).trim();
  if (!resolved) return "";

  return resolved
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px 0;">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function renderActionEmailHtml({
  branding,
  previewText,
  heading,
  body,
  buttonLabel,
  actionUrl,
  expiryNotice,
  footer,
  variables,
}) {
  const brandName = escapeHtml(branding?.app_name || DEFAULT_BRANDING_SETTINGS.app_name);
  const tagline = escapeHtml(branding?.tagline || DEFAULT_BRANDING_SETTINGS.tagline);
  const primaryColor = escapeHtml(branding?.primary_color || DEFAULT_BRANDING_SETTINGS.primary_color);
  const accentColor = escapeHtml(branding?.accent_color || DEFAULT_BRANDING_SETTINGS.accent_color);
  const resolvedPreview = escapeHtml(interpolateEmailTemplateText(previewText, variables));
  const resolvedHeading = escapeHtml(interpolateEmailTemplateText(heading, variables));
  const resolvedExpiry = escapeHtml(interpolateEmailTemplateText(expiryNotice, variables));
  const resolvedFooter = escapeHtml(interpolateEmailTemplateText(footer, variables));
  const resolvedButtonLabel = escapeHtml(interpolateEmailTemplateText(buttonLabel, variables));
  const safeActionUrl = escapeHtml(actionUrl);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <title>${resolvedHeading || brandName}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,sans-serif;color:#1c1917;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${resolvedPreview}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #e7e5e4;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 24px 32px;background:linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%);color:#ffffff;">
                <div style="font-size:14px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;margin-bottom:12px;">${brandName}</div>
                <div style="font-size:30px;line-height:1.2;font-weight:700;margin:0 0 8px 0;">${resolvedHeading}</div>
                <div style="font-size:15px;line-height:1.6;opacity:0.92;">${tagline}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <div style="font-size:16px;line-height:1.7;color:#292524;">${renderEmailTemplateParagraphs(body, variables)}</div>
                <div style="margin:28px 0;">
                  <a href="${safeActionUrl}" style="display:inline-block;background:${primaryColor};color:#ffffff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:999px;">${resolvedButtonLabel}</a>
                </div>
                <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#57534e;">${resolvedExpiry}</p>
                <div style="padding:16px;border:1px solid #e7e5e4;border-radius:16px;background:#fafaf9;">
                  <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#57534e;">If the button does not work, copy and paste this secure link into your browser:</p>
                  <p style="margin:0;font-size:13px;line-height:1.7;word-break:break-all;"><a href="${safeActionUrl}" style="color:${primaryColor};text-decoration:none;">${safeActionUrl}</a></p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px 32px;">
                <div style="padding-top:20px;border-top:1px solid #e7e5e4;font-size:13px;line-height:1.7;color:#78716c;">
                  ${resolvedFooter}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function sanitizeInvoiceTemplateText(value, fieldName, maxLength, { allowEmpty = false } = {}) {
  const text = String(value ?? "").trim();
  if (!text) {
    if (allowEmpty) return "";
    throw new HttpError(400, `${fieldName} cannot be empty`);
  }
  if (text.length > maxLength) {
    throw new HttpError(400, `${fieldName} must be ${maxLength} characters or fewer`);
  }
  return text;
}

function invoiceNumberFromTransaction(template, transaction) {
  const prefix = String(template?.invoice_prefix || DEFAULT_INVOICE_TEMPLATE_SETTINGS.invoice_prefix).toUpperCase();
  const fallbackSuffix = String(transaction?.transaction_id || "unknown").slice(-8).toUpperCase();
  const stripeNumber = String(transaction?.stripe_invoice_number || "").trim();
  if (stripeNumber) {
    return `${prefix}-${stripeNumber.replace(/\s+/g, "-")}`;
  }
  return `${prefix}-${fallbackSuffix}`;
}

function renderInvoiceHtml({ template, transaction, user, planInfo }) {
  const invoiceNumber = escapeHtml(invoiceNumberFromTransaction(template, transaction));
  const amount = Number(transaction?.amount || 0);
  const currency = normalizeCurrencyCode(transaction?.currency || "eur", "eur");
  const subtotal = Number(transaction?.amount_subtotal ?? amount);
  const taxAmount = Number(transaction?.amount_tax || Math.max(amount - subtotal, 0));
  const issuedAt = transaction?.paid_at || transaction?.created_at || isoNow();
  const dueAt = transaction?.period_end || user?.subscription_expires_at || issuedAt;

  const safePlanName =
    planInfo?.name || String(transaction?.plan || user?.plan || "Subscription").replace(/^\w/, (c) => c.toUpperCase());
  const companyName = escapeHtml(template.company_name);
  const logoSection =
    template.show_logo && template.logo_url
      ? `<img src="${escapeHtml(template.logo_url)}" alt="${companyName} logo" style="max-height:52px;max-width:220px;object-fit:contain;" />`
      : `<div style="font-size:24px;font-weight:700;color:${escapeHtml(template.primary_color)};">${companyName}</div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Invoice ${invoiceNumber}</title>
    <style>
      :root {
        --invoice-primary: ${escapeHtml(template.primary_color)};
        --invoice-accent: ${escapeHtml(template.accent_color)};
      }
      body { margin: 0; padding: 28px; background: #f8fafc; font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; }
      .sheet { max-width: 860px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; }
      .header { padding: 28px; background: linear-gradient(135deg, var(--invoice-primary), var(--invoice-accent)); color: #ffffff; }
      .header-grid { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
      .title { font-size: 30px; font-weight: 700; margin: 14px 0 6px; letter-spacing: .4px; }
      .subtitle { font-size: 13px; opacity: 0.95; margin: 0; }
      .content { padding: 28px; }
      .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 18px; }
      .meta-box { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; background: #f8fafc; }
      .meta-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin-bottom: 5px; }
      .meta-value { font-size: 14px; font-weight: 600; color: #0f172a; word-break: break-word; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #475569; border-bottom: 1px solid #e2e8f0; padding: 10px 8px; }
      td { border-bottom: 1px solid #f1f5f9; padding: 12px 8px; font-size: 14px; color: #1e293b; vertical-align: top; }
      td.num, th.num { text-align: right; white-space: nowrap; }
      .totals { margin-top: 16px; display: flex; justify-content: flex-end; }
      .totals table { width: 320px; }
      .totals td { border: none; padding: 5px 0; }
      .totals .label { color: #64748b; }
      .totals .total { font-size: 18px; font-weight: 700; color: var(--invoice-primary); border-top: 1px solid #e2e8f0; padding-top: 8px; }
      .notes { margin-top: 18px; padding: 14px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; font-size: 13px; color: #334155; }
      .footer { margin-top: 16px; font-size: 12px; color: #64748b; text-align: center; }
      @media print { body { padding: 0; background: #fff; } .sheet { border: none; border-radius: 0; } }
    </style>
  </head>
  <body>
    <article class="sheet">
      <header class="header">
        <div class="header-grid">
          <div>${logoSection}<p class="title">Invoice</p><p class="subtitle">Invoice ${invoiceNumber}</p></div>
          <div style="text-align:right;font-size:12px;line-height:1.6;">
            <div><strong>${companyName}</strong></div>
            <div>${escapeHtml(template.company_address)}</div>
            <div>${escapeHtml(template.company_email)}</div>
            ${template.company_phone ? `<div>${escapeHtml(template.company_phone)}</div>` : ""}
            ${template.company_website ? `<div>${escapeHtml(template.company_website)}</div>` : ""}
            ${template.tax_id ? `<div>${escapeHtml(template.tax_label)}: ${escapeHtml(template.tax_id)}</div>` : ""}
          </div>
        </div>
      </header>
      <section class="content">
        <div class="meta-grid">
          <div class="meta-box"><div class="meta-label">Billed To</div><div class="meta-value">${escapeHtml(user?.name || "Customer")}<br/>${escapeHtml(user?.email || "N/A")}</div></div>
          <div class="meta-box"><div class="meta-label">Issued At</div><div class="meta-value">${escapeHtml(formatDateTime(issuedAt))}</div></div>
          <div class="meta-box"><div class="meta-label">Due / Renewal</div><div class="meta-value">${escapeHtml(formatDateTime(dueAt))}</div></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th class="num">Qty</th>
              <th class="num">Unit</th>
              <th class="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>${escapeHtml(safePlanName)} Plan</strong><br/>
                <span style="font-size:12px;color:#64748b;">Secure PDF subscription billing cycle</span>
              </td>
              <td class="num">1</td>
              <td class="num">${escapeHtml(formatMoney(subtotal, currency))}</td>
              <td class="num">${escapeHtml(formatMoney(subtotal, currency))}</td>
            </tr>
          </tbody>
        </table>

        <div class="totals">
          <table>
            <tbody>
              <tr><td class="label">Subtotal</td><td class="num">${escapeHtml(formatMoney(subtotal, currency))}</td></tr>
              <tr><td class="label">Tax</td><td class="num">${escapeHtml(formatMoney(taxAmount, currency))}</td></tr>
              <tr><td class="label total">Total</td><td class="num total">${escapeHtml(formatMoney(amount, currency))}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="notes">
          <p style="margin:0 0 8px;"><strong>Notes</strong></p>
          <p style="margin:0 0 10px;">${escapeHtml(template.notes)}</p>
          <p style="margin:0;"><strong>Terms:</strong> ${escapeHtml(template.terms)}</p>
        </div>
        <p class="footer">${escapeHtml(template.footer_text)}</p>
      </section>
    </article>
  </body>
</html>`;
}

function buildCustomerDisplayLines(customer = {}) {
  const lines = [];
  const primaryName = customer.company_name || customer.full_name || customer.email || "Customer";
  lines.push(primaryName);
  if (customer.full_name && customer.company_name && customer.full_name !== customer.company_name) {
    lines.push(customer.full_name);
  }
  if (customer.email) lines.push(customer.email);
  if (customer.phone) lines.push(customer.phone);
  if (customer.address_line_1) lines.push(customer.address_line_1);
  if (customer.address_line_2) lines.push(customer.address_line_2);
  const cityLine = [
    customer.city,
    customer.state,
    customer.postal_code,
  ].filter(Boolean).join(", ");
  if (cityLine) lines.push(cityLine);
  if (customer.country) lines.push(customer.country);
  if (customer.tax_id) {
    lines.push(`${customer.tax_label || "Tax ID"}: ${customer.tax_id}`);
  }
  return lines;
}

function buildInvoiceSnapshot({ transaction, user, template, planInfo }) {
  const normalizedCustomer = getNormalizedBillingProfile({
    ...(user?.billing_profile || {}),
    full_name:
      user?.billing_profile?.full_name ||
      user?.name ||
      null,
    email:
      user?.billing_profile?.email ||
      user?.email ||
      null,
  });
  const amount = Number(transaction?.amount || 0);
  const subtotal = Number(transaction?.amount_subtotal ?? amount);
  const taxAmount = Number(transaction?.amount_tax || Math.max(amount - subtotal, 0));
  const issuedAt = transaction?.paid_at || transaction?.created_at || isoNow();

  return {
    version: 1,
    invoice_number: invoiceNumberFromTransaction(template, transaction),
    generated_at: isoNow(),
    issued_at: issuedAt,
    paid_at: transaction?.paid_at || issuedAt,
    currency: normalizeCurrencyCode(transaction?.currency || "eur", "eur"),
    seller: {
      company_name: template.company_name,
      company_address: template.company_address,
      company_email: template.company_email,
      company_phone: template.company_phone,
      company_website: template.company_website,
      tax_label: template.tax_label,
      tax_id: template.tax_id,
    },
    customer: normalizedCustomer,
    line_items: [
      {
        description: `${planInfo?.name || "Subscription"} Plan`,
        note: "Secure PDF subscription billing cycle",
        quantity: 1,
        unit_amount: subtotal,
        subtotal,
      },
    ],
    totals: {
      subtotal,
      tax: taxAmount,
      total: amount,
    },
    plan_name: planInfo?.name || "Subscription",
    notes: template.notes,
    terms: template.terms,
    footer_text: template.footer_text,
    branding: {
      primary_color: template.primary_color,
      accent_color: template.accent_color,
      logo_url: template.logo_url,
      show_logo: template.show_logo,
    },
    period_start: transaction?.period_start || null,
    period_end: transaction?.period_end || null,
  };
}

function getInvoiceSnapshotFromTransaction({ transaction, user, template, planInfo }) {
  if (transaction?.invoice_snapshot && typeof transaction.invoice_snapshot === "object") {
    return transaction.invoice_snapshot;
  }
  return buildInvoiceSnapshot({ transaction, user, template, planInfo });
}

async function buildStoredInvoiceSnapshot(transaction, user) {
  const template = await getActiveInvoiceTemplateConfig();
  const planInfo = (await getSubscriptionPlanDefinition(transaction?.plan)) || {
    name: String(transaction?.plan || "Subscription"),
    price: Number(transaction?.amount || 0),
  };
  return buildInvoiceSnapshot({
    transaction,
    user,
    template,
    planInfo,
  });
}

function hexToPdfRgb(hex, fallback = "#064e3b") {
  const candidate = HEX_COLOR_RE.test(String(hex || "").trim()) ? String(hex).trim() : fallback;
  const clean = candidate.replace("#", "");
  return rgb(
    Number.parseInt(clean.slice(0, 2), 16) / 255,
    Number.parseInt(clean.slice(2, 4), 16) / 255,
    Number.parseInt(clean.slice(4, 6), 16) / 255,
  );
}

function drawWrappedPdfText(page, text, {
  x,
  y,
  maxWidth,
  font,
  size = 10,
  color = rgb(0, 0, 0),
  lineHeight = size + 4,
} = {}) {
  const content = String(text || "").trim();
  if (!content) {
    return y;
  }

  const paragraphs = content.split(/\r?\n/);
  let cursorY = y;

  for (const paragraph of paragraphs) {
    const words = String(paragraph || "").split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      cursorY -= lineHeight;
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const nextLine = `${line} ${word}`;
      if (font.widthOfTextAtSize(nextLine, size) <= maxWidth) {
        line = nextLine;
      } else {
        page.drawText(line, { x, y: cursorY, size, font, color });
        cursorY -= lineHeight;
        line = word;
      }
    }
    page.drawText(line, { x, y: cursorY, size, font, color });
    cursorY -= lineHeight;
  }

  return cursorY;
}

async function renderInvoicePdfBuffer({ snapshot, template }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 42;
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const primaryColor = hexToPdfRgb(snapshot?.branding?.primary_color || template?.primary_color);
  const accentColor = hexToPdfRgb(snapshot?.branding?.accent_color || template?.accent_color || "#10b981");
  const ink = rgb(0.10, 0.12, 0.16);
  const muted = rgb(0.38, 0.43, 0.49);
  const soft = rgb(0.95, 0.97, 0.98);

  page.drawRectangle({ x: 0, y: height - 148, width, height: 148, color: primaryColor });
  page.drawRectangle({ x: width - 180, y: height - 148, width: 180, height: 148, color: accentColor, opacity: 0.22 });

  page.drawText(snapshot?.seller?.company_name || template?.company_name || "Invoice", {
    x: margin,
    y: height - 58,
    size: 22,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Payment Invoice", {
    x: margin,
    y: height - 82,
    size: 11,
    font: fontRegular,
    color: rgb(0.92, 0.97, 0.95),
  });
  page.drawText(snapshot?.invoice_number || "INVOICE", {
    x: width - margin - fontBold.widthOfTextAtSize(snapshot?.invoice_number || "INVOICE", 16),
    y: height - 62,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(`Issued ${formatDateTime(snapshot?.issued_at)}`, {
    x: width - margin - fontRegular.widthOfTextAtSize(`Issued ${formatDateTime(snapshot?.issued_at)}`, 10),
    y: height - 84,
    size: 10,
    font: fontRegular,
    color: rgb(0.92, 0.97, 0.95),
  });

  let cursorY = height - 190;
  const sectionGap = 18;
  const halfWidth = (width - margin * 2 - 16) / 2;

  page.drawRectangle({ x: margin, y: cursorY - 126, width: halfWidth, height: 126, color: soft });
  page.drawRectangle({ x: margin + halfWidth + 16, y: cursorY - 126, width: halfWidth, height: 126, color: soft });

  page.drawText("Seller", { x: margin + 14, y: cursorY - 20, size: 10, font: fontBold, color: primaryColor });
  let nextY = cursorY - 40;
  nextY = drawWrappedPdfText(page, snapshot?.seller?.company_name, {
    x: margin + 14,
    y: nextY,
    maxWidth: halfWidth - 28,
    font: fontBold,
    size: 12,
    color: ink,
    lineHeight: 16,
  });
  nextY = drawWrappedPdfText(page, [
    snapshot?.seller?.company_address,
    snapshot?.seller?.company_email,
    snapshot?.seller?.company_phone,
    snapshot?.seller?.company_website,
    snapshot?.seller?.tax_id ? `${snapshot?.seller?.tax_label || "Tax ID"}: ${snapshot?.seller?.tax_id}` : "",
  ].filter(Boolean).join("\n"), {
    x: margin + 14,
    y: nextY,
    maxWidth: halfWidth - 28,
    font: fontRegular,
    size: 10,
    color: muted,
    lineHeight: 14,
  });

  page.drawText("Bill To", { x: margin + halfWidth + 30, y: cursorY - 20, size: 10, font: fontBold, color: primaryColor });
  drawWrappedPdfText(page, buildCustomerDisplayLines(snapshot?.customer).join("\n"), {
    x: margin + halfWidth + 30,
    y: cursorY - 40,
    maxWidth: halfWidth - 28,
    font: fontRegular,
    size: 10.5,
    color: ink,
    lineHeight: 14,
  });

  cursorY -= 126 + sectionGap;

  const infoCardWidth = (width - margin * 2 - 24) / 3;
  const infoItems = [
    { label: "Plan", value: snapshot?.plan_name || "Subscription" },
    { label: "Paid At", value: formatDateTime(snapshot?.paid_at || snapshot?.issued_at) },
    { label: "Billing Period", value: snapshot?.period_start || snapshot?.period_end ? `${formatDateTime(snapshot?.period_start)} - ${formatDateTime(snapshot?.period_end)}` : "N/A" },
  ];
  infoItems.forEach((item, index) => {
    const x = margin + index * (infoCardWidth + 12);
    page.drawRectangle({ x, y: cursorY - 72, width: infoCardWidth, height: 72, color: rgb(1, 1, 1), borderColor: rgb(0.88, 0.91, 0.94), borderWidth: 1 });
    page.drawText(item.label, { x: x + 12, y: cursorY - 22, size: 9, font: fontBold, color: muted });
    drawWrappedPdfText(page, item.value, {
      x: x + 12,
      y: cursorY - 40,
      maxWidth: infoCardWidth - 24,
      font: fontRegular,
      size: 10.5,
      color: ink,
      lineHeight: 13,
    });
  });

  cursorY -= 72 + sectionGap + 8;

  const tableX = margin;
  const tableWidth = width - margin * 2;
  const col1 = tableWidth * 0.52;
  const col2 = tableWidth * 0.12;
  const col3 = tableWidth * 0.16;
  const col4 = tableWidth * 0.20;

  page.drawRectangle({ x: tableX, y: cursorY - 28, width: tableWidth, height: 28, color: primaryColor });
  page.drawText("Description", { x: tableX + 12, y: cursorY - 18, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Qty", { x: tableX + col1 + 12, y: cursorY - 18, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Unit", { x: tableX + col1 + col2 + 12, y: cursorY - 18, size: 10, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Amount", { x: tableX + col1 + col2 + col3 + 12, y: cursorY - 18, size: 10, font: fontBold, color: rgb(1, 1, 1) });

  cursorY -= 42;
  const lineItem = Array.isArray(snapshot?.line_items) && snapshot.line_items.length > 0
    ? snapshot.line_items[0]
    : {
        description: snapshot?.plan_name || "Subscription",
        note: "",
        quantity: 1,
        unit_amount: snapshot?.totals?.subtotal || 0,
        subtotal: snapshot?.totals?.subtotal || 0,
      };
  page.drawRectangle({ x: tableX, y: cursorY - 54, width: tableWidth, height: 54, color: rgb(1, 1, 1), borderColor: rgb(0.90, 0.92, 0.94), borderWidth: 1 });
  drawWrappedPdfText(page, `${lineItem.description}${lineItem.note ? `\n${lineItem.note}` : ""}`, {
    x: tableX + 12,
    y: cursorY - 18,
    maxWidth: col1 - 24,
    font: fontRegular,
    size: 10,
    color: ink,
    lineHeight: 13,
  });
  page.drawText(String(lineItem.quantity || 1), { x: tableX + col1 + 12, y: cursorY - 24, size: 10, font: fontRegular, color: ink });
  page.drawText(formatMoney(lineItem.unit_amount || 0, snapshot?.currency), { x: tableX + col1 + col2 + 12, y: cursorY - 24, size: 10, font: fontRegular, color: ink });
  page.drawText(formatMoney(lineItem.subtotal || 0, snapshot?.currency), { x: tableX + col1 + col2 + col3 + 12, y: cursorY - 24, size: 10, font: fontBold, color: ink });

  cursorY -= 76;

  const totalsX = width - margin - 190;
  page.drawRectangle({ x: totalsX, y: cursorY - 88, width: 190, height: 88, color: soft, borderColor: rgb(0.88, 0.91, 0.94), borderWidth: 1 });
  const totalRows = [
    { label: "Subtotal", value: formatMoney(snapshot?.totals?.subtotal || 0, snapshot?.currency) },
    { label: "Tax", value: formatMoney(snapshot?.totals?.tax || 0, snapshot?.currency) },
    { label: "Total", value: formatMoney(snapshot?.totals?.total || 0, snapshot?.currency), bold: true },
  ];
  totalRows.forEach((row, index) => {
    const rowY = cursorY - 22 - index * 24;
    page.drawText(row.label, { x: totalsX + 14, y: rowY, size: 10, font: row.bold ? fontBold : fontRegular, color: row.bold ? primaryColor : muted });
    const targetFont = row.bold ? fontBold : fontRegular;
    page.drawText(row.value, {
      x: totalsX + 176 - targetFont.widthOfTextAtSize(row.value, row.bold ? 11 : 10),
      y: rowY,
      size: row.bold ? 11 : 10,
      font: targetFont,
      color: row.bold ? primaryColor : ink,
    });
  });

  cursorY -= 108;

  page.drawText("Notes", { x: margin, y: cursorY, size: 10, font: fontBold, color: primaryColor });
  cursorY = drawWrappedPdfText(page, snapshot?.notes || template?.notes || "", {
    x: margin,
    y: cursorY - 18,
    maxWidth: width - margin * 2,
    font: fontRegular,
    size: 10,
    color: muted,
    lineHeight: 14,
  });

  cursorY -= 8;
  page.drawText("Terms", { x: margin, y: cursorY, size: 10, font: fontBold, color: primaryColor });
  cursorY = drawWrappedPdfText(page, snapshot?.terms || template?.terms || "", {
    x: margin,
    y: cursorY - 18,
    maxWidth: width - margin * 2,
    font: fontRegular,
    size: 10,
    color: muted,
    lineHeight: 14,
  });

  page.drawLine({
    start: { x: margin, y: 72 },
    end: { x: width - margin, y: 72 },
    thickness: 1,
    color: rgb(0.90, 0.92, 0.94),
  });
  page.drawText(snapshot?.footer_text || template?.footer_text || "", {
    x: margin,
    y: 54,
    size: 9,
    font: fontRegular,
    color: muted,
  });

  return Buffer.from(await pdfDoc.save());
}

function getWasabiClient(storageConfig) {
  const wasabi = storageConfig?.wasabi || {};
  if (
    !wasabi.endpoint ||
    !wasabi.region ||
    !wasabi.bucket ||
    !wasabi.access_key_id ||
    !wasabi.secret_access_key
  ) {
    throw new HttpError(500, "Wasabi storage is not configured");
  }

  return new S3Client({
    region: wasabi.region,
    endpoint: wasabi.endpoint,
    forcePathStyle: Boolean(wasabi.force_path_style),
    credentials: {
      accessKeyId: wasabi.access_key_id,
      secretAccessKey: wasabi.secret_access_key,
    },
  });
}

async function streamToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body.transformToByteArray === "function") {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }

  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function putFileToWasabi(storageConfig, storageKey, content, contentType) {
  const client = getWasabiClient(storageConfig);
  await client.send(
    new PutObjectCommand({
      Bucket: storageConfig.wasabi.bucket,
      Key: storageKey,
      Body: content,
      ContentType: contentType,
    }),
  );
}

async function getFileFromWasabi(storageConfig, storageKey) {
  const client = getWasabiClient(storageConfig);
  const response = await client.send(
    new GetObjectCommand({
      Bucket: storageConfig.wasabi.bucket,
      Key: storageKey,
    }),
  );

  return {
    storage_key: storageKey,
    content_type: response.ContentType || "application/pdf",
    content: await streamToBuffer(response.Body),
  };
}

async function deleteFileFromWasabi(storageConfig, storageKey) {
  const client = getWasabiClient(storageConfig);
  await client.send(
    new DeleteObjectCommand({
      Bucket: storageConfig.wasabi.bucket,
      Key: storageKey,
    }),
  );
}

async function putPdfBinary(storageProvider, storageKey, userId, content, contentType = "application/pdf") {
  if (storageProvider === STORAGE_PROVIDER_WASABI) {
    const storageConfig = await getActiveStorageConfig();
    if (!storageConfig.wasabi.configured) {
      throw new HttpError(500, "Wasabi storage is not configured");
    }
    await putFileToWasabi(storageConfig, storageKey, content, contentType);
    return;
  }
  await db.putFile(storageKey, userId, content, contentType);
}

async function getPdfBinary(pdf) {
  const storageProvider = normalizeStorageProvider(pdf.storage_provider || STORAGE_PROVIDER_SUPABASE);
  if (storageProvider === STORAGE_PROVIDER_WASABI) {
    const storageConfig = await getActiveStorageConfig();
    if (!storageConfig.wasabi.configured) {
      throw new HttpError(500, "Wasabi storage is not configured");
    }
    return getFileFromWasabi(storageConfig, pdf.storage_key);
  }
  return db.getFile(pdf.storage_key);
}

async function deletePdfBinary(pdf) {
  const storageProvider = normalizeStorageProvider(pdf.storage_provider || STORAGE_PROVIDER_SUPABASE);
  if (!pdf.storage_key) return;
  if (storageProvider === STORAGE_PROVIDER_WASABI) {
    const storageConfig = await getActiveStorageConfig();
    if (!storageConfig.wasabi.configured) return;
    await deleteFileFromWasabi(storageConfig, pdf.storage_key);
    return;
  }
  await db.deleteFile(pdf.storage_key);
}

async function deletePdfBinaryByProvider(storageProvider, storageKey) {
  if (!storageKey) return;
  const normalizedProvider = normalizeStorageProvider(storageProvider || STORAGE_PROVIDER_SUPABASE);
  if (normalizedProvider === STORAGE_PROVIDER_WASABI) {
    const storageConfig = await getActiveStorageConfig();
    if (!storageConfig.wasabi.configured) return;
    await deleteFileFromWasabi(storageConfig, storageKey);
    return;
  }
  await db.deleteFile(storageKey);
}

async function migratePdfRecordToProvider(pdf, destinationProvider) {
  const targetProvider = normalizeStorageProvider(destinationProvider || STORAGE_PROVIDER_SUPABASE);
  const currentProvider = normalizeStorageProvider(pdf?.storage_provider || STORAGE_PROVIDER_SUPABASE);

  if (!pdf?.pdf_id) {
    return { migrated: false, reason: "missing_pdf_id" };
  }
  if (!pdf?.storage_key) {
    return { migrated: false, reason: "missing_storage_key" };
  }
  if (currentProvider === targetProvider) {
    return { migrated: false, reason: "already_on_destination" };
  }

  const file = await getPdfBinary(pdf);
  if (!file?.content) {
    throw new HttpError(404, `Stored file not found for PDF ${pdf.pdf_id}`);
  }

  await putPdfBinary(
    targetProvider,
    pdf.storage_key,
    pdf.user_id,
    file.content,
    file.content_type || "application/pdf",
  );

  await db.pdfs.updateOne(
    { pdf_id: pdf.pdf_id },
    {
      $set: {
        storage_provider: targetProvider,
        updated_at: isoNow(),
      },
    },
  );

  try {
    await deletePdfBinaryByProvider(currentProvider, pdf.storage_key);
  } catch (error) {
    return {
      migrated: true,
      reason: "source_cleanup_failed",
      warning: error?.message || "Source cleanup failed",
    };
  }

  return { migrated: true, reason: "migrated" };
}

async function getCurrentUser(req) {
  const credentialsException = new HttpError(401, "Could not validate credentials");

  let token = getCookieValue(req, "session_token");
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    throw credentialsException;
  }

  const session = await db.user_sessions.findOne({ session_token: token }, { _id: 0 });
  if (session) {
    const expiresAt = ensureDate(session.expires_at, "Session expired");
    if (expiresAt < nowUtc()) {
      throw new HttpError(401, "Session expired");
    }

    const user = await db.users.findOne({ user_id: session.user_id }, { _id: 0 });
    if (!user) {
      throw credentialsException;
    }
    return ensureSuperAdminRole(user);
  }

  let payload;
  try {
    payload = jwt.verify(token, SECRET_KEY, { algorithms: [ALGORITHM] });
  } catch {
    throw credentialsException;
  }

  const userId = payload?.sub;
  if (!userId) {
    throw credentialsException;
  }

  const user = await db.users.findOne({ user_id: userId }, { _id: 0 });
  if (!user) {
    throw credentialsException;
  }

  return ensureSuperAdminRole(user);
}

async function getCurrentAdmin(req) {
  const user = await getCurrentUser(req);
  if (!isAdminRole(user.role)) {
    throw new HttpError(403, "Admin access required");
  }
  return user;
}

async function getCurrentSuperAdmin(req) {
  const user = await getCurrentUser(req);
  if (!isSuperAdminUser(user)) {
    throw new HttpError(403, "Super admin access required");
  }
  if (user.role !== "super_admin" || user.plan !== "enterprise" || user.subscription_status !== "active") {
    await db.users.updateOne(
      { user_id: user.user_id },
      {
        $set: {
          role: "super_admin",
          plan: "enterprise",
          subscription_status: "active",
        },
      },
    );
    return { ...user, role: "super_admin", plan: "enterprise", subscription_status: "active" };
  }
  return user;
}

async function handleAuthRegister(req, res) {
  const body = await getJsonBody(req);
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const originUrl = normalizeOriginUrl(body.origin_url || "");
  const requestedLanguage = body.language ? String(body.language).trim() : "";
  const localizationConfig = await getActiveLocalizationConfig();
  const language =
    VALID_LANGUAGES.includes(requestedLanguage) &&
    Array.isArray(localizationConfig.enabled_languages) &&
    localizationConfig.enabled_languages.includes(requestedLanguage)
      ? requestedLanguage
      : localizationConfig.default_language || DEFAULT_PLATFORM_LANGUAGE;

  if (!name || !email || !password) {
    throw new HttpError(400, "Name, email, and password are required");
  }
  if (password.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters");
  }

  const existing = await db.users.findOne({ email }, { _id: 0 });
  if (existing) {
    await logAuditEvent(req, {
      eventType: "auth.register",
      targetUserId: existing.user_id,
      success: false,
      message: "email_already_registered",
      metadata: { email },
    });
    throw new HttpError(400, "Email already registered");
  }

  const userId = makeId("user");
  const now = isoNow();
  const isConfiguredSuperAdmin = isConfiguredSuperAdminEmail(email);
  const hasCustomEmailDelivery = await hasTransactionalEmailDelivery();
  const useSupabaseSelfServeSignup =
    isSupabaseAuthEnabled() && !(hasCustomEmailDelivery && isSupabaseAuthAdminEnabled());

  if (useSupabaseSelfServeSignup) {
    let signUpResult = null;
    try {
      signUpResult = await supabaseAuthSignUp(req, {
        email,
        password,
        name: name || email.split("@")[0] || "User",
        originUrl,
      });
    } catch (error) {
      const lower = String(error?.message || "").toLowerCase();
      if (lower.includes("already") || lower.includes("registered")) {
        throw new HttpError(400, "Email already registered");
      }
      throw new HttpError(400, error?.message || "Failed to register with Supabase");
    }

    const supabaseUser = signUpResult?.user || null;
    const userDoc = await ensureLocalUserFromSupabase({
      email,
      supabaseUserId: supabaseUser?.id || "",
      name: name || email.split("@")[0] || "User",
      language,
      emailConfirmed: Boolean(supabaseUser?.email_confirmed),
      emailConfirmedAt: supabaseUser?.email_confirmed_at || null,
    });
    await db.users.updateOne(
      { user_id: userDoc.user_id },
      { $set: { email_verification_sent_at: now } },
    );

    await logAuditEvent(req, {
      eventType: "auth.register",
      actorUserId: userDoc.user_id,
      targetUserId: userDoc.user_id,
      resourceType: "user",
      resourceId: userDoc.user_id,
      success: true,
      message: "verification_pending",
      metadata: {
        email,
        verification_delivery: "sent",
        verification_provider: "supabase",
      },
    });

    sendJson(res, 200, {
      message: "Registration successful. Please verify your email before signing in.",
      pending_verification: true,
      user: sanitizeUser({ ...userDoc, email_verification_sent_at: now }),
      verification_delivery: "sent",
      verification_provider: "supabase",
    });
    return;
  }

  const userDoc = {
    user_id: userId,
    name,
    email,
    password_hash: await bcrypt.hash(password, 12),
    role: isConfiguredSuperAdmin ? "super_admin" : "user",
    subscription_status: isConfiguredSuperAdmin ? "active" : "inactive",
    plan: isConfiguredSuperAdmin ? "enterprise" : "none",
    storage_used: 0,
    language,
    billing_profile: {},
    email_verified: false,
    email_verification_sent_at: now,
    created_at: now,
  };

  await db.users.insertOne(userDoc);

  if (isSupabaseAuthAdminEnabled()) {
    try {
      const supabaseUser = await supabaseAuthAdminCreateUser({
        email,
        password,
        name: name || email.split("@")[0] || "User",
        emailConfirmed: false,
      });
      if (supabaseUser?.id) {
        await db.users.updateOne(
          { user_id: userId },
          { $set: { supabase_user_id: supabaseUser.id } },
        );
        userDoc.supabase_user_id = supabaseUser.id;
      }
    } catch (error) {
      if (!isSupabaseAlreadyExistsError(error)) {
        throw new HttpError(400, error?.message || "Failed to create auth account");
      }
      const existingSupabaseUser = await supabaseAuthAdminFindUserByEmail(email);
      if (existingSupabaseUser?.id) {
        await db.users.updateOne(
          { user_id: userId },
          { $set: { supabase_user_id: existingSupabaseUser.id } },
        );
        userDoc.supabase_user_id = existingSupabaseUser.id;
      }
    }
  }

  const verificationToken = tokenUrlSafe(32);
  const verificationTokenHash = hashToken(verificationToken);
  const verificationExpiresAt = new Date(
    Date.now() + EMAIL_VERIFICATION_EXPIRE_HOURS * 60 * 60 * 1000,
  ).toISOString();

  await db.email_verifications.insertOne({
    verification_id: makeId("verify"),
    user_id: userId,
    email,
    token_hash: verificationTokenHash,
    expires_at: verificationExpiresAt,
    used: false,
    created_at: now,
  });

  const delivery = await sendEmailVerificationEmail({
    req,
    email,
    name,
    token: verificationToken,
    originUrl,
  });

  await logAuditEvent(req, {
    eventType: "auth.register",
    actorUserId: userId,
    targetUserId: userId,
    resourceType: "user",
    resourceId: userId,
    success: true,
    message: "verification_pending",
    metadata: {
      email,
      verification_delivery: delivery.delivered ? "sent" : "not_sent",
      verification_provider: delivery.provider,
      verification_error: delivery.error || null,
    },
  });

  const responseBody = {
    message: "Registration successful. Please verify your email before signing in.",
    pending_verification: true,
    user: sanitizeUser(userDoc),
    verification_delivery: delivery.delivered ? "sent" : "not_sent",
  };

  if (AUTH_DEBUG_TOKENS) {
    responseBody.debug = {
      verify_email_token: verificationToken,
    };
  }

  sendJson(res, 200, {
    ...responseBody,
  });
}

async function handleAuthLogin(req, res) {
  const body = await getJsonBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    throw new HttpError(400, "Email and password are required");
  }

  const existingLocalUser = await db.users.findOne({ email }, { _id: 0 });

  if (isSupabaseAuthEnabled()) {
    let supabaseUser = null;
    try {
      const signIn = await supabaseAuthSignInWithPassword(email, password);
      supabaseUser = signIn.user;
    } catch (error) {
      const lower = String(error?.message || "").toLowerCase();
      if (lower.includes("email not confirmed")) {
        await logAuditEvent(req, {
          eventType: "auth.login",
          actorUserId: existingLocalUser?.user_id || null,
          targetUserId: existingLocalUser?.user_id || null,
          success: false,
          message: "email_not_verified",
          metadata: { email },
        });
        throw new HttpError(
          403,
          "Please verify your email before signing in. Use resend verification if needed.",
        );
      }

      // Legacy fallback for users that still only exist in local auth.
      const validLegacyPassword = existingLocalUser?.password_hash
        ? await bcrypt.compare(password, existingLocalUser.password_hash)
        : false;

      if (existingLocalUser && validLegacyPassword) {
        try {
          await supabaseAuthAdminCreateUser({
            email,
            password,
            name: existingLocalUser.name || email.split("@")[0] || "User",
            emailConfirmed: existingLocalUser.email_verified !== false,
          });
        } catch (createError) {
          if (!isSupabaseAlreadyExistsError(createError)) {
            throw new HttpError(
              400,
              createError?.message || "Failed to migrate user to Supabase auth",
            );
          }
        }

        try {
          const retry = await supabaseAuthSignInWithPassword(email, password);
          supabaseUser = retry.user;
        } catch (retryError) {
          const retryLower = String(retryError?.message || "").toLowerCase();
          if (retryLower.includes("email not confirmed")) {
            throw new HttpError(
              403,
              "Please verify your email before signing in. Use resend verification if needed.",
            );
          }
          throw new HttpError(401, "Invalid email or password");
        }
      } else {
        await logAuditEvent(req, {
          eventType: "auth.login",
          targetUserId: existingLocalUser?.user_id || null,
          success: false,
          message: "invalid_credentials",
          metadata: { email },
        });
        throw new HttpError(401, "Invalid email or password");
      }
    }

    if (!supabaseUser?.email) {
      throw new HttpError(401, "Invalid email or password");
    }

    let currentUser = await ensureLocalUserFromSupabase({
      email: supabaseUser.email,
      supabaseUserId: supabaseUser.id || "",
      name: supabaseUser.name || existingLocalUser?.name || email.split("@")[0] || "User",
      language: existingLocalUser?.language || await getPlatformDefaultLanguage(),
      emailConfirmed: Boolean(supabaseUser.email_confirmed),
      emailConfirmedAt: supabaseUser.email_confirmed_at || null,
    });

    if (currentUser.email_verified === false) {
      await logAuditEvent(req, {
        eventType: "auth.login",
        actorUserId: currentUser.user_id,
        targetUserId: currentUser.user_id,
        success: false,
        message: "email_not_verified",
        metadata: { email },
      });
      throw new HttpError(
        403,
        "Please verify your email before signing in. Use resend verification if needed.",
      );
    }

    if (isTwoFactorEnabledForUser(currentUser)) {
      return issueTwoFactorChallenge(req, res, currentUser, "password");
    }

    const accessToken = createAccessToken({ sub: currentUser.user_id });
    setSessionCookie(res, accessToken);

    await logAuditEvent(req, {
      eventType: "auth.login",
      actorUserId: currentUser.user_id,
      targetUserId: currentUser.user_id,
      resourceType: "user",
      resourceId: currentUser.user_id,
      success: true,
      message: "login_success",
      metadata: { provider: "supabase" },
    });

    sendJson(res, 200, {
      access_token: accessToken,
      token_type: "bearer",
      user: sanitizeUser(currentUser),
    });
    return;
  }

  const user = existingLocalUser;
  const valid = user?.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !valid) {
    await logAuditEvent(req, {
      eventType: "auth.login",
      targetUserId: user?.user_id || null,
      success: false,
      message: "invalid_credentials",
      metadata: { email },
    });
    throw new HttpError(401, "Invalid email or password");
  }

  let currentUser = user;
  if (
    isConfiguredSuperAdminEmail(user.email) &&
    (user.role !== "super_admin" || user.plan !== "enterprise" || user.subscription_status !== "active")
  ) {
    await db.users.updateOne(
      { user_id: user.user_id },
      {
        $set: {
          role: "super_admin",
          plan: "enterprise",
          subscription_status: "active",
        },
      },
    );
    currentUser = {
      ...user,
      role: "super_admin",
      plan: "enterprise",
      subscription_status: "active",
    };
  }

  if (currentUser.email_verified === false) {
    await logAuditEvent(req, {
      eventType: "auth.login",
      actorUserId: currentUser.user_id,
      targetUserId: currentUser.user_id,
      success: false,
      message: "email_not_verified",
      metadata: { email },
    });
    throw new HttpError(
      403,
      "Please verify your email before signing in. Use resend verification if needed.",
    );
  }

  if (isTwoFactorEnabledForUser(currentUser)) {
    return issueTwoFactorChallenge(req, res, currentUser, "password");
  }

  const accessToken = createAccessToken({ sub: currentUser.user_id });
  setSessionCookie(res, accessToken);

  await logAuditEvent(req, {
    eventType: "auth.login",
    actorUserId: currentUser.user_id,
    targetUserId: currentUser.user_id,
    resourceType: "user",
    resourceId: currentUser.user_id,
    success: true,
    message: "login_success",
  });

  sendJson(res, 200, {
    access_token: accessToken,
    token_type: "bearer",
    user: sanitizeUser(currentUser),
  });
}

async function handleAuthGoogleStart(req, res) {
  const originUrl = normalizeOriginUrl(req.query.origin_url || "");
  const nextPath = sanitizeAuthNextPath(req.query.next || "/dashboard");
  const authorizeUrl = buildSupabaseOAuthAuthorizeUrl(req, "google", {
    originUrl,
    nextPath,
  });
  let response;
  try {
    response = await fetch(authorizeUrl, {
      method: "GET",
      redirect: "manual",
    });
  } catch (error) {
    throw new HttpError(502, `Failed to reach Supabase Google auth: ${error?.message || "request_failed"}`);
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
      throw new HttpError(502, "Supabase Google auth did not provide a redirect URL");
    }
    sendRedirect(res, location);
    return;
  }

  const payload = await response.json().catch(() => ({}));
  const message = getSupabaseAuthErrorMessage(payload, "Google authentication is not configured");
  if (message.toLowerCase().includes("unsupported provider")) {
    throw new HttpError(
      503,
      "Google login is not enabled in Supabase. Enable Google under Supabase Auth -> Providers and save the provider credentials there.",
    );
  }
  throw new HttpError(response.status || 502, `Google authentication failed: ${message}`);
}

async function handleAuthGoogleExchange(req, res) {
  const body = await getJsonBody(req);
  const supabaseAccessToken = String(body.access_token || "").trim();

  if (!supabaseAccessToken) {
    throw new HttpError(400, "Supabase access token is required");
  }

  let supabaseUser = null;
  try {
    supabaseUser = await supabaseAuthGetUserByAccessToken(supabaseAccessToken);
  } catch {
    throw new HttpError(401, "Invalid Google authentication session");
  }

  if (!supabaseUser?.email) {
    throw new HttpError(401, "Google account email is missing");
  }

  const localUser = await ensureLocalUserFromSupabase({
    email: supabaseUser.email,
    supabaseUserId: supabaseUser.id || "",
    name: supabaseUser.name || supabaseUser.email.split("@")[0] || "User",
    emailConfirmed: true,
    emailConfirmedAt: supabaseUser.email_confirmed_at || isoNow(),
  });

  if (isTwoFactorEnabledForUser(localUser)) {
    return issueTwoFactorChallenge(req, res, localUser, "google");
  }

  const accessToken = createAccessToken({ sub: localUser.user_id });
  setSessionCookie(res, accessToken);

  await logAuditEvent(req, {
    eventType: "auth.google_login",
    actorUserId: localUser.user_id,
    targetUserId: localUser.user_id,
    resourceType: "user",
    resourceId: localUser.user_id,
    success: true,
    message: "google_oauth_success",
    metadata: {
      email: supabaseUser.email,
      provider: "supabase_google",
    },
  });

  sendJson(res, 200, {
    access_token: accessToken,
    token_type: "bearer",
    user: sanitizeUser(localUser),
  });
}

async function handleAuthGoogleSession(req, res) {
  const body = await getJsonBody(req);
  const sessionId = body.session_id;

  if (!sessionId) {
    throw new HttpError(400, "Session ID required");
  }

  let googleResponse;
  try {
    googleResponse = await fetch("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data", {
      headers: {
        "X-Session-ID": String(sessionId),
      },
    });
  } catch {
    throw new HttpError(401, "Invalid session");
  }

  if (googleResponse.status !== 200) {
    throw new HttpError(401, "Invalid session");
  }

  const googleData = await googleResponse.json();
  const email = String(googleData.email || "").trim().toLowerCase();
  const name = String(googleData.name || "").trim() || "User";
  const picture = googleData.picture || null;
  const sessionToken = googleData.session_token;

  if (!email || !sessionToken) {
    throw new HttpError(401, "Invalid session");
  }

  const existingUser = await db.users.findOne({ email }, { _id: 0 });
  let userId;
  const resolvedRole = isConfiguredSuperAdminEmail(email) ? "super_admin" : "user";
  const resolvedPlan = resolvedRole === "super_admin" ? "enterprise" : existingUser?.plan || "none";
  const resolvedSubscriptionStatus =
    resolvedRole === "super_admin" ? "active" : existingUser?.subscription_status || "inactive";

  if (existingUser) {
    userId = existingUser.user_id;
    await db.users.updateOne(
      { user_id: userId },
      {
        $set: {
          name,
          picture,
          role: resolvedRole,
          plan: resolvedPlan,
          subscription_status: resolvedSubscriptionStatus,
          email_verified: true,
          email_verified_at: isoNow(),
          billing_profile: existingUser.billing_profile || {},
        },
      },
    );
  } else {
    userId = makeId("user");
    const defaultLanguage = await getPlatformDefaultLanguage();
    const userDoc = {
      user_id: userId,
      name,
      email,
      picture,
      role: resolvedRole,
      subscription_status: resolvedRole === "super_admin" ? "active" : "inactive",
      plan: resolvedRole === "super_admin" ? "enterprise" : "none",
      storage_used: 0,
      language: defaultLanguage,
      billing_profile: {},
      email_verified: true,
      email_verified_at: isoNow(),
      created_at: isoNow(),
    };
    await db.users.insertOne(userDoc);
  }

  const user = await db.users.findOne({ user_id: userId }, { _id: 0 });
  if (isTwoFactorEnabledForUser(user)) {
    return issueTwoFactorChallenge(req, res, user, "google_session");
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.user_sessions.insertOne({
    user_id: userId,
    session_token: sessionToken,
    expires_at: expiresAt,
    created_at: isoNow(),
  });

  setSessionCookie(res, String(sessionToken));
  await logAuditEvent(req, {
    eventType: "auth.google_session",
    actorUserId: userId,
    targetUserId: userId,
    resourceType: "user",
    resourceId: userId,
    success: true,
    message: "oauth_session_established",
    metadata: { email },
  });
  sendJson(res, 200, { user: sanitizeUser(user) });
}

async function handleTwoFactorStatusGet(req, res) {
  const user = await getCurrentUser(req);
  assertTwoFactorEligibleUser(user);
  sendJson(res, 200, {
    two_factor: getNormalizedTwoFactorSettings(user.two_factor || {}),
    email: user.email,
    role: user.role,
  });
}

async function handleTwoFactorSetup(req, res) {
  const user = await getCurrentUser(req);
  assertTwoFactorEligibleUser(user);

  if (isTwoFactorEnabledForUser(user)) {
    throw new HttpError(400, "Two-factor authentication is already enabled");
  }

  const secret = generateTotpSecret();
  const branding = await getActiveBrandingConfig().catch(() => null);
  const issuer = branding?.app_name || "Secure PDF";
  const setupStartedAt = isoNow();

  await db.users.updateOne(
    { user_id: user.user_id },
    {
      $set: {
        two_factor: {
          ...(user.two_factor || {}),
          enabled: false,
          secret: null,
          pending_secret: secret,
          pending_setup_started_at: setupStartedAt,
          configured_at: null,
          last_verified_at: user?.two_factor?.last_verified_at || null,
        },
      },
    },
  );

  await logAuditEvent(req, {
    eventType: "auth.two_factor_setup_start",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "user",
    resourceId: user.user_id,
    success: true,
    message: "two_factor_setup_started",
  });

  sendJson(res, 200, {
    two_factor: {
      enabled: false,
      setup_pending: true,
      configured_at: null,
      last_verified_at: null,
    },
    secret,
    manual_entry_key: secret,
    otp_auth_uri: buildTwoFactorOtpAuthUri({
      issuer,
      email: user.email,
      secret,
    }),
  });
}

async function handleTwoFactorEnable(req, res) {
  const user = await getCurrentUser(req);
  assertTwoFactorEligibleUser(user);
  const body = await getJsonBody(req);
  const code = normalizeOtpCode(body.code || body.otp || "");
  const pendingSecret = String(user?.two_factor?.pending_secret || "").trim();

  if (!pendingSecret) {
    throw new HttpError(400, "Two-factor setup is not pending");
  }
  if (!verifyTotpCode(pendingSecret, code)) {
    throw new HttpError(400, "Invalid verification code");
  }

  const now = isoNow();
  await db.users.updateOne(
    { user_id: user.user_id },
    {
      $set: {
        two_factor: {
          enabled: true,
          secret: pendingSecret,
          pending_secret: null,
          pending_setup_started_at: null,
          configured_at: now,
          last_verified_at: now,
        },
      },
    },
  );

  await logAuditEvent(req, {
    eventType: "auth.two_factor_enabled",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "user",
    resourceId: user.user_id,
    success: true,
    message: "two_factor_enabled",
  });

  const refreshedUser = await db.users.findOne({ user_id: user.user_id }, { _id: 0 });
  sendJson(res, 200, {
    message: "Two-factor authentication enabled",
    user: sanitizeUser(refreshedUser),
    two_factor: getNormalizedTwoFactorSettings(refreshedUser?.two_factor || {}),
  });
}

async function handleTwoFactorDisable(req, res) {
  const user = await getCurrentUser(req);
  assertTwoFactorEligibleUser(user);
  const body = await getJsonBody(req);
  const code = normalizeOtpCode(body.code || body.otp || "");
  const activeSecret = String(user?.two_factor?.secret || "").trim();

  if (!activeSecret || !user?.two_factor?.enabled) {
    throw new HttpError(400, "Two-factor authentication is not enabled");
  }
  if (!verifyTotpCode(activeSecret, code)) {
    throw new HttpError(400, "Invalid verification code");
  }

  await db.users.updateOne(
    { user_id: user.user_id },
    {
      $set: {
        two_factor: {
          enabled: false,
          secret: null,
          pending_secret: null,
          pending_setup_started_at: null,
          configured_at: null,
          last_verified_at: isoNow(),
        },
      },
    },
  );

  await logAuditEvent(req, {
    eventType: "auth.two_factor_disabled",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "user",
    resourceId: user.user_id,
    success: true,
    message: "two_factor_disabled",
  });

  const refreshedUser = await db.users.findOne({ user_id: user.user_id }, { _id: 0 });
  sendJson(res, 200, {
    message: "Two-factor authentication disabled",
    user: sanitizeUser(refreshedUser),
    two_factor: getNormalizedTwoFactorSettings(refreshedUser?.two_factor || {}),
  });
}

async function handleTwoFactorLoginVerify(req, res) {
  const body = await getJsonBody(req);
  const challengeToken = String(body.challenge_token || "").trim();
  const code = normalizeOtpCode(body.code || body.otp || "");

  if (!challengeToken) {
    throw new HttpError(400, "Challenge token is required");
  }

  const challenge = await db.collection("two_factor_challenges").findOne(
    { challenge_token: challengeToken, used: false },
    { _id: 0 },
  );

  if (!challenge) {
    throw new HttpError(400, "Two-factor challenge is invalid or already used");
  }

  if (ensureDate(challenge.expires_at, "Two-factor challenge expired") < nowUtc()) {
    await db.collection("two_factor_challenges").updateOne(
      { challenge_token: challengeToken },
      { $set: { used: true, used_at: isoNow(), expired: true } },
    );
    throw new HttpError(400, "Two-factor challenge expired");
  }

  const user = await db.users.findOne({ user_id: challenge.user_id }, { _id: 0 });
  if (!user || !isTwoFactorEnabledForUser(user)) {
    throw new HttpError(400, "Two-factor authentication is not enabled for this account");
  }

  if (!verifyTotpCode(user.two_factor.secret, code)) {
    await logAuditEvent(req, {
      eventType: "auth.two_factor_verify",
      actorUserId: user.user_id,
      targetUserId: user.user_id,
      resourceType: "user",
      resourceId: user.user_id,
      success: false,
      message: "two_factor_invalid_code",
      metadata: { provider: challenge.provider || "password" },
    });
    throw new HttpError(400, "Invalid verification code");
  }

  const now = isoNow();
  await db.collection("two_factor_challenges").updateOne(
    { challenge_token: challengeToken },
    { $set: { used: true, used_at: now } },
  );
  await db.users.updateOne(
    { user_id: user.user_id },
    {
      $set: {
        "two_factor.last_verified_at": now,
      },
    },
  );

  const accessToken = createAccessToken({ sub: user.user_id });
  setSessionCookie(res, accessToken);

  await logAuditEvent(req, {
    eventType: "auth.two_factor_verify",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "user",
    resourceId: user.user_id,
    success: true,
    message: "two_factor_login_success",
    metadata: { provider: challenge.provider || "password" },
  });

  const refreshedUser = await db.users.findOne({ user_id: user.user_id }, { _id: 0 });
  sendJson(res, 200, {
    access_token: accessToken,
    token_type: "bearer",
    user: sanitizeUser(refreshedUser),
  });
}

async function handleAuthMe(req, res) {
  const user = await getCurrentUser(req);
  sendJson(res, 200, sanitizeUser(user));
}

async function handleAuthLogout(req, res) {
  let actorUserId = null;
  try {
    const currentUser = await getCurrentUser(req);
    actorUserId = currentUser.user_id;
  } catch {
    actorUserId = null;
  }
  const token = getCookieValue(req, "session_token");
  if (token) {
    await db.user_sessions.deleteOne({ session_token: token });
  }
  clearSessionCookie(res);
  await logAuditEvent(req, {
    eventType: "auth.logout",
    actorUserId,
    targetUserId: actorUserId,
    resourceType: "user",
    resourceId: actorUserId,
    success: true,
    message: "logout_success",
  });
  sendJson(res, 200, { message: "Logged out successfully" });
}

async function handleAuthLanguage(req, res) {
  const user = await getCurrentUser(req);
  const body = await getJsonBody(req);
  const language = String(body.language || "").trim();
  const localization = await getActiveLocalizationConfig();

  if (
    !VALID_LANGUAGES.includes(language) ||
    !Array.isArray(localization.enabled_languages) ||
    !localization.enabled_languages.includes(language)
  ) {
    throw new HttpError(400, "Selected language is not available");
  }

  await db.users.updateOne(
    { user_id: user.user_id },
    {
      $set: {
        language,
      },
    },
  );

  sendJson(res, 200, {
    message: "Language updated successfully",
    language,
  });
}

async function handleAuthProfileUpdate(req, res) {
  const user = await getCurrentUser(req);
  const body = await getJsonBody(req);
  const update = {};

  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name) {
      throw new HttpError(400, "Name is required");
    }
    if (name.length > 120) {
      throw new HttpError(400, "Name must be 120 characters or fewer");
    }
    update.name = name;
  }

  if (body.billing_profile !== undefined) {
    update.billing_profile = sanitizeBillingProfileInput(body.billing_profile);
  }

  if (body.secure_link_defaults !== undefined) {
    update.secure_link_defaults = sanitizeSecureLinkDefaultsInput(body.secure_link_defaults);
  }

  if (Object.keys(update).length === 0) {
    throw new HttpError(400, "No profile changes provided");
  }

  await db.users.updateOne(
    { user_id: user.user_id },
    {
      $set: update,
    },
  );

  const updatedUser = await db.users.findOne({ user_id: user.user_id }, { _id: 0 });
  await logAuditEvent(req, {
    eventType: "auth.profile_update",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "user",
    resourceId: user.user_id,
    success: true,
    message: "profile_updated",
    metadata: { updated_fields: Object.keys(update) },
  });

  sendJson(res, 200, {
    message: "Profile updated successfully",
    user: sanitizeUser(updatedUser),
  });
}

async function handleWorkspacesGet(req, res) {
  const actor = await getCurrentUser(req);
  const workspaces = await listAvailableWorkspacesForUser(actor);
  const requestedWorkspaceId = getRequestedWorkspaceId(req, actor.user_id);
  const activeWorkspace =
    workspaces.find((workspace) => workspace.workspace_id === requestedWorkspaceId) ||
    workspaces[0] ||
    null;

  const receivedInvitations = await db.team_invitations.find(
    { email: actor.email, status: "pending" },
    { _id: 0, invitation_id: 1, expires_at: 1 },
    { sort: { created_at: -1 }, limit: 50 },
  );
  const receivedPendingCount = receivedInvitations.filter((item) => !isTeamInvitationExpired(item)).length;

  sendJson(res, 200, {
    active_workspace_id: activeWorkspace?.workspace_id || actor.user_id,
    workspaces,
    received_invitation_count: receivedPendingCount,
  });
}

async function handleTeamGet(req, res) {
  const actor = await getCurrentUser(req);
  const workspace = await getCurrentWorkspace(req);

  const [workspaces, memberships, rawWorkspaceInvitations, rawReceivedInvitations] = await Promise.all([
    listAvailableWorkspacesForUser(actor),
    workspace.permissions.manage_team
      ? db.team_memberships.find(
        { account_id: workspace.accountId, status: "active" },
        { _id: 0 },
        { sort: { created_at: 1 } },
      )
      : Promise.resolve([]),
    workspace.permissions.manage_team
      ? db.team_invitations.find(
        { account_id: workspace.accountId },
        { _id: 0 },
        { sort: { created_at: -1 } },
      )
      : Promise.resolve([]),
    db.team_invitations.find(
      { email: actor.email },
      { _id: 0 },
      { sort: { created_at: -1 }, limit: 100 },
    ),
  ]);

  const invitationsToExpire = [];
  for (const invitation of [...rawWorkspaceInvitations, ...rawReceivedInvitations]) {
    if (invitation?.status === "pending" && isTeamInvitationExpired(invitation)) {
      invitationsToExpire.push(invitation.invitation_id);
    }
  }
  for (const invitationId of invitationsToExpire) {
    await db.team_invitations.updateOne(
      { invitation_id: invitationId, status: "pending" },
      {
        $set: {
          status: "expired",
          expired_at: isoNow(),
        },
      },
    );
  }

  const workspaceInvitations = rawWorkspaceInvitations.filter(
    (invitation) => invitation.status === "pending" && !isTeamInvitationExpired(invitation),
  );
  const receivedInvitations = rawReceivedInvitations.filter(
    (invitation) => invitation.status === "pending" && !isTeamInvitationExpired(invitation),
  );

  const memberUserIds = Array.from(
    new Set(memberships.map((membership) => String(membership.user_id || "").trim()).filter(Boolean)),
  );
  const invitationUserIds = Array.from(
    new Set(
      [...workspaceInvitations, ...receivedInvitations]
        .flatMap((invitation) => [invitation.account_id, invitation.invited_by_user_id])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
  const lookupUserIds = Array.from(new Set([workspace.accountId, ...memberUserIds, ...invitationUserIds]));
  const lookupUsers = lookupUserIds.length
    ? await db.users.find(
      { user_id: { $in: lookupUserIds } },
      { _id: 0, user_id: 1, name: 1, email: 1 },
      { limit: lookupUserIds.length },
    )
    : [];
  const lookupUserMap = new Map(lookupUsers.map((item) => [item.user_id, item]));

  const members = [
    {
      membership_id: `owner:${workspace.accountId}`,
      user_id: workspace.ownerUser.user_id,
      name: workspace.ownerUser.name || workspace.ownerUser.email || "Owner",
      email: workspace.ownerUser.email || null,
      account_role: TEAM_ROLE_OWNER,
      role_label: getTeamRoleDefinition(TEAM_ROLE_OWNER).label,
      status: "active",
      is_owner: true,
      created_at: workspace.ownerUser.created_at || null,
      can_edit: false,
      can_remove: false,
    },
    ...memberships.map((membership) => {
      const memberUser = lookupUserMap.get(membership.user_id) || {};
      const role = normalizeTeamRole(membership.account_role, TEAM_ROLE_MEMBER);
      const isSelf = membership.user_id === actor.user_id;
      return {
        membership_id: membership.membership_id,
        user_id: membership.user_id,
        name: memberUser.name || memberUser.email || "Team member",
        email: memberUser.email || null,
        account_role: role,
        role_label: getTeamRoleDefinition(role).label,
        status: membership.status || "active",
        is_owner: false,
        is_self: isSelf,
        created_at: membership.created_at || membership.accepted_at || null,
        invited_by_user_id: membership.invited_by_user_id || null,
        can_edit: workspace.permissions.manage_team,
        can_remove: workspace.permissions.manage_team || isSelf,
      };
    }),
  ];

  const mapInvitation = (invitation) => {
    const ownerUser = lookupUserMap.get(invitation.account_id) || {};
    const inviterUser = lookupUserMap.get(invitation.invited_by_user_id) || {};
    const role = normalizeTeamRole(invitation.account_role, TEAM_ROLE_MEMBER);
    return {
      invitation_id: invitation.invitation_id,
      account_id: invitation.account_id,
      account_name: ownerUser.name || ownerUser.email || "Workspace",
      account_owner_email: ownerUser.email || null,
      email: invitation.email,
      account_role: role,
      role_label: getTeamRoleDefinition(role).label,
      invited_by_user_id: invitation.invited_by_user_id || null,
      invited_by_name: inviterUser.name || inviterUser.email || "Workspace admin",
      status: invitation.status || "pending",
      created_at: invitation.created_at || null,
      expires_at: invitation.expires_at || null,
    };
  };

  sendJson(res, 200, {
    workspace: buildWorkspaceSummaryPayload(workspace),
    workspaces,
    can_manage_team: workspace.permissions.manage_team,
    members,
    invitations: workspaceInvitations.map(mapInvitation),
    received_invitations: receivedInvitations.map(mapInvitation),
  });
}

async function handleTeamInvitationCreate(req, res) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_team" });
  const body = await getJsonBody(req);
  const email = normalizeEmailAddress(body.email || "", "Team member email");
  const accountRole = normalizeTeamRole(body.account_role || body.role || TEAM_ROLE_MEMBER, TEAM_ROLE_MEMBER);
  const originUrl = normalizeOriginUrl(body.origin_url || "");

  if (accountRole === TEAM_ROLE_OWNER) {
    throw new HttpError(400, "Owner role cannot be assigned by invitation");
  }
  if (email === String(workspace.ownerUser.email || "").trim().toLowerCase()) {
    throw new HttpError(400, "Workspace owner is already part of this workspace");
  }

  const existingUser = await db.users.findOne({ email }, { _id: 0, user_id: 1, name: 1, email: 1 });
  if (existingUser?.user_id) {
    const existingMembership = await db.team_memberships.findOne(
      {
        account_id: workspace.accountId,
        user_id: existingUser.user_id,
        status: "active",
      },
      { _id: 0, membership_id: 1 },
    );
    if (existingMembership) {
      throw new HttpError(400, "This user is already a member of the workspace");
    }
  }

  const pendingInvite = await db.team_invitations.findOne(
    { account_id: workspace.accountId, email, status: "pending" },
    { _id: 0 },
  );
  if (pendingInvite && !isTeamInvitationExpired(pendingInvite)) {
    throw new HttpError(400, "A pending invitation already exists for this email");
  }
  if (pendingInvite?.invitation_id) {
    await db.team_invitations.updateOne(
      { invitation_id: pendingInvite.invitation_id },
      {
        $set: {
          status: "expired",
          expired_at: isoNow(),
        },
      },
    );
  }

  const rawToken = tokenUrlSafe(32);
  const invitationDoc = {
    invitation_id: makeId("teaminv"),
    account_id: workspace.accountId,
    email,
    account_role: accountRole,
    token_hash: hashToken(rawToken),
    status: "pending",
    invited_by_user_id: workspace.actor.user_id,
    created_at: isoNow(),
    expires_at: new Date(Date.now() + TEAM_INVITATION_EXPIRE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };

  await db.team_invitations.insertOne(invitationDoc);

  let delivery = {
    delivered: false,
    provider: "none",
    error: null,
  };
  try {
    if (await hasTransactionalEmailDelivery()) {
      delivery = await sendTeamInvitationEmail({
        req,
        invitation: { ...invitationDoc, token: rawToken },
        workspaceOwner: workspace.ownerUser,
        inviter: workspace.actor,
        originUrl,
      });
    }
  } catch (error) {
    delivery = {
      delivered: false,
      provider: "app",
      error: error?.message || "Failed to send invitation email",
    };
  }

  await db.team_invitations.updateOne(
    { invitation_id: invitationDoc.invitation_id },
    {
      $set: {
        email_delivery_status: delivery.delivered ? "sent" : "pending",
        email_delivery_provider: delivery.provider || null,
        email_delivery_error: delivery.error || null,
        email_delivery_sent_at: delivery.delivered ? isoNow() : null,
      },
    },
  );

  await logAuditEvent(req, {
    eventType: "team.invitation_create",
    ...getWorkspaceAuditFields(workspace, {
      invited_email: email,
      invited_role: accountRole,
      email_delivery_status: delivery.delivered ? "sent" : "pending",
    }),
    resourceType: "team_invitation",
    resourceId: invitationDoc.invitation_id,
    success: true,
    message: "workspace_invitation_created",
  });

  sendJson(res, 200, {
    message: delivery.delivered
      ? "Invitation created and email sent"
      : "Invitation created. Share the invite link if email delivery is not configured.",
    invitation: {
      invitation_id: invitationDoc.invitation_id,
      email,
      account_role: accountRole,
      role_label: getTeamRoleDefinition(accountRole).label,
      status: "pending",
      created_at: invitationDoc.created_at,
      expires_at: invitationDoc.expires_at,
      email_delivery_status: delivery.delivered ? "sent" : "pending",
      email_delivery_error: delivery.error || null,
    },
    invite_url: buildTeamInvitationUrl(req, rawToken, originUrl),
  });
}

async function handleTeamInvitationPreview(req, res) {
  const token = String(req.query?.token || "").trim();
  if (!token) {
    throw new HttpError(400, "Invitation token is required");
  }

  const invitation = await db.team_invitations.findOne(
    { token_hash: hashToken(token) },
    { _id: 0 },
  );
  if (!invitation) {
    throw new HttpError(404, "Invitation not found");
  }
  if (invitation.status !== "pending") {
    throw new HttpError(400, "This invitation is no longer active");
  }
  if (isTeamInvitationExpired(invitation)) {
    await db.team_invitations.updateOne(
      { invitation_id: invitation.invitation_id },
      {
        $set: {
          status: "expired",
          expired_at: isoNow(),
        },
      },
    );
    throw new HttpError(410, "This invitation has expired");
  }

  const lookupIds = Array.from(new Set(
    [invitation.account_id, invitation.invited_by_user_id]
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  ));
  const lookupUsers = lookupIds.length
    ? await db.users.find(
      { user_id: { $in: lookupIds } },
      { _id: 0, user_id: 1, name: 1, email: 1 },
      { limit: lookupIds.length },
    )
    : [];
  const lookupUserMap = new Map(lookupUsers.map((item) => [item.user_id, item]));
  const ownerUser = lookupUserMap.get(invitation.account_id) || {};
  const inviterUser = lookupUserMap.get(invitation.invited_by_user_id) || {};
  const role = normalizeTeamRole(invitation.account_role, TEAM_ROLE_MEMBER);

  sendJson(res, 200, {
    invitation_id: invitation.invitation_id,
    email: invitation.email,
    account_id: invitation.account_id,
    account_name: ownerUser.name || ownerUser.email || "Workspace",
    invited_by_user_id: invitation.invited_by_user_id || null,
    invited_by_name: inviterUser.name || inviterUser.email || "Workspace admin",
    account_role: role,
    role_label: getTeamRoleDefinition(role).label,
    status: invitation.status || "pending",
    created_at: invitation.created_at || null,
    expires_at: invitation.expires_at || null,
  });
}

async function handleTeamInvitationAccept(req, res) {
  const actor = await getCurrentUser(req);
  const body = await getJsonBody(req);
  const token = String(body.token || "").trim();
  const invitationId = String(body.invitation_id || "").trim();
  if (!token && !invitationId) {
    throw new HttpError(400, "Invitation token or invitation_id is required");
  }

  const invitation = await db.team_invitations.findOne(
    token ? { token_hash: hashToken(token) } : { invitation_id: invitationId },
    { _id: 0 },
  );
  if (!invitation) {
    throw new HttpError(404, "Invitation not found");
  }
  if (invitation.status !== "pending") {
    throw new HttpError(400, "This invitation is no longer active");
  }
  if (isTeamInvitationExpired(invitation)) {
    await db.team_invitations.updateOne(
      { invitation_id: invitation.invitation_id },
      {
        $set: {
          status: "expired",
          expired_at: isoNow(),
        },
      },
    );
    throw new HttpError(410, "This invitation has expired");
  }
  if (String(invitation.email || "").trim().toLowerCase() !== String(actor.email || "").trim().toLowerCase()) {
    throw new HttpError(403, "This invitation was sent to a different email address");
  }

  const workspace = await getWorkspaceAccessForUser(actor, invitation.account_id).catch((error) => {
    if (error instanceof HttpError && error.status === 403) {
      return null;
    }
    throw error;
  });
  let membership = null;
  const now = isoNow();

  if (!workspace) {
    const existingMembership = await db.team_memberships.findOne(
      {
        account_id: invitation.account_id,
        user_id: actor.user_id,
      },
      { _id: 0 },
    );
    if (existingMembership) {
      await db.team_memberships.updateOne(
        { membership_id: existingMembership.membership_id },
        {
          $set: {
            account_role: normalizeTeamRole(invitation.account_role, TEAM_ROLE_MEMBER),
            status: "active",
            invited_by_user_id: invitation.invited_by_user_id || null,
            invitation_id: invitation.invitation_id,
            accepted_at: now,
            updated_at: now,
          },
        },
      );
      membership = await db.team_memberships.findOne(
        { membership_id: existingMembership.membership_id },
        { _id: 0 },
      );
    } else {
      membership = {
        membership_id: makeId("teammem"),
        account_id: invitation.account_id,
        user_id: actor.user_id,
        account_role: normalizeTeamRole(invitation.account_role, TEAM_ROLE_MEMBER),
        status: "active",
        invited_by_user_id: invitation.invited_by_user_id || null,
        invitation_id: invitation.invitation_id,
        created_at: now,
        accepted_at: now,
        updated_at: now,
      };
      await db.team_memberships.insertOne(membership);
    }
  } else {
    if (workspace.membership?.membership_id) {
      await db.team_memberships.updateOne(
        { membership_id: workspace.membership.membership_id },
        {
          $set: {
            account_role: normalizeTeamRole(invitation.account_role, TEAM_ROLE_MEMBER),
            invited_by_user_id: invitation.invited_by_user_id || null,
            invitation_id: invitation.invitation_id,
            accepted_at: now,
            updated_at: now,
          },
        },
      );
      membership = await db.team_memberships.findOne(
        { membership_id: workspace.membership.membership_id },
        { _id: 0 },
      );
    }
  }

  await db.team_invitations.updateOne(
    { invitation_id: invitation.invitation_id },
    {
      $set: {
        status: "accepted",
        accepted_by_user_id: actor.user_id,
        accepted_at: now,
      },
    },
  );

  const acceptedWorkspace = await getWorkspaceAccessForUser(actor, invitation.account_id);
  await logAuditEvent(req, {
    eventType: "team.invitation_accept",
    ...getWorkspaceAuditFields(acceptedWorkspace, {
      invitation_id: invitation.invitation_id,
      invited_email: invitation.email,
      invited_role: invitation.account_role,
    }),
    resourceType: "team_invitation",
    resourceId: invitation.invitation_id,
    success: true,
    message: "workspace_invitation_accepted",
  });

  sendJson(res, 200, {
    message: "Invitation accepted successfully",
    workspace: buildWorkspaceSummaryPayload(acceptedWorkspace),
    membership: membership
      ? {
        membership_id: membership.membership_id,
        account_id: membership.account_id,
        account_role: membership.account_role,
        role_label: getTeamRoleDefinition(membership.account_role).label,
        status: membership.status,
      }
      : null,
  });
}

async function handleTeamInvitationDecline(req, res, invitationId) {
  const actor = await getCurrentUser(req);
  const invitation = await db.team_invitations.findOne(
    { invitation_id: invitationId },
    { _id: 0 },
  );
  if (!invitation) {
    throw new HttpError(404, "Invitation not found");
  }
  if (String(invitation.email || "").trim().toLowerCase() !== String(actor.email || "").trim().toLowerCase()) {
    throw new HttpError(403, "This invitation was sent to a different email address");
  }
  if (invitation.status !== "pending") {
    throw new HttpError(400, "This invitation is no longer active");
  }

  await db.team_invitations.updateOne(
    { invitation_id: invitationId },
    {
      $set: {
        status: "declined",
        declined_by_user_id: actor.user_id,
        declined_at: isoNow(),
      },
    },
  );

  await logAuditEvent(req, {
    eventType: "team.invitation_decline",
    actorUserId: actor.user_id,
    targetUserId: invitation.account_id || null,
    accountId: invitation.account_id || null,
    accountOwnerUserId: invitation.account_id || null,
    resourceType: "team_invitation",
    resourceId: invitationId,
    success: true,
    message: "workspace_invitation_declined",
    metadata: {
      invitation_id: invitationId,
      invited_email: invitation.email,
    },
  });

  sendJson(res, 200, { message: "Invitation declined" });
}

async function handleTeamInvitationDelete(req, res, invitationId) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_team" });
  const invitation = await db.team_invitations.findOne(
    { invitation_id: invitationId, account_id: workspace.accountId },
    { _id: 0 },
  );
  if (!invitation) {
    throw new HttpError(404, "Invitation not found");
  }

  await db.team_invitations.updateOne(
    { invitation_id: invitationId },
    {
      $set: {
        status: "cancelled",
        cancelled_by_user_id: workspace.actor.user_id,
        cancelled_at: isoNow(),
      },
    },
  );

  await logAuditEvent(req, {
    eventType: "team.invitation_cancel",
    ...getWorkspaceAuditFields(workspace, {
      invitation_id: invitationId,
      invited_email: invitation.email,
    }),
    resourceType: "team_invitation",
    resourceId: invitationId,
    success: true,
    message: "workspace_invitation_cancelled",
  });

  sendJson(res, 200, { message: "Invitation cancelled" });
}

async function handleTeamMemberUpdate(req, res, membershipId) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_team" });
  const body = await getJsonBody(req);
  const membership = await db.team_memberships.findOne(
    { membership_id: membershipId, account_id: workspace.accountId, status: "active" },
    { _id: 0 },
  );
  if (!membership) {
    throw new HttpError(404, "Team member not found");
  }
  if (membership.user_id === workspace.ownerUser.user_id) {
    throw new HttpError(400, "Workspace owner cannot be modified");
  }

  const accountRole = normalizeTeamRole(body.account_role || body.role || "", "__invalid__");
  if (accountRole === "__invalid__") {
    throw new HttpError(400, "A valid team role is required");
  }
  if (accountRole === TEAM_ROLE_OWNER) {
    throw new HttpError(400, "Owner role cannot be assigned");
  }

  await db.team_memberships.updateOne(
    { membership_id: membershipId },
    {
      $set: {
        account_role: accountRole,
        updated_at: isoNow(),
      },
    },
  );

  await logAuditEvent(req, {
    eventType: "team.member_update",
    ...getWorkspaceAuditFields(workspace, {
      membership_id: membershipId,
      member_user_id: membership.user_id,
      account_role: accountRole,
    }),
    resourceType: "team_membership",
    resourceId: membershipId,
    success: true,
    message: "workspace_member_updated",
  });

  sendJson(res, 200, {
    message: "Team member updated",
    membership_id: membershipId,
    account_role: accountRole,
    role_label: getTeamRoleDefinition(accountRole).label,
  });
}

async function handleTeamMemberDelete(req, res, membershipId) {
  const actor = await getCurrentUser(req);
  const membership = await db.team_memberships.findOne(
    { membership_id: membershipId, status: "active" },
    { _id: 0 },
  );
  if (!membership) {
    throw new HttpError(404, "Team member not found");
  }
  const workspace = await getWorkspaceAccessForUser(actor, membership.account_id);
  const isSelf = membership.user_id === actor.user_id;
  if (!workspace.permissions.manage_team && !isSelf) {
    throw new HttpError(403, "You do not have permission to remove this team member");
  }
  if (membership.user_id === workspace.ownerUser.user_id) {
    throw new HttpError(400, "Workspace owner cannot be removed");
  }

  await db.team_memberships.updateOne(
    { membership_id },
    {
      $set: {
        status: "removed",
        removed_by_user_id: actor.user_id,
        removed_at: isoNow(),
        updated_at: isoNow(),
      },
    },
  );

  await logAuditEvent(req, {
    eventType: isSelf ? "team.member_leave" : "team.member_remove",
    ...getWorkspaceAuditFields(workspace, {
      membership_id,
      member_user_id: membership.user_id,
      removed_self: isSelf,
    }),
    resourceType: "team_membership",
    resourceId: membershipId,
    success: true,
    message: isSelf ? "workspace_member_left" : "workspace_member_removed",
  });

  sendJson(res, 200, {
    message: isSelf ? "You left the workspace" : "Team member removed",
  });
}

async function resolveSupabaseUserIdForLocalUser(localUser) {
  if (!localUser || !isSupabaseAuthAdminEnabled()) return "";
  if (localUser.supabase_user_id) return String(localUser.supabase_user_id);

  const ensured = await ensureSupabaseAuthAccountForLocalUser(localUser, {
    emailConfirmed: localUser.email_verified !== false,
  });
  if (ensured?.user?.id) {
    return String(ensured.user.id);
  }

  const updatedLocalUser = await db.users.findOne({ user_id: localUser.user_id }, { _id: 0 });
  if (updatedLocalUser?.supabase_user_id) {
    return String(updatedLocalUser.supabase_user_id);
  }

  const existing = await supabaseAuthAdminFindUserByEmail(localUser.email);
  if (existing?.id) {
    await db.users.updateOne(
      { user_id: localUser.user_id },
      { $set: { supabase_user_id: existing.id } },
    );
    return String(existing.id);
  }

  return "";
}

async function handleAuthEmailChangeRequest(req, res) {
  const user = await getCurrentUser(req);
  const body = await getJsonBody(req);
  const newEmail = normalizeEmailAddress(body.new_email || "", "New email");
  const originUrl = normalizeOriginUrl(body.origin_url || "");

  if (isConfiguredSuperAdminEmail(user.email)) {
    throw new HttpError(
      400,
      "Configured super admin email cannot be changed until SUPER_ADMIN_EMAILS is updated.",
    );
  }
  if (newEmail === String(user.email || "").trim().toLowerCase()) {
    throw new HttpError(400, "New email must be different from the current email");
  }
  if (!(await hasTransactionalEmailDelivery())) {
    throw new HttpError(
      503,
      "Email delivery is not configured for verified email changes. Configure custom SMTP or Resend first.",
    );
  }

  const existingUser = await db.users.findOne({ email: newEmail }, { _id: 0 });
  if (existingUser && existingUser.user_id !== user.user_id) {
    throw new HttpError(400, "Email already registered");
  }

  const now = isoNow();
  await db.email_change_requests.updateMany(
    { user_id: user.user_id, used: false },
    { $set: { used: true, invalidated_at: now } },
  );

  const rawToken = tokenUrlSafe(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_CHANGE_EXPIRE_HOURS * 60 * 60 * 1000).toISOString();

  await db.email_change_requests.insertOne({
    change_id: makeId("emailchg"),
    user_id: user.user_id,
    current_email: String(user.email || "").trim().toLowerCase(),
    new_email: newEmail,
    token_hash: tokenHash,
    expires_at: expiresAt,
    used: false,
    created_at: now,
    requested_ip: getClientIp(req),
  });

  await db.users.updateOne(
    { user_id: user.user_id },
    {
      $set: {
        pending_email: newEmail,
        pending_email_requested_at: now,
      },
    },
  );

  const delivery = await sendEmailChangeVerificationEmail({
    req,
    email: newEmail,
    currentEmail: user.email,
    name: user.name,
    token: rawToken,
    originUrl,
  });

  if (!delivery.delivered) {
    await db.email_change_requests.deleteOne({ token_hash: tokenHash });
    await db.users.updateOne(
      { user_id: user.user_id },
      {
        $set: {
          pending_email: null,
          pending_email_requested_at: null,
        },
      },
    );
    await logAuditEvent(req, {
      eventType: "auth.email_change_request",
      actorUserId: user.user_id,
      targetUserId: user.user_id,
      resourceType: "user",
      resourceId: user.user_id,
      success: false,
      message: "email_change_delivery_failed",
      metadata: {
        current_email: user.email,
        new_email: newEmail,
        provider: delivery.provider,
        delivery_error: delivery.error || null,
      },
    });
    throw new HttpError(503, "Failed to send verification email. Check email delivery settings.");
  }

  await logAuditEvent(req, {
    eventType: "auth.email_change_request",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "user",
    resourceId: user.user_id,
    success: true,
    message: "email_change_requested",
    metadata: {
      current_email: user.email,
      new_email: newEmail,
      provider: delivery.provider,
    },
  });

  const updatedUser = await db.users.findOne({ user_id: user.user_id }, { _id: 0 });
  const responseBody = {
    message: "Verification email sent to the new address",
    pending_email: newEmail,
    user: sanitizeUser(updatedUser),
  };
  if (AUTH_DEBUG_TOKENS) {
    responseBody.debug = { email_change_token: rawToken };
  }
  sendJson(res, 200, responseBody);
}

async function handleAuthEmailChangeConfirm(req, res) {
  const body = await getJsonBody(req);
  const token = String(body.token || "").trim();
  if (!token) {
    throw new HttpError(400, "Token is required");
  }

  const tokenHash = hashToken(token);
  const changeRequest = await db.email_change_requests.findOne(
    { token_hash: tokenHash, used: false },
    { _id: 0 },
  );
  if (!changeRequest) {
    await logAuditEvent(req, {
      eventType: "auth.email_change_confirm",
      success: false,
      message: "invalid_token",
    });
    throw new HttpError(400, "Invalid or expired email change token");
  }

  const expiresAt = ensureDate(changeRequest.expires_at, "Invalid or expired email change token");
  if (expiresAt < nowUtc()) {
    await db.email_change_requests.updateOne(
      { token_hash: tokenHash },
      { $set: { used: true, invalidated_at: isoNow() } },
    );
    await logAuditEvent(req, {
      eventType: "auth.email_change_confirm",
      actorUserId: changeRequest.user_id,
      targetUserId: changeRequest.user_id,
      success: false,
      message: "token_expired",
    });
    throw new HttpError(400, "Email change token expired");
  }

  const user = await db.users.findOne({ user_id: changeRequest.user_id }, { _id: 0 });
  if (!user) {
    await db.email_change_requests.updateOne(
      { token_hash: tokenHash },
      { $set: { used: true, invalidated_at: isoNow() } },
    );
    throw new HttpError(404, "User not found");
  }

  const newEmail = normalizeEmailAddress(changeRequest.new_email || "", "New email");
  const existingUser = await db.users.findOne({ email: newEmail }, { _id: 0 });
  if (existingUser && existingUser.user_id !== user.user_id) {
    await db.email_change_requests.updateOne(
      { token_hash: tokenHash },
      { $set: { used: true, invalidated_at: isoNow() } },
    );
    throw new HttpError(400, "Email already registered");
  }

  let resolvedSupabaseUserId = String(user.supabase_user_id || "").trim();
  if (isSupabaseAuthAdminEnabled()) {
    resolvedSupabaseUserId = await resolveSupabaseUserIdForLocalUser(user);
    if (!resolvedSupabaseUserId) {
      throw new HttpError(400, "Supabase auth user could not be resolved for this account");
    }
    try {
      await supabaseAuthAdminUpdateUserById(resolvedSupabaseUserId, {
        email: newEmail,
        email_confirm: true,
        user_metadata: {
          name: user.name || newEmail.split("@")[0] || "User",
        },
      });
    } catch (error) {
      throw new HttpError(400, error?.message || "Failed to update email in Supabase");
    }
  }

  const now = isoNow();
  const nextBillingProfile =
    user?.billing_profile?.email &&
    String(user.billing_profile.email || "").trim().toLowerCase() === String(user.email || "").trim().toLowerCase()
      ? { ...user.billing_profile, email: newEmail }
      : user.billing_profile;

  const update = {
    email: newEmail,
    email_verified: true,
    email_verified_at: now,
    pending_email: null,
    pending_email_requested_at: null,
    supabase_user_id: resolvedSupabaseUserId || user.supabase_user_id || null,
  };
  if (nextBillingProfile) {
    update.billing_profile = nextBillingProfile;
  }

  await db.users.updateOne({ user_id: user.user_id }, { $set: update });
  await db.email_change_requests.updateOne(
    { token_hash: tokenHash },
    { $set: { used: true, used_at: now } },
  );
  await db.email_change_requests.updateMany(
    { user_id: user.user_id, used: false },
    { $set: { used: true, invalidated_at: now } },
  );

  const updatedUser = await db.users.findOne({ user_id: user.user_id }, { _id: 0 });
  const accessToken = createAccessToken({ sub: user.user_id });
  setSessionCookie(res, accessToken);

  await logAuditEvent(req, {
    eventType: "auth.email_change_confirm",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "user",
    resourceId: user.user_id,
    success: true,
    message: "email_changed",
    metadata: {
      previous_email: changeRequest.current_email,
      new_email: newEmail,
      provider: isSupabaseAuthAdminEnabled() ? "supabase_admin" : "local",
    },
  });

  sendJson(res, 200, {
    message: "Email updated successfully",
    access_token: accessToken,
    token_type: "bearer",
    user: sanitizeUser(updatedUser),
  });
}

async function handleAuthPasswordReset(req, res) {
  const body = await getJsonBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  const originUrl = normalizeOriginUrl(body.origin_url || "");

  if (!email) {
    throw new HttpError(400, "Email is required");
  }

  const genericResponse = { message: "If email exists, reset link will be sent" };
  const user = await db.users.findOne({ email }, { _id: 0 });

  const hasCustomEmailDelivery = await hasTransactionalEmailDelivery();
  if (isSupabaseAuthEnabled() && !hasCustomEmailDelivery) {
    let syncResult = null;
    if (user) {
      syncResult = await ensureSupabaseAuthAccountForLocalUser(user, {
        emailConfirmed: user.email_verified !== false,
      });
    }

    let delivery = { delivered: false, provider: "supabase", error: null };
    try {
      await supabaseAuthSendPasswordReset(req, email, { originUrl });
      delivery = { delivered: true, provider: "supabase", error: null };
    } catch (error) {
      delivery = {
        delivered: false,
        provider: "supabase",
        error: error?.message || "request_failed",
      };
    }

    await logAuditEvent(req, {
      eventType: "auth.password_reset_request",
      actorUserId: user?.user_id || null,
      targetUserId: user?.user_id || null,
      success: true,
      message: user ? "reset_token_issued" : "email_not_found",
      metadata: {
        email,
        delivery: delivery.delivered ? "sent" : "not_sent",
        provider: delivery.provider,
        delivery_error: delivery.error || null,
        supabase_user_sync: syncResult?.ensured
          ? (syncResult.created ? "created" : "existing")
          : (syncResult?.error ? "failed" : null),
        supabase_user_sync_error: syncResult?.error || null,
      },
    });

    if (AUTH_DEBUG_TOKENS) {
      genericResponse.debug = {
        email_delivery: {
          delivered: delivery.delivered,
          provider: delivery.provider,
          error: delivery.error || null,
        },
      };
    }
    sendJson(res, 200, genericResponse);
    return;
  }

  if (!user) {
    await logAuditEvent(req, {
      eventType: "auth.password_reset_request",
      success: true,
      message: "email_not_found",
      metadata: { email },
    });
    sendJson(res, 200, genericResponse);
    return;
  }

  const result = await issuePasswordResetForUser(req, user, {
    email,
    originUrl,
    failSilently: true,
  });

  if (AUTH_DEBUG_TOKENS) {
    genericResponse.debug = result?.debug || {
      email_delivery: {
        delivered: false,
        provider: "error",
        error: "request_failed",
      },
    };
  }
  sendJson(res, 200, genericResponse);
}

async function issuePasswordResetForUser(
  req,
  user,
  { email = "", originUrl = "", failSilently = false } = {},
) {
  const normalizedEmail = String(email || user?.email || "").trim().toLowerCase();

  try {
    await db.password_resets.updateMany(
      { user_id: user.user_id, used: false },
      { $set: { used: true, invalidated_at: isoNow() } },
    );

    const rawToken = tokenUrlSafe(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRE_MINUTES * 60 * 1000).toISOString();

    await db.password_resets.insertOne({
      reset_id: makeId("reset"),
      user_id: user.user_id,
      email: normalizedEmail,
      token_hash: tokenHash,
      expires_at: expiresAt,
      used: false,
      created_at: isoNow(),
      requested_ip: getClientIp(req),
    });

    const delivery = await sendPasswordResetEmail({
      req,
      email: normalizedEmail,
      token: rawToken,
      originUrl,
    });

    if (!delivery.delivered) {
      await db.password_resets.updateOne(
        { token_hash: tokenHash },
        { $set: { used: true, invalidated_at: isoNow() } },
      );
      throw new Error(delivery.error || "password_reset_email_not_delivered");
    }

    await logAuditEvent(req, {
      eventType: "auth.password_reset_request",
      actorUserId: user.user_id,
      targetUserId: user.user_id,
      success: true,
      message: "reset_token_issued",
      metadata: {
        email: normalizedEmail,
        delivery: "sent",
        provider: delivery.provider,
        delivery_error: null,
      },
    });

    return {
      delivered: true,
      provider: delivery.provider,
      debug: AUTH_DEBUG_TOKENS
        ? {
            reset_token: rawToken,
            email_delivery: {
              delivered: true,
              provider: delivery.provider,
              error: null,
            },
          }
        : null,
    };
  } catch (error) {
    console.error("Password reset request failed", error?.message || error);
    await logAuditEvent(req, {
      eventType: "auth.password_reset_request",
      actorUserId: user?.user_id || null,
      targetUserId: user?.user_id || null,
      success: false,
      message: "reset_request_failed",
      metadata: {
        email: normalizedEmail,
        error: error?.message || "request_failed",
      },
    });

    if (!failSilently) {
      throw new HttpError(400, `Password reset email failed: ${error?.message || "request_failed"}`);
    }

    return {
      delivered: false,
      provider: "error",
      debug: AUTH_DEBUG_TOKENS
        ? {
            email_delivery: {
              delivered: false,
              provider: "error",
              error: error?.message || "request_failed",
            },
          }
        : null,
    };
  }
}

async function handleAuthPasswordResetSelf(req, res) {
  const user = await getCurrentUser(req);
  const body = await getJsonBody(req);
  const originUrl = normalizeOriginUrl(body.origin_url || "");

  const result = await issuePasswordResetForUser(req, user, {
    email: user.email,
    originUrl,
    failSilently: false,
  });

  sendJson(res, 200, {
    message: "Password reset email sent",
    provider: result.provider,
  });
}

async function handleAuthPasswordResetValidate(req, res) {
  const accessToken = String(req.query.access_token || "").trim();
  if (accessToken) {
    try {
      await supabaseAuthGetUserByAccessToken(accessToken);
      sendJson(res, 200, { valid: true });
    } catch {
      sendJson(res, 200, { valid: false, detail: "Invalid or expired reset token" });
    }
    return;
  }

  const token = String(req.query.token || "").trim();
  if (!token) {
    throw new HttpError(400, "Token is required");
  }

  const tokenHash = hashToken(token);
  const reset = await db.password_resets.findOne({ token_hash: tokenHash, used: false }, { _id: 0 });
  if (!reset) {
    sendJson(res, 200, { valid: false, detail: "Invalid or expired reset token" });
    return;
  }

  const expiresAt = ensureDate(reset.expires_at, "Invalid or expired reset token");
  if (expiresAt < nowUtc()) {
    await db.password_resets.updateOne(
      { token_hash: tokenHash },
      { $set: { used: true, invalidated_at: isoNow() } },
    );
    sendJson(res, 200, { valid: false, detail: "Invalid or expired reset token" });
    return;
  }

  sendJson(res, 200, { valid: true });
}

async function handleAuthPasswordResetConfirm(req, res) {
  const body = await getJsonBody(req);
  const accessToken = String(body.access_token || "").trim();
  const token = String(body.token || "");
  const newPassword = String(body.new_password || "");

  if (newPassword.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters");
  }

  if (accessToken) {
    let supabaseUser = null;
    try {
      await supabaseAuthUpdatePassword(accessToken, newPassword);
      supabaseUser = await supabaseAuthGetUserByAccessToken(accessToken);
    } catch {
      await logAuditEvent(req, {
        eventType: "auth.password_reset_confirm",
        success: false,
        message: "invalid_token",
      });
      throw new HttpError(400, "Invalid or expired reset token");
    }

    const resolvedUser = await ensureLocalUserFromSupabase({
      email: supabaseUser.email,
      supabaseUserId: supabaseUser.id || "",
      name: supabaseUser.name || supabaseUser.email.split("@")[0] || "User",
      emailConfirmed: true,
      emailConfirmedAt: supabaseUser.email_confirmed_at || isoNow(),
    });

    await db.user_sessions.deleteMany({ user_id: resolvedUser.user_id });

    await logAuditEvent(req, {
      eventType: "auth.password_reset_confirm",
      actorUserId: resolvedUser.user_id,
      targetUserId: resolvedUser.user_id,
      resourceType: "user",
      resourceId: resolvedUser.user_id,
      success: true,
      message: "password_reset_success",
      metadata: { provider: "supabase" },
    });

    sendJson(res, 200, { message: "Password reset successfully" });
    return;
  }

  if (!token || !newPassword) {
    throw new HttpError(400, "Token and new password are required");
  }

  const tokenHash = hashToken(token);
  const reset = await db.password_resets.findOne({ token_hash: tokenHash, used: false }, { _id: 0 });
  if (!reset) {
    await logAuditEvent(req, {
      eventType: "auth.password_reset_confirm",
      success: false,
      message: "invalid_token",
    });
    throw new HttpError(400, "Invalid or expired reset token");
  }

  const expiresAt = ensureDate(reset.expires_at, "Invalid or expired reset token");
  if (expiresAt < nowUtc()) {
    await db.password_resets.updateOne(
      { token_hash: tokenHash },
      { $set: { used: true, invalidated_at: isoNow() } },
    );
    await logAuditEvent(req, {
      eventType: "auth.password_reset_confirm",
      actorUserId: reset.user_id,
      targetUserId: reset.user_id,
      success: false,
      message: "token_expired",
    });
    throw new HttpError(400, "Reset token expired");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.users.updateOne(
    { user_id: reset.user_id },
    {
      $set: {
        password_hash: passwordHash,
      },
    },
  );

  const resetUser = await db.users.findOne({ user_id: reset.user_id }, { _id: 0 });
  if (resetUser && isSupabaseAuthAdminEnabled()) {
    try {
      const resolvedSupabaseUserId = await resolveSupabaseUserIdForLocalUser(resetUser);
      if (resolvedSupabaseUserId) {
        await supabaseAuthAdminUpdateUserById(resolvedSupabaseUserId, {
          password: newPassword,
        });
      }
    } catch {
      // Do not block a successful local reset if Supabase sync is temporarily unavailable.
    }
  }

  await db.user_sessions.deleteMany({ user_id: reset.user_id });

  await db.password_resets.updateOne(
    { token_hash: tokenHash },
    {
      $set: { used: true, used_at: isoNow() },
    },
  );
  await db.password_resets.updateMany(
    { user_id: reset.user_id, used: false },
    { $set: { used: true, invalidated_at: isoNow() } },
  );

  await logAuditEvent(req, {
    eventType: "auth.password_reset_confirm",
    actorUserId: reset.user_id,
    targetUserId: reset.user_id,
    resourceType: "user",
    resourceId: reset.user_id,
    success: true,
    message: "password_reset_success",
  });

  sendJson(res, 200, { message: "Password reset successfully" });
}

async function handleAuthVerifyEmailConfirm(req, res) {
  const body = await getJsonBody(req);
  const accessToken = String(body.access_token || "").trim();
  if (accessToken) {
    let supabaseUser = null;
    try {
      supabaseUser = await supabaseAuthGetUserByAccessToken(accessToken);
    } catch {
      await logAuditEvent(req, {
        eventType: "auth.email_verify_confirm",
        success: false,
        message: "invalid_token",
      });
      throw new HttpError(400, "Invalid or expired verification token");
    }

    const localUser = await ensureLocalUserFromSupabase({
      email: supabaseUser.email,
      supabaseUserId: supabaseUser.id || "",
      name: supabaseUser.name || supabaseUser.email.split("@")[0] || "User",
      emailConfirmed: true,
      emailConfirmedAt: supabaseUser.email_confirmed_at || isoNow(),
    });

    const accessTokenJwt = createAccessToken({ sub: localUser.user_id });
    setSessionCookie(res, accessTokenJwt);

    await logAuditEvent(req, {
      eventType: "auth.email_verify_confirm",
      actorUserId: localUser.user_id,
      targetUserId: localUser.user_id,
      resourceType: "user",
      resourceId: localUser.user_id,
      success: true,
      message: "email_verified",
      metadata: { provider: "supabase" },
    });

    sendJson(res, 200, {
      message: "Email verified successfully",
      access_token: accessTokenJwt,
      token_type: "bearer",
      user: sanitizeUser(localUser),
    });
    return;
  }

  const token = String(body.token || "").trim();
  if (!token) {
    throw new HttpError(400, "Token is required");
  }

  const tokenHash = hashToken(token);
  const verification = await db.email_verifications.findOne(
    { token_hash: tokenHash, used: false },
    { _id: 0 },
  );
  if (!verification) {
    await logAuditEvent(req, {
      eventType: "auth.email_verify_confirm",
      success: false,
      message: "invalid_token",
    });
    throw new HttpError(400, "Invalid or expired verification token");
  }

  const expiresAt = ensureDate(verification.expires_at, "Invalid or expired verification token");
  if (expiresAt < nowUtc()) {
    await db.email_verifications.updateOne(
      { token_hash: tokenHash },
      { $set: { used: true, invalidated_at: isoNow() } },
    );
    await logAuditEvent(req, {
      eventType: "auth.email_verify_confirm",
      actorUserId: verification.user_id,
      targetUserId: verification.user_id,
      success: false,
      message: "token_expired",
    });
    throw new HttpError(400, "Verification token expired");
  }

  const now = isoNow();
  await db.users.updateOne(
    { user_id: verification.user_id },
    {
      $set: {
        email_verified: true,
        email_verified_at: now,
      },
    },
  );

  const verifiedUser = await db.users.findOne({ user_id: verification.user_id }, { _id: 0 });
  if (verifiedUser && isSupabaseAuthAdminEnabled()) {
    try {
      const resolvedSupabaseUserId = await resolveSupabaseUserIdForLocalUser(verifiedUser);
      if (resolvedSupabaseUserId) {
        await supabaseAuthAdminUpdateUserById(resolvedSupabaseUserId, {
          email_confirm: true,
        });
      }
    } catch {
      // Keep the local verification path valid even if Supabase sync is temporarily unavailable.
    }
  }

  await db.email_verifications.updateOne(
    { token_hash: tokenHash },
    { $set: { used: true, used_at: now } },
  );
  await db.email_verifications.updateMany(
    { user_id: verification.user_id, used: false },
    { $set: { used: true, invalidated_at: now } },
  );

  const user = await db.users.findOne({ user_id: verification.user_id }, { _id: 0 });
  const legacyAccessToken = createAccessToken({ sub: verification.user_id });
  setSessionCookie(res, legacyAccessToken);

  await logAuditEvent(req, {
    eventType: "auth.email_verify_confirm",
    actorUserId: verification.user_id,
    targetUserId: verification.user_id,
    resourceType: "user",
    resourceId: verification.user_id,
    success: true,
    message: "email_verified",
  });

  sendJson(res, 200, {
    message: "Email verified successfully",
    access_token: legacyAccessToken,
    token_type: "bearer",
    user: sanitizeUser(user),
  });
}

async function handleAuthVerifyEmailResend(req, res) {
  const body = await getJsonBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  const originUrl = normalizeOriginUrl(body.origin_url || "");
  if (!email) {
    throw new HttpError(400, "Email is required");
  }

  const generic = { message: "If account exists and is unverified, a verification email was sent" };
  const user = await db.users.findOne({ email }, { _id: 0 });

  const hasCustomEmailDelivery = await hasTransactionalEmailDelivery();
  if (isSupabaseAuthEnabled() && !hasCustomEmailDelivery) {
    let syncResult = null;
    if (user) {
      syncResult = await ensureSupabaseAuthAccountForLocalUser(user, {
        emailConfirmed: user.email_verified === true,
      });
    }

    let delivery = { delivered: false, provider: "supabase", error: null };
    try {
      await supabaseAuthResendVerification(req, email, { originUrl });
      delivery = { delivered: true, provider: "supabase", error: null };
    } catch (error) {
      delivery = {
        delivered: false,
        provider: "supabase",
        error: error?.message || "request_failed",
      };
    }

    await db.users.updateOne(
      { email },
      { $set: { email_verification_sent_at: isoNow() } },
    );

    await logAuditEvent(req, {
      eventType: "auth.email_verify_resend",
      actorUserId: user?.user_id || null,
      targetUserId: user?.user_id || null,
      success: true,
      message: user ? "verification_resent" : "email_not_found",
      metadata: {
        email,
        delivery: delivery.delivered ? "sent" : "not_sent",
        provider: delivery.provider,
        delivery_error: delivery.error || null,
        supabase_user_sync: syncResult?.ensured
          ? (syncResult.created ? "created" : "existing")
          : (syncResult?.error ? "failed" : null),
        supabase_user_sync_error: syncResult?.error || null,
      },
    });

    sendJson(res, 200, generic);
    return;
  }

  if (!user || user.email_verified === true) {
    await logAuditEvent(req, {
      eventType: "auth.email_verify_resend",
      targetUserId: user?.user_id || null,
      success: true,
      message: user ? "already_verified" : "email_not_found",
      metadata: { email },
    });
    sendJson(res, 200, generic);
    return;
  }

  const now = isoNow();
  await db.email_verifications.updateMany(
    { user_id: user.user_id, used: false },
    { $set: { used: true, invalidated_at: now } },
  );

  const verificationToken = tokenUrlSafe(32);
  const verificationTokenHash = hashToken(verificationToken);
  const verificationExpiresAt = new Date(
    Date.now() + EMAIL_VERIFICATION_EXPIRE_HOURS * 60 * 60 * 1000,
  ).toISOString();

  await db.email_verifications.insertOne({
    verification_id: makeId("verify"),
    user_id: user.user_id,
    email,
    token_hash: verificationTokenHash,
    expires_at: verificationExpiresAt,
    used: false,
    created_at: now,
  });
  await db.users.updateOne(
    { user_id: user.user_id },
    { $set: { email_verification_sent_at: now } },
  );

  const delivery = await sendEmailVerificationEmail({
    req,
    email,
    name: user.name,
    token: verificationToken,
    originUrl,
  });

  await logAuditEvent(req, {
    eventType: "auth.email_verify_resend",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    success: true,
    message: "verification_resent",
    metadata: {
      email,
      delivery: delivery.delivered ? "sent" : "not_sent",
      provider: delivery.provider,
      delivery_error: delivery.error || null,
    },
  });

  if (AUTH_DEBUG_TOKENS) {
    generic.debug = { verify_email_token: verificationToken };
  }
  sendJson(res, 200, generic);
}

async function handleFoldersGet(req, res) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_documents" });
  const folders = await db.folders.find({ user_id: workspace.accountId }, { _id: 0 });
  sendJson(res, 200, folders);
}

async function handleFoldersCreate(req, res) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_documents" });
  const body = await getJsonBody(req);
  const name = String(body.name || "").trim();

  if (!name) {
    throw new HttpError(400, "Folder name is required");
  }
  if (name.length > 120) {
    throw new HttpError(400, "Folder name must be 120 characters or fewer");
  }

  const duplicate = await db.folders.findOne(
    { user_id: workspace.accountId, name },
    { _id: 0, folder_id: 1 },
  );
  if (duplicate) {
    throw new HttpError(400, "A folder with this name already exists");
  }

  const folderDoc = {
    folder_id: makeId("folder"),
    user_id: workspace.accountId,
    name,
    created_at: isoNow(),
  };

  await db.folders.insertOne(folderDoc);
  await logAuditEvent(req, {
    eventType: "folder.create",
    ...getWorkspaceAuditFields(workspace, {
      name,
    }),
    resourceType: "folder",
    resourceId: folderDoc.folder_id,
    success: true,
    message: "folder_created",
  });
  sendJson(res, 200, folderDoc);
}

async function handleFoldersRename(req, res, folderId) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_documents" });
  const body = await getJsonBody(req);
  const name = String(body.name || "").trim();

  if (!name) {
    throw new HttpError(400, "Folder name is required");
  }
  if (name.length > 120) {
    throw new HttpError(400, "Folder name must be 120 characters or fewer");
  }

  const existingFolder = await db.folders.findOne(
    { folder_id: folderId, user_id: workspace.accountId },
    { _id: 0 },
  );
  if (!existingFolder) {
    throw new HttpError(404, "Folder not found");
  }

  const duplicate = await db.folders.findOne(
    { user_id: workspace.accountId, name },
    { _id: 0, folder_id: 1 },
  );
  if (duplicate && duplicate.folder_id !== folderId) {
    throw new HttpError(400, "A folder with this name already exists");
  }

  await db.folders.updateOne(
    { folder_id: folderId, user_id: workspace.accountId },
    {
      $set: {
        name,
      },
    },
  );

  await logAuditEvent(req, {
    eventType: "folder.rename",
    ...getWorkspaceAuditFields(workspace, {
      previous_name: existingFolder.name || null,
      name,
    }),
    resourceType: "folder",
    resourceId: folderId,
    success: true,
    message: "folder_renamed",
  });

  sendJson(res, 200, {
    ...existingFolder,
    name,
  });
}

async function handleFoldersDelete(req, res, folderId) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_documents" });
  const existingFolder = await db.folders.findOne(
    { folder_id: folderId, user_id: workspace.accountId },
    { _id: 0 },
  );
  if (!existingFolder) {
    throw new HttpError(404, "Folder not found");
  }
  const pdfsMovedToRoot = await db.pdfs.countDocuments({
    user_id: workspace.accountId,
    folder: folderId,
  });

  await db.pdfs.updateMany(
    {
      user_id: workspace.accountId,
      folder: folderId,
    },
    {
      $set: { folder: null },
    },
  );

  const result = await db.folders.deleteOne({
    folder_id: folderId,
    user_id: workspace.accountId,
  });

  if (result.deletedCount === 0) throw new HttpError(404, "Folder not found");

  await logAuditEvent(req, {
    eventType: "folder.delete",
    ...getWorkspaceAuditFields(workspace, {
      name: existingFolder.name || null,
      pdfs_moved_to_root: pdfsMovedToRoot,
    }),
    resourceType: "folder",
    resourceId: folderId,
    success: true,
    message: "folder_deleted",
  });

  sendJson(res, 200, { message: "Folder deleted successfully" });
}

async function handlePdfsUpload(req, res) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_documents" });
  const owner = workspace.ownerUser;
  if (owner.subscription_status !== "active") {
    throw new HttpError(403, "Active subscription required");
  }

  const { files } = await parseMultipart(req);
  const uploaded = Array.isArray(files.file) ? files.file[0] : files.file;

  if (!uploaded) {
    throw new HttpError(400, "File is required");
  }

  const filename = String(uploaded.originalFilename || uploaded.newFilename || "");
  if (!filename.toLowerCase().endsWith(".pdf")) {
    throw new HttpError(400, "Only PDF files are allowed");
  }

  const content = await fs.readFile(uploaded.filepath);
  const fileSize = content.length;

  const plan = owner.plan || "basic";
  const planInfo = (await getSubscriptionPlanDefinition(plan)) || (await getFallbackSubscriptionPlanDefinition());
  const maxStorage = Number(planInfo.storage_mb) * 1024 * 1024;

  if (Number(owner.storage_used || 0) + fileSize > maxStorage) {
    throw new HttpError(400, "Storage limit exceeded");
  }

  const pdfId = makeId("pdf");
  const safeFilename = `${pdfId}_${tokenHex(8)}.pdf`;
  const storageKey = `${workspace.accountId}/${safeFilename}`;
  const storageConfig = await getActiveStorageConfig();
  const activeStorageProvider = normalizeStorageProvider(storageConfig.active_provider);
  if (activeStorageProvider === STORAGE_PROVIDER_WASABI && !storageConfig.wasabi.configured) {
    throw new HttpError(500, "Wasabi storage is selected but not configured");
  }

  await putPdfBinary(activeStorageProvider, storageKey, workspace.accountId, content, "application/pdf");

  const now = isoNow();
  const directAccessToken = tokenUrlSafe(24);
  const pdfDoc = {
    pdf_id: pdfId,
    user_id: workspace.accountId,
    filename,
    original_filename: filename,
    storage_key: storageKey,
    storage_provider: activeStorageProvider,
    file_path: null,
    file_size: fileSize,
    folder: null,
    direct_access_token: directAccessToken,
    direct_access_enabled: false,
    direct_access_public: false,
    direct_access_updated_at: now,
    created_at: now,
  };

  await db.pdfs.insertOne(pdfDoc);
  await db.users.updateOne(
    { user_id: workspace.accountId },
    {
      $inc: { storage_used: fileSize },
    },
  );

  await logAuditEvent(req, {
    eventType: "pdf.upload",
    ...getWorkspaceAuditFields(workspace, {
      filename,
      file_size: fileSize,
      storage_provider: activeStorageProvider,
    }),
    resourceType: "pdf",
    resourceId: pdfId,
    success: true,
    message: "pdf_uploaded",
  });

  const preferredOrigin = await getPreferredUserOrigin(req, owner);
  const directAccessPath = buildDirectAccessPath(directAccessToken);

  sendJson(res, 200, {
    pdf_id: pdfId,
    filename,
    file_size: fileSize,
    folder: null,
    storage_provider: activeStorageProvider,
    direct_access_enabled: false,
    direct_access_public: false,
    direct_access_token: directAccessToken,
    direct_access_path: directAccessPath,
    direct_access_url: buildDirectAccessUrl(preferredOrigin, directAccessToken),
    created_at: now,
  });
}

async function normalizePdfRecordForResponse(pdf, userId) {
  const updates = {};
  const normalized = { ...pdf };

  if (!Object.prototype.hasOwnProperty.call(normalized, "original_filename")) {
    normalized.original_filename = normalized.filename;
    updates.original_filename = normalized.filename;
  }

  if (!Object.prototype.hasOwnProperty.call(normalized, "storage_provider")) {
    normalized.storage_provider = STORAGE_PROVIDER_SUPABASE;
    updates.storage_provider = STORAGE_PROVIDER_SUPABASE;
  } else {
    normalized.storage_provider = normalizeStorageProvider(normalized.storage_provider);
  }

  if (!Object.prototype.hasOwnProperty.call(normalized, "direct_access_token") || !normalized.direct_access_token) {
    normalized.direct_access_token = tokenUrlSafe(24);
    updates.direct_access_token = normalized.direct_access_token;
  }
  if (!Object.prototype.hasOwnProperty.call(normalized, "direct_access_enabled")) {
    normalized.direct_access_enabled = false;
    updates.direct_access_enabled = false;
  } else {
    normalized.direct_access_enabled = Boolean(normalized.direct_access_enabled);
  }
  if (!Object.prototype.hasOwnProperty.call(normalized, "direct_access_public")) {
    normalized.direct_access_public = false;
    updates.direct_access_public = false;
  } else {
    normalized.direct_access_public = Boolean(normalized.direct_access_public);
  }

  if (Object.keys(updates).length > 0) {
    updates.direct_access_updated_at = isoNow();
    await db.pdfs.updateOne(
      { pdf_id: normalized.pdf_id, user_id: userId },
      {
        $set: updates,
      },
    );
  }

  normalized.direct_access_path = buildDirectAccessPath(normalized.direct_access_token);
  normalized.direct_access_url = normalized.direct_access_path;
  normalized.direct_access_mode = normalized.direct_access_public ? "public" : "authenticated";
  return normalized;
}

async function handlePdfsGet(req, res) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_documents" });
  const folder = typeof req.query.folder === "string" ? req.query.folder : undefined;

  const query = { user_id: workspace.accountId };
  if (folder) {
    query.folder = folder;
  }

  const pdfs = await db.pdfs.find(
    query,
    {
      _id: 0,
      pdf_id: 1,
      user_id: 1,
      filename: 1,
      original_filename: 1,
      file_size: 1,
      folder: 1,
      created_at: 1,
      storage_provider: 1,
      direct_access_token: 1,
      direct_access_enabled: 1,
      direct_access_public: 1,
    },
    { sort: { created_at: -1 } },
  );
  const { domainById } = await getUserDomainMap(workspace.accountId);
  const preferredOrigin = await getPreferredUserOrigin(req, workspace.ownerUser, domainById);
  const normalized = [];
  for (const pdf of pdfs) {
    const next = await normalizePdfRecordForResponse(pdf, workspace.accountId);
    next.direct_access_path = buildDirectAccessPath(next.direct_access_token);
    next.direct_access_url = buildDirectAccessUrl(preferredOrigin, next.direct_access_token);
    normalized.push(next);
  }

  sendJson(res, 200, normalized);
}

function buildClientSecureLinkResponse(link, req, domainById, platformOrigin) {
  const domainDoc = link.custom_domain_id ? domainById.get(link.custom_domain_id) : null;
  let linkOrigin = platformOrigin;
  if (domainDoc?.domain) {
    try {
      linkOrigin = getOriginForDomainHost(domainDoc.domain, req);
    } catch {
      linkOrigin = platformOrigin;
    }
  }

  return {
    link_id: link.link_id,
    pdf_id: link.pdf_id,
    user_id: link.user_id,
    token: link.token,
    expiry_mode: link.expiry_mode,
    expiry_duration_seconds: link.expiry_duration_seconds,
    expiry_fixed_datetime: link.expiry_fixed_datetime,
    first_open_at: link.first_open_at,
    expires_at: link.expires_at,
    open_count: Number(link.open_count || 0),
    unique_ip_count: Array.isArray(link.unique_ips) ? link.unique_ips.length : 0,
    status: link.status,
    custom_expired_url: link.custom_expired_url || null,
    custom_expired_message: link.custom_expired_message || null,
    internal_title: link.internal_title || null,
    internal_note: link.internal_note || null,
    custom_domain_id: link.custom_domain_id || null,
    security_options: getNormalizedSecureLinkDefaults(link.security_options || {}),
    domain: domainDoc?.domain || null,
    secure_url: buildSecureViewUrl(linkOrigin, link.token),
    created_at: link.created_at,
  };
}

function getPdfWorkspaceSortValue(pdf, metricsByPdf, sortBy) {
  const metrics = metricsByPdf.get(pdf.pdf_id) || { activeLinks: 0, totalViews: 0, linkCount: 0 };
  if (sortBy === "name") return String(pdf.filename || "");
  if (sortBy === "size") return Number(pdf.file_size || 0);
  if (sortBy === "views") return Number(metrics.totalViews || 0);
  if (sortBy === "links") return Number(metrics.activeLinks || 0);
  return parseDate(pdf.created_at)?.getTime() || 0;
}

function comparePdfWorkspaceItems(left, right, metricsByPdf, sortBy) {
  const leftValue = getPdfWorkspaceSortValue(left, metricsByPdf, sortBy);
  const rightValue = getPdfWorkspaceSortValue(right, metricsByPdf, sortBy);

  if (sortBy === "name") {
    return String(leftValue).localeCompare(String(rightValue));
  }
  if (sortBy === "oldest") {
    return Number(leftValue) - Number(rightValue);
  }
  return Number(rightValue) - Number(leftValue);
}

async function handlePdfsWorkspaceGet(req, res) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_documents" });
  const folderFilter = String(req.query.folder || "all").trim() || "all";
  const searchQuery = String(req.query.search || "").trim().toLowerCase();
  const sortBy = String(req.query.sort || "recent").trim() || "recent";
  const limit = parseLimit(req.query.limit, 24, 100);
  const offset = Math.max(0, Number.parseInt(String(req.query.offset || "0"), 10) || 0);

  const [allPdfs, folders, rawLinks, { domainById }] = await Promise.all([
    db.pdfs.find(
      { user_id: workspace.accountId },
      {
        _id: 0,
        pdf_id: 1,
        user_id: 1,
        filename: 1,
        original_filename: 1,
        file_size: 1,
        folder: 1,
        created_at: 1,
        storage_provider: 1,
        direct_access_token: 1,
        direct_access_enabled: 1,
        direct_access_public: 1,
      },
      { sort: { created_at: -1 } },
    ),
    db.folders.find(
      { user_id: workspace.accountId },
      { _id: 0, folder_id: 1, name: 1 },
      { sort: { name: 1 } },
    ),
    db.links.find(
      { user_id: workspace.accountId },
      {
        _id: 0,
        link_id: 1,
        pdf_id: 1,
        user_id: 1,
        token: 1,
        expiry_mode: 1,
        expiry_duration_seconds: 1,
        expiry_fixed_datetime: 1,
        first_open_at: 1,
        expires_at: 1,
        open_count: 1,
        unique_ips: 1,
        status: 1,
        custom_expired_url: 1,
        custom_expired_message: 1,
        internal_title: 1,
        internal_note: 1,
        custom_domain_id: 1,
        security_options: 1,
        created_at: 1,
      },
      { sort: { created_at: -1 } },
    ),
    getUserDomainMap(workspace.accountId),
  ]);

  const platformOrigin = buildPublicBaseUrl(req);
  const preferredOrigin = await getPreferredUserOrigin(req, workspace.ownerUser, domainById);
  const links = rawLinks.map((link) =>
    buildClientSecureLinkResponse(link, req, domainById, platformOrigin),
  );

  const linksByPdf = new Map();
  const metricsByPdf = new Map();
  for (const link of links) {
    const pdfLinks = linksByPdf.get(link.pdf_id) || [];
    pdfLinks.push(link);
    linksByPdf.set(link.pdf_id, pdfLinks);

    const metrics = metricsByPdf.get(link.pdf_id) || { linkCount: 0, activeLinks: 0, totalViews: 0 };
    metrics.linkCount += 1;
    if (link.status === "active") {
      metrics.activeLinks += 1;
    }
    metrics.totalViews += Number(link.open_count || 0);
    metricsByPdf.set(link.pdf_id, metrics);
  }

  const folderStatsById = new Map(
    folders.map((folder) => [
      folder.folder_id,
      { pdfCount: 0, activeLinks: 0, totalViews: 0 },
    ]),
  );
  const rootStats = { pdfCount: 0, activeLinks: 0, totalViews: 0 };
  for (const pdf of allPdfs) {
    const metrics = metricsByPdf.get(pdf.pdf_id) || { activeLinks: 0, totalViews: 0 };
    const bucket = pdf.folder
      ? (folderStatsById.get(pdf.folder) || { pdfCount: 0, activeLinks: 0, totalViews: 0 })
      : rootStats;
    bucket.pdfCount += 1;
    bucket.activeLinks += Number(metrics.activeLinks || 0);
    bucket.totalViews += Number(metrics.totalViews || 0);
    if (pdf.folder && !folderStatsById.has(pdf.folder)) {
      folderStatsById.set(pdf.folder, bucket);
    }
  }

  const filteredPdfs = allPdfs
    .filter((pdf) => {
      const matchesFolder =
        folderFilter === "all"
          ? true
          : folderFilter === "root"
            ? !pdf.folder
            : pdf.folder === folderFilter;
      if (!matchesFolder) return false;

      if (!searchQuery) return true;
      if (String(pdf.filename || "").toLowerCase().includes(searchQuery)) return true;

      const pdfLinks = linksByPdf.get(pdf.pdf_id) || [];
      return pdfLinks.some((link) =>
        [link.token, link.internal_title, link.internal_note]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(searchQuery),
      );
    })
    .sort((left, right) => comparePdfWorkspaceItems(left, right, metricsByPdf, sortBy));

  const total = filteredPdfs.length;
  const pageItems = filteredPdfs.slice(offset, offset + limit);
  const pagePdfIds = new Set(pageItems.map((pdf) => pdf.pdf_id));
  const normalizedItems = [];
  for (const pdf of pageItems) {
    const normalizedPdf = await normalizePdfRecordForResponse(pdf, workspace.accountId);
    normalizedPdf.direct_access_path = buildDirectAccessPath(normalizedPdf.direct_access_token);
    normalizedPdf.direct_access_url = buildDirectAccessUrl(preferredOrigin, normalizedPdf.direct_access_token);
    normalizedItems.push(normalizedPdf);
  }

  const pageLinks = links.filter((link) => pagePdfIds.has(link.pdf_id));

  sendJson(res, 200, {
    items: normalizedItems,
    links: pageLinks,
    folders,
    meta: {
      total,
      limit,
      offset,
      has_more: offset + normalizedItems.length < total,
    },
    summary: {
      totals: {
        pdfCount: allPdfs.length,
        activeLinks: links.filter((link) => link.status === "active").length,
        totalViews: links.reduce((sum, link) => sum + Number(link.open_count || 0), 0),
      },
      folder_stats: {
        all: {
          pdfCount: allPdfs.length,
          activeLinks: links.filter((link) => link.status === "active").length,
          totalViews: links.reduce((sum, link) => sum + Number(link.open_count || 0), 0),
        },
        root: rootStats,
        by_folder: Object.fromEntries(folderStatsById.entries()),
      },
    },
  });
}

async function handlePdfsFileGet(req, res, pdfId) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_documents" });
  const pdf = await db.pdfs.findOne({ pdf_id: pdfId, user_id: workspace.accountId }, { _id: 0 });
  if (!pdf) {
    throw new HttpError(404, "PDF not found");
  }

  const normalizedPdf = await normalizePdfRecordForResponse(pdf, workspace.accountId);
  if (!normalizedPdf.storage_key && !normalizedPdf.file_path) {
    throw new HttpError(404, "PDF file is unavailable");
  }

  let file = null;
  if (normalizedPdf.storage_key) {
    file = await getPdfBinary(normalizedPdf);
  } else if (normalizedPdf.file_path) {
    const absolutePath = path.isAbsolute(normalizedPdf.file_path)
      ? normalizedPdf.file_path
      : path.join(process.cwd(), normalizedPdf.file_path);
    const content = await fs.readFile(absolutePath);
    file = {
      content,
      content_type: "application/pdf",
    };
  }

  if (!file?.content) {
    throw new HttpError(404, "PDF file is unavailable");
  }

  const inlineFilename = String(normalizedPdf.filename || "document.pdf").replace(/"/g, "");
  res.setHeader("Content-Type", file.content_type || "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${inlineFilename}"`);
  res.setHeader("Cache-Control", "private, max-age=120");
  res.statusCode = 200;
  res.end(file.content);
}

async function handlePdfsRename(req, res, pdfId) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_documents" });
  const body = await getJsonBody(req);
  const filename = String(body.filename || "").trim();

  if (!filename) {
    throw new HttpError(400, "Filename is required");
  }

  const existingPdf = await db.pdfs.findOne({ pdf_id: pdfId, user_id: workspace.accountId }, { _id: 0 });
  if (!existingPdf) {
    throw new HttpError(404, "PDF not found");
  }

  const result = await db.pdfs.updateOne(
    { pdf_id: pdfId, user_id: workspace.accountId },
    {
      $set: { filename },
    },
  );

  if (result.matchedCount === 0) {
    throw new HttpError(404, "PDF not found");
  }

  await logAuditEvent(req, {
    eventType: "pdf.rename",
    ...getWorkspaceAuditFields(workspace, {
      previous_filename: existingPdf.filename || null,
      filename,
    }),
    resourceType: "pdf",
    resourceId: pdfId,
    success: true,
    message: "pdf_renamed",
  });

  sendJson(res, 200, {
    message: "PDF renamed successfully",
    filename,
  });
}

async function handlePdfsMove(req, res, pdfId) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_documents" });
  const body = await getJsonBody(req);
  const folder = body.folder || null;
  const existingPdf = await db.pdfs.findOne({ pdf_id: pdfId, user_id: workspace.accountId }, { _id: 0 });
  if (!existingPdf) {
    throw new HttpError(404, "PDF not found");
  }
  let existingFolder = null;

  if (folder) {
    existingFolder = await db.folders.findOne(
      { folder_id: folder, user_id: workspace.accountId },
      { _id: 0 },
    );
    if (!existingFolder) {
      throw new HttpError(404, "Folder not found");
    }
  }

  const result = await db.pdfs.updateOne(
    { pdf_id: pdfId, user_id: workspace.accountId },
    {
      $set: { folder },
    },
  );

  if (result.matchedCount === 0) {
    throw new HttpError(404, "PDF not found");
  }

  const previousFolder = existingPdf.folder
    ? await db.folders.findOne(
      { folder_id: existingPdf.folder, user_id: workspace.accountId },
      { _id: 0 },
    )
    : null;

  await logAuditEvent(req, {
    eventType: "pdf.move",
    ...getWorkspaceAuditFields(workspace, {
      previous_folder_id: existingPdf.folder || null,
      previous_folder_name: previousFolder?.name || null,
      folder_id: folder,
      folder_name: existingFolder?.name || null,
    }),
    resourceType: "pdf",
    resourceId: pdfId,
    success: true,
    message: "pdf_moved",
  });

  sendJson(res, 200, { message: "PDF moved successfully" });
}

function parseOptionalBoolean(value, fieldName) {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  throw new HttpError(400, `${fieldName} must be boolean`);
}

async function handlePdfsDirectAccessUpdate(req, res, pdfId) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_documents" });
  const body = await getJsonBody(req);
  const enabled = parseOptionalBoolean(body.enabled, "enabled");
  const isPublic = parseOptionalBoolean(body.is_public, "is_public");

  if (enabled === undefined && isPublic === undefined) {
    throw new HttpError(400, "enabled or is_public is required");
  }

  const existing = await db.pdfs.findOne({ pdf_id: pdfId, user_id: workspace.accountId }, { _id: 0 });
  if (!existing) {
    throw new HttpError(404, "PDF not found");
  }

  const updateData = {};
  if (enabled !== undefined) {
    updateData.direct_access_enabled = enabled;
  }
  if (isPublic !== undefined) {
    updateData.direct_access_public = isPublic;
  }
  if (!existing.direct_access_token) {
    updateData.direct_access_token = tokenUrlSafe(24);
  }
  if (!Object.prototype.hasOwnProperty.call(existing, "storage_provider")) {
    updateData.storage_provider = STORAGE_PROVIDER_SUPABASE;
  }
  updateData.direct_access_updated_at = isoNow();

  await db.pdfs.updateOne(
    { pdf_id: pdfId, user_id: workspace.accountId },
    {
      $set: updateData,
    },
  );

  const updated = await db.pdfs.findOne({ pdf_id: pdfId, user_id: workspace.accountId }, { _id: 0 });
  const normalized = await normalizePdfRecordForResponse(updated, workspace.accountId);
  const preferredOrigin = await getPreferredUserOrigin(req, workspace.ownerUser);
  const directAccessPath = buildDirectAccessPath(normalized.direct_access_token);

  await logAuditEvent(req, {
    eventType: "pdf.direct_access_update",
    ...getWorkspaceAuditFields(workspace, {
      direct_access_enabled: normalized.direct_access_enabled,
      direct_access_public: normalized.direct_access_public,
    }),
    resourceType: "pdf",
    resourceId: pdfId,
    success: true,
    message: "direct_access_settings_updated",
  });

  sendJson(res, 200, {
    message: "Direct access settings updated",
    pdf_id: pdfId,
    direct_access_enabled: normalized.direct_access_enabled,
    direct_access_public: normalized.direct_access_public,
    direct_access_mode: normalized.direct_access_mode,
    direct_access_token: normalized.direct_access_token,
    direct_access_path: directAccessPath,
    direct_access_url: buildDirectAccessUrl(preferredOrigin, normalized.direct_access_token),
  });
}

async function removeLegacyFileIfExists(filePath) {
  if (!filePath) return;
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  try {
    await fs.unlink(absolutePath);
  } catch {
    // ignore missing legacy files
  }
}

async function handlePdfsDelete(req, res, pdfId) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_documents" });
  const pdf = await db.pdfs.findOne({ pdf_id: pdfId, user_id: workspace.accountId }, { _id: 0 });

  if (!pdf) {
    throw new HttpError(404, "PDF not found");
  }

  if (pdf.storage_key) {
    await deletePdfBinary(pdf);
  } else if (pdf.file_path) {
    await removeLegacyFileIfExists(pdf.file_path);
  }

  await db.pdfs.deleteOne({ pdf_id: pdfId, user_id: workspace.accountId });

  await db.users.updateOne(
    { user_id: workspace.accountId },
    {
      $inc: { storage_used: -Number(pdf.file_size || 0) },
    },
  );

  await db.links.updateMany(
    { pdf_id: pdfId, user_id: workspace.accountId },
    {
      $set: { status: "revoked" },
    },
  );

  await logAuditEvent(req, {
    eventType: "pdf.delete",
    ...getWorkspaceAuditFields(workspace, {
      file_size: Number(pdf.file_size || 0),
    }),
    resourceType: "pdf",
    resourceId: pdfId,
    success: true,
    message: "pdf_deleted",
  });

  sendJson(res, 200, { message: "PDF deleted successfully" });
}

async function handleLinksCreate(req, res) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_links" });
  const owner = workspace.ownerUser;
  const body = await getJsonBody(req);

  const pdfId = String(body.pdf_id || "");
  if (!pdfId) {
    throw new HttpError(400, "pdf_id is required");
  }

  const pdf = await db.pdfs.findOne({ pdf_id: pdfId, user_id: workspace.accountId }, { _id: 0 });
  if (!pdf) {
    throw new HttpError(404, "PDF not found");
  }

  if (owner.subscription_status !== "active") {
    throw new HttpError(403, "Active subscription required");
  }

  const expiryMode = String(body.expiry_mode || "");
  if (!["countdown", "fixed", "manual"].includes(expiryMode)) {
    throw new HttpError(400, "Invalid expiry mode");
  }

  const now = nowUtc();
  let expiryDurationSeconds = null;
  let expiresAt = null;

  if (expiryMode === "countdown") {
    const days = Number.parseInt(body.expiry_days || 0, 10);
    const hours = Number.parseInt(body.expiry_hours || 0, 10);
    const minutes = Number.parseInt(body.expiry_minutes || 0, 10);
    const seconds = Number.parseInt(body.expiry_seconds || 0, 10);

    if ([days, hours, minutes, seconds].some((value) => Number.isNaN(value) || value < 0)) {
      throw new HttpError(400, "Countdown values cannot be negative");
    }
    if (minutes > 59 || seconds > 59) {
      throw new HttpError(400, "Minutes and seconds must be between 0 and 59");
    }

    expiryDurationSeconds = days * 86400 + hours * 3600 + minutes * 60 + seconds;
    if (expiryDurationSeconds <= 0) {
      throw new HttpError(400, "Countdown duration must be greater than zero");
    }
  } else if (expiryMode === "fixed") {
    if (!body.expiry_fixed_datetime) {
      throw new HttpError(400, "Fixed expiry datetime is required");
    }
    expiresAt = ensureDate(body.expiry_fixed_datetime, "Fixed expiry datetime is invalid");
    if (expiresAt <= now) {
      throw new HttpError(400, "Fixed expiry must be in the future");
    }
  }

  const explicitCustomDomainRequested = body.custom_domain_id !== undefined;
  let customDomainId;
  if (!explicitCustomDomainRequested) {
    customDomainId = owner.preferred_domain_id || null;
  } else {
    const rawDomainId = String(body.custom_domain_id || "").trim();
    customDomainId = rawDomainId && rawDomainId !== "platform" ? rawDomainId : null;
  }

  let customDomain = null;
  if (customDomainId) {
    customDomain = await db.domains.findOne(
      { domain_id: customDomainId, user_id: workspace.accountId },
      { _id: 0 },
    );
    if (!customDomain && explicitCustomDomainRequested) {
      throw new HttpError(404, "Selected custom domain was not found");
    }
    if (customDomain && !isDomainReadyForLinks(customDomain)) {
      if (explicitCustomDomainRequested) {
        throw new HttpError(
          400,
          "Selected custom domain is not verified with active SSL. Verify DNS and SSL first.",
        );
      }
      customDomain = null;
      customDomainId = null;
    }
    if (!customDomain && !explicitCustomDomainRequested) {
      customDomainId = null;
    }
  }

  const internalTitle = normalizeOptionalText(
    body.internal_title !== undefined ? body.internal_title : body.title,
    { maxLength: 140 },
  );
  const internalNote = normalizeOptionalText(
    body.internal_note !== undefined ? body.internal_note : body.description,
    { maxLength: 400 },
  );
  const accountLinkDefaults = getNormalizedSecureLinkDefaults(workspace.actor.secure_link_defaults || {});
  const requestedSecurityOptions =
    body.security_options && typeof body.security_options === "object" ? body.security_options : {};
  const securityOptions = sanitizeSecureLinkDefaultsInput({
    ...accountLinkDefaults,
    ...requestedSecurityOptions,
  });

  const linkDoc = {
    link_id: makeId("link"),
    pdf_id: pdfId,
    user_id: workspace.accountId,
    token: tokenUrlSafe(32),
    expiry_mode: expiryMode,
    expiry_duration_seconds: expiryDurationSeconds,
    expiry_fixed_datetime: expiresAt ? expiresAt.toISOString() : null,
    first_open_at: null,
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    open_count: 0,
    unique_ips: [],
    ip_sessions: {},
    status: "active",
    custom_expired_url: body.custom_expired_url || null,
    custom_expired_message: body.custom_expired_message || null,
    internal_title: internalTitle,
    internal_note: internalNote,
    custom_domain_id: customDomainId,
    security_options: securityOptions,
    first_viewer_ip: null,
    created_at: now.toISOString(),
    access_log: [],
  };

  await db.links.insertOne(linkDoc);
  await logAuditEvent(req, {
    eventType: "link.create",
    ...getWorkspaceAuditFields(workspace, {
      pdf_id: pdfId,
      expiry_mode: expiryMode,
      internal_title: internalTitle,
      custom_domain_id: customDomainId,
      security_options: securityOptions,
    }),
    resourceType: "link",
    resourceId: linkDoc.link_id,
    success: true,
    message: "secure_link_created",
  });
  let secureOrigin = buildPublicBaseUrl(req);
  if (customDomain?.domain) {
    try {
      secureOrigin = getOriginForDomainHost(customDomain.domain, req);
    } catch {
      secureOrigin = buildPublicBaseUrl(req);
    }
  }
  sendJson(res, 200, {
    ...linkDoc,
    domain: customDomain?.domain || null,
    secure_url: buildSecureViewUrl(secureOrigin, linkDoc.token),
  });
}

async function handleLinksGet(req, res) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_links" });
  const limit =
    req.query.limit !== undefined
      ? parseLimit(req.query.limit, 20, 500)
      : null;
  const [links, { domainById }] = await Promise.all([
    db.links.find(
      { user_id: workspace.accountId },
      {
        _id: 0,
        link_id: 1,
        pdf_id: 1,
        user_id: 1,
        token: 1,
        expiry_mode: 1,
        expiry_duration_seconds: 1,
        expiry_fixed_datetime: 1,
        first_open_at: 1,
        expires_at: 1,
        open_count: 1,
        unique_ips: 1,
        status: 1,
        custom_expired_url: 1,
        custom_expired_message: 1,
        internal_title: 1,
        internal_note: 1,
        custom_domain_id: 1,
        security_options: 1,
        created_at: 1,
      },
      {
        sort: { created_at: -1 },
        ...(limit ? { limit } : {}),
      },
    ),
    getUserDomainMap(workspace.accountId),
  ]);

  const platformOrigin = buildPublicBaseUrl(req);
  const responseLinks = links.map((link) =>
    buildClientSecureLinkResponse(link, req, domainById, platformOrigin),
  );

  sendJson(res, 200, responseLinks);
}

async function handleLinksUpdate(req, res, linkId) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_links" });
  const body = await getJsonBody(req);
  const link = await db.links.findOne({ link_id: linkId, user_id: workspace.accountId }, { _id: 0 });

  if (!link) {
    throw new HttpError(404, "Link not found");
  }

  const update = {};

  if (body.internal_title !== undefined || body.title !== undefined) {
    update.internal_title = normalizeOptionalText(
      body.internal_title !== undefined ? body.internal_title : body.title,
      { maxLength: 140 },
    );
  }

  if (body.internal_note !== undefined || body.description !== undefined) {
    update.internal_note = normalizeOptionalText(
      body.internal_note !== undefined ? body.internal_note : body.description,
      { maxLength: 400 },
    );
  }

  if (body.custom_expired_url !== undefined) {
    update.custom_expired_url = normalizeOptionalText(body.custom_expired_url, { maxLength: 2000 });
  }

  if (body.custom_expired_message !== undefined) {
    update.custom_expired_message = normalizeOptionalText(body.custom_expired_message, { maxLength: 4000 });
  }

  if (body.security_options !== undefined) {
    const mergedSecurityOptions = {
      ...getNormalizedSecureLinkDefaults(link.security_options || {}),
      ...(body.security_options && typeof body.security_options === "object" ? body.security_options : {}),
    };
    update.security_options = sanitizeSecureLinkDefaultsInput(mergedSecurityOptions);
  }

  if (Object.keys(update).length === 0) {
    throw new HttpError(400, "No link settings were provided");
  }

  update.updated_at = isoNow();

  await db.links.updateOne(
    { link_id: linkId, user_id: workspace.accountId },
    { $set: update },
  );

  const updatedLink = await db.links.findOne({ link_id: linkId, user_id: workspace.accountId }, { _id: 0 });
  const platformOrigin = buildPublicBaseUrl(req);
  let domain = null;
  let linkOrigin = platformOrigin;

  if (updatedLink?.custom_domain_id) {
    const domainDoc = await db.domains.findOne(
      { domain_id: updatedLink.custom_domain_id, user_id: workspace.accountId },
      { _id: 0 },
    );
    domain = domainDoc?.domain || null;
    if (domain) {
      try {
        linkOrigin = getOriginForDomainHost(domain, req);
      } catch {
        linkOrigin = platformOrigin;
      }
    }
  }

  await logAuditEvent(req, {
    eventType: "link.update",
    ...getWorkspaceAuditFields(workspace, {
      internal_title: updatedLink?.internal_title || null,
      security_options: getNormalizedSecureLinkDefaults(updatedLink?.security_options || {}),
    }),
    resourceType: "link",
    resourceId: linkId,
    success: true,
    message: "secure_link_updated",
  });

  sendJson(res, 200, {
    link_id: updatedLink.link_id,
    pdf_id: updatedLink.pdf_id,
    user_id: updatedLink.user_id,
    token: updatedLink.token,
    expiry_mode: updatedLink.expiry_mode,
    expiry_duration_seconds: updatedLink.expiry_duration_seconds,
    expiry_fixed_datetime: updatedLink.expiry_fixed_datetime,
    first_open_at: updatedLink.first_open_at,
    expires_at: updatedLink.expires_at,
    open_count: Number(updatedLink.open_count || 0),
    unique_ip_count: Array.isArray(updatedLink.unique_ips) ? updatedLink.unique_ips.length : 0,
    status: updatedLink.status,
    custom_expired_url: updatedLink.custom_expired_url || null,
    custom_expired_message: updatedLink.custom_expired_message || null,
    internal_title: updatedLink.internal_title || null,
    internal_note: updatedLink.internal_note || null,
    custom_domain_id: updatedLink.custom_domain_id || null,
    security_options: getNormalizedSecureLinkDefaults(updatedLink.security_options || {}),
    domain,
    secure_url: buildSecureViewUrl(linkOrigin, updatedLink.token),
    created_at: updatedLink.created_at,
    updated_at: updatedLink.updated_at,
  });
}

async function handleLinksStats(req, res, linkId) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_links" });
  const link = await db.links.findOne({ link_id: linkId, user_id: workspace.accountId }, { _id: 0 });

  if (!link) {
    throw new HttpError(404, "Link not found");
  }

  sendJson(res, 200, {
    link_id: linkId,
    open_count: Number(link.open_count || 0),
    unique_ips: link.unique_ips || [],
    unique_ip_count: (link.unique_ips || []).length,
    access_log: (link.access_log || []).slice(-50),
    ip_sessions: link.ip_sessions || {},
    status: link.status,
    created_at: link.created_at,
    internal_title: link.internal_title || null,
    internal_note: link.internal_note || null,
    security_options: getNormalizedSecureLinkDefaults(link.security_options || {}),
    first_open_at: link.first_open_at,
    expires_at: link.expires_at,
  });
}

async function handleLinksDelete(req, res, linkId) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_links" });
  const result = await db.links.deleteOne({ link_id: linkId, user_id: workspace.accountId });
  if (result.deletedCount === 0) {
    throw new HttpError(404, "Link not found");
  }
  await logAuditEvent(req, {
    eventType: "link.delete",
    ...getWorkspaceAuditFields(workspace),
    resourceType: "link",
    resourceId: linkId,
    success: true,
    message: "link_deleted",
  });
  sendJson(res, 200, { message: "Link deleted successfully" });
}

async function handleLinksRevoke(req, res, linkId) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_links" });
  const result = await db.links.updateOne(
    { link_id: linkId, user_id: workspace.accountId },
    { $set: { status: "revoked" } },
  );

  if (result.matchedCount === 0) {
    throw new HttpError(404, "Link not found");
  }

  await logAuditEvent(req, {
    eventType: "link.revoke",
    ...getWorkspaceAuditFields(workspace),
    resourceType: "link",
    resourceId: linkId,
    success: true,
    message: "link_revoked",
  });

  sendJson(res, 200, { message: "Link revoked successfully" });
}

async function handleViewToken(req, res, token) {
  const link = await db.links.findOne({ token }, { _id: 0 });
  if (!link) {
    throw new HttpError(404, "Link not found");
  }

  if (link.status === "revoked") {
    sendJson(res, 200, {
      status: "revoked",
      custom_expired_url: link.custom_expired_url,
      custom_expired_message: link.custom_expired_message || "This link has been revoked",
    });
    return;
  }

  const user = await db.users.findOne({ user_id: link.user_id }, { _id: 0 });
  if (!user || user.subscription_status !== "active") {
    sendJson(res, 200, {
      status: "expired",
      custom_expired_message: "The owner's subscription is inactive",
    });
    return;
  }

  const now = nowUtc();
  const clientIp = getClientIp(req);
  const clientGeo = getClientGeo(req);
  const sessionKey = ipSessionKey(clientIp);
  const viewerSessionId = getViewerSessionId(req);
  const viewerId = viewerSessionId || `${clientIp}_${tokenHex(4)}`;
  const securityOptions = getNormalizedSecureLinkDefaults(link.security_options || {});
  const blockedMessage = getLinkAccessBlockMessage(link, securityOptions, clientIp, clientGeo, req);
  const viewerSessionConflictMessage = getViewerSessionConflictMessage(
    link,
    securityOptions,
    viewerSessionId,
    now,
  );

  if (blockedMessage || viewerSessionConflictMessage) {
    sendJson(res, 200, {
      status: "blocked",
      custom_expired_message: blockedMessage || viewerSessionConflictMessage,
      viewer_id: viewerId,
      security_options: buildSecureViewerPayload(securityOptions),
    });
    return;
  }

  let viewerSession = getViewerSessionByIp(link, sessionKey, clientIp);
  if (securityOptions.nda_required && !viewerSession?.nda_accepted_at) {
    if (isSingleViewerSessionEnabled(securityOptions) && viewerSessionId) {
      await db.links.updateOne(
        { token },
        {
          $set: {
            active_viewer_session: buildActiveViewerSessionRecord(viewerSessionId, clientIp, now),
          },
        },
      );
    }
    sendJson(res, 200, {
      status: "nda_required",
      nda: {
        title: securityOptions.nda_title,
        text: securityOptions.nda_text,
        accept_label: securityOptions.nda_accept_label,
      },
      viewer_id: viewerId,
      security_options: buildSecureViewerPayload(securityOptions),
    });
    return;
  }

  let expiresAt = null;
  let remainingSeconds = null;
  const pendingSetOps = {};

  if (link.expiry_mode === "countdown") {
    if (viewerSession?.first_open) {
      const firstOpen = ensureDate(viewerSession.first_open, "Invalid session timing");
      expiresAt = new Date(firstOpen.getTime() + Number(link.expiry_duration_seconds || 0) * 1000);
      if (now >= expiresAt) {
        sendJson(res, 200, {
          status: "expired",
          custom_expired_url: link.custom_expired_url,
          custom_expired_message:
            link.custom_expired_message || "Your viewing session has expired",
        });
        return;
      }
      remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
    } else {
      const duration = Number(link.expiry_duration_seconds || 0);
      expiresAt = new Date(now.getTime() + duration * 1000);
      remainingSeconds = duration;

      const newSession = {
        ...(viewerSession && typeof viewerSession === "object" ? viewerSession : {}),
        ip: clientIp,
        first_open: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      };
      pendingSetOps[`ip_sessions.${sessionKey}`] = newSession;
      if (!link.first_open_at) {
        pendingSetOps.first_open_at = now.toISOString();
      }
      viewerSession = newSession;
    }
  } else if (link.expiry_mode === "fixed" && link.expires_at) {
    expiresAt = ensureDate(link.expires_at, "Invalid expiry time");
    if (now >= expiresAt) {
      await db.links.updateOne(
        { token },
        {
          $set: { status: "expired" },
        },
      );
      sendJson(res, 200, {
        status: "expired",
        custom_expired_url: link.custom_expired_url,
        custom_expired_message: link.custom_expired_message || "This link has expired",
      });
      return;
    }
    remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  }

  const accessEntry = {
    ip: clientIp,
    country: clientGeo.country,
    region: clientGeo.region,
    city: clientGeo.city,
    timestamp: now.toISOString(),
    user_agent: String(req.headers["user-agent"] || "unknown").slice(0, 200),
  };

  const updateOps = {
    $inc: { open_count: 1 },
    $push: { access_log: { $each: [accessEntry], $slice: -100 } },
  };

  if (!(link.unique_ips || []).includes(clientIp)) {
    updateOps.$addToSet = { unique_ips: clientIp };
  }
  if (securityOptions.lock_to_first_ip && !link.first_viewer_ip) {
    pendingSetOps.first_viewer_ip = clientIp;
  }
  if (isSingleViewerSessionEnabled(securityOptions) && viewerSessionId) {
    pendingSetOps.active_viewer_session = buildActiveViewerSessionRecord(viewerSessionId, clientIp, now);
  }
  if (Object.keys(pendingSetOps).length > 0) {
    updateOps.$set = pendingSetOps;
  }

  await db.links.updateOne({ token }, updateOps);

  const watermarkConfig = getNormalizedWatermarkConfig(securityOptions);

  sendJson(res, 200, {
    status: "active",
    pdf_url: `/api/view/${token}/pdf`,
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    remaining_seconds: remainingSeconds,
    watermark_data: {
      ip: clientIp,
      timestamp: now.toISOString(),
      link_id: link.link_id,
      viewer_session_id: viewerId,
      enhanced: isEnhancedWatermarkEnabled(securityOptions),
      mode: watermarkConfig.mode,
      text: watermarkConfig.text || null,
      logo_url: watermarkConfig.logo_url || null,
    },
    custom_expired_url: link.custom_expired_url,
    custom_expired_message: link.custom_expired_message,
    viewer_id: viewerId,
    security_options: buildSecureViewerPayload(securityOptions),
  });
}

async function handleViewTokenNdaAccept(req, res, token) {
  const link = await db.links.findOne({ token }, { _id: 0 });
  if (!link) {
    throw new HttpError(404, "Link not found");
  }
  if (link.status === "revoked") {
    throw new HttpError(410, "This link has been revoked");
  }

  const owner = await db.users.findOne({ user_id: link.user_id }, { _id: 0 });
  if (!owner || owner.subscription_status !== "active") {
    throw new HttpError(410, "The owner's subscription is inactive");
  }

  const securityOptions = getNormalizedSecureLinkDefaults(link.security_options || {});
  if (!securityOptions.nda_required) {
    sendJson(res, 200, { message: "NDA is not required for this link" });
    return;
  }

  const clientIp = getClientIp(req);
  const clientGeo = getClientGeo(req);
  const viewerSessionId = getViewerSessionId(req);
  const blockedMessage = getLinkAccessBlockMessage(link, securityOptions, clientIp, clientGeo, req);
  if (blockedMessage) {
    throw new HttpError(403, blockedMessage);
  }
  const viewerSessionConflictMessage = getViewerSessionConflictMessage(
    link,
    securityOptions,
    viewerSessionId,
    nowUtc(),
  );
  if (viewerSessionConflictMessage) {
    throw new HttpError(409, viewerSessionConflictMessage);
  }

  const sessionKey = ipSessionKey(clientIp);
  const existingSession = getViewerSessionByIp(link, sessionKey, clientIp);
  const nextSession = {
    ...(existingSession && typeof existingSession === "object" ? existingSession : {}),
    ip: clientIp,
    nda_accepted_at: isoNow(),
  };

  const setOps = {
    [`ip_sessions.${sessionKey}`]: nextSession,
  };
  if (securityOptions.lock_to_first_ip && !link.first_viewer_ip) {
    setOps.first_viewer_ip = clientIp;
  }
  if (isSingleViewerSessionEnabled(securityOptions) && viewerSessionId) {
    setOps.active_viewer_session = buildActiveViewerSessionRecord(viewerSessionId, clientIp, nowUtc());
  }

  await db.links.updateOne(
    { token },
    {
      $set: setOps,
    },
  );

  sendJson(res, 200, { message: "NDA accepted successfully" });
}

async function handleViewTokenPdf(req, res, token) {
  const link = await db.links.findOne({ token }, { _id: 0 });
  if (!link || link.status === "revoked") {
    throw new HttpError(404, "Link not found or revoked");
  }
  const owner = await db.users.findOne({ user_id: link.user_id }, { _id: 0 });
  if (!owner || owner.subscription_status !== "active") {
    throw new HttpError(410, "The owner's subscription is inactive");
  }

  const clientIp = getClientIp(req);
  const clientGeo = getClientGeo(req);
  const sessionKey = ipSessionKey(clientIp);
  const now = nowUtc();
  const viewerSessionId = getViewerSessionId(req);
  const securityOptions = getNormalizedSecureLinkDefaults(link.security_options || {});
  const blockedMessage = getLinkAccessBlockMessage(link, securityOptions, clientIp, clientGeo, req);
  if (blockedMessage) {
    throw new HttpError(403, blockedMessage);
  }
  const viewerSessionConflictMessage = getViewerSessionConflictMessage(
    link,
    securityOptions,
    viewerSessionId,
    now,
  );
  if (viewerSessionConflictMessage) {
    throw new HttpError(409, viewerSessionConflictMessage);
  }
  let viewerSession = getViewerSessionByIp(link, sessionKey, clientIp);
  if (securityOptions.nda_required && !viewerSession?.nda_accepted_at) {
    throw new HttpError(403, "NDA acceptance is required before viewing this document");
  }
  const pendingSetOps = {};

  if (link.expiry_mode === "countdown") {
    if (viewerSession?.expires_at) {
      const expiresAt = ensureDate(viewerSession.expires_at, "Invalid session timing");
      if (now >= expiresAt) {
        throw new HttpError(410, "Your viewing session has expired");
      }
    } else {
      const duration = Number(link.expiry_duration_seconds || 0);
      const expiresAt = new Date(now.getTime() + duration * 1000);
      const newSession = {
        ...(viewerSession && typeof viewerSession === "object" ? viewerSession : {}),
        ip: clientIp,
        first_open: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      };
      pendingSetOps[`ip_sessions.${sessionKey}`] = newSession;
      if (!link.first_open_at) {
        pendingSetOps.first_open_at = now.toISOString();
      }
      viewerSession = newSession;
    }
  } else if (link.expiry_mode === "fixed" && link.expires_at) {
    const expiresAt = ensureDate(link.expires_at, "Invalid expiry time");
    if (now >= expiresAt) {
      throw new HttpError(410, "Link expired");
    }
  }
  if (securityOptions.lock_to_first_ip && !link.first_viewer_ip) {
    pendingSetOps.first_viewer_ip = clientIp;
  }
  if (isSingleViewerSessionEnabled(securityOptions) && viewerSessionId) {
    pendingSetOps.active_viewer_session = buildActiveViewerSessionRecord(viewerSessionId, clientIp, now);
  }
  if (Object.keys(pendingSetOps).length > 0) {
    await db.links.updateOne(
      { token },
      {
        $set: pendingSetOps,
      },
    );
  }

  const pdf = await db.pdfs.findOne({ pdf_id: link.pdf_id }, { _id: 0 });
  if (!pdf) {
    throw new HttpError(404, "PDF not found");
  }

  const headers = {
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };

  if (pdf.storage_key) {
    const fileRow = await getPdfBinary(pdf);
    if (!fileRow) {
      throw new HttpError(404, "PDF file not found");
    }

    sendBuffer(res, 200, fileRow.content, fileRow.content_type || "application/pdf", headers);
    return;
  }

  if (pdf.file_path) {
    const absolutePath = path.isAbsolute(pdf.file_path)
      ? pdf.file_path
      : path.join(process.cwd(), pdf.file_path);
    try {
      const content = await fs.readFile(absolutePath);
      sendBuffer(res, 200, content, "application/pdf", headers);
      return;
    } catch {
      throw new HttpError(404, "PDF file not found");
    }
  }

  throw new HttpError(404, "PDF file not found");
}

async function handleViewTokenHeartbeat(req, res, token) {
  const link = await db.links.findOne({ token }, { _id: 0 });
  if (!link || link.status === "revoked") {
    throw new HttpError(404, "Link not found or revoked");
  }

  const owner = await db.users.findOne({ user_id: link.user_id }, { _id: 0 });
  if (!owner || owner.subscription_status !== "active") {
    throw new HttpError(410, "The owner's subscription is inactive");
  }

  const now = nowUtc();
  const clientIp = getClientIp(req);
  const clientGeo = getClientGeo(req);
  const viewerSessionId = getViewerSessionId(req);
  const securityOptions = getNormalizedSecureLinkDefaults(link.security_options || {});
  const blockedMessage = getLinkAccessBlockMessage(link, securityOptions, clientIp, clientGeo, req);
  if (blockedMessage) {
    throw new HttpError(403, blockedMessage);
  }
  const viewerSessionConflictMessage = getViewerSessionConflictMessage(
    link,
    securityOptions,
    viewerSessionId,
    now,
  );
  if (viewerSessionConflictMessage) {
    throw new HttpError(409, viewerSessionConflictMessage);
  }

  if (isSingleViewerSessionEnabled(securityOptions) && viewerSessionId) {
    await db.links.updateOne(
      { token },
      {
        $set: {
          active_viewer_session: buildActiveViewerSessionRecord(viewerSessionId, clientIp, now),
        },
      },
    );
  }

  sendJson(res, 200, {
    status: "ok",
    viewer_id: viewerSessionId || null,
    security_options: buildSecureViewerPayload(securityOptions),
  });
}

async function handleDirectTokenPdf(req, res, token) {
  const directToken = String(token || "").trim();
  if (!directToken) {
    throw new HttpError(404, "Document not found");
  }

  const pdf = await db.pdfs.findOne({ direct_access_token: directToken }, { _id: 0 });
  if (!pdf) {
    throw new HttpError(404, "Document not found");
  }

  const normalizedPdf = await normalizePdfRecordForResponse(pdf, pdf.user_id);
  if (!normalizedPdf.direct_access_enabled) {
    throw new HttpError(404, "Direct access is disabled");
  }

  let viewer = null;
  if (!normalizedPdf.direct_access_public) {
    viewer = await getCurrentUser(req);
    let canAccess =
      viewer.user_id === normalizedPdf.user_id || isAdminRole(viewer.role) || isSuperAdminUser(viewer);
    if (!canAccess) {
      const membership = await db.team_memberships.findOne(
        {
          account_id: normalizedPdf.user_id,
          user_id: viewer.user_id,
          status: "active",
        },
        { _id: 0, membership_id: 1 },
      );
      canAccess = Boolean(membership);
    }
    if (!canAccess) {
      throw new HttpError(403, "Access denied");
    }
  } else {
    try {
      viewer = await getCurrentUser(req);
    } catch {
      viewer = null;
    }
  }

  const headers = {
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=60",
  };

  if (normalizedPdf.storage_key) {
    const fileRow = await getPdfBinary(normalizedPdf);
    if (!fileRow) {
      throw new HttpError(404, "PDF file not found");
    }

    await logAuditEvent(req, {
      eventType: "pdf.direct_access_open",
      actorUserId: viewer?.user_id || null,
      targetUserId: normalizedPdf.user_id,
      resourceType: "pdf",
      resourceId: normalizedPdf.pdf_id,
      success: true,
      message: "direct_pdf_opened",
      metadata: {
        public_access: normalizedPdf.direct_access_public,
      },
    });

    sendBuffer(res, 200, fileRow.content, fileRow.content_type || "application/pdf", headers);
    return;
  }

  if (normalizedPdf.file_path) {
    const absolutePath = path.isAbsolute(normalizedPdf.file_path)
      ? normalizedPdf.file_path
      : path.join(process.cwd(), normalizedPdf.file_path);
    try {
      const content = await fs.readFile(absolutePath);
      sendBuffer(res, 200, content, "application/pdf", headers);
      return;
    } catch {
      throw new HttpError(404, "PDF file not found");
    }
  }

  throw new HttpError(404, "PDF file not found");
}

async function handleSubscriptionCheckout(req, res) {
  const user = await getCurrentUser(req);
  const body = await getJsonBody(req);
  const plan = String(body.plan || "");

  const planInfo = await getSubscriptionPlanDefinition(plan, { requireActive: true });
  if (!planInfo) {
    throw new HttpError(400, "Invalid plan");
  }

  let originUrl = String(body.origin_url || "").trim();
  if (!originUrl) {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    if (host) {
      originUrl = `${proto}://${host}`;
    }
  }
  originUrl = originUrl.replace(/\/$/, "");
  if (!originUrl) {
    throw new HttpError(400, "origin_url is required");
  }

  const stripeConfig = await getActiveStripeConfig();
  const stripeKey = stripeConfig.active_key;

  if (!stripeKey) {
    if (stripeConfig.mode === "sandbox") {
      throw new HttpError(400, "Stripe sandbox key is not configured");
    }
    throw new HttpError(400, "Stripe live key is not configured");
  }

  const amountCents = Math.round(Number(planInfo.price) * 100);
  const checkoutPayload = {
    mode: "subscription",
    success_url: `${originUrl}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${originUrl}/pricing?payment=cancelled`,
    "metadata[user_id]": user.user_id,
    "metadata[plan]": plan,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": planInfo.currency || "eur",
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][recurring][interval]": planInfo.interval || "month",
    "line_items[0][price_data][product_data][name]": `${planInfo.name} Plan`,
    "line_items[0][price_data][product_data][description]": `${planInfo.storage_mb} MB storage`,
    "subscription_data[metadata][user_id]": user.user_id,
    "subscription_data[metadata][plan]": plan,
    allow_promotion_codes: "true",
  };
  if (user.stripe_customer_id) {
    checkoutPayload.customer = user.stripe_customer_id;
  } else if (user.email) {
    checkoutPayload.customer_email = user.email;
  }

  const stripeSession = await stripeApiRequest(
    "POST",
    "/v1/checkout/sessions",
    stripeKey,
    checkoutPayload,
  );

  const sessionId = stripeSession.id;
  const sessionUrl = stripeSession.url;

  if (!sessionId || !sessionUrl) {
    throw new HttpError(400, "Stripe did not return a checkout URL");
  }

  await db.payment_transactions.insertOne({
    transaction_id: makeId("txn"),
    user_id: user.user_id,
    session_id: sessionId,
    amount: planInfo.price,
    currency: "eur",
    plan,
    payment_status: "pending",
    stripe_mode: stripeConfig.mode,
    stripe_customer_id: user.stripe_customer_id || null,
    stripe_subscription_id: null,
    stripe_subscription_status: null,
    stripe_invoice_id: null,
    stripe_invoice_number: null,
    stripe_invoice_url: null,
    stripe_invoice_pdf: null,
    stripe_payment_intent_id: null,
    amount_subtotal: planInfo.price,
    amount_tax: 0,
    paid_at: null,
    period_start: null,
    period_end: null,
    created_at: isoNow(),
  });

  await logAuditEvent(req, {
    eventType: "subscription.checkout_created",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "subscription",
    resourceId: sessionId,
    success: true,
    message: "checkout_session_created",
    metadata: { plan, stripe_mode: stripeConfig.mode },
  });

  sendJson(res, 200, {
    url: sessionUrl,
    session_id: sessionId,
  });
}

async function handleSubscriptionStatus(req, res, sessionId) {
  const user = await getCurrentUser(req);
  const txn = await db.payment_transactions.findOne(
    { session_id: sessionId, user_id: user.user_id },
    { _id: 0 },
  );

  if (!txn) {
    throw new HttpError(404, "Transaction not found");
  }

  const stripeConfig = await getActiveStripeConfig();
  const stripeKey = stripeConfig.active_key;
  if (!stripeKey) {
    throw new HttpError(400, "Stripe key is not configured");
  }

  const stripeSession = await stripeApiRequest(
    "GET",
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription&expand[]=invoice`,
    stripeKey,
  );
  const hydrated = await hydrateStripeCheckoutData(stripeKey, stripeSession);
  const plan = txn.plan || stripeSession?.metadata?.plan || "basic";

  const transactionUpdate = {
    payment_status:
      hydrated.payment_status === "paid"
        ? "completed"
        : hydrated.checkout_status === "expired"
          ? "expired"
          : txn.payment_status || "pending",
    amount: hydrated.amount || Number(txn.amount || 0),
    currency: normalizeCurrencyCode(hydrated.currency || txn.currency || "eur", "eur"),
    stripe_customer_id: hydrated.stripe_customer_id || txn.stripe_customer_id || null,
    stripe_subscription_id: hydrated.stripe_subscription_id || txn.stripe_subscription_id || null,
    stripe_subscription_status: hydrated.stripe_subscription?.status || txn.stripe_subscription_status || null,
    stripe_invoice_id: hydrated.stripe_invoice_id || txn.stripe_invoice_id || null,
    stripe_invoice_number: hydrated.stripe_invoice?.number || txn.stripe_invoice_number || null,
    stripe_invoice_url: hydrated.stripe_invoice?.hosted_invoice_url || txn.stripe_invoice_url || null,
    stripe_invoice_pdf: hydrated.stripe_invoice?.invoice_pdf || txn.stripe_invoice_pdf || null,
    stripe_payment_intent_id:
      hydrated.stripe_invoice?.payment_intent_id || txn.stripe_payment_intent_id || null,
    amount_subtotal:
      hydrated.stripe_invoice?.amount_subtotal !== undefined
        ? hydrated.stripe_invoice.amount_subtotal
        : Number(txn.amount_subtotal || txn.amount || 0),
    amount_tax:
      hydrated.stripe_invoice?.amount_tax !== undefined
        ? hydrated.stripe_invoice.amount_tax
        : Number(txn.amount_tax || 0),
    paid_at: hydrated.stripe_invoice?.paid_at || txn.paid_at || null,
    period_start:
      hydrated.stripe_subscription?.current_period_start ||
      hydrated.stripe_invoice?.period_start ||
      txn.period_start ||
      null,
    period_end:
      hydrated.stripe_subscription?.current_period_end ||
      hydrated.stripe_invoice?.period_end ||
      txn.period_end ||
      null,
    updated_at: isoNow(),
  };

  await db.payment_transactions.updateOne(
    { session_id: sessionId },
    {
      $set: transactionUpdate,
    },
  );

  const previousPaymentStatus = String(txn.payment_status || "").toLowerCase();
  if (
    hydrated.payment_status === "paid" &&
    previousPaymentStatus !== "completed"
  ) {
    await applyUserSubscriptionState({
      userId: user.user_id,
      plan,
      stripeCustomerId: hydrated.stripe_customer_id,
      stripeSubscription: hydrated.stripe_subscription,
      paymentStatus: hydrated.payment_status,
    });

    const invoiceSnapshot = await buildStoredInvoiceSnapshot(
      { ...txn, ...transactionUpdate, plan },
      { ...user, billing_profile: user.billing_profile || {} },
    );
    await db.payment_transactions.updateOne(
      { session_id: sessionId },
      {
        $set: {
          invoice_snapshot: invoiceSnapshot,
        },
      },
    );

    await logAuditEvent(req, {
      eventType: "subscription.activated",
      actorUserId: user.user_id,
      targetUserId: user.user_id,
      resourceType: "subscription",
      resourceId: hydrated.stripe_subscription_id || sessionId,
      success: true,
      message: "subscription_activated_via_status",
      metadata: { plan, source: "status_check" },
    });
  }

  sendJson(res, 200, {
    status: hydrated.checkout_status,
    payment_status: hydrated.payment_status,
    amount: hydrated.amount,
    currency: hydrated.currency,
    stripe_customer_id: hydrated.stripe_customer_id,
    stripe_subscription_id: hydrated.stripe_subscription_id,
    stripe_subscription_status: hydrated.stripe_subscription?.status || null,
    period_end:
      hydrated.stripe_subscription?.current_period_end ||
      hydrated.stripe_invoice?.period_end ||
      null,
    invoice: hydrated.stripe_invoice
      ? {
          invoice_id: hydrated.stripe_invoice.id,
          invoice_number: hydrated.stripe_invoice.number,
          invoice_url: hydrated.stripe_invoice.hosted_invoice_url,
          invoice_pdf: hydrated.stripe_invoice.invoice_pdf,
        }
      : null,
  });
}

async function handleStripeWebhook(req, res) {
  const body = await getRawBody(req);
  const signature = req.headers["stripe-signature"];

  if (
    STRIPE_WEBHOOK_SECRET &&
    !verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET)
  ) {
    throw new HttpError(400, "Invalid Stripe signature");
  }

  let event;
  try {
    event = JSON.parse(body.toString("utf-8"));
  } catch {
    throw new HttpError(400, "Invalid webhook payload");
  }

  const stripeConfig = await getActiveStripeConfig();
  const stripeKey = stripeConfig.active_key;

  if (event.type === "checkout.session.completed") {
    const sessionData = event?.data?.object || {};
    const metadata = sessionData.metadata || {};
    const sessionId = sessionData.id || null;
    const stripeCustomerId =
      typeof sessionData.customer === "string" ? sessionData.customer : sessionData.customer?.id || "";
    const stripeSubscriptionId =
      typeof sessionData.subscription === "string"
        ? sessionData.subscription
        : sessionData.subscription?.id || "";

    const targetUser = await findUserByStripeReferences({
      userId: metadata.user_id || "",
      stripeCustomerId,
      stripeSubscriptionId,
    });

    if (targetUser) {
      const plan = metadata.plan || targetUser.plan || "basic";
      const configuredPlan = await getSubscriptionPlanDefinition(plan);
      let hydrated = {
        checkout_status: String(sessionData.status || "complete").toLowerCase(),
        payment_status: String(sessionData.payment_status || "paid").toLowerCase(),
        amount: amountFromStripeMinor(sessionData.amount_total, configuredPlan?.price || 0),
        currency: normalizeCurrencyCode(sessionData.currency || "eur", "eur"),
        stripe_customer_id: stripeCustomerId || null,
        stripe_subscription: normalizeStripeSubscription(
          typeof sessionData.subscription === "object" ? sessionData.subscription : null,
        ),
        stripe_invoice: normalizeStripeInvoice(typeof sessionData.invoice === "object" ? sessionData.invoice : null),
        stripe_subscription_id: stripeSubscriptionId || null,
        stripe_invoice_id:
          typeof sessionData.invoice === "string" ? sessionData.invoice : sessionData.invoice?.id || null,
      };

      if (stripeKey) {
        try {
          hydrated = await hydrateStripeCheckoutData(stripeKey, sessionData);
        } catch {
          // Use fallback payload above if Stripe hydration fails.
        }
      }

      if (sessionId) {
        const existingTxn = await db.payment_transactions.findOne(
          { session_id: sessionId },
          { _id: 0 },
        );
        if (existingTxn) {
          const baseUpdate = {
            payment_status: hydrated.payment_status === "paid" ? "completed" : "pending",
            amount: hydrated.amount || Number(existingTxn.amount || 0),
            currency: normalizeCurrencyCode(hydrated.currency || existingTxn.currency || "eur", "eur"),
            stripe_customer_id: hydrated.stripe_customer_id || existingTxn.stripe_customer_id || null,
            stripe_subscription_id: hydrated.stripe_subscription_id || existingTxn.stripe_subscription_id || null,
            stripe_subscription_status:
              hydrated.stripe_subscription?.status || existingTxn.stripe_subscription_status || null,
            stripe_invoice_id: hydrated.stripe_invoice_id || existingTxn.stripe_invoice_id || null,
            stripe_invoice_number:
              hydrated.stripe_invoice?.number || existingTxn.stripe_invoice_number || null,
            stripe_invoice_url:
              hydrated.stripe_invoice?.hosted_invoice_url || existingTxn.stripe_invoice_url || null,
            stripe_invoice_pdf:
              hydrated.stripe_invoice?.invoice_pdf || existingTxn.stripe_invoice_pdf || null,
            stripe_payment_intent_id:
              hydrated.stripe_invoice?.payment_intent_id || existingTxn.stripe_payment_intent_id || null,
            amount_subtotal:
              hydrated.stripe_invoice?.amount_subtotal !== undefined
                ? hydrated.stripe_invoice.amount_subtotal
                : Number(existingTxn.amount_subtotal || existingTxn.amount || 0),
            amount_tax:
              hydrated.stripe_invoice?.amount_tax !== undefined
                ? hydrated.stripe_invoice.amount_tax
                : Number(existingTxn.amount_tax || 0),
            paid_at: hydrated.stripe_invoice?.paid_at || existingTxn.paid_at || null,
            period_start:
              hydrated.stripe_subscription?.current_period_start ||
              hydrated.stripe_invoice?.period_start ||
              existingTxn.period_start ||
              null,
            period_end:
              hydrated.stripe_subscription?.current_period_end ||
              hydrated.stripe_invoice?.period_end ||
              existingTxn.period_end ||
              null,
            updated_at: isoNow(),
          };
          let invoiceSnapshot = existingTxn.invoice_snapshot || null;
          if (hydrated.payment_status === "paid") {
            invoiceSnapshot = await buildStoredInvoiceSnapshot(
              { ...existingTxn, ...baseUpdate, plan },
              targetUser,
            );
          }
          await db.payment_transactions.updateOne(
            { session_id: sessionId },
            {
              $set: invoiceSnapshot ? { ...baseUpdate, invoice_snapshot: invoiceSnapshot } : baseUpdate,
            },
          );
        }
      }

      await applyUserSubscriptionState({
        userId: targetUser.user_id,
        plan,
        stripeCustomerId: hydrated.stripe_customer_id,
        stripeSubscription: hydrated.stripe_subscription,
        paymentStatus: hydrated.payment_status,
      });

      await logAuditEvent(req, {
        eventType: "subscription.activated",
        actorUserId: null,
        targetUserId: targetUser.user_id,
        resourceType: "subscription",
        resourceId: hydrated.stripe_subscription_id || sessionId || null,
        success: true,
        message: "subscription_activated_via_webhook",
        metadata: { plan, source: "stripe_webhook_checkout" },
      });
    }
  } else if (event.type === "invoice.payment_succeeded" || event.type === "invoice.payment_failed") {
    const invoiceObj = event?.data?.object || {};
    const normalizedInvoice = normalizeStripeInvoice(invoiceObj);
    const stripeCustomerId =
      typeof invoiceObj.customer === "string" ? invoiceObj.customer : invoiceObj.customer?.id || "";
    const stripeSubscriptionId =
      typeof invoiceObj.subscription === "string"
        ? invoiceObj.subscription
        : invoiceObj.subscription?.id || "";
    const metadata = invoiceObj.metadata || {};
    const targetUser = await findUserByStripeReferences({
      userId: metadata.user_id || "",
      stripeCustomerId,
      stripeSubscriptionId,
    });

    if (targetUser) {
      const plan = metadata.plan || targetUser.plan || "basic";
      const configuredPlan = await getSubscriptionPlanDefinition(plan);
      let normalizedSubscription = null;
      if (stripeKey && stripeSubscriptionId) {
        try {
          const fetched = await stripeApiRequest(
            "GET",
            `/v1/subscriptions/${encodeURIComponent(stripeSubscriptionId)}`,
            stripeKey,
          );
          normalizedSubscription = normalizeStripeSubscription(fetched);
        } catch {
          normalizedSubscription = null;
        }
      }

      const paymentCompleted = event.type === "invoice.payment_succeeded";
      let existingTxn = normalizedInvoice?.id
        ? await db.payment_transactions.findOne(
            { stripe_invoice_id: normalizedInvoice.id },
            { _id: 0 },
          )
        : null;
      if (!existingTxn) {
        const pendingTxns = await db.payment_transactions.find(
          { user_id: targetUser.user_id, payment_status: "pending" },
          { _id: 0 },
        );
        const orderedPending = sortByDateDesc(pendingTxns, (txn) => txn.created_at);
        existingTxn = orderedPending.find((txn) => {
          if (txn.stripe_invoice_id) return false;
          if (!stripeSubscriptionId) return true;
          return !txn.stripe_subscription_id || txn.stripe_subscription_id === stripeSubscriptionId;
        }) || null;
      }
      const upsertData = {
        transaction_id: existingTxn?.transaction_id || makeId("txn"),
        user_id: targetUser.user_id,
        session_id: existingTxn?.session_id || `invoice:${normalizedInvoice?.id || tokenHex(10)}`,
        amount:
          normalizedInvoice?.amount_paid ||
          normalizedInvoice?.amount_due ||
          Number(existingTxn?.amount || configuredPlan?.price || 0),
        currency: normalizeCurrencyCode(
          normalizedInvoice?.currency || existingTxn?.currency || "eur",
          "eur",
        ),
        plan,
        payment_status: paymentCompleted ? "completed" : "failed",
        stripe_mode: stripeConfig.mode,
        stripe_customer_id: stripeCustomerId || existingTxn?.stripe_customer_id || null,
        stripe_subscription_id:
          stripeSubscriptionId || existingTxn?.stripe_subscription_id || null,
        stripe_subscription_status:
          normalizedSubscription?.status || existingTxn?.stripe_subscription_status || null,
        stripe_invoice_id: normalizedInvoice?.id || existingTxn?.stripe_invoice_id || null,
        stripe_invoice_number:
          normalizedInvoice?.number || existingTxn?.stripe_invoice_number || null,
        stripe_invoice_url:
          normalizedInvoice?.hosted_invoice_url || existingTxn?.stripe_invoice_url || null,
        stripe_invoice_pdf:
          normalizedInvoice?.invoice_pdf || existingTxn?.stripe_invoice_pdf || null,
        stripe_payment_intent_id:
          normalizedInvoice?.payment_intent_id || existingTxn?.stripe_payment_intent_id || null,
        amount_subtotal:
          normalizedInvoice?.amount_subtotal !== undefined
            ? normalizedInvoice.amount_subtotal
            : Number(existingTxn?.amount_subtotal || 0),
        amount_tax:
          normalizedInvoice?.amount_tax !== undefined
            ? normalizedInvoice.amount_tax
            : Number(existingTxn?.amount_tax || 0),
        paid_at: paymentCompleted
          ? normalizedInvoice?.paid_at || isoNow()
          : existingTxn?.paid_at || null,
        period_start:
          normalizedSubscription?.current_period_start ||
          normalizedInvoice?.period_start ||
          existingTxn?.period_start ||
          null,
        period_end:
          normalizedSubscription?.current_period_end ||
          normalizedInvoice?.period_end ||
          existingTxn?.period_end ||
          null,
        created_at:
          existingTxn?.created_at || fromStripeTimestampToIso(invoiceObj.created) || isoNow(),
        updated_at: isoNow(),
      };
      if (paymentCompleted) {
        upsertData.invoice_snapshot = await buildStoredInvoiceSnapshot(upsertData, targetUser);
      } else if (existingTxn?.invoice_snapshot) {
        upsertData.invoice_snapshot = existingTxn.invoice_snapshot;
      }

      if (existingTxn) {
        await db.payment_transactions.updateOne(
          { transaction_id: existingTxn.transaction_id },
          { $set: upsertData },
        );
      } else {
        await db.payment_transactions.insertOne(upsertData);
      }

      await applyUserSubscriptionState({
        userId: targetUser.user_id,
        plan,
        stripeCustomerId,
        stripeSubscription: normalizedSubscription,
        paymentStatus: paymentCompleted ? "paid" : "unpaid",
      });

      await logAuditEvent(req, {
        eventType: paymentCompleted ? "subscription.payment_succeeded" : "subscription.payment_failed",
        actorUserId: null,
        targetUserId: targetUser.user_id,
        resourceType: "payment",
        resourceId: normalizedInvoice?.id || null,
        success: paymentCompleted,
        message: paymentCompleted ? "invoice_payment_succeeded" : "invoice_payment_failed",
        metadata: {
          stripe_subscription_id: stripeSubscriptionId || null,
          amount: upsertData.amount,
          currency: upsertData.currency,
          plan,
        },
      });
    }
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscriptionObj = event?.data?.object || {};
    const normalizedSubscription = normalizeStripeSubscription(subscriptionObj);
    const stripeCustomerId =
      typeof subscriptionObj.customer === "string"
        ? subscriptionObj.customer
        : subscriptionObj.customer?.id || "";
    const targetUser = await findUserByStripeReferences({
      userId: subscriptionObj?.metadata?.user_id || "",
      stripeCustomerId,
      stripeSubscriptionId: normalizedSubscription?.id || "",
    });
    if (targetUser) {
      const plan = subscriptionObj?.metadata?.plan || targetUser.plan || "basic";
      await applyUserSubscriptionState({
        userId: targetUser.user_id,
        plan,
        stripeCustomerId,
        stripeSubscription: normalizedSubscription,
        paymentStatus: isStripeSubscriptionActiveStatus(normalizedSubscription?.status) ? "paid" : "unpaid",
      });

      if (event.type === "customer.subscription.deleted") {
        await db.users.updateOne(
          { user_id: targetUser.user_id },
          {
            $set: {
              subscription_status: "inactive",
              stripe_subscription_status: "canceled",
            },
          },
        );
      }

      await logAuditEvent(req, {
        eventType: "subscription.state_change",
        actorUserId: null,
        targetUserId: targetUser.user_id,
        resourceType: "subscription",
        resourceId: normalizedSubscription?.id || null,
        success: true,
        message: event.type,
        metadata: {
          status: normalizedSubscription?.status || null,
          cancel_at_period_end: normalizedSubscription?.cancel_at_period_end || false,
        },
      });
    }
  }

  sendJson(res, 200, { received: true });
}

async function handleSubscriptionPlans(_req, res) {
  const config = await getActiveSubscriptionPlansConfig();
  const plans = {};
  for (const [planId, plan] of sortSubscriptionPlanEntries(config.plans)) {
    plans[planId] = {
      ...plan,
      currency: config.currency,
      interval: config.interval,
    };
  }
  sendJson(res, 200, plans);
}

function sortByDateDesc(items, dateSelector) {
  return [...items].sort((left, right) => {
    const leftDate = parseDate(dateSelector(left))?.getTime() || 0;
    const rightDate = parseDate(dateSelector(right))?.getTime() || 0;
    return rightDate - leftDate;
  });
}

function normalizePaymentTransactionForResponse(transaction, templateConfig) {
  const snapshot = transaction?.invoice_snapshot && typeof transaction.invoice_snapshot === "object"
    ? transaction.invoice_snapshot
    : null;
  const invoiceNumber = snapshot?.invoice_number || invoiceNumberFromTransaction(templateConfig, transaction);
  return {
    transaction_id: transaction.transaction_id,
    session_id: transaction.session_id || null,
    plan: transaction.plan || "none",
    payment_status: transaction.payment_status || "pending",
    amount: Number(transaction.amount || 0),
    currency: normalizeCurrencyCode(transaction.currency || "eur", "eur"),
    amount_subtotal: Number(transaction.amount_subtotal ?? transaction.amount ?? 0),
    amount_tax: Number(transaction.amount_tax || 0),
    paid_at: transaction.paid_at || null,
    created_at: transaction.created_at || null,
    period_start: transaction.period_start || null,
    period_end: transaction.period_end || null,
    stripe_mode: transaction.stripe_mode || null,
    stripe_invoice_id: transaction.stripe_invoice_id || null,
    stripe_invoice_number: transaction.stripe_invoice_number || null,
    stripe_invoice_url: transaction.stripe_invoice_url || null,
    stripe_invoice_pdf: transaction.stripe_invoice_pdf || null,
    invoice_number: invoiceNumber,
    invoice_download_url: `/api/subscription/invoices/${encodeURIComponent(transaction.transaction_id)}/download`,
    admin_invoice_download_url: `/api/admin/invoices/${encodeURIComponent(transaction.transaction_id)}/download`,
    invoice_snapshot: snapshot,
  };
}

function buildPaymentSummary(user, transactions) {
  const completed = transactions.filter((txn) => String(txn.payment_status) === "completed");
  const failed = transactions.filter((txn) => String(txn.payment_status) === "failed");
  const pending = transactions.filter(
    (txn) => !["completed", "failed", "expired"].includes(String(txn.payment_status || "")),
  );
  const totalPaid = completed.reduce((sum, txn) => sum + Number(txn.amount || 0), 0);
  const orderedCompleted = sortByDateDesc(completed, (txn) => txn.paid_at || txn.created_at);
  const lastCompleted = orderedCompleted[0] || null;
  const nextRenewal =
    user.subscription_current_period_end ||
    user.next_renewal_at ||
    user.subscription_expires_at ||
    null;

  return {
    total_payments: transactions.length,
    successful_payments: completed.length,
    failed_payments: failed.length,
    pending_payments: pending.length,
    total_paid: totalPaid,
    currency: normalizeCurrencyCode(lastCompleted?.currency || "eur", "eur"),
    last_payment_at: lastCompleted?.paid_at || lastCompleted?.created_at || null,
    next_renewal_at: nextRenewal,
  };
}

async function handleSubscriptionOverview(req, res) {
  const user = await getCurrentUser(req);
  const [transactions, auditEvents, invoiceTemplate] = await Promise.all([
    db.payment_transactions.find({ user_id: user.user_id }, { _id: 0 }),
    db.audit_events.find({ target_user_id: user.user_id }, { _id: 0 }),
    getActiveInvoiceTemplateConfig(),
  ]);

  const orderedTransactions = sortByDateDesc(
    transactions,
    (txn) => txn.paid_at || txn.created_at || txn.updated_at,
  );
  const paymentRows = orderedTransactions.map((txn) =>
    normalizePaymentTransactionForResponse(txn, invoiceTemplate),
  );
  const summary = buildPaymentSummary(user, orderedTransactions);
  const billingAuditLog = sortByDateDesc(
    auditEvents.filter((eventDoc) =>
      String(eventDoc.event_type || "").startsWith("subscription."),
    ),
    (eventDoc) => eventDoc.created_at,
  ).slice(0, 60);

  sendJson(res, 200, {
    subscription: {
      plan: user.plan || "none",
      status: user.subscription_status || "inactive",
      stripe_subscription_status: user.stripe_subscription_status || null,
      stripe_customer_id: user.stripe_customer_id || null,
      stripe_subscription_id: user.stripe_subscription_id || null,
      started_at: user.subscription_started_at || null,
      current_period_start: user.subscription_current_period_start || null,
      current_period_end: user.subscription_current_period_end || null,
      next_renewal_at:
        user.subscription_current_period_end ||
        user.next_renewal_at ||
        user.subscription_expires_at ||
        null,
      cancel_at_period_end: Boolean(user.cancel_at_period_end),
      can_manage_billing: Boolean(user.stripe_customer_id),
    },
    payment_summary: summary,
    payments: paymentRows,
    audit_log: billingAuditLog,
  });
}

async function handleSubscriptionBillingPortal(req, res) {
  const user = await getCurrentUser(req);
  const body = await getJsonBody(req);

  let originUrl = String(body.origin_url || "").trim();
  if (!originUrl) {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    if (host) {
      originUrl = `${proto}://${host}`;
    }
  }
  originUrl = originUrl.replace(/\/$/, "");
  if (!originUrl) {
    throw new HttpError(400, "origin_url is required");
  }

  const stripeConfig = await getActiveStripeConfig();
  const stripeKey = stripeConfig.active_key;
  if (!stripeKey) {
    throw new HttpError(400, "Stripe key is not configured");
  }

  let customerId = user.stripe_customer_id || null;
  if (!customerId) {
    const orderedTransactions = sortByDateDesc(
      await db.payment_transactions.find(
        { user_id: user.user_id, payment_status: "completed" },
        { _id: 0 },
      ),
      (txn) => txn.paid_at || txn.created_at,
    );
    customerId = orderedTransactions[0]?.stripe_customer_id || null;
  }

  if (!customerId) {
    throw new HttpError(400, "No Stripe customer found for this account yet");
  }

  const portalSession = await stripeApiRequest(
    "POST",
    "/v1/billing_portal/sessions",
    stripeKey,
    {
      customer: customerId,
      return_url: `${originUrl}/settings`,
    },
  );

  if (!portalSession?.url) {
    throw new HttpError(400, "Stripe did not return a billing portal URL");
  }

  await logAuditEvent(req, {
    eventType: "subscription.billing_portal_open",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "subscription",
    resourceId: customerId,
    success: true,
    message: "billing_portal_session_created",
  });

  sendJson(res, 200, {
    url: portalSession.url,
  });
}

async function handleSubscriptionInvoiceDownload(req, res, transactionId) {
  const user = await getCurrentUser(req);
  const [transaction, templateConfig] = await Promise.all([
    db.payment_transactions.findOne(
      { transaction_id: transactionId, user_id: user.user_id },
      { _id: 0 },
    ),
    getActiveInvoiceTemplateConfig(),
  ]);

  if (!transaction) {
    throw new HttpError(404, "Invoice transaction not found");
  }
  if (String(transaction.payment_status || "") !== "completed") {
    throw new HttpError(400, "Invoice is only available after successful payment");
  }

  const planInfo = (await getSubscriptionPlanDefinition(transaction.plan)) || {
    name: String(transaction.plan || "Subscription"),
    price: Number(transaction.amount || 0),
  };
  const snapshot = getInvoiceSnapshotFromTransaction({
    transaction,
    user,
    template: templateConfig,
    planInfo,
  });
  const pdfBuffer = await renderInvoicePdfBuffer({
    snapshot,
    template: templateConfig,
  });
  const invoiceNumber = String(snapshot?.invoice_number || invoiceNumberFromTransaction(templateConfig, transaction)).replace(
    /[^A-Za-z0-9_-]/g,
    "-",
  );

  const headers = {
    "Content-Disposition": `attachment; filename="invoice-${invoiceNumber}.pdf"`,
    "Cache-Control": "no-store",
  };
  sendBuffer(
    res,
    200,
    pdfBuffer,
    "application/pdf",
    headers,
  );
}

async function handleAdminInvoiceDownload(req, res, transactionId) {
  await getCurrentAdmin(req);
  const transaction = await db.payment_transactions.findOne(
    { transaction_id: transactionId },
    { _id: 0 },
  );
  if (!transaction) {
    throw new HttpError(404, "Invoice transaction not found");
  }
  if (String(transaction.payment_status || "") !== "completed") {
    throw new HttpError(400, "Invoice is only available after successful payment");
  }

  const [user, templateConfig] = await Promise.all([
    db.users.findOne({ user_id: transaction.user_id }, { _id: 0 }),
    getActiveInvoiceTemplateConfig(),
  ]);
  if (!user) {
    throw new HttpError(404, "Invoice owner not found");
  }

  const planInfo = (await getSubscriptionPlanDefinition(transaction.plan)) || {
    name: String(transaction.plan || "Subscription"),
    price: Number(transaction.amount || 0),
  };
  const snapshot = getInvoiceSnapshotFromTransaction({
    transaction,
    user,
    template: templateConfig,
    planInfo,
  });
  const pdfBuffer = await renderInvoicePdfBuffer({
    snapshot,
    template: templateConfig,
  });
  const invoiceNumber = String(snapshot?.invoice_number || invoiceNumberFromTransaction(templateConfig, transaction)).replace(
    /[^A-Za-z0-9_-]/g,
    "-",
  );

  sendBuffer(
    res,
    200,
    pdfBuffer,
    "application/pdf",
    {
      "Content-Disposition": `attachment; filename="invoice-${invoiceNumber}.pdf"`,
      "Cache-Control": "no-store",
    },
  );
}

async function handleAdminInvoiceUpdate(req, res, transactionId) {
  const admin = await getCurrentAdmin(req);
  const body = await getJsonBody(req);
  const transaction = await db.payment_transactions.findOne(
    { transaction_id: transactionId },
    { _id: 0 },
  );
  if (!transaction) {
    throw new HttpError(404, "Invoice transaction not found");
  }
  if (String(transaction.payment_status || "") !== "completed") {
    throw new HttpError(400, "Only paid invoices can be updated");
  }
  if (!body.customer || typeof body.customer !== "object") {
    throw new HttpError(400, "customer payload is required");
  }

  const [user, templateConfig] = await Promise.all([
    db.users.findOne({ user_id: transaction.user_id }, { _id: 0 }),
    getActiveInvoiceTemplateConfig(),
  ]);
  if (!user) {
    throw new HttpError(404, "Invoice owner not found");
  }

  const planInfo = (await getSubscriptionPlanDefinition(transaction.plan)) || {
    name: String(transaction.plan || "Subscription"),
    price: Number(transaction.amount || 0),
  };
  const snapshot = getInvoiceSnapshotFromTransaction({
    transaction,
    user,
    template: templateConfig,
    planInfo,
  });
  const nextCustomer = sanitizeBillingProfileInput({
    ...(snapshot.customer || {}),
    ...body.customer,
  });
  const nextSnapshot = {
    ...snapshot,
    customer: nextCustomer,
    generated_at: isoNow(),
  };

  await db.payment_transactions.updateOne(
    { transaction_id: transactionId },
    {
      $set: {
        invoice_snapshot: nextSnapshot,
        updated_at: isoNow(),
      },
    },
  );

  await logAuditEvent(req, {
    eventType: "admin.invoice_update",
    actorUserId: admin.user_id,
    targetUserId: user.user_id,
    resourceType: "invoice",
    resourceId: transactionId,
    success: true,
    message: "admin_updated_invoice_snapshot",
    metadata: { invoice_number: nextSnapshot.invoice_number },
  });

  sendJson(res, 200, {
    message: "Invoice updated successfully",
    payment: normalizePaymentTransactionForResponse(
      { ...transaction, invoice_snapshot: nextSnapshot },
      templateConfig,
    ),
  });
}

async function handleAdminBillingCustomersGet(req, res) {
  await getCurrentAdmin(req);

  const [users, transactions] = await Promise.all([
    db.users.find({}, { _id: 0, password_hash: 0 }),
    db.payment_transactions.find({}, { _id: 0 }),
  ]);

  const txnsByUser = new Map();
  for (const txn of transactions) {
    if (!txn.user_id) continue;
    if (!txnsByUser.has(txn.user_id)) txnsByUser.set(txn.user_id, []);
    txnsByUser.get(txn.user_id).push(txn);
  }

  const rows = users.map((user) => {
    const txns = sortByDateDesc(txnsByUser.get(user.user_id) || [], (txn) => txn.paid_at || txn.created_at);
    const summary = buildPaymentSummary(user, txns);
    return {
      user_id: user.user_id,
      name: user.name || "Unknown",
      email: user.email || "",
      role: user.role || "user",
      plan: user.plan || "none",
      subscription_status: user.subscription_status || "inactive",
      stripe_subscription_status: user.stripe_subscription_status || null,
      next_renewal_at: summary.next_renewal_at,
      payment_count: summary.total_payments,
      successful_payments: summary.successful_payments,
      failed_payments: summary.failed_payments,
      total_paid: summary.total_paid,
      currency: summary.currency,
      last_payment_at: summary.last_payment_at,
      stripe_customer_id: user.stripe_customer_id || null,
      stripe_subscription_id: user.stripe_subscription_id || null,
    };
  });

  sendJson(res, 200, sortByDateDesc(rows, (row) => row.last_payment_at || row.next_renewal_at));
}

async function handleAdminBillingCustomerGet(req, res, userId) {
  await getCurrentAdmin(req);

  const [user, transactions, auditEvents, invoiceTemplate] = await Promise.all([
    db.users.findOne({ user_id: userId }, { _id: 0, password_hash: 0 }),
    db.payment_transactions.find({ user_id: userId }, { _id: 0 }),
    db.audit_events.find({ target_user_id: userId }, { _id: 0 }),
    getActiveInvoiceTemplateConfig(),
  ]);

  if (!user) {
    throw new HttpError(404, "User not found");
  }

  const orderedTransactions = sortByDateDesc(
    transactions,
    (txn) => txn.paid_at || txn.created_at || txn.updated_at,
  );
  const paymentRows = orderedTransactions.map((txn) =>
    normalizePaymentTransactionForResponse(txn, invoiceTemplate),
  );
  const summary = buildPaymentSummary(user, orderedTransactions);
  const billingAuditLog = sortByDateDesc(
    auditEvents.filter((eventDoc) =>
      String(eventDoc.event_type || "").startsWith("subscription."),
    ),
    (eventDoc) => eventDoc.created_at,
  ).slice(0, 120);

  sendJson(res, 200, {
    user,
    subscription: {
      plan: user.plan || "none",
      status: user.subscription_status || "inactive",
      stripe_subscription_status: user.stripe_subscription_status || null,
      stripe_customer_id: user.stripe_customer_id || null,
      stripe_subscription_id: user.stripe_subscription_id || null,
      current_period_start: user.subscription_current_period_start || null,
      current_period_end: user.subscription_current_period_end || null,
      next_renewal_at:
        user.subscription_current_period_end ||
        user.next_renewal_at ||
        user.subscription_expires_at ||
        null,
    },
    payment_summary: summary,
    payments: paymentRows,
    audit_log: billingAuditLog,
  });
}

async function handleAdminUsersGet(req, res) {
  await getCurrentAdmin(req);

  const [users, allPdfs, allLinks, allPayments] = await Promise.all([
    db.users.find({}, { _id: 0, password_hash: 0 }),
    db.pdfs.find({}, { _id: 0, user_id: 1 }),
    db.links.find({}, { _id: 0, user_id: 1 }),
    db.payment_transactions.find({}, { _id: 0, user_id: 1, payment_status: 1, amount: 1, paid_at: 1, created_at: 1, currency: 1 }),
  ]);

  const pdfCountByUser = new Map();
  for (const pdf of allPdfs) {
    const userId = pdf.user_id;
    if (!userId) continue;
    pdfCountByUser.set(userId, (pdfCountByUser.get(userId) || 0) + 1);
  }
  const linkCountByUser = new Map();
  for (const link of allLinks) {
    const userId = link.user_id;
    if (!userId) continue;
    linkCountByUser.set(userId, (linkCountByUser.get(userId) || 0) + 1);
  }

  const paymentStatsByUser = new Map();
  for (const payment of allPayments) {
    const userId = payment.user_id;
    if (!userId) continue;
    const existing = paymentStatsByUser.get(userId) || {
      payment_count: 0,
      successful_payments: 0,
      failed_payments: 0,
      total_paid: 0,
      last_payment_at: null,
      currency: "eur",
    };
    existing.payment_count += 1;
    if (String(payment.payment_status || "") === "completed") {
      existing.successful_payments += 1;
      existing.total_paid += Number(payment.amount || 0);
      existing.currency = normalizeCurrencyCode(payment.currency || existing.currency, existing.currency);
      const candidate = parseDate(payment.paid_at || payment.created_at);
      const current = parseDate(existing.last_payment_at);
      if (candidate && (!current || candidate.getTime() > current.getTime())) {
        existing.last_payment_at = candidate.toISOString();
      }
    }
    if (String(payment.payment_status || "") === "failed") {
      existing.failed_payments += 1;
    }
    paymentStatsByUser.set(userId, existing);
  }

  for (const user of users) {
    if (
      isConfiguredSuperAdminEmail(user.email) &&
      (user.role !== "super_admin" || user.plan !== "enterprise" || user.subscription_status !== "active")
    ) {
      await db.users.updateOne(
        { user_id: user.user_id },
        {
          $set: {
            role: "super_admin",
            plan: "enterprise",
            subscription_status: "active",
          },
        },
      );
      user.role = "super_admin";
      user.plan = "enterprise";
      user.subscription_status = "active";
    }
    user.pdf_count = pdfCountByUser.get(user.user_id) || 0;
    user.link_count = linkCountByUser.get(user.user_id) || 0;
    const paymentStats = paymentStatsByUser.get(user.user_id) || {
      payment_count: 0,
      successful_payments: 0,
      failed_payments: 0,
      total_paid: 0,
      last_payment_at: null,
      currency: "eur",
    };
    user.payment_count = paymentStats.payment_count;
    user.successful_payments = paymentStats.successful_payments;
    user.failed_payments = paymentStats.failed_payments;
    user.total_paid = paymentStats.total_paid;
    user.payment_currency = paymentStats.currency;
    user.last_payment_at = paymentStats.last_payment_at;
    user.next_renewal_at =
      user.subscription_current_period_end ||
      user.next_renewal_at ||
      user.subscription_expires_at ||
      null;
  }

  sendJson(res, 200, users);
}

async function handleAdminUsersCreate(req, res) {
  const admin = await getCurrentAdmin(req);
  const body = await getJsonBody(req);

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = String(body.role || "user").trim();
  const plan = String(body.plan || "none").trim();
  const freeAccessDays = Number.parseInt(String(body.free_access_days ?? "0"), 10);

  if (!name || !email || !password) {
    throw new HttpError(400, "Name, email and password are required");
  }
  if (password.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters");
  }
  if (!["user", "admin", "super_admin"].includes(role)) {
    throw new HttpError(400, "Invalid role");
  }
  if (plan !== "none" && !(await getSubscriptionPlanDefinition(plan, { requireActive: true }))) {
    throw new HttpError(400, "Invalid subscription plan");
  }
  if (Number.isNaN(freeAccessDays) || freeAccessDays < 0 || freeAccessDays > 3650) {
    throw new HttpError(400, "free_access_days must be between 0 and 3650");
  }
  if (role === "super_admin" && !isSuperAdminUser(admin)) {
    throw new HttpError(403, "Only super admin can create super admin users");
  }
  if (plan !== "none" && freeAccessDays < 1) {
    throw new HttpError(400, "Free access days must be at least 1 when a plan is selected");
  }

  const existingUser = await db.users.findOne({ email }, { _id: 0 });
  if (existingUser) {
    throw new HttpError(400, "Email already registered");
  }

  const now = isoNow();
  const isSuperAdmin = role === "super_admin" || isConfiguredSuperAdminEmail(email);
  const grantedPeriodEnd =
    plan !== "none" && freeAccessDays > 0
      ? new Date(Date.now() + freeAccessDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  let supabaseUserId = null;
  if (isSupabaseAuthAdminEnabled()) {
    const created = await supabaseAuthAdminCreateUser({
      email,
      password,
      name,
      emailConfirmed: true,
    });
    supabaseUserId = created?.id || null;
  }

  const userDoc = {
    user_id: makeId("user"),
    name,
    email,
    password_hash: await bcrypt.hash(password, 12),
    role: isSuperAdmin ? "super_admin" : role,
    plan: isSuperAdmin ? "enterprise" : plan,
    subscription_status: isSuperAdmin ? "active" : (plan === "none" ? "inactive" : "active"),
    subscription_started_at: plan === "none" && !isSuperAdmin ? null : now,
    subscription_current_period_start: plan === "none" && !isSuperAdmin ? null : now,
    subscription_current_period_end: isSuperAdmin ? null : grantedPeriodEnd,
    subscription_expires_at: isSuperAdmin ? null : grantedPeriodEnd,
    next_renewal_at: isSuperAdmin ? null : grantedPeriodEnd,
    subscription_source: isSuperAdmin ? "super_admin" : (plan === "none" ? "manual" : "admin_grant"),
    storage_used: 0,
    language: await getPlatformDefaultLanguage(),
    billing_profile: {},
    email_verified: true,
    email_verified_at: now,
    supabase_user_id: supabaseUserId,
    created_at: now,
  };

  await db.users.insertOne(userDoc);
  await logAuditEvent(req, {
    eventType: "admin.user_create",
    actorUserId: admin.user_id,
    targetUserId: userDoc.user_id,
    resourceType: "user",
    resourceId: userDoc.user_id,
    success: true,
    message: "admin_created_user",
    metadata: {
      role: userDoc.role,
      plan: userDoc.plan,
      free_access_days: freeAccessDays,
    },
  });

  sendJson(res, 200, {
    message: "User created successfully",
    user: sanitizeUser(userDoc),
  });
}

async function handleAdminUsersUpdate(req, res, userId) {
  const admin = await getCurrentAdmin(req);
  const body = await getJsonBody(req);
  const targetUser = await db.users.findOne({ user_id: userId }, { _id: 0 });
  if (!targetUser) {
    throw new HttpError(404, "User not found");
  }
  const adminIsSuperAdmin = isSuperAdminUser(admin);
  const targetIsSuperAdmin = isSuperAdminUser(targetUser);

  const update = {};
  for (const key of ["subscription_status", "plan", "role"]) {
    if (body[key] !== undefined && body[key] !== null) {
      update[key] = body[key];
    }
  }
  if (body.billing_profile !== undefined) {
    update.billing_profile = sanitizeBillingProfileInput(body.billing_profile);
  }
  if (body.free_access_days !== undefined) {
    const freeAccessDays = Number.parseInt(String(body.free_access_days), 10);
    if (Number.isNaN(freeAccessDays) || freeAccessDays < 0 || freeAccessDays > 3650) {
      throw new HttpError(400, "free_access_days must be between 0 and 3650");
    }
    if ((body.plan !== undefined ? String(body.plan) : String(targetUser.plan || "none")) !== "none" && freeAccessDays < 1) {
      throw new HttpError(400, "Free access days must be at least 1 when a plan is selected");
    }
    if (freeAccessDays > 0) {
      const now = isoNow();
      const periodEnd = new Date(Date.now() + freeAccessDays * 24 * 60 * 60 * 1000).toISOString();
      update.subscription_status = "active";
      update.subscription_started_at = targetUser.subscription_started_at || now;
      update.subscription_current_period_start = now;
      update.subscription_current_period_end = periodEnd;
      update.subscription_expires_at = periodEnd;
      update.next_renewal_at = periodEnd;
      update.subscription_source = "admin_grant";
    } else if ((body.plan !== undefined ? String(body.plan) : String(targetUser.plan || "none")) === "none") {
      update.subscription_current_period_start = null;
      update.subscription_current_period_end = null;
      update.subscription_expires_at = null;
      update.next_renewal_at = null;
      update.subscription_status = "inactive";
    }
  }

  if (update.subscription_status !== undefined) {
    const nextStatus = String(update.subscription_status || "").trim();
    if (!["active", "inactive"].includes(nextStatus)) {
      throw new HttpError(400, "Invalid subscription status");
    }
    const activatingInactiveAccount =
      nextStatus === "active" && String(targetUser.subscription_status || "inactive") !== "active";
    if (activatingInactiveAccount) {
      const hasPlanSelection = body.plan !== undefined;
      const hasAccessWindow = body.free_access_days !== undefined;
      if (!hasPlanSelection || !hasAccessWindow) {
        throw new HttpError(400, "Select a subscription plan and access period before activating access");
      }
      const requestedPlan = String(
        body.plan !== undefined ? body.plan : targetUser.plan || "none",
      ).trim();
      const requestedAccessDays = Number.parseInt(
        String(body.free_access_days !== undefined ? body.free_access_days : "0"),
        10,
      );
      if (
        requestedPlan === "none" ||
        Number.isNaN(requestedAccessDays) ||
        requestedAccessDays < 1
      ) {
        throw new HttpError(400, "Select a valid subscription plan and access period before activating access");
      }
    }
  }

  if (Object.keys(update).length === 0) {
    throw new HttpError(400, "No update data provided");
  }

  if (update.role !== undefined) {
    const nextRole = String(update.role || "").trim();
    if (!["user", "admin", "super_admin"].includes(nextRole)) {
      throw new HttpError(400, "Invalid role");
    }
    if (nextRole === "super_admin" && !adminIsSuperAdmin) {
      throw new HttpError(403, "Only super admin can assign super_admin role");
    }
    if (isConfiguredSuperAdminEmail(targetUser.email) && nextRole !== "super_admin") {
      throw new HttpError(400, "Configured super admin account must remain super_admin");
    }
  }
  if (update.plan !== undefined) {
    const nextPlan = String(update.plan || "").trim();
    if (nextPlan !== "none" && !(await getSubscriptionPlanDefinition(nextPlan, { requireActive: true }))) {
      throw new HttpError(400, "Invalid plan");
    }
    if (nextPlan === "none" && body.free_access_days === undefined) {
      update.subscription_status = "inactive";
      update.subscription_current_period_start = null;
      update.subscription_current_period_end = null;
      update.subscription_expires_at = null;
      update.next_renewal_at = null;
    }
  }
  if (targetIsSuperAdmin && !adminIsSuperAdmin) {
    throw new HttpError(403, "Only super admin can modify super admin accounts");
  }

  const result = await db.users.updateOne(
    { user_id: userId },
    {
      $set: update,
    },
  );

  if (result.matchedCount === 0) {
    throw new HttpError(404, "User not found");
  }

  await logAuditEvent(req, {
    eventType: "admin.user_update",
    actorUserId: admin.user_id,
    targetUserId: userId,
    resourceType: "user",
    resourceId: userId,
    success: true,
    message: "admin_updated_user",
    metadata: { update },
  });

  sendJson(res, 200, { message: "User updated successfully" });
}

async function handleAdminUsersDelete(req, res, userId) {
  const admin = await getCurrentAdmin(req);
  if (admin.user_id === userId) {
    throw new HttpError(400, "Cannot delete yourself");
  }

  const targetUser = await db.users.findOne({ user_id: userId }, { _id: 0 });
  if (!targetUser) {
    throw new HttpError(404, "User not found");
  }
  if (isConfiguredSuperAdminEmail(targetUser.email)) {
    throw new HttpError(400, "Configured super admin account cannot be deleted");
  }
  if (isSuperAdminUser(targetUser) && !isSuperAdminUser(admin)) {
    throw new HttpError(403, "Only super admin can delete a super admin account");
  }

  const userPdfs = await db.pdfs.find({ user_id: userId }, { _id: 0 });
  for (const pdf of userPdfs) {
    if (pdf.storage_key) {
      await deletePdfBinary(pdf);
    } else if (pdf.file_path) {
      await removeLegacyFileIfExists(pdf.file_path);
    }
  }

  await db.deleteFilesByUser(userId);
  await db.pdfs.deleteMany({ user_id: userId });
  await db.links.deleteMany({ user_id: userId });
  await db.user_sessions.deleteMany({ user_id: userId });
  await db.folders.deleteMany({ user_id: userId });
  await db.users.deleteOne({ user_id: userId });

  await logAuditEvent(req, {
    eventType: "admin.user_delete",
    actorUserId: admin.user_id,
    targetUserId: userId,
    resourceType: "user",
    resourceId: userId,
    success: true,
    message: "admin_deleted_user",
  });

  sendJson(res, 200, { message: "User deleted successfully" });
}

async function handleAdminLinksGet(req, res) {
  await getCurrentAdmin(req);

  const [links, users, pdfs, domains] = await Promise.all([
    db.links.find({}, {
      _id: 0,
      link_id: 1,
      pdf_id: 1,
      user_id: 1,
      token: 1,
      expiry_mode: 1,
      expiry_duration_seconds: 1,
      expiry_fixed_datetime: 1,
      first_open_at: 1,
      expires_at: 1,
      open_count: 1,
      unique_ips: 1,
      status: 1,
      custom_expired_url: 1,
      custom_expired_message: 1,
      internal_title: 1,
      internal_note: 1,
      custom_domain_id: 1,
      created_at: 1,
    }, { sort: { created_at: -1 } }),
    db.users.find({}, { _id: 0, user_id: 1, name: 1, email: 1 }),
    db.pdfs.find({}, { _id: 0, pdf_id: 1, filename: 1 }),
    db.domains.find({}, { _id: 0, user_id: 1, domain_id: 1, domain: 1 }),
  ]);

  const userById = new Map();
  for (const user of users) {
    userById.set(user.user_id, user);
  }
  const pdfById = new Map();
  for (const pdf of pdfs) {
    pdfById.set(pdf.pdf_id, pdf);
  }
  const domainByUserAndId = new Map();
  for (const domain of domains) {
    if (!domain?.user_id || !domain?.domain_id) continue;
    domainByUserAndId.set(`${domain.user_id}:${domain.domain_id}`, domain);
  }

  const platformOrigin = buildPublicBaseUrl(req);
  const responseLinks = links.map((link) => {
    const user = userById.get(link.user_id);
    const pdf = pdfById.get(link.pdf_id);
    const domainDoc = link.custom_domain_id
      ? domainByUserAndId.get(`${link.user_id}:${link.custom_domain_id}`)
      : null;
    let linkOrigin = platformOrigin;
    if (domainDoc?.domain) {
      try {
        linkOrigin = getOriginForDomainHost(domainDoc.domain, req);
      } catch {
        linkOrigin = platformOrigin;
      }
    }

    return {
      link_id: link.link_id,
      pdf_id: link.pdf_id,
      user_id: link.user_id,
      token: link.token,
      expiry_mode: link.expiry_mode,
      expiry_duration_seconds: link.expiry_duration_seconds,
      expiry_fixed_datetime: link.expiry_fixed_datetime,
      first_open_at: link.first_open_at,
      expires_at: link.expires_at,
      open_count: Number(link.open_count || 0),
      unique_ip_count: Array.isArray(link.unique_ips) ? link.unique_ips.length : 0,
      status: link.status,
      custom_expired_url: link.custom_expired_url || null,
      custom_expired_message: link.custom_expired_message || null,
      internal_title: link.internal_title || null,
      internal_note: link.internal_note || null,
      custom_domain_id: link.custom_domain_id || null,
      domain: domainDoc?.domain || null,
      secure_url: buildSecureViewUrl(linkOrigin, link.token),
      created_at: link.created_at,
      user_name: user?.name || "Unknown",
      user_email: user?.email || "Unknown",
      pdf_name: pdf?.filename || "Unknown",
    };
  });

  sendJson(res, 200, responseLinks);
}

async function handleAdminLinksRevoke(req, res, linkId) {
  const admin = await getCurrentAdmin(req);

  const result = await db.links.updateOne(
    { link_id: linkId },
    {
      $set: { status: "revoked" },
    },
  );

  if (result.matchedCount === 0) {
    throw new HttpError(404, "Link not found");
  }

  await logAuditEvent(req, {
    eventType: "admin.link_revoke",
    actorUserId: admin.user_id,
    resourceType: "link",
    resourceId: linkId,
    success: true,
    message: "admin_revoked_link",
  });

  sendJson(res, 200, { message: "Link revoked successfully" });
}

async function handleAdminLinksDelete(req, res, linkId) {
  const admin = await getCurrentAdmin(req);

  const result = await db.links.deleteOne({ link_id: linkId });
  if (result.deletedCount === 0) {
    throw new HttpError(404, "Link not found");
  }

  await logAuditEvent(req, {
    eventType: "admin.link_delete",
    actorUserId: admin.user_id,
    resourceType: "link",
    resourceId: linkId,
    success: true,
    message: "admin_deleted_link",
  });

  sendJson(res, 200, { message: "Link deleted successfully" });
}

async function handleAdminStats(req, res) {
  await getCurrentAdmin(req);

  const [users, totalPdfs, totalLinks, activeLinks, totalStorage, totalViews, viewerLinks] = await Promise.all([
    db.users.find({}, { _id: 0, subscription_status: 1 }),
    db.pdfs.countDocuments({}),
    db.links.countDocuments({}),
    db.links.countDocuments({ status: "active" }),
    db.users.sumField({}, "storage_used"),
    db.links.sumField({}, "open_count"),
    db.links.find({}, { _id: 0, unique_ips: 1 }),
  ]);

  const totalUsers = users.length;
  const activeSubscribers = users.filter((user) => user.subscription_status === "active").length;
  const uniqueViewerSet = new Set();
  for (const link of viewerLinks) {
    for (const ip of link.unique_ips || []) {
      if (ip) uniqueViewerSet.add(ip);
    }
  }
  const totalUniqueViewers = uniqueViewerSet.size;

  sendJson(res, 200, {
    total_users: totalUsers,
    active_subscribers: activeSubscribers,
    total_pdfs: totalPdfs,
    total_links: totalLinks,
    active_links: activeLinks,
    total_storage_bytes: totalStorage,
    total_views: totalViews,
    total_unique_viewers: totalUniqueViewers,
  });
}

async function handleAdminStripeGet(req, res) {
  await requireSettingsSectionAccess(req, "payments", "read");
  const config = await getActiveStripeConfig();
  sendJson(res, 200, config);
}

async function handleAdminStripePut(req, res) {
  const { user: admin } = await requireSettingsSectionAccess(req, "payments", "write");
  const body = await getJsonBody(req);

  const updateData = {
    key: "stripe",
    updated_at: isoNow(),
  };

  if (body.stripe_key !== undefined) {
    const stripeKey = String(body.stripe_key || "");
    if (
      stripeKey &&
      !stripeKey.startsWith("sk_test_") &&
      !stripeKey.startsWith("sk_live_")
    ) {
      throw new HttpError(400, "Invalid Stripe key format");
    }

    const keyType = stripeKeyType(stripeKey);
    if (keyType === "live") {
      updateData.live_key = stripeKey;
    } else if (keyType === "sandbox") {
      updateData.sandbox_key = stripeKey;
    }
    updateData.stripe_key = stripeKey;
  }

  if (body.mode !== undefined) {
    const mode = String(body.mode || "");
    if (mode !== "sandbox" && mode !== "live") {
      throw new HttpError(400, "Mode must be 'sandbox' or 'live'");
    }
    updateData.mode = mode;
  }

  await persistPlatformSettingUpdate(req, {
    actor: admin,
    key: "stripe",
    updateData,
    updatedFields: [
      ...(Object.prototype.hasOwnProperty.call(updateData, "mode") ? ["mode"] : []),
      ...(Object.prototype.hasOwnProperty.call(updateData, "live_key") ? ["live_key"] : []),
      ...(Object.prototype.hasOwnProperty.call(updateData, "sandbox_key") ? ["sandbox_key"] : []),
      ...(Object.prototype.hasOwnProperty.call(updateData, "stripe_key") ? ["stripe_key"] : []),
    ],
    eventType: "admin.stripe_settings_update",
    message: "admin_updated_stripe_settings",
    metadata: {
      mode: updateData.mode || null,
      updated_live_key: Object.prototype.hasOwnProperty.call(updateData, "live_key"),
      updated_sandbox_key: Object.prototype.hasOwnProperty.call(updateData, "sandbox_key"),
    },
  });

  sendJson(res, 200, { message: "Stripe settings updated successfully" });
}

async function handleAdminStorageGet(req, res) {
  await requireSettingsSectionAccess(req, "storage", "read");
  const config = await getActiveStorageConfig();
  sendJson(res, 200, {
    key: "storage",
    active_provider: config.active_provider,
    providers: config.providers,
    wasabi: {
      endpoint: config.wasabi.endpoint,
      region: config.wasabi.region,
      bucket: config.wasabi.bucket,
      force_path_style: config.wasabi.force_path_style,
      configured: config.wasabi.configured,
      access_key_preview: config.wasabi.access_key_preview,
      secret_key_preview: config.wasabi.secret_key_preview,
      access_key_set: config.wasabi.access_key_set,
      secret_key_set: config.wasabi.secret_key_set,
    },
  });
}

async function handleAdminStoragePut(req, res) {
  const { user: admin } = await requireSettingsSectionAccess(req, "storage", "write");
  const body = await getJsonBody(req);
  const now = isoNow();

  const existingConfig = await getActiveStorageConfig();
  const updateData = {
    key: "storage",
    updated_at: now,
  };

  if (body.active_provider !== undefined) {
    const rawProvider = String(body.active_provider || "").trim();
    if (!VALID_STORAGE_PROVIDERS.includes(rawProvider)) {
      throw new HttpError(400, "Invalid storage provider");
    }
    const provider = normalizeStorageProvider(rawProvider);
    if (!VALID_STORAGE_PROVIDERS.includes(provider)) {
      throw new HttpError(400, "Invalid storage provider");
    }
    updateData.active_provider = provider;
  }

  if (body.wasabi_endpoint !== undefined) {
    updateData.wasabi_endpoint = String(body.wasabi_endpoint || "").trim();
  }
  if (body.wasabi_region !== undefined) {
    updateData.wasabi_region = String(body.wasabi_region || "").trim();
  }
  if (body.wasabi_bucket !== undefined) {
    updateData.wasabi_bucket = String(body.wasabi_bucket || "").trim();
  }
  if (body.wasabi_access_key_id !== undefined) {
    updateData.wasabi_access_key_id = String(body.wasabi_access_key_id || "").trim();
  }
  if (body.wasabi_secret_access_key !== undefined) {
    updateData.wasabi_secret_access_key = String(body.wasabi_secret_access_key || "").trim();
  }
  if (body.wasabi_force_path_style !== undefined) {
    updateData.wasabi_force_path_style = parseOptionalBoolean(
      body.wasabi_force_path_style,
      "wasabi_force_path_style",
    );
  }

  if (Object.keys(updateData).length <= 2) {
    throw new HttpError(400, "No storage settings provided");
  }

  const merged = {
    active_provider: updateData.active_provider || existingConfig.active_provider,
    wasabi_endpoint:
      updateData.wasabi_endpoint !== undefined
        ? updateData.wasabi_endpoint
        : existingConfig.wasabi.endpoint,
    wasabi_region:
      updateData.wasabi_region !== undefined
        ? updateData.wasabi_region
        : existingConfig.wasabi.region,
    wasabi_bucket:
      updateData.wasabi_bucket !== undefined
        ? updateData.wasabi_bucket
        : existingConfig.wasabi.bucket,
    wasabi_access_key_id:
      updateData.wasabi_access_key_id !== undefined
        ? updateData.wasabi_access_key_id
        : existingConfig.wasabi.access_key_id,
    wasabi_secret_access_key:
      updateData.wasabi_secret_access_key !== undefined
        ? updateData.wasabi_secret_access_key
        : existingConfig.wasabi.secret_access_key,
    wasabi_force_path_style:
      updateData.wasabi_force_path_style !== undefined
        ? updateData.wasabi_force_path_style
        : existingConfig.wasabi.force_path_style,
  };

  if (merged.active_provider === STORAGE_PROVIDER_WASABI) {
    const missing = [];
    if (!merged.wasabi_endpoint) missing.push("wasabi_endpoint");
    if (!merged.wasabi_region) missing.push("wasabi_region");
    if (!merged.wasabi_bucket) missing.push("wasabi_bucket");
    if (!merged.wasabi_access_key_id) missing.push("wasabi_access_key_id");
    if (!merged.wasabi_secret_access_key) missing.push("wasabi_secret_access_key");
    if (missing.length > 0) {
      throw new HttpError(
        400,
        `Wasabi provider requires complete configuration. Missing: ${missing.join(", ")}`,
      );
    }
  }

  await persistPlatformSettingUpdate(req, {
    actor: admin,
    key: "storage",
    updateData,
    updatedFields: Object.keys(updateData).filter((field) => !["key", "updated_at"].includes(field)),
    eventType: "admin.storage_settings_update",
    message: "super_admin_updated_storage_settings",
    metadata: {
      active_provider: merged.active_provider,
      updated_wasabi_endpoint: Object.prototype.hasOwnProperty.call(updateData, "wasabi_endpoint"),
      updated_wasabi_region: Object.prototype.hasOwnProperty.call(updateData, "wasabi_region"),
      updated_wasabi_bucket: Object.prototype.hasOwnProperty.call(updateData, "wasabi_bucket"),
      updated_wasabi_access_key: Object.prototype.hasOwnProperty.call(
        updateData,
        "wasabi_access_key_id",
      ),
      updated_wasabi_secret_key: Object.prototype.hasOwnProperty.call(
        updateData,
        "wasabi_secret_access_key",
      ),
    },
  });

  const nextConfig = await getActiveStorageConfig();
  sendJson(res, 200, {
    message: "Storage settings updated successfully",
    key: "storage",
    active_provider: nextConfig.active_provider,
    providers: nextConfig.providers,
    wasabi: {
      endpoint: nextConfig.wasabi.endpoint,
      region: nextConfig.wasabi.region,
      bucket: nextConfig.wasabi.bucket,
      force_path_style: nextConfig.wasabi.force_path_style,
      configured: nextConfig.wasabi.configured,
      access_key_preview: nextConfig.wasabi.access_key_preview,
      secret_key_preview: nextConfig.wasabi.secret_key_preview,
      access_key_set: nextConfig.wasabi.access_key_set,
      secret_key_set: nextConfig.wasabi.secret_key_set,
    },
  });
}

async function handleAdminEmailDeliveryGet(req, res) {
  await requireSettingsSectionAccess(req, "email", "read");
  const config = await getActiveAdminEmailDeliveryConfig(req);
  sendJson(res, 200, config);
}

async function handleAdminEmailDeliveryPut(req, res) {
  const { user: admin } = await requireSettingsSectionAccess(req, "email", "write");
  const body = await getJsonBody(req);
  const existing = await getActiveEmailDeliveryConfig();
  const existingDoc = (await getPlatformSettingDoc("email_delivery")) || {};
  const now = isoNow();

  const updateData = {
    key: "email_delivery",
    updated_at: now,
  };
  const updatedFields = [];

  if (body.active_provider !== undefined) {
    const provider = normalizeEmailDeliveryProvider(body.active_provider);
    if (!provider) {
      throw new HttpError(
        400,
        `active_provider must be one of: ${VALID_EMAIL_DELIVERY_PROVIDERS.join(", ")}`,
      );
    }
    updateData.active_provider = provider;
    updatedFields.push("active_provider");
  }
  if (body.gmail_client_id !== undefined) {
    updateData.gmail_client_id = sanitizeOptionalEmailProviderText(body.gmail_client_id, "gmail_client_id", 255);
    updatedFields.push("gmail_client_id");
  }
  if (body.gmail_client_secret !== undefined) {
    updateData.gmail_client_secret = sanitizeOptionalEmailProviderText(body.gmail_client_secret, "gmail_client_secret", 255);
    updatedFields.push("gmail_client_secret");
  }
  if (body.gmail_from_email !== undefined) {
    updateData.gmail_from_email = sanitizeOptionalEmailValue(body.gmail_from_email, "gmail_from_email");
    updatedFields.push("gmail_from_email");
  }
  if (body.gmail_from_name !== undefined) {
    updateData.gmail_from_name = sanitizeOptionalEmailProviderText(body.gmail_from_name, "gmail_from_name", 120);
    updatedFields.push("gmail_from_name");
  }
  if (body.gmail_reply_to !== undefined) {
    updateData.gmail_reply_to = sanitizeOptionalEmailValue(body.gmail_reply_to, "gmail_reply_to");
    updatedFields.push("gmail_reply_to");
  }
  if (body.gmail_force_return_path !== undefined) {
    updateData.gmail_force_return_path = parseOptionalBoolean(body.gmail_force_return_path, "gmail_force_return_path");
    updatedFields.push("gmail_force_return_path");
  }
  if (body.mailgun_api_key !== undefined) {
    updateData.mailgun_api_key = sanitizeOptionalEmailProviderText(body.mailgun_api_key, "mailgun_api_key", 255);
    updatedFields.push("mailgun_api_key");
  }
  if (body.mailgun_domain !== undefined) {
    updateData.mailgun_domain = sanitizeOptionalMailgunDomain(body.mailgun_domain, "mailgun_domain");
    updatedFields.push("mailgun_domain");
  }
  if (body.mailgun_region !== undefined) {
    updateData.mailgun_region = normalizeMailgunRegion(body.mailgun_region, "us");
    updatedFields.push("mailgun_region");
  }
  if (body.mailgun_from_email !== undefined) {
    updateData.mailgun_from_email = sanitizeOptionalEmailValue(body.mailgun_from_email, "mailgun_from_email");
    updatedFields.push("mailgun_from_email");
  }
  if (body.mailgun_from_name !== undefined) {
    updateData.mailgun_from_name = sanitizeOptionalEmailProviderText(body.mailgun_from_name, "mailgun_from_name", 120);
    updatedFields.push("mailgun_from_name");
  }
  if (body.mailgun_reply_to !== undefined) {
    updateData.mailgun_reply_to = sanitizeOptionalEmailValue(body.mailgun_reply_to, "mailgun_reply_to");
    updatedFields.push("mailgun_reply_to");
  }
  if (body.mailgun_force_return_path !== undefined) {
    updateData.mailgun_force_return_path = parseOptionalBoolean(body.mailgun_force_return_path, "mailgun_force_return_path");
    updatedFields.push("mailgun_force_return_path");
  }
  if (body.outlook_tenant_id !== undefined) {
    updateData.outlook_tenant_id = sanitizeOptionalEmailProviderText(body.outlook_tenant_id, "outlook_tenant_id", 120) || MICROSOFT_DEFAULT_TENANT;
    updatedFields.push("outlook_tenant_id");
  }
  if (body.outlook_client_id !== undefined) {
    updateData.outlook_client_id = sanitizeOptionalEmailProviderText(body.outlook_client_id, "outlook_client_id", 255);
    updatedFields.push("outlook_client_id");
  }
  if (body.outlook_client_secret !== undefined) {
    updateData.outlook_client_secret = sanitizeOptionalEmailProviderText(body.outlook_client_secret, "outlook_client_secret", 255);
    updatedFields.push("outlook_client_secret");
  }
  if (body.outlook_from_email !== undefined) {
    updateData.outlook_from_email = sanitizeOptionalEmailValue(body.outlook_from_email, "outlook_from_email");
    updatedFields.push("outlook_from_email");
  }
  if (body.outlook_from_name !== undefined) {
    updateData.outlook_from_name = sanitizeOptionalEmailProviderText(body.outlook_from_name, "outlook_from_name", 120);
    updatedFields.push("outlook_from_name");
  }
  if (body.outlook_reply_to !== undefined) {
    updateData.outlook_reply_to = sanitizeOptionalEmailValue(body.outlook_reply_to, "outlook_reply_to");
    updatedFields.push("outlook_reply_to");
  }
  if (body.outlook_save_to_sent_items !== undefined) {
    updateData.outlook_save_to_sent_items = parseOptionalBoolean(body.outlook_save_to_sent_items, "outlook_save_to_sent_items");
    updatedFields.push("outlook_save_to_sent_items");
  }
  if (body.smtp_host !== undefined) {
    updateData.smtp_host = sanitizeOptionalHost(body.smtp_host, "smtp_host");
    updatedFields.push("smtp_host");
  }
  if (body.smtp_port !== undefined) {
    updateData.smtp_port = normalizeSmtpPort(body.smtp_port, 587);
    updatedFields.push("smtp_port");
  }
  if (body.smtp_encryption !== undefined) {
    updateData.smtp_encryption = normalizeSmtpEncryption(body.smtp_encryption, "tls");
    updatedFields.push("smtp_encryption");
  }
  if (body.smtp_secure !== undefined) {
    updateData.smtp_secure = parseOptionalBoolean(body.smtp_secure, "smtp_secure");
    updatedFields.push("smtp_secure");
  }
  if (body.smtp_auth_enabled !== undefined) {
    updateData.smtp_auth_enabled = parseOptionalBoolean(body.smtp_auth_enabled, "smtp_auth_enabled");
    updatedFields.push("smtp_auth_enabled");
  }
  if (body.smtp_username !== undefined) {
    updateData.smtp_username = String(body.smtp_username ?? "").trim();
    updatedFields.push("smtp_username");
  }
  if (body.smtp_password !== undefined) {
    updateData.smtp_password = String(body.smtp_password ?? "").trim();
    updatedFields.push("smtp_password");
  }
  if (body.smtp_from_email !== undefined) {
    updateData.smtp_from_email = sanitizeOptionalEmailValue(body.smtp_from_email, "smtp_from_email");
    updatedFields.push("smtp_from_email");
  }
  if (body.smtp_from_name !== undefined) {
    updateData.smtp_from_name = String(body.smtp_from_name ?? "").trim().slice(0, 120);
    updatedFields.push("smtp_from_name");
  }
  if (body.smtp_reply_to !== undefined) {
    updateData.smtp_reply_to = sanitizeOptionalEmailValue(body.smtp_reply_to, "smtp_reply_to");
    updatedFields.push("smtp_reply_to");
  }
  if (body.smtp_force_return_path !== undefined) {
    updateData.smtp_force_return_path = parseOptionalBoolean(body.smtp_force_return_path, "smtp_force_return_path");
    updatedFields.push("smtp_force_return_path");
  }

  if (updatedFields.length === 0) {
    throw new HttpError(400, "No email delivery settings provided");
  }

  const merged = {
    active_provider:
      updateData.active_provider !== undefined
        ? updateData.active_provider
        : existing.requested_provider,
    gmail: {
      client_id:
        updateData.gmail_client_id !== undefined ? updateData.gmail_client_id : String(existingDoc.gmail_client_id || "").trim(),
      client_secret:
        updateData.gmail_client_secret !== undefined ? updateData.gmail_client_secret : String(existingDoc.gmail_client_secret || "").trim(),
      refresh_token: String(existingDoc.gmail_refresh_token || "").trim(),
      email: String(existingDoc.gmail_email || "").trim().toLowerCase(),
      from_email:
        updateData.gmail_from_email !== undefined ? updateData.gmail_from_email : existing.gmail.from_email,
      from_name:
        updateData.gmail_from_name !== undefined ? updateData.gmail_from_name : existing.gmail.from_name,
      reply_to:
        updateData.gmail_reply_to !== undefined ? updateData.gmail_reply_to : existing.gmail.reply_to,
    },
    mailgun: {
      api_key:
        updateData.mailgun_api_key !== undefined ? updateData.mailgun_api_key : String(existingDoc.mailgun_api_key || "").trim(),
      domain:
        updateData.mailgun_domain !== undefined ? updateData.mailgun_domain : existing.mailgun.domain,
      region:
        updateData.mailgun_region !== undefined ? updateData.mailgun_region : existing.mailgun.region,
      from_email:
        updateData.mailgun_from_email !== undefined ? updateData.mailgun_from_email : existing.mailgun.from_email,
      from_name:
        updateData.mailgun_from_name !== undefined ? updateData.mailgun_from_name : existing.mailgun.from_name,
      reply_to:
        updateData.mailgun_reply_to !== undefined ? updateData.mailgun_reply_to : existing.mailgun.reply_to,
    },
    outlook: {
      tenant_id:
        updateData.outlook_tenant_id !== undefined
          ? updateData.outlook_tenant_id
          : String(existingDoc.outlook_tenant_id || MICROSOFT_DEFAULT_TENANT).trim() || MICROSOFT_DEFAULT_TENANT,
      client_id:
        updateData.outlook_client_id !== undefined ? updateData.outlook_client_id : String(existingDoc.outlook_client_id || "").trim(),
      client_secret:
        updateData.outlook_client_secret !== undefined ? updateData.outlook_client_secret : String(existingDoc.outlook_client_secret || "").trim(),
      refresh_token: String(existingDoc.outlook_refresh_token || "").trim(),
      email: String(existingDoc.outlook_email || "").trim().toLowerCase(),
      from_email:
        updateData.outlook_from_email !== undefined ? updateData.outlook_from_email : existing.outlook.from_email,
      from_name:
        updateData.outlook_from_name !== undefined ? updateData.outlook_from_name : existing.outlook.from_name,
      reply_to:
        updateData.outlook_reply_to !== undefined ? updateData.outlook_reply_to : existing.outlook.reply_to,
    },
    smtp_host:
      updateData.smtp_host !== undefined ? updateData.smtp_host : existing.smtp.host,
    smtp_port:
      updateData.smtp_port !== undefined ? updateData.smtp_port : existing.smtp.port,
    smtp_encryption:
      updateData.smtp_encryption !== undefined ? updateData.smtp_encryption : existing.smtp.encryption,
    smtp_secure:
      updateData.smtp_secure !== undefined ? updateData.smtp_secure : existing.smtp.secure,
    smtp_auth_enabled:
      updateData.smtp_auth_enabled !== undefined ? updateData.smtp_auth_enabled : existing.smtp.auth_enabled,
    smtp_username:
      updateData.smtp_username !== undefined ? updateData.smtp_username : existing.smtp.username,
    smtp_password:
      updateData.smtp_password !== undefined ? updateData.smtp_password : existing.smtp.password,
    smtp_from_email:
      updateData.smtp_from_email !== undefined
        ? updateData.smtp_from_email
        : existing.smtp.from_email,
    smtp_from_name:
      updateData.smtp_from_name !== undefined
        ? updateData.smtp_from_name
        : existing.smtp.from_name,
    smtp_reply_to:
      updateData.smtp_reply_to !== undefined
        ? updateData.smtp_reply_to
        : existing.smtp.reply_to,
    smtp_force_return_path:
      updateData.smtp_force_return_path !== undefined
        ? updateData.smtp_force_return_path
        : existing.smtp.force_return_path,
  };

  if (merged.active_provider === EMAIL_PROVIDER_GMAIL) {
    const missing = [];
    if (!merged.gmail.client_id) missing.push("gmail_client_id");
    if (!merged.gmail.client_secret) missing.push("gmail_client_secret");
    if (!merged.gmail.from_email) missing.push("gmail_from_email");
    if (missing.length > 0) {
      throw new HttpError(400, `Gmail requires complete configuration. Missing: ${missing.join(", ")}`);
    }
  }

  if (merged.active_provider === EMAIL_PROVIDER_MAILGUN) {
    const missing = [];
    if (!merged.mailgun.api_key) missing.push("mailgun_api_key");
    if (!merged.mailgun.domain) missing.push("mailgun_domain");
    if (!merged.mailgun.from_email) missing.push("mailgun_from_email");
    if (missing.length > 0) {
      throw new HttpError(400, `Mailgun requires complete configuration. Missing: ${missing.join(", ")}`);
    }
  }

  if (merged.active_provider === EMAIL_PROVIDER_OUTLOOK) {
    if (!merged.outlook.client_id || !merged.outlook.client_secret) {
      throw new HttpError(400, "Microsoft 365 / Outlook requires client ID and client secret");
    }
  }

  if (merged.active_provider === EMAIL_PROVIDER_SMTP) {
    const missing = [];
    if (!merged.smtp_host) missing.push("smtp_host");
    if (!merged.smtp_port) missing.push("smtp_port");
    if (!merged.smtp_from_email) missing.push("smtp_from_email");
    if (merged.smtp_auth_enabled && !merged.smtp_username) missing.push("smtp_username");
    if (merged.smtp_auth_enabled && !merged.smtp_password) missing.push("smtp_password");
    if (missing.length > 0) {
      throw new HttpError(
        400,
        `SMTP delivery requires complete configuration. Missing: ${missing.join(", ")}`,
      );
    }
  }

  if (merged.active_provider === EMAIL_PROVIDER_RESEND && !existing.resend.configured) {
    throw new HttpError(
      400,
      "Resend is not configured in the server environment. Set RESEND_API_KEY and EMAIL_FROM first, or switch to custom SMTP.",
    );
  }

  await persistPlatformSettingUpdate(req, {
    actor: admin,
    key: "email_delivery",
    updateData,
    updatedFields,
    eventType: "admin.email_delivery_settings_update",
    message: "super_admin_updated_email_delivery_settings",
    metadata: {
      active_provider: merged.active_provider,
      public_updated_fields: updatedFields.filter((field) =>
        !["smtp_password", "gmail_client_secret", "mailgun_api_key", "outlook_client_secret"].includes(field)
      ),
      updated_smtp_password: updatedFields.includes("smtp_password"),
      updated_gmail_client_secret: updatedFields.includes("gmail_client_secret"),
      updated_mailgun_api_key: updatedFields.includes("mailgun_api_key"),
      updated_outlook_client_secret: updatedFields.includes("outlook_client_secret"),
    },
  });

  const config = await getActiveAdminEmailDeliveryConfig(req);
  sendJson(res, 200, {
    message: "Email delivery settings updated successfully",
    ...config,
  });
}

async function handleAdminGmailStart(req, res) {
  const { user: admin } = await requireSettingsSectionAccess(req, "email", "write");
  const config = await getActiveEmailDeliveryConfig();
  if (!config.gmail.client_id || !config.gmail.client_secret) {
    sendRedirect(
      res,
      buildAdminSettingsRedirectUrl(req, {
        provider: EMAIL_PROVIDER_GMAIL,
        oauth: "error",
        message: "Save Gmail client ID and client secret first.",
      }),
    );
    return;
  }

  const state = createEmailProviderStateToken(EMAIL_PROVIDER_GMAIL, admin.user_id);
  const redirectUri = buildEmailDeliveryCallbackUrl(req, EMAIL_PROVIDER_GMAIL);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.gmail.client_id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  sendRedirect(res, url.toString());
}

async function handleAdminGmailCallback(req, res) {
  const error = String(req.query.error || "").trim();
  if (error) {
    sendRedirect(
      res,
      buildAdminSettingsRedirectUrl(req, {
        provider: EMAIL_PROVIDER_GMAIL,
        oauth: "error",
        message: error,
      }),
    );
    return;
  }

  const { user: admin } = await requireSettingsSectionAccess(req, "email", "write");
  verifyEmailProviderStateToken(req.query.state, EMAIL_PROVIDER_GMAIL);
  const code = String(req.query.code || "").trim();
  if (!code) {
    sendRedirect(
      res,
      buildAdminSettingsRedirectUrl(req, {
        provider: EMAIL_PROVIDER_GMAIL,
        oauth: "error",
        message: "Missing authorization code",
      }),
    );
    return;
  }

  const existingDoc = (await getPlatformSettingDoc("email_delivery")) || {};
  const clientId = String(existingDoc.gmail_client_id || "").trim();
  const clientSecret = String(existingDoc.gmail_client_secret || "").trim();
  if (!clientId || !clientSecret) {
    throw new HttpError(400, "Save Gmail client ID and client secret first");
  }

  try {
    const tokenPayload = await fetchJsonUrlEncoded("https://oauth2.googleapis.com/token", {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: buildEmailDeliveryCallbackUrl(req, EMAIL_PROVIDER_GMAIL),
      grant_type: "authorization_code",
    });
    const refreshToken = String(tokenPayload.refresh_token || existingDoc.gmail_refresh_token || "").trim();
    if (!refreshToken) {
      throw new Error("Google did not return a refresh token. Reconnect with consent.");
    }
    const configuredFromEmail = String(existingDoc.gmail_from_email || existingDoc.gmail_email || "").trim().toLowerCase();
    await persistPlatformSettingUpdate(req, {
      actor: admin,
      key: "email_delivery",
      updateData: {
        gmail_refresh_token: refreshToken,
        gmail_email: configuredFromEmail,
        gmail_connected_at: isoNow(),
        gmail_token_scope: String(tokenPayload.scope || GOOGLE_OAUTH_SCOPES.join(" ")).trim(),
        updated_at: isoNow(),
      },
      updatedFields: [
        "gmail_refresh_token",
        "gmail_email",
        "gmail_connected_at",
        "gmail_token_scope",
      ],
      eventType: "admin.email_delivery_gmail_connected",
      message: "gmail_mailer_connected",
      metadata: { email: configuredFromEmail || null },
    });

    sendRedirect(
      res,
      buildAdminSettingsRedirectUrl(req, {
        provider: EMAIL_PROVIDER_GMAIL,
        oauth: "connected",
      }),
    );
  } catch (oauthError) {
    sendRedirect(
      res,
      buildAdminSettingsRedirectUrl(req, {
        provider: EMAIL_PROVIDER_GMAIL,
        oauth: "error",
        message: oauthError?.message || "gmail_connection_failed",
      }),
    );
  }
}

async function handleAdminOutlookStart(req, res) {
  const { user: admin } = await requireSettingsSectionAccess(req, "email", "write");
  const config = await getActiveEmailDeliveryConfig();
  if (!config.outlook.client_id || !config.outlook.client_secret) {
    sendRedirect(
      res,
      buildAdminSettingsRedirectUrl(req, {
        provider: EMAIL_PROVIDER_OUTLOOK,
        oauth: "error",
        message: "Save Outlook client ID and client secret first.",
      }),
    );
    return;
  }

  const state = createEmailProviderStateToken(EMAIL_PROVIDER_OUTLOOK, admin.user_id);
  const tenantId = config.outlook.tenant_id || MICROSOFT_DEFAULT_TENANT;
  const redirectUri = buildEmailDeliveryCallbackUrl(req, EMAIL_PROVIDER_OUTLOOK);
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", config.outlook.client_id);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_OAUTH_SCOPES.join(" "));
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("state", state);
  sendRedirect(res, url.toString());
}

async function handleAdminOutlookCallback(req, res) {
  const error = String(req.query.error || "").trim();
  if (error) {
    sendRedirect(
      res,
      buildAdminSettingsRedirectUrl(req, {
        provider: EMAIL_PROVIDER_OUTLOOK,
        oauth: "error",
        message: error,
      }),
    );
    return;
  }

  const { user: admin } = await requireSettingsSectionAccess(req, "email", "write");
  verifyEmailProviderStateToken(req.query.state, EMAIL_PROVIDER_OUTLOOK);
  const code = String(req.query.code || "").trim();
  if (!code) {
    sendRedirect(
      res,
      buildAdminSettingsRedirectUrl(req, {
        provider: EMAIL_PROVIDER_OUTLOOK,
        oauth: "error",
        message: "Missing authorization code",
      }),
    );
    return;
  }

  const existingDoc = (await getPlatformSettingDoc("email_delivery")) || {};
  const tenantId = String(existingDoc.outlook_tenant_id || MICROSOFT_DEFAULT_TENANT).trim() || MICROSOFT_DEFAULT_TENANT;
  const clientId = String(existingDoc.outlook_client_id || "").trim();
  const clientSecret = String(existingDoc.outlook_client_secret || "").trim();
  if (!clientId || !clientSecret) {
    throw new HttpError(400, "Save Outlook client ID and client secret first");
  }

  try {
    const tokenPayload = await fetchJsonUrlEncoded(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: buildEmailDeliveryCallbackUrl(req, EMAIL_PROVIDER_OUTLOOK),
        grant_type: "authorization_code",
        scope: MICROSOFT_OAUTH_SCOPES.join(" "),
      },
    );
    const refreshToken = String(tokenPayload.refresh_token || existingDoc.outlook_refresh_token || "").trim();
    if (!refreshToken) {
      throw new Error("Microsoft did not return a refresh token.");
    }
    const profile = await fetchMicrosoftProfile(tokenPayload.access_token);
    await persistPlatformSettingUpdate(req, {
      actor: admin,
      key: "email_delivery",
      updateData: {
        outlook_refresh_token: refreshToken,
        outlook_email: profile.email,
        outlook_connected_at: isoNow(),
        updated_at: isoNow(),
      },
      updatedFields: [
        "outlook_refresh_token",
        "outlook_email",
        "outlook_connected_at",
      ],
      eventType: "admin.email_delivery_outlook_connected",
      message: "outlook_mailer_connected",
      metadata: { email: profile.email },
    });

    sendRedirect(
      res,
      buildAdminSettingsRedirectUrl(req, {
        provider: EMAIL_PROVIDER_OUTLOOK,
        oauth: "connected",
      }),
    );
  } catch (oauthError) {
    sendRedirect(
      res,
      buildAdminSettingsRedirectUrl(req, {
        provider: EMAIL_PROVIDER_OUTLOOK,
        oauth: "error",
        message: oauthError?.message || "outlook_connection_failed",
      }),
    );
  }
}

async function handleAdminEmailProviderDisconnect(req, res, provider) {
  const { user: admin } = await requireSettingsSectionAccess(req, "email", "write");
  const normalizedProvider = normalizeEmailDeliveryProvider(provider);
  if (![EMAIL_PROVIDER_GMAIL, EMAIL_PROVIDER_OUTLOOK].includes(normalizedProvider)) {
    throw new HttpError(404, "Provider not supported");
  }

  const clearData =
    normalizedProvider === EMAIL_PROVIDER_GMAIL
      ? {
          gmail_refresh_token: "",
          gmail_email: "",
          gmail_connected_at: null,
          gmail_token_scope: "",
        }
      : {
          outlook_refresh_token: "",
          outlook_email: "",
          outlook_connected_at: null,
        };
  const existing = await getActiveEmailDeliveryConfig();
  if (existing.requested_provider === normalizedProvider || existing.active_provider === normalizedProvider) {
    clearData.active_provider = EMAIL_PROVIDER_SUPABASE;
  }
  clearData.updated_at = isoNow();
  clearData.key = "email_delivery";

  await persistPlatformSettingUpdate(req, {
    actor: admin,
    key: "email_delivery",
    updateData: clearData,
    updatedFields: Object.keys(clearData).filter((field) => !["key", "updated_at"].includes(field)),
    eventType: `admin.email_delivery_${normalizedProvider}_disconnected`,
    message: `${normalizedProvider}_mailer_disconnected`,
  });

  sendJson(res, 200, {
    message: `${normalizedProvider} disconnected successfully`,
    ...(await getActiveAdminEmailDeliveryConfig(req)),
  });
}

async function handleAdminEmailDeliveryTest(req, res) {
  const { user: admin } = await requireSettingsSectionAccess(req, "email", "write");
  const body = await getJsonBody(req);
  const recipient = normalizeEmailAddress(body.recipient || admin.email, "recipient");
  const config = await getActiveEmailDeliveryConfig();

  if (!config.custom_delivery_enabled) {
    throw new HttpError(
      400,
      "No custom email delivery provider is active. Configure Gmail, Mailgun, Outlook, SMTP, or Resend first.",
    );
  }

  const result = await sendTransactionalEmail({
    to: recipient,
    subject: "Secure PDF Platform email delivery test",
    text: `This is a test email from ${DEFAULT_BRANDING_SETTINGS.app_name}. Active provider: ${config.active_provider}.`,
    html: `<p>This is a test email from <strong>${DEFAULT_BRANDING_SETTINGS.app_name}</strong>.</p><p>Active provider: <strong>${config.active_provider}</strong>.</p>`,
  });

  await logAuditEvent(req, {
    eventType: "admin.email_delivery_test",
    actorUserId: admin.user_id,
    targetUserId: admin.user_id,
    resourceType: "platform_settings",
    resourceId: "email_delivery",
    success: Boolean(result.delivered),
    message: result.delivered ? "email_test_sent" : "email_test_failed",
    metadata: {
      recipient,
      provider: result.provider,
      error: result.error || null,
    },
  });

  if (!result.delivered) {
    throw new HttpError(400, `Test email failed: ${result.error || "unknown_error"}`);
  }

  sendJson(res, 200, {
    message: "Test email sent successfully",
    recipient,
    provider: result.provider,
  });
}

async function handleAdminVercelGet(req, res) {
  await requireSettingsSectionAccess(req, "domains", "read");
  const config = await getActiveVercelConfig();
  sendJson(res, 200, {
    key: "vercel",
    configured: config.configured,
    auto_attach: config.auto_attach,
    project_id: config.project_id,
    team_id: config.team_id,
    token_set: config.token_set,
    token_preview: config.token_preview,
  });
}

async function handleAdminVercelPut(req, res) {
  const { user: admin } = await requireSettingsSectionAccess(req, "domains", "write");
  const body = await getJsonBody(req);
  const now = isoNow();
  const existing = await getActiveVercelConfig();

  const updateData = {
    key: "vercel",
    updated_at: now,
  };
  const updatedFields = [];

  if (body.api_token !== undefined) {
    updateData.api_token = normalizeVercelApiToken(body.api_token);
    updatedFields.push("api_token");
  }
  if (body.project_id !== undefined) {
    updateData.project_id = normalizeVercelProjectId(body.project_id);
    updatedFields.push("project_id");
  }
  if (body.team_id !== undefined) {
    updateData.team_id = normalizeVercelTeamId(body.team_id);
    updatedFields.push("team_id");
  }
  if (body.auto_attach !== undefined) {
    updateData.auto_attach = parseOptionalBoolean(body.auto_attach, "auto_attach");
    updatedFields.push("auto_attach");
  }

  if (updatedFields.length === 0) {
    throw new HttpError(400, "No Vercel settings provided");
  }

  const merged = {
    api_token:
      updateData.api_token !== undefined ? updateData.api_token : existing.api_token,
    project_id:
      updateData.project_id !== undefined ? updateData.project_id : existing.project_id,
    auto_attach:
      updateData.auto_attach !== undefined ? updateData.auto_attach : existing.auto_attach,
  };

  if (merged.auto_attach && (!merged.api_token || !merged.project_id)) {
    throw new HttpError(
      400,
      "Vercel auto-attach requires both API token and project ID",
    );
  }

  await persistPlatformSettingUpdate(req, {
    actor: admin,
    key: "vercel",
    updateData,
    updatedFields,
    eventType: "admin.vercel_settings_update",
    message: "super_admin_updated_vercel_settings",
    metadata: {
      configured: Boolean(merged.api_token && merged.project_id),
      auto_attach: Boolean(merged.auto_attach),
    },
  });

  const nextConfig = await getActiveVercelConfig();
  sendJson(res, 200, {
    message: "Vercel settings updated successfully",
    key: "vercel",
    configured: nextConfig.configured,
    auto_attach: nextConfig.auto_attach,
    project_id: nextConfig.project_id,
    team_id: nextConfig.team_id,
    token_set: nextConfig.token_set,
    token_preview: nextConfig.token_preview,
  });
}

async function handleBrandingGet(req, res) {
  const config = await getActiveBrandingConfig();
  sendJson(res, 200, config);
}

async function handleLocalizationGet(req, res) {
  const config = await getActiveLocalizationConfig();
  sendJson(res, 200, config);
}

async function handlePublicSiteGet(req, res) {
  const config = await getActivePublicSiteConfig();
  sendJson(res, 200, config);
}

async function handleAdminLocalizationGet(req, res) {
  await requireSettingsSectionAccess(req, "localization", "read");
  const config = await getActiveLocalizationConfig();
  sendJson(res, 200, config);
}

async function handleAdminLocalizationPut(req, res) {
  const { user: admin } = await requireSettingsSectionAccess(req, "localization", "write");
  const body = await getJsonBody(req);
  const existingConfig = await getActiveLocalizationConfig();
  const nextDefaultLanguageCandidate =
    body.default_language !== undefined
      ? String(body.default_language || "").trim()
      : existingConfig.default_language;

  if (!VALID_LANGUAGES.includes(nextDefaultLanguageCandidate)) {
    throw new HttpError(400, "Unsupported default language");
  }

  const enabledLanguages =
    body.enabled_languages !== undefined
      ? sanitizeEnabledLanguages(body.enabled_languages, nextDefaultLanguageCandidate)
      : existingConfig.enabled_languages;

  if (!enabledLanguages.includes(nextDefaultLanguageCandidate)) {
    throw new HttpError(400, "Default language must stay enabled");
  }

  const updateData = {
    key: "localization",
    default_language: nextDefaultLanguageCandidate,
    enabled_languages: enabledLanguages,
    automatic_detection:
      body.automatic_detection !== undefined
        ? Boolean(body.automatic_detection)
        : Boolean(existingConfig.automatic_detection),
    site_timezone:
      body.site_timezone !== undefined
        ? sanitizeLocalizationTimezone(body.site_timezone)
        : existingConfig.site_timezone,
    site_currency:
      body.site_currency !== undefined
        ? sanitizeLocalizationCurrency(body.site_currency)
        : existingConfig.site_currency,
    manual_overrides:
      body.manual_overrides !== undefined
        ? sanitizeLocalizationManualOverrides(body.manual_overrides)
        : existingConfig.manual_overrides,
    updated_at: isoNow(),
  };

  const updatedFields = [];
  [
    "default_language",
    "enabled_languages",
    "automatic_detection",
    "site_timezone",
    "site_currency",
    "manual_overrides",
  ].forEach((fieldName) => {
    if (body[fieldName] !== undefined) {
      updatedFields.push(fieldName);
    }
  });

  if (!updatedFields.length) {
    throw new HttpError(400, "No localization settings provided");
  }

  await persistPlatformSettingUpdate(req, {
    actor: admin,
    key: "localization",
    updateData,
    updatedFields,
    eventType: "admin.localization_settings_update",
    message: "admin_updated_localization_settings",
    metadata: {
      default_language: nextDefaultLanguageCandidate,
      enabled_languages: enabledLanguages,
    },
  });

  const config = await getActiveLocalizationConfig();
  sendJson(res, 200, {
    message: "Localization settings updated successfully",
    ...config,
  });
}

async function handleAdminPublicSiteGet(req, res) {
  await requireSettingsSectionAccess(req, "public_site", "read");
  const config = await getActivePublicSiteConfig();
  sendJson(res, 200, config);
}

async function handleAdminPublicSitePut(req, res) {
  const { user: admin } = await requireSettingsSectionAccess(req, "public_site", "write");
  const body = await getJsonBody(req);

  const updateData = {
    key: "public_site",
    updated_at: isoNow(),
  };
  const updatedFields = [];

  const fieldSpecs = [
    ["about_url", { allowRelativePath: true }],
    ["contact_url", { allowRelativePath: true }],
    ["blog_url", { allowRelativePath: true }],
    ["privacy_url", { allowRelativePath: true }],
    ["terms_url", { allowRelativePath: true }],
    ["gdpr_url", { allowRelativePath: true }],
    ["auth_portal_url", { allowRelativePath: false }],
  ];

  for (const [fieldName, options] of fieldSpecs) {
    if (body[fieldName] !== undefined) {
      updateData[fieldName] = sanitizeOptionalUrlSetting(body[fieldName], fieldName, options);
      updatedFields.push(fieldName);
    }
  }

  if (updatedFields.length === 0) {
    throw new HttpError(400, "No public site settings provided");
  }

  await persistPlatformSettingUpdate(req, {
    actor: admin,
    key: "public_site",
    updateData,
    updatedFields,
    eventType: "admin.public_site_settings_update",
    message: "super_admin_updated_public_site_settings",
  });

  const config = await getActivePublicSiteConfig();
  sendJson(res, 200, {
    message: "Public site settings updated successfully",
    ...config,
  });
}

async function handleAdminBrandingGet(req, res) {
  await requireSettingsSectionAccess(req, "branding", "read");
  const config = await getActiveBrandingConfig();
  sendJson(res, 200, config);
}

async function handleAdminBrandingPut(req, res) {
  const { user: admin } = await requireSettingsSectionAccess(req, "branding", "write");
  const body = await getJsonBody(req);

  const updateData = {
    key: "branding",
    updated_at: isoNow(),
  };
  const updatedFields = [];

  if (body.app_name !== undefined) {
    updateData.app_name = sanitizeBrandingString(body.app_name, "app_name", 48);
    updatedFields.push("app_name");
  }
  if (body.product_name !== undefined) {
    updateData.product_name = sanitizeBrandingString(body.product_name, "product_name", 72);
    updatedFields.push("product_name");
  }
  if (body.tagline !== undefined) {
    updateData.tagline = sanitizeBrandingString(body.tagline, "tagline", 120);
    updatedFields.push("tagline");
  }
  if (body.primary_color !== undefined) {
    updateData.primary_color = sanitizeBrandingColor(body.primary_color, "primary_color");
    updatedFields.push("primary_color");
  }
  if (body.accent_color !== undefined) {
    updateData.accent_color = sanitizeBrandingColor(body.accent_color, "accent_color");
    updatedFields.push("accent_color");
  }
  if (body.footer_text !== undefined) {
    updateData.footer_text = sanitizeBrandingString(body.footer_text, "footer_text", 160);
    updatedFields.push("footer_text");
  }

  if (updatedFields.length === 0) {
    throw new HttpError(400, "No branding settings provided");
  }

  await persistPlatformSettingUpdate(req, {
    actor: admin,
    key: "branding",
    updateData,
    updatedFields,
    eventType: "admin.branding_settings_update",
    message: "super_admin_updated_branding_settings",
  });

  const config = await getActiveBrandingConfig();
  sendJson(res, 200, {
    message: "Branding settings updated successfully",
    ...config,
  });
}

async function handleSeoGet(req, res) {
  const config = await getActiveSeoConfig();
  sendJson(res, 200, config);
}

async function handleAdminSeoGet(req, res) {
  await requireSettingsSectionAccess(req, "seo", "read");
  const config = await getActiveSeoConfig();
  sendJson(res, 200, config);
}

async function handleAdminSeoPut(req, res) {
  const { user: admin } = await requireSettingsSectionAccess(req, "seo", "write");
  const body = await getJsonBody(req);

  const updateData = {
    key: "seo",
    updated_at: isoNow(),
  };
  const updatedFields = [];

  if (body.site_name !== undefined) {
    updateData.site_name = sanitizeSeoText(body.site_name, "site_name", 80);
    updatedFields.push("site_name");
  }
  if (body.default_title !== undefined) {
    updateData.default_title = sanitizeSeoText(body.default_title, "default_title", 120);
    updatedFields.push("default_title");
  }
  if (body.default_description !== undefined) {
    updateData.default_description = sanitizeSeoText(
      body.default_description,
      "default_description",
      320,
    );
    updatedFields.push("default_description");
  }
  if (body.default_keywords !== undefined) {
    updateData.default_keywords = sanitizeSeoText(body.default_keywords, "default_keywords", 320);
    updatedFields.push("default_keywords");
  }
  if (body.og_image_url !== undefined) {
    updateData.og_image_url = sanitizeSeoUrlOrPath(body.og_image_url, "og_image_url", {
      allowRelativePath: true,
      allowEmpty: true,
    });
    updatedFields.push("og_image_url");
  }
  if (body.favicon_url !== undefined) {
    updateData.favicon_url = sanitizeSeoUrlOrPath(body.favicon_url, "favicon_url", {
      allowRelativePath: true,
      allowEmpty: true,
    });
    updatedFields.push("favicon_url");
  }
  if (body.canonical_base_url !== undefined) {
    updateData.canonical_base_url = sanitizeSeoUrlOrPath(
      body.canonical_base_url,
      "canonical_base_url",
      {
        allowRelativePath: false,
        allowEmpty: true,
      },
    );
    updatedFields.push("canonical_base_url");
  }
  if (body.twitter_handle !== undefined) {
    const twitterHandle = String(body.twitter_handle || "").trim();
    if (twitterHandle.length > 64) {
      throw new HttpError(400, "twitter_handle must be 64 characters or fewer");
    }
    updateData.twitter_handle = twitterHandle;
    updatedFields.push("twitter_handle");
  }
  if (body.noindex !== undefined) {
    updateData.noindex = parseOptionalBoolean(body.noindex, "noindex");
    updatedFields.push("noindex");
  }

  if (updatedFields.length === 0) {
    throw new HttpError(400, "No SEO settings provided");
  }

  await persistPlatformSettingUpdate(req, {
    actor: admin,
    key: "seo",
    updateData,
    updatedFields,
    eventType: "admin.seo_settings_update",
    message: "super_admin_updated_seo_settings",
  });
  invalidatePlatformSettingCache("branding");

  const config = await getActiveSeoConfig();
  sendJson(res, 200, {
    message: "SEO settings updated successfully",
    ...config,
  });
}

async function handleAdminInvoiceTemplateGet(req, res) {
  await requireSettingsSectionAccess(req, "invoice", "read");
  const config = await getActiveInvoiceTemplateConfig();
  sendJson(res, 200, config);
}

async function handleAdminInvoiceTemplatePut(req, res) {
  const { user: admin } = await requireSettingsSectionAccess(req, "invoice", "write");
  const body = await getJsonBody(req);

  const updateData = {
    key: "invoice_template",
    updated_at: isoNow(),
  };
  const updatedFields = [];

  if (body.company_name !== undefined) {
    updateData.company_name = sanitizeInvoiceTemplateText(body.company_name, "company_name", 100);
    updatedFields.push("company_name");
  }
  if (body.company_address !== undefined) {
    updateData.company_address = sanitizeInvoiceTemplateText(
      body.company_address,
      "company_address",
      200,
    );
    updatedFields.push("company_address");
  }
  if (body.company_email !== undefined) {
    updateData.company_email = sanitizeInvoiceTemplateText(body.company_email, "company_email", 120);
    updatedFields.push("company_email");
  }
  if (body.company_phone !== undefined) {
    updateData.company_phone = sanitizeInvoiceTemplateText(
      body.company_phone,
      "company_phone",
      64,
      { allowEmpty: true },
    );
    updatedFields.push("company_phone");
  }
  if (body.company_website !== undefined) {
    updateData.company_website = sanitizeInvoiceTemplateText(
      body.company_website,
      "company_website",
      220,
      { allowEmpty: true },
    );
    updatedFields.push("company_website");
  }
  if (body.tax_label !== undefined) {
    updateData.tax_label = sanitizeInvoiceTemplateText(body.tax_label, "tax_label", 40);
    updatedFields.push("tax_label");
  }
  if (body.tax_id !== undefined) {
    updateData.tax_id = sanitizeInvoiceTemplateText(body.tax_id, "tax_id", 80, {
      allowEmpty: true,
    });
    updatedFields.push("tax_id");
  }
  if (body.invoice_prefix !== undefined) {
    const prefix = sanitizeInvoiceTemplateText(body.invoice_prefix, "invoice_prefix", 12).toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(prefix)) {
      throw new HttpError(400, "invoice_prefix can only contain letters, numbers, - or _");
    }
    updateData.invoice_prefix = prefix;
    updatedFields.push("invoice_prefix");
  }
  if (body.notes !== undefined) {
    updateData.notes = sanitizeInvoiceTemplateText(body.notes, "notes", 500);
    updatedFields.push("notes");
  }
  if (body.terms !== undefined) {
    updateData.terms = sanitizeInvoiceTemplateText(body.terms, "terms", 500);
    updatedFields.push("terms");
  }
  if (body.footer_text !== undefined) {
    updateData.footer_text = sanitizeInvoiceTemplateText(body.footer_text, "footer_text", 240);
    updatedFields.push("footer_text");
  }
  if (body.primary_color !== undefined) {
    updateData.primary_color = sanitizeBrandingColor(body.primary_color, "primary_color");
    updatedFields.push("primary_color");
  }
  if (body.accent_color !== undefined) {
    updateData.accent_color = sanitizeBrandingColor(body.accent_color, "accent_color");
    updatedFields.push("accent_color");
  }
  if (body.logo_url !== undefined) {
    updateData.logo_url = sanitizeSeoUrlOrPath(body.logo_url, "logo_url", {
      allowRelativePath: true,
      allowEmpty: true,
    });
    updatedFields.push("logo_url");
  }
  if (body.show_logo !== undefined) {
    updateData.show_logo = parseOptionalBoolean(body.show_logo, "show_logo");
    updatedFields.push("show_logo");
  }

  if (updatedFields.length === 0) {
    throw new HttpError(400, "No invoice template settings provided");
  }

  await persistPlatformSettingUpdate(req, {
    actor: admin,
    key: "invoice_template",
    updateData,
    updatedFields,
    eventType: "admin.invoice_template_update",
    message: "super_admin_updated_invoice_template",
  });

  const config = await getActiveInvoiceTemplateConfig();
  sendJson(res, 200, {
    message: "Invoice template settings updated successfully",
    ...config,
  });
}

async function handleAdminAuthEmailTemplateGet(req, res) {
  await requireSettingsSectionAccess(req, "email", "read");
  const config = await getActiveAuthEmailTemplateConfig();
  sendJson(res, 200, config);
}

async function handleAdminAuthEmailTemplatePut(req, res) {
  const { user: admin } = await requireSettingsSectionAccess(req, "email", "write");
  const body = await getJsonBody(req);

  const updateData = {
    key: "auth_email_template",
    updated_at: isoNow(),
  };
  const updatedFields = [];

  if (body.verify_email_subject !== undefined) {
    updateData.verify_email_subject = sanitizeAuthEmailTemplateText(
      body.verify_email_subject,
      "verify_email_subject",
      160,
    );
    updatedFields.push("verify_email_subject");
  }
  if (body.verify_email_preview_text !== undefined) {
    updateData.verify_email_preview_text = sanitizeAuthEmailTemplateText(
      body.verify_email_preview_text,
      "verify_email_preview_text",
      220,
      { allowEmpty: true },
    );
    updatedFields.push("verify_email_preview_text");
  }
  if (body.verify_email_heading !== undefined) {
    updateData.verify_email_heading = sanitizeAuthEmailTemplateText(
      body.verify_email_heading,
      "verify_email_heading",
      120,
    );
    updatedFields.push("verify_email_heading");
  }
  if (body.verify_email_body !== undefined) {
    updateData.verify_email_body = sanitizeAuthEmailTemplateText(
      body.verify_email_body,
      "verify_email_body",
      1200,
    );
    updatedFields.push("verify_email_body");
  }
  if (body.verify_email_button_label !== undefined) {
    updateData.verify_email_button_label = sanitizeAuthEmailTemplateText(
      body.verify_email_button_label,
      "verify_email_button_label",
      60,
    );
    updatedFields.push("verify_email_button_label");
  }
  if (body.verify_email_expiry_notice !== undefined) {
    updateData.verify_email_expiry_notice = sanitizeAuthEmailTemplateText(
      body.verify_email_expiry_notice,
      "verify_email_expiry_notice",
      200,
    );
    updatedFields.push("verify_email_expiry_notice");
  }
  if (body.verify_email_footer !== undefined) {
    updateData.verify_email_footer = sanitizeAuthEmailTemplateText(
      body.verify_email_footer,
      "verify_email_footer",
      320,
    );
    updatedFields.push("verify_email_footer");
  }
  if (body.password_reset_subject !== undefined) {
    updateData.password_reset_subject = sanitizeAuthEmailTemplateText(
      body.password_reset_subject,
      "password_reset_subject",
      160,
    );
    updatedFields.push("password_reset_subject");
  }
  if (body.password_reset_preview_text !== undefined) {
    updateData.password_reset_preview_text = sanitizeAuthEmailTemplateText(
      body.password_reset_preview_text,
      "password_reset_preview_text",
      220,
      { allowEmpty: true },
    );
    updatedFields.push("password_reset_preview_text");
  }
  if (body.password_reset_heading !== undefined) {
    updateData.password_reset_heading = sanitizeAuthEmailTemplateText(
      body.password_reset_heading,
      "password_reset_heading",
      120,
    );
    updatedFields.push("password_reset_heading");
  }
  if (body.password_reset_body !== undefined) {
    updateData.password_reset_body = sanitizeAuthEmailTemplateText(
      body.password_reset_body,
      "password_reset_body",
      1200,
    );
    updatedFields.push("password_reset_body");
  }
  if (body.password_reset_button_label !== undefined) {
    updateData.password_reset_button_label = sanitizeAuthEmailTemplateText(
      body.password_reset_button_label,
      "password_reset_button_label",
      60,
    );
    updatedFields.push("password_reset_button_label");
  }
  if (body.password_reset_expiry_notice !== undefined) {
    updateData.password_reset_expiry_notice = sanitizeAuthEmailTemplateText(
      body.password_reset_expiry_notice,
      "password_reset_expiry_notice",
      200,
    );
    updatedFields.push("password_reset_expiry_notice");
  }
  if (body.password_reset_footer !== undefined) {
    updateData.password_reset_footer = sanitizeAuthEmailTemplateText(
      body.password_reset_footer,
      "password_reset_footer",
      320,
    );
    updatedFields.push("password_reset_footer");
  }

  if (updatedFields.length === 0) {
    throw new HttpError(400, "No auth email template settings provided");
  }

  await persistPlatformSettingUpdate(req, {
    actor: admin,
    key: "auth_email_template",
    updateData,
    updatedFields,
    eventType: "admin.auth_email_template_update",
    message: "super_admin_updated_auth_email_template",
  });

  const config = await getActiveAuthEmailTemplateConfig();
  sendJson(res, 200, {
    message: "Auth email template settings updated successfully",
    ...config,
  });
}

async function handleAdminSubscriptionPlansGet(req, res) {
  await requireSettingsSectionAccess(req, "plans", "read");
  const config = await getActiveSubscriptionPlansConfig();
  sendJson(res, 200, config);
}

async function handleAdminSubscriptionPlansPut(req, res) {
  const { user: admin } = await requireSettingsSectionAccess(req, "plans", "write");
  const body = await getJsonBody(req);
  const existingConfig = await getActiveSubscriptionPlansConfig();
  const nextPlans = cloneJson(existingConfig.plans || {});
  const updatedFields = [];

  const updateData = {
    key: "subscription_plans",
    updated_at: isoNow(),
  };

  if (body.currency !== undefined) {
    updateData.currency = normalizeCurrencyCode(body.currency, existingConfig.currency || "eur");
    updatedFields.push("currency");
  }
  if (body.interval !== undefined) {
    const interval = String(body.interval || "").trim().toLowerCase();
    if (!["month", "year"].includes(interval)) {
      throw new HttpError(400, "interval must be month or year");
    }
    updateData.interval = interval;
    updatedFields.push("interval");
  }
  if (body.plans !== undefined) {
    if (!body.plans || typeof body.plans !== "object" || Array.isArray(body.plans)) {
      throw new HttpError(400, "plans must be an object");
    }

    for (const [planId, incoming] of Object.entries(body.plans)) {
      if (!isValidSubscriptionPlanId(planId)) {
        throw new HttpError(
          400,
          `${planId || "plan_id"} must contain only lowercase letters, numbers, dashes, or underscores`,
        );
      }
      if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
        throw new HttpError(400, `${planId} must be an object`);
      }

      const nextPlan = {
        ...(nextPlans[planId] || getGenericDefaultSubscriptionPlan(planId, Object.keys(nextPlans).length)),
      };

      if (incoming.name !== undefined) {
        nextPlan.name = sanitizePlanText(incoming.name, `${planId}.name`, 48);
      }
      if (incoming.description !== undefined) {
        nextPlan.description = sanitizePlanText(incoming.description, `${planId}.description`, 140);
      }
      if (incoming.badge !== undefined) {
        nextPlan.badge = sanitizePlanText(incoming.badge, `${planId}.badge`, 40, { allowEmpty: true });
      }
      if (incoming.price !== undefined) {
        nextPlan.price = sanitizePlanNumber(incoming.price, `${planId}.price`, {
          min: 0,
          max: 100000,
          decimals: 2,
        });
      }
      if (incoming.storage_mb !== undefined) {
        nextPlan.storage_mb = sanitizePlanNumber(incoming.storage_mb, `${planId}.storage_mb`, {
          min: 0,
          max: 1000000,
          decimals: 0,
        });
      }
      if (incoming.links_per_month !== undefined) {
        nextPlan.links_per_month = sanitizePlanNumber(
          incoming.links_per_month,
          `${planId}.links_per_month`,
          {
            min: 0,
            max: 1000000,
            decimals: 0,
          },
        );
      }
      if (incoming.featured !== undefined) {
        nextPlan.featured = parseOptionalBoolean(incoming.featured, `${planId}.featured`);
      }
      if (incoming.active !== undefined) {
        nextPlan.active = parseOptionalBoolean(incoming.active, `${planId}.active`);
      }
      if (incoming.public_visible !== undefined) {
        nextPlan.public_visible = parseOptionalBoolean(
          incoming.public_visible,
          `${planId}.public_visible`,
        );
      }
      if (incoming.sort_order !== undefined) {
        nextPlan.sort_order = sanitizePlanNumber(incoming.sort_order, `${planId}.sort_order`, {
          min: 0,
          max: 1000,
          decimals: 0,
        });
      }
      if (incoming.features !== undefined) {
        nextPlan.features = sanitizePlanFeatures(incoming.features, `${planId}.features`);
      }

      nextPlan.plan_id = planId;
      nextPlans[planId] = nextPlan;
      updatedFields.push(planId);
    }
  }

  if (updatedFields.length === 0) {
    throw new HttpError(400, "No subscription plan settings provided");
  }

  updateData.plans = nextPlans;

  await persistPlatformSettingUpdate(req, {
    actor: admin,
    key: "subscription_plans",
    updateData,
    updatedFields,
    eventType: "admin.subscription_plan_settings_update",
    message: "super_admin_updated_subscription_plan_settings",
  });

  const config = await getActiveSubscriptionPlansConfig();
  sendJson(res, 200, {
    message: "Subscription plan settings updated successfully",
    ...config,
  });
}

async function handleDomainsCreate(req, res) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_domains" });
  const owner = workspace.ownerUser;

  const body = await getJsonBody(req);
  const domain = normalizeDomainHost(body.domain || "");
  const existingDomain = await db.domains.findOne(
    { user_id: workspace.accountId, domain },
    { _id: 0, domain_id: 1 },
  );
  if (existingDomain) {
    throw new HttpError(400, "Domain already exists");
  }

  const domainId = makeId("dom");
  const shouldSetDefault =
    parseOptionalBoolean(body.set_default, "set_default") ??
    !owner.preferred_domain_id;
  const now = isoNow();

  const domainDoc = {
    domain_id: domainId,
    user_id: workspace.accountId,
    domain,
    verification_token: tokenUrlSafe(24),
    verification_txt_name: getDomainVerificationTxtName(domain),
    verification_status: "pending",
    ssl_status: "pending",
    verification_error: "Run verification after adding DNS records",
    verification_checked_at: null,
    ssl_checked_at: null,
    created_at: now,
  };

  await db.domains.insertOne(domainDoc);

  const vercelConfig = await getActiveVercelConfig();
  const vercelAttach = await ensureDomainAttachedOnVercel(vercelConfig, domain);
  const vercelUpdate = {
    vercel_project_id: vercelConfig.project_id || null,
    vercel_status: vercelAttach.status,
    vercel_error: vercelAttach.error || null,
    vercel_checked_at: now,
    vercel_verified: Boolean(vercelAttach.verified),
  };
  if (vercelAttach.details) {
    vercelUpdate.vercel_details = vercelAttach.details;
  }
  await db.domains.updateOne(
    { domain_id: domainId, user_id: workspace.accountId },
    {
      $set: vercelUpdate,
    },
  );

  await logAuditEvent(req, {
    eventType: "domain.create",
    ...getWorkspaceAuditFields(workspace, {
      domain,
      set_default: shouldSetDefault,
      vercel_status: vercelUpdate.vercel_status,
      vercel_auto_attach: vercelConfig.auto_attach,
      vercel_configured: vercelConfig.configured,
    }),
    resourceType: "domain",
    resourceId: domainId,
    success: true,
    message: "custom_domain_created",
  });

  const preferredDomainId = owner.preferred_domain_id || null;
  const responseDoc = buildDomainResponse(
    { ...domainDoc, ...vercelUpdate },
    req,
    preferredDomainId,
  );

  sendJson(res, 200, {
    ...responseDoc,
    requested_default: shouldSetDefault,
    message: vercelConfig.configured
      ? "Domain saved as pending. Vercel attach attempted automatically. Add DNS records, then click Verify DNS & SSL."
      : "Domain saved as pending. Add this domain in Vercel, configure DNS records, then click Verify DNS & SSL.",
  });
}

async function handleDomainsGet(req, res) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_domains" });
  const domains = await db.domains.find({ user_id: workspace.accountId }, { _id: 0 });
  const preferredDomainId = workspace.ownerUser.preferred_domain_id || null;
  const withMeta = domains
    .map((domain) => buildDomainResponse(domain, req, preferredDomainId))
    .sort((left, right) => {
      if (left.is_default && !right.is_default) return -1;
      if (!left.is_default && right.is_default) return 1;
      return String(left.domain).localeCompare(String(right.domain));
    });
  sendJson(res, 200, withMeta);
}

async function handleDomainsVerify(req, res, domainId) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_domains" });
  const domain = await db.domains.findOne(
    { domain_id: domainId, user_id: workspace.accountId },
    { _id: 0 },
  );
  if (!domain) {
    throw new HttpError(404, "Domain not found");
  }

  const vercelConfig = await getActiveVercelConfig();
  const vercelCheck = await verifyDomainOnVercel(vercelConfig, domain.domain);
  const dnsCheck = await checkDomainDnsVerification(req, domain);
  let sslCheck = {
    ssl_status: "pending",
    ssl_error: "DNS routing + TXT verification are required before SSL check",
    certificate: null,
  };
  if (dnsCheck.dns_verified) {
    sslCheck = await checkDomainSslStatus(domain.domain);
  }

  const nextVerificationStatus = dnsCheck.dns_verified ? "verified" : "pending";
  const nextSslStatus = dnsCheck.dns_verified ? sslCheck.ssl_status : "pending";
  const verificationError =
    dnsCheck.verification_error || sslCheck.ssl_error || null;
  const now = isoNow();

  const updateData = {
    verification_status: nextVerificationStatus,
    ssl_status: nextSslStatus,
    verification_error: verificationError,
    verification_checked_at: now,
    ssl_checked_at: now,
    dns_check: {
      routing_ok: dnsCheck.routing_ok,
      txt_ok: dnsCheck.txt_ok,
      cname_records: dnsCheck.cname_records,
      a_records: dnsCheck.a_records,
      txt_records: dnsCheck.txt_records,
      cname_matches: dnsCheck.cname_matches,
      a_matches: dnsCheck.a_matches,
      checked_at: now,
    },
    ssl_check: {
      ssl_status: sslCheck.ssl_status,
      ssl_error: sslCheck.ssl_error || null,
      certificate: sslCheck.certificate || null,
      checked_at: now,
    },
    vercel_project_id: vercelConfig.project_id || null,
    vercel_status: vercelCheck.status,
    vercel_error: vercelCheck.error || null,
    vercel_checked_at: now,
    vercel_verified: Boolean(vercelCheck.verified),
  };
  if (vercelCheck.details) {
    updateData.vercel_details = vercelCheck.details;
  }

  await db.domains.updateOne(
    { domain_id: domainId, user_id: workspace.accountId },
    {
      $set: updateData,
    },
  );

  if (isDomainReadyForLinks({ ...domain, ...updateData })) {
    const latestUser = await db.users.findOne({ user_id: workspace.accountId }, { _id: 0, preferred_domain_id: 1 });
    const requestedDefault = parseOptionalBoolean(req.query?.set_default, "set_default");
    if (!latestUser?.preferred_domain_id || requestedDefault === true) {
      await db.users.updateOne(
        { user_id: workspace.accountId },
        {
          $set: { preferred_domain_id: domainId },
        },
      );
    }
  }

  await logAuditEvent(req, {
    eventType: "domain.verify",
    ...getWorkspaceAuditFields(workspace, {
      dns_verified: dnsCheck.dns_verified,
      ssl_status: nextSslStatus,
      routing_ok: dnsCheck.routing_ok,
      txt_ok: dnsCheck.txt_ok,
      vercel_status: vercelCheck.status,
      vercel_error: vercelCheck.error || null,
      verification_error: verificationError,
    }),
    resourceType: "domain",
    resourceId: domainId,
    success: isDomainReadyForLinks({ ...domain, ...updateData }),
    message: "custom_domain_dns_ssl_check",
  });

  const latestUser = await db.users.findOne({ user_id: workspace.accountId }, { _id: 0, preferred_domain_id: 1 });
  const updatedDomain = {
    ...domain,
    ...updateData,
  };
  const responseDoc = buildDomainResponse(updatedDomain, req, latestUser?.preferred_domain_id || null);
  sendJson(res, 200, responseDoc);
}

async function handleDomainsDefaultPut(req, res) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_domains" });
  const body = await getJsonBody(req);
  const rawDomainId = body.domain_id;
  const domainId = rawDomainId ? String(rawDomainId).trim() : null;

  if (domainId) {
    const domain = await db.domains.findOne(
      { domain_id: domainId, user_id: workspace.accountId },
      { _id: 0 },
    );
    if (!domain) {
      throw new HttpError(404, "Domain not found");
    }
    if (!isDomainReadyForLinks(domain)) {
      throw new HttpError(400, "Domain must be verified with active SSL before setting as default");
    }
  }

  await db.users.updateOne(
    { user_id: workspace.accountId },
    {
      $set: { preferred_domain_id: domainId || null },
    },
  );

  await logAuditEvent(req, {
    eventType: "domain.default_update",
    ...getWorkspaceAuditFields(workspace, { domain_id: domainId || null }),
    resourceType: "domain",
    resourceId: domainId,
    success: true,
    message: "default_custom_domain_updated",
  });

  sendJson(res, 200, {
    message: "Default domain updated",
    preferred_domain_id: domainId || null,
  });
}

async function handleDomainsDelete(req, res, domainId) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "manage_domains" });
  const result = await db.domains.deleteOne({ domain_id: domainId, user_id: workspace.accountId });
  if (result.deletedCount === 0) {
    throw new HttpError(404, "Domain not found");
  }

  await db.links.updateMany(
    { user_id: workspace.accountId, custom_domain_id: domainId },
    {
      $set: { custom_domain_id: null },
    },
  );
  if (workspace.ownerUser.preferred_domain_id === domainId) {
    await db.users.updateOne(
      { user_id: workspace.accountId },
      {
        $set: { preferred_domain_id: null },
      },
    );
  }

  await logAuditEvent(req, {
    eventType: "domain.delete",
    ...getWorkspaceAuditFields(workspace),
    resourceType: "domain",
    resourceId: domainId,
    success: true,
    message: "custom_domain_deleted",
  });

  sendJson(res, 200, { message: "Domain deleted successfully" });
}

async function handleDashboardStats(req, res) {
  const workspace = await getCurrentWorkspace(req, { requiredPermission: "view_workspace" });
  const owner = workspace.ownerUser;
  const includeAnalytics = String(req.query.analytics || "").trim() === "1";

  const [pdfCount, linkCount, activeLinks, expiredLinks, revokedLinks, totalViews, viewerLinks, analyticsLinks] = await Promise.all([
    db.pdfs.countDocuments({ user_id: workspace.accountId }),
    db.links.countDocuments({ user_id: workspace.accountId }),
    db.links.countDocuments({ user_id: workspace.accountId, status: "active" }),
    db.links.countDocuments({ user_id: workspace.accountId, status: "expired" }),
    db.links.countDocuments({ user_id: workspace.accountId, status: "revoked" }),
    db.links.sumField({ user_id: workspace.accountId }, "open_count"),
    db.links.find({ user_id: workspace.accountId }, { _id: 0, unique_ips: 1 }),
    includeAnalytics
      ? db.links.find({ user_id: workspace.accountId }, { _id: 0, access_log: 1 })
      : Promise.resolve([]),
  ]);

  const uniqueViewerSet = new Set();
  for (const link of viewerLinks) {
    for (const ip of link.unique_ips || []) {
      if (ip) uniqueViewerSet.add(ip);
    }
  }
  const uniqueViewers = uniqueViewerSet.size;

  let recentViews = 0;
  if (includeAnalytics) {
    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const link of analyticsLinks) {
      for (const access of link.access_log || []) {
        const timestampMs = parseDate(access?.timestamp)?.getTime() || 0;
        if (timestampMs >= sevenDaysAgoMs) {
          recentViews += 1;
        }
      }
    }
  }

  const plan = owner.plan || "none";
  const planInfo = (await getSubscriptionPlanDefinition(plan)) || { storage_mb: 0, links_per_month: 0 };

  sendJson(res, 200, {
    pdf_count: pdfCount,
    link_count: linkCount,
    active_links: activeLinks,
    expired_links: expiredLinks,
    revoked_links: revokedLinks,
    total_views: totalViews,
    unique_viewers: uniqueViewers,
    recent_views_7d: recentViews,
    storage_used: Number(owner.storage_used || 0),
    storage_limit: Number(planInfo.storage_mb || 0) * 1024 * 1024,
    plan,
    subscription_status: owner.subscription_status || "inactive",
    workspace: buildWorkspaceSummaryPayload(workspace),
  });
}

function parseBooleanQuery(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function parseLimit(value, fallback = 100, max = 500) {
  const parsed = Number.parseInt(String(value || fallback), 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function sortAuditEventsDescending(events) {
  return [...events].sort((a, b) => {
    const left = parseDate(a.created_at)?.getTime() || 0;
    const right = parseDate(b.created_at)?.getTime() || 0;
    return right - left;
  });
}

async function handleAuditEventsGet(req, res) {
  const user = await getCurrentUser(req);
  const limit = parseLimit(req.query.limit, 100, 250);
  const eventType = String(req.query.event_type || "").trim();
  const success = parseBooleanQuery(req.query.success);

  const allEvents = await db.audit_events.find({}, { _id: 0 });
  const filtered = allEvents.filter((eventDoc) => {
    const isOwnEvent =
      eventDoc.actor_user_id === user.user_id || eventDoc.target_user_id === user.user_id;
    if (!isOwnEvent) return false;
    if (eventType && eventDoc.event_type !== eventType) return false;
    if (success !== null && Boolean(eventDoc.success) !== success) return false;
    return true;
  });

  const ordered = sortAuditEventsDescending(filtered).slice(0, limit);
  sendJson(res, 200, {
    total: filtered.length,
    events: ordered.map((event) => ({
      ...event,
      account_id: event.account_id || null,
      account_owner_user_id: event.account_owner_user_id || null,
      actor_workspace_role: event.actor_workspace_role || null,
      actor_membership_id: event.actor_membership_id || null,
    })),
  });
}

async function handleAdminAuditEventsGet(req, res) {
  await getCurrentAdmin(req);
  const limit = parseLimit(req.query.limit, 200, 1000);
  const eventType = String(req.query.event_type || "").trim();
  const actorUserId = String(req.query.actor_user_id || "").trim();
  const targetUserId = String(req.query.target_user_id || "").trim();
  const resourceType = String(req.query.resource_type || "").trim();
  const success = parseBooleanQuery(req.query.success);

  const query = {};
  if (eventType) query.event_type = eventType;
  if (actorUserId) query.actor_user_id = actorUserId;
  if (targetUserId) query.target_user_id = targetUserId;
  if (resourceType) query.resource_type = resourceType;
  if (success !== null) query.success = success;

  const [total, ordered] = await Promise.all([
    db.audit_events.countDocuments(query),
    db.audit_events.find(
      query,
      {
        _id: 0,
        event_id: 1,
        event_type: 1,
        actor_user_id: 1,
        target_user_id: 1,
        account_id: 1,
        account_owner_user_id: 1,
        actor_workspace_role: 1,
        actor_membership_id: 1,
        resource_type: 1,
        resource_id: 1,
        success: 1,
        message: 1,
        created_at: 1,
      },
      { sort: { created_at: -1 }, limit },
    ),
  ]);

  sendJson(res, 200, {
    total,
    events: ordered,
  });
}

async function handleAdminSettingsPermissionsGet(req, res) {
  const user = await getCurrentAdmin(req);
  const permissions = await getActiveSettingsPermissionsConfig();
  const accessibleSections = SETTINGS_SECTION_KEYS.filter((sectionKey) =>
    canUserAccessSettingsSection(user, permissions, sectionKey, "read"),
  );

  sendJson(res, 200, {
    ...permissions,
    current_role: user.role,
    available_roles: ["admin", "super_admin"],
    accessible_sections: accessibleSections,
  });
}

async function handleAdminSettingsPermissionsPut(req, res) {
  const admin = await getCurrentSuperAdmin(req);
  const body = await getJsonBody(req);
  const existingConfig = await getActiveSettingsPermissionsConfig();
  const sourceSections =
    body.sections && typeof body.sections === "object" && !Array.isArray(body.sections)
      ? body.sections
      : null;

  if (!sourceSections) {
    throw new HttpError(400, "sections must be an object keyed by settings section");
  }

  const nextSections = cloneJson(existingConfig.sections || {});
  const updatedFields = [];

  for (const [sectionKey, values] of Object.entries(sourceSections)) {
    if (!SETTINGS_SECTION_DEFINITIONS[sectionKey]) {
      throw new HttpError(400, `Unknown settings section: ${sectionKey}`);
    }
    const source =
      values && typeof values === "object" && !Array.isArray(values)
        ? values
        : {};
    if (source.read_role !== undefined) {
      const normalized = normalizeSettingsPermissionRole(source.read_role, "__invalid__");
      if (normalized === "__invalid__") {
        throw new HttpError(400, `${sectionKey}.read_role must be admin or super_admin`);
      }
      nextSections[sectionKey].read_role = normalized;
      updatedFields.push(`sections.${sectionKey}.read_role`);
    }
    if (source.write_role !== undefined) {
      const normalized = normalizeSettingsPermissionRole(source.write_role, "__invalid__");
      if (normalized === "__invalid__") {
        throw new HttpError(400, `${sectionKey}.write_role must be admin or super_admin`);
      }
      nextSections[sectionKey].write_role = normalized;
      updatedFields.push(`sections.${sectionKey}.write_role`);
    }
  }

  for (const [sectionKey, section] of Object.entries(nextSections)) {
    if (getRoleRank(section.write_role) < getRoleRank(section.read_role)) {
      throw new HttpError(
        400,
        `${sectionKey}.write_role cannot be less privileged than ${sectionKey}.read_role`,
      );
    }
  }

  if (!updatedFields.length) {
    throw new HttpError(400, "No settings permission changes provided");
  }

  await persistPlatformSettingUpdate(req, {
    actor: admin,
    key: "settings_permissions",
    updateData: {
      sections: Object.fromEntries(
        Object.entries(nextSections).map(([sectionKey, section]) => [
          sectionKey,
          {
            read_role: section.read_role,
            write_role: section.write_role,
          },
        ]),
      ),
      updated_at: isoNow(),
    },
    updatedFields,
    eventType: "admin.settings_permissions_update",
    message: "super_admin_updated_settings_permissions",
    metadata: {
      sections: Object.fromEntries(
        Object.entries(nextSections).map(([sectionKey, section]) => [
          sectionKey,
          {
            read_role: section.read_role,
            write_role: section.write_role,
          },
        ]),
      ),
    },
  });

  sendJson(res, 200, {
    message: "Settings permissions updated successfully",
    ...(await getActiveSettingsPermissionsConfig()),
    current_role: admin.role,
    available_roles: ["admin", "super_admin"],
    accessible_sections: SETTINGS_SECTION_KEYS,
  });
}

async function handleAdminSettingsHistoryGet(req, res) {
  const admin = await getCurrentAdmin(req);
  const permissions = await getActiveSettingsPermissionsConfig();
  const limit = parseLimit(req.query.limit, 50, 200);
  const requestedSettingKey = String(req.query.setting_key || "").trim();
  const allowedSettingKeys = new Set(
    SETTINGS_SECTION_KEYS.filter((sectionKey) =>
      canUserAccessSettingsSection(admin, permissions, sectionKey, "read"),
    ).flatMap((sectionKey) => SETTINGS_SECTION_DEFINITIONS[sectionKey].setting_keys),
  );
  if (admin.role === "super_admin") {
    allowedSettingKeys.add("settings_permissions");
  }

  if (requestedSettingKey && !allowedSettingKeys.has(requestedSettingKey)) {
    throw new HttpError(403, "You do not have access to this setting history");
  }

  const query = requestedSettingKey ? { setting_key: requestedSettingKey } : {};
  const rows = await db.settings_history.find(
    query,
    { _id: 0 },
    { sort: { created_at: -1 }, limit: requestedSettingKey ? limit : Math.max(limit * 5, 200) },
  );
  const filtered = rows
    .filter((row) => allowedSettingKeys.has(String(row.setting_key || "").trim()))
    .slice(0, limit);

  const actorIds = Array.from(
    new Set(filtered.map((row) => String(row.actor_user_id || "").trim()).filter(Boolean)),
  );
  const actors = actorIds.length
    ? await db.users.find(
      { user_id: { $in: actorIds } },
      { _id: 0, user_id: 1, name: 1, email: 1, role: 1 },
      { limit: actorIds.length },
    )
    : [];
  const actorMap = new Map(actors.map((actor) => [actor.user_id, actor]));

  sendJson(res, 200, {
    total: filtered.length,
    changes: filtered.map((row) => ({
      ...row,
      actor: row.actor_user_id ? actorMap.get(row.actor_user_id) || null : null,
    })),
  });
}

async function handleAdminOperationsHealthGet(req, res) {
  await getCurrentAdmin(req);
  sendJson(res, 200, await getOperationsHealthSummary());
}

async function handleAdminJobsGet(req, res) {
  await getCurrentAdmin(req);
  const limit = parseLimit(req.query.limit, 50, 200);
  const statusQuery = String(req.query.status || "").trim();
  const jobTypeQuery = String(req.query.job_type || "").trim();
  const query = {};

  if (statusQuery) {
    const normalizedStatus = normalizeJobStatus(statusQuery, "__invalid__");
    if (normalizedStatus === "__invalid__") {
      throw new HttpError(400, "Invalid job status");
    }
    query.status = normalizedStatus;
  }
  if (jobTypeQuery) {
    query.job_type = jobTypeQuery;
  }

  const jobs = await db.jobs.find(query, { _id: 0 }, { sort: { created_at: -1 }, limit });
  sendJson(res, 200, {
    total: jobs.length,
    jobs: jobs.map((job) => getJobSummary(job)),
  });
}

async function handleAdminJobsRun(req, res) {
  await getCurrentSuperAdmin(req);
  const body = await getJsonBody(req).catch(() => ({}));
  const result = await processQueuedJobs(req, {
    limit: parseLimit(body?.limit, 1, 10),
  });
  sendJson(res, 200, {
    message: result.processed
      ? "Queued jobs processed"
      : "No queued jobs were ready to run",
    ...result,
  });
}

async function handleAdminStorageMigrationCreate(req, res) {
  const { user: admin } = await requireSettingsSectionAccess(req, "storage", "write");
  const body = await getJsonBody(req);
  const destinationProvider = normalizeStorageProvider(body.destination_provider);
  const sourceProvider = body.source_provider
    ? normalizeStorageProvider(body.source_provider)
    : "";
  const runNow = body.run_now !== false;
  const limit = body.limit !== undefined ? parseLimit(body.limit, 1000, 10000) : undefined;

  if (!VALID_STORAGE_PROVIDERS.includes(destinationProvider)) {
    throw new HttpError(400, "destination_provider must be a valid storage provider");
  }
  if (sourceProvider && !VALID_STORAGE_PROVIDERS.includes(sourceProvider)) {
    throw new HttpError(400, "source_provider must be a valid storage provider");
  }
  if (sourceProvider && sourceProvider === destinationProvider) {
    throw new HttpError(400, "Source and destination providers must differ");
  }

  const storageConfig = await getActiveStorageConfig();
  if (destinationProvider === STORAGE_PROVIDER_WASABI && !storageConfig.wasabi.configured) {
    throw new HttpError(400, "Wasabi must be configured before starting a migration");
  }

  const job = await enqueueBackgroundJob({
    jobType: JOB_TYPE_STORAGE_MIGRATION,
    payload: {
      destination_provider: destinationProvider,
      source_provider: sourceProvider || null,
      limit: limit || null,
    },
    createdByUserId: admin.user_id,
  });

  await logAuditEvent(req, {
    eventType: "admin.storage_migration_job_created",
    actorUserId: admin.user_id,
    targetUserId: admin.user_id,
    resourceType: "job",
    resourceId: job.job_id,
    success: true,
    message: "storage_migration_job_created",
    metadata: {
      destination_provider: destinationProvider,
      source_provider: sourceProvider || null,
      limit: limit || null,
      run_now: Boolean(runNow),
    },
  });

  let runner = null;
  if (runNow) {
    runner = await processQueuedJobs(req, { limit: 1 });
  }

  const latestJob = await db.jobs.findOne({ job_id: job.job_id }, { _id: 0 });
  sendJson(res, 200, {
    message: runNow
      ? "Storage migration job queued and processed"
      : "Storage migration job queued successfully",
    job: getJobSummary(latestJob || job),
    runner,
  });
}

const ROUTE_HANDLERS = {
  handleAdminAuditEventsGet,
  handleAdminAuthEmailTemplateGet,
  handleAdminAuthEmailTemplatePut,
  handleAdminBillingCustomerGet,
  handleAdminBillingCustomersGet,
  handleAdminBrandingGet,
  handleAdminBrandingPut,
  handleAdminEmailDeliveryGet,
  handleAdminEmailDeliveryPut,
  handleAdminEmailDeliveryTest,
  handleAdminEmailProviderDisconnect,
  handleAdminGmailCallback,
  handleAdminGmailStart,
  handleAdminInvoiceDownload,
  handleAdminInvoiceTemplateGet,
  handleAdminInvoiceTemplatePut,
  handleAdminInvoiceUpdate,
  handleAdminJobsGet,
  handleAdminJobsRun,
  handleAdminLinksDelete,
  handleAdminLinksGet,
  handleAdminLinksRevoke,
  handleAdminLocalizationGet,
  handleAdminLocalizationPut,
  handleAdminOperationsHealthGet,
  handleAdminOutlookCallback,
  handleAdminOutlookStart,
  handleAdminPublicSiteGet,
  handleAdminPublicSitePut,
  handleAdminSeoGet,
  handleAdminSeoPut,
  handleAdminSettingsHistoryGet,
  handleAdminSettingsPermissionsGet,
  handleAdminSettingsPermissionsPut,
  handleAdminStats,
  handleAdminStorageGet,
  handleAdminStorageMigrationCreate,
  handleAdminStoragePut,
  handleAdminStripeGet,
  handleAdminStripePut,
  handleAdminSubscriptionPlansGet,
  handleAdminSubscriptionPlansPut,
  handleAdminUsersCreate,
  handleAdminUsersDelete,
  handleAdminUsersGet,
  handleAdminUsersUpdate,
  handleAdminVercelGet,
  handleAdminVercelPut,
  handleAuditEventsGet,
  handleAuthEmailChangeConfirm,
  handleAuthEmailChangeRequest,
  handleAuthGoogleExchange,
  handleAuthGoogleSession,
  handleAuthGoogleStart,
  handleAuthLanguage,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthMe,
  handleAuthPasswordReset,
  handleAuthPasswordResetConfirm,
  handleAuthPasswordResetSelf,
  handleAuthPasswordResetValidate,
  handleAuthProfileUpdate,
  handleAuthRegister,
  handleAuthVerifyEmailConfirm,
  handleAuthVerifyEmailResend,
  handleBrandingGet,
  handleDashboardStats,
  handleDirectTokenPdf,
  handleDomainsCreate,
  handleDomainsDefaultPut,
  handleDomainsDelete,
  handleDomainsGet,
  handleDomainsVerify,
  handleFoldersCreate,
  handleFoldersDelete,
  handleFoldersGet,
  handleFoldersRename,
  handleLinksCreate,
  handleLinksDelete,
  handleLinksGet,
  handleLinksRevoke,
  handleLinksStats,
  handleLinksUpdate,
  handleLocalizationGet,
  handlePdfsDelete,
  handlePdfsDirectAccessUpdate,
  handlePdfsFileGet,
  handlePdfsGet,
  handlePdfsMove,
  handlePdfsRename,
  handlePdfsUpload,
  handlePdfsWorkspaceGet,
  handlePublicSiteGet,
  handleSeoGet,
  handleStripeWebhook,
  handleSubscriptionBillingPortal,
  handleSubscriptionCheckout,
  handleSubscriptionInvoiceDownload,
  handleSubscriptionOverview,
  handleSubscriptionPlans,
  handleSubscriptionStatus,
  handleTeamGet,
  handleTeamInvitationAccept,
  handleTeamInvitationCreate,
  handleTeamInvitationDecline,
  handleTeamInvitationDelete,
  handleTeamInvitationPreview,
  handleTeamMemberDelete,
  handleTeamMemberUpdate,
  handleTwoFactorDisable,
  handleTwoFactorEnable,
  handleTwoFactorLoginVerify,
  handleTwoFactorSetup,
  handleTwoFactorStatusGet,
  handleViewToken,
  handleViewTokenHeartbeat,
  handleViewTokenNdaAccept,
  handleViewTokenPdf,
  handleWorkspacesGet,
};

export async function handleApiRequest(req, res, pathSegments = []) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    await routeApiRequest({
      req,
      res,
      pathSegments,
      handlers: ROUTE_HANDLERS,
      sendJson,
      HttpError,
      emailProviders: {
        gmail: EMAIL_PROVIDER_GMAIL,
        outlook: EMAIL_PROVIDER_OUTLOOK,
      },
    });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { detail: error.detail });
      return;
    }

    const rawMessage = typeof error?.message === "string" ? error.message : "";
    const lower = rawMessage.toLowerCase();
    if (
      lower.includes("supabase_db_url") ||
      lower.includes("database_url") ||
      lower.includes("invalid url") ||
      lower.includes("getaddrinfo enotfound") ||
      lower.includes("connection terminated") ||
      lower.includes("timeout expired")
    ) {
      sendJson(res, 500, {
        detail:
          "Database connection is not configured correctly. Check SUPABASE_DB_URL and pooler settings.",
      });
      return;
    }

    console.error("API error", error);
    sendJson(res, 500, { detail: "Internal server error" });
  }
}
