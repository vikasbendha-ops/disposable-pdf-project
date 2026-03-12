import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import path from "node:path";
import tls from "node:tls";
import { parse as parseCookie, serialize as serializeCookie } from "cookie";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import bcrypt from "bcryptjs";
import formidable from "formidable";
import jwt from "jsonwebtoken";
import { getStore } from "./store";
import { normalizeSeoConfig } from "./seo";

const db = getStore();

const SUBSCRIPTION_PLANS = {
  basic: { price: 5.0, name: "Basic", storage_mb: 500, links_per_month: 50 },
  pro: { price: 15.0, name: "Pro", storage_mb: 2000, links_per_month: 200 },
  enterprise: { price: 49.0, name: "Enterprise", storage_mb: 10000, links_per_month: 1000 },
};

const VALID_LANGUAGES = [
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "nl",
  "ru",
  "zh",
  "ja",
  "ko",
  "ar",
  "hi",
  "tr",
  "pl",
  "sv",
  "no",
  "da",
  "fi",
  "el",
  "cs",
  "ro",
  "hu",
  "th",
  "vi",
  "id",
  "ms",
  "fil",
  "uk",
  "he",
  "sl",
];

const ALGORITHM = "HS256";
const ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7;
const SECRET_KEY = process.env.JWT_SECRET_KEY || "change-this-in-production";
const STRIPE_API_KEY = process.env.STRIPE_API_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "no-reply@autodestroy.local";
const APP_BASE_URL = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
const EMAIL_VERIFICATION_EXPIRE_HOURS = Number(process.env.EMAIL_VERIFICATION_EXPIRE_HOURS || "24");
const PASSWORD_RESET_EXPIRE_MINUTES = Number(process.env.PASSWORD_RESET_EXPIRE_MINUTES || "60");
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

function hashToken(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function buildPublicBaseUrl(req) {
  if (APP_BASE_URL) return APP_BASE_URL;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  if (!host) return "";
  return `${proto}://${host}`;
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
  const domains = await db.domains.find({ user_id: userId }, { _id: 0 });
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

async function sendTransactionalEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY || !EMAIL_FROM || !to) {
    return { delivered: false, provider: "none" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { delivered: false, provider: "resend", error: body || "request_failed" };
    }
    return { delivered: true, provider: "resend" };
  } catch (error) {
    return {
      delivered: false,
      provider: "resend",
      error: error?.message || "request_failed",
    };
  }
}

async function sendEmailVerificationEmail({ req, email, name, token }) {
  const baseUrl = buildPublicBaseUrl(req);
  const verifyUrl = baseUrl
    ? `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`
    : "";
  const subject = "Verify your email address";
  const text = verifyUrl
    ? `Hi ${name || "there"}, verify your email: ${verifyUrl}`
    : "Hi, your verification email could not generate a link because APP_BASE_URL is missing.";
  const html = verifyUrl
    ? `<p>Hi ${name || "there"},</p><p>Verify your email to activate your account:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in ${EMAIL_VERIFICATION_EXPIRE_HOURS} hours.</p>`
    : "<p>APP_BASE_URL is missing, so verification URL could not be generated.</p>";

  return sendTransactionalEmail({ to: email, subject, text, html });
}

async function sendPasswordResetEmail({ req, email, token }) {
  const baseUrl = buildPublicBaseUrl(req);
  const resetUrl = baseUrl
    ? `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`
    : "";
  const subject = "Reset your password";
  const text = resetUrl
    ? `Use this link to reset your password: ${resetUrl}`
    : "APP_BASE_URL is missing, so reset URL could not be generated.";
  const html = resetUrl
    ? `<p>You requested a password reset.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in ${PASSWORD_RESET_EXPIRE_MINUTES} minutes.</p>`
    : "<p>APP_BASE_URL is missing, so reset URL could not be generated.</p>";

  return sendTransactionalEmail({ to: email, subject, text, html });
}

async function logAuditEvent(
  req,
  {
    eventType,
    actorUserId = null,
    targetUserId = null,
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

function sanitizeUser(user) {
  if (!user) return null;
  const clean = { ...user };
  delete clean.password_hash;
  if (clean.created_at instanceof Date) {
    clean.created_at = clean.created_at.toISOString();
  }
  return clean;
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

function ipSessionKey(clientIp) {
  return crypto.createHash("sha256").update(clientIp).digest("hex").slice(0, 24);
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

function maskSecret(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.length <= 8) return "********";
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
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

async function getActiveBrandingConfig() {
  const doc = await db.platform_settings.findOne({ key: "branding" }, { _id: 0 });
  return getNormalizedBrandingConfig(doc);
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
    db.platform_settings.findOne({ key: "seo" }, { _id: 0 }),
    db.platform_settings.findOne({ key: "branding" }, { _id: 0 }),
  ]);
  return normalizeSeoConfig(seoDoc, brandingDoc);
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
  const language = body.language ? String(body.language) : "en";

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
    email_verified: false,
    email_verification_sent_at: now,
    created_at: now,
  };

  await db.users.insertOne(userDoc);

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

  const user = await db.users.findOne({ email }, { _id: 0 });
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
        },
      },
    );
  } else {
    userId = makeId("user");
    const userDoc = {
      user_id: userId,
      name,
      email,
      picture,
      role: resolvedRole,
      subscription_status: resolvedRole === "super_admin" ? "active" : "inactive",
      plan: resolvedRole === "super_admin" ? "enterprise" : "none",
      storage_used: 0,
      language: "en",
      email_verified: true,
      email_verified_at: isoNow(),
      created_at: isoNow(),
    };
    await db.users.insertOne(userDoc);
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.user_sessions.insertOne({
    user_id: userId,
    session_token: sessionToken,
    expires_at: expiresAt,
    created_at: isoNow(),
  });

  setSessionCookie(res, String(sessionToken));

  const user = await db.users.findOne({ user_id: userId }, { _id: 0 });
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

  if (!VALID_LANGUAGES.includes(language)) {
    throw new HttpError(400, "Invalid language code");
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

async function handleAuthPasswordReset(req, res) {
  const body = await getJsonBody(req);
  const email = String(body.email || "").trim().toLowerCase();

  if (!email) {
    throw new HttpError(400, "Email is required");
  }

  const genericResponse = { message: "If email exists, reset link will be sent" };
  const user = await db.users.findOne({ email }, { _id: 0 });
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
    email,
    token_hash: tokenHash,
    expires_at: expiresAt,
    used: false,
    created_at: isoNow(),
    requested_ip: getClientIp(req),
  });

  const delivery = await sendPasswordResetEmail({
    req,
    email,
    token: rawToken,
  });

  await logAuditEvent(req, {
    eventType: "auth.password_reset_request",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    success: true,
    message: "reset_token_issued",
    metadata: {
      email,
      delivery: delivery.delivered ? "sent" : "not_sent",
      provider: delivery.provider,
    },
  });

  if (AUTH_DEBUG_TOKENS) {
    genericResponse.debug = { reset_token: rawToken };
  }
  sendJson(res, 200, genericResponse);
}

async function handleAuthPasswordResetValidate(req, res) {
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
  const token = String(body.token || "");
  const newPassword = String(body.new_password || "");

  if (!token || !newPassword) {
    throw new HttpError(400, "Token and new password are required");
  }
  if (newPassword.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters");
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

  await db.email_verifications.updateOne(
    { token_hash: tokenHash },
    { $set: { used: true, used_at: now } },
  );
  await db.email_verifications.updateMany(
    { user_id: verification.user_id, used: false },
    { $set: { used: true, invalidated_at: now } },
  );

  const user = await db.users.findOne({ user_id: verification.user_id }, { _id: 0 });
  const accessToken = createAccessToken({ sub: verification.user_id });
  setSessionCookie(res, accessToken);

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
    access_token: accessToken,
    token_type: "bearer",
    user: sanitizeUser(user),
  });
}

async function handleAuthVerifyEmailResend(req, res) {
  const body = await getJsonBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) {
    throw new HttpError(400, "Email is required");
  }

  const generic = { message: "If account exists and is unverified, a verification email was sent" };
  const user = await db.users.findOne({ email }, { _id: 0 });
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
    },
  });

  if (AUTH_DEBUG_TOKENS) {
    generic.debug = { verify_email_token: verificationToken };
  }
  sendJson(res, 200, generic);
}

async function handleFoldersGet(req, res) {
  const user = await getCurrentUser(req);
  const folders = await db.folders.find({ user_id: user.user_id }, { _id: 0 });
  sendJson(res, 200, folders);
}

async function handleFoldersCreate(req, res) {
  const user = await getCurrentUser(req);
  const body = await getJsonBody(req);
  const name = String(body.name || "").trim();

  if (!name) {
    throw new HttpError(400, "Folder name is required");
  }

  const folderDoc = {
    folder_id: makeId("folder"),
    user_id: user.user_id,
    name,
    created_at: isoNow(),
  };

  await db.folders.insertOne(folderDoc);
  sendJson(res, 200, folderDoc);
}

async function handleFoldersDelete(req, res, folderId) {
  const user = await getCurrentUser(req);

  await db.pdfs.updateMany(
    {
      user_id: user.user_id,
      folder: folderId,
    },
    {
      $set: { folder: null },
    },
  );

  const result = await db.folders.deleteOne({
    folder_id: folderId,
    user_id: user.user_id,
  });

  if (result.deletedCount === 0) {
    throw new HttpError(404, "Folder not found");
  }

  sendJson(res, 200, { message: "Folder deleted successfully" });
}

async function handlePdfsUpload(req, res) {
  const user = await getCurrentUser(req);
  if (user.subscription_status !== "active") {
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

  const plan = user.plan || "basic";
  const planInfo = SUBSCRIPTION_PLANS[plan] || SUBSCRIPTION_PLANS.basic;
  const maxStorage = Number(planInfo.storage_mb) * 1024 * 1024;

  if (Number(user.storage_used || 0) + fileSize > maxStorage) {
    throw new HttpError(400, "Storage limit exceeded");
  }

  const pdfId = makeId("pdf");
  const safeFilename = `${pdfId}_${tokenHex(8)}.pdf`;
  const storageKey = `${user.user_id}/${safeFilename}`;
  const storageConfig = await getActiveStorageConfig();
  const activeStorageProvider = normalizeStorageProvider(storageConfig.active_provider);
  if (activeStorageProvider === STORAGE_PROVIDER_WASABI && !storageConfig.wasabi.configured) {
    throw new HttpError(500, "Wasabi storage is selected but not configured");
  }

  await putPdfBinary(activeStorageProvider, storageKey, user.user_id, content, "application/pdf");

  const now = isoNow();
  const directAccessToken = tokenUrlSafe(24);
  const pdfDoc = {
    pdf_id: pdfId,
    user_id: user.user_id,
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
    { user_id: user.user_id },
    {
      $inc: { storage_used: fileSize },
    },
  );

  await logAuditEvent(req, {
    eventType: "pdf.upload",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "pdf",
    resourceId: pdfId,
    success: true,
    message: "pdf_uploaded",
    metadata: {
      filename,
      file_size: fileSize,
      storage_provider: activeStorageProvider,
    },
  });

  const preferredOrigin = await getPreferredUserOrigin(req, user);
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
  const user = await getCurrentUser(req);
  const folder = typeof req.query.folder === "string" ? req.query.folder : undefined;

  const query = { user_id: user.user_id };
  if (folder) {
    query.folder = folder;
  }

  const pdfs = await db.pdfs.find(query, { _id: 0 });
  const { domainById } = await getUserDomainMap(user.user_id);
  const preferredOrigin = await getPreferredUserOrigin(req, user, domainById);
  const normalized = [];
  for (const pdf of pdfs) {
    const next = await normalizePdfRecordForResponse(pdf, user.user_id);
    next.direct_access_path = buildDirectAccessPath(next.direct_access_token);
    next.direct_access_url = buildDirectAccessUrl(preferredOrigin, next.direct_access_token);
    normalized.push(next);
  }

  sendJson(res, 200, normalized);
}

async function handlePdfsRename(req, res, pdfId) {
  const user = await getCurrentUser(req);
  const body = await getJsonBody(req);
  const filename = String(body.filename || "").trim();

  if (!filename) {
    throw new HttpError(400, "Filename is required");
  }

  const result = await db.pdfs.updateOne(
    { pdf_id: pdfId, user_id: user.user_id },
    {
      $set: { filename },
    },
  );

  if (result.matchedCount === 0) {
    throw new HttpError(404, "PDF not found");
  }

  sendJson(res, 200, {
    message: "PDF renamed successfully",
    filename,
  });
}

async function handlePdfsMove(req, res, pdfId) {
  const user = await getCurrentUser(req);
  const body = await getJsonBody(req);
  const folder = body.folder || null;

  if (folder) {
    const existingFolder = await db.folders.findOne(
      { folder_id: folder, user_id: user.user_id },
      { _id: 0 },
    );
    if (!existingFolder) {
      throw new HttpError(404, "Folder not found");
    }
  }

  const result = await db.pdfs.updateOne(
    { pdf_id: pdfId, user_id: user.user_id },
    {
      $set: { folder },
    },
  );

  if (result.matchedCount === 0) {
    throw new HttpError(404, "PDF not found");
  }

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
  const user = await getCurrentUser(req);
  const body = await getJsonBody(req);
  const enabled = parseOptionalBoolean(body.enabled, "enabled");
  const isPublic = parseOptionalBoolean(body.is_public, "is_public");

  if (enabled === undefined && isPublic === undefined) {
    throw new HttpError(400, "enabled or is_public is required");
  }

  const existing = await db.pdfs.findOne({ pdf_id: pdfId, user_id: user.user_id }, { _id: 0 });
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
    { pdf_id: pdfId, user_id: user.user_id },
    {
      $set: updateData,
    },
  );

  const updated = await db.pdfs.findOne({ pdf_id: pdfId, user_id: user.user_id }, { _id: 0 });
  const normalized = await normalizePdfRecordForResponse(updated, user.user_id);
  const preferredOrigin = await getPreferredUserOrigin(req, user);
  const directAccessPath = buildDirectAccessPath(normalized.direct_access_token);

  await logAuditEvent(req, {
    eventType: "pdf.direct_access_update",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "pdf",
    resourceId: pdfId,
    success: true,
    message: "direct_access_settings_updated",
    metadata: {
      direct_access_enabled: normalized.direct_access_enabled,
      direct_access_public: normalized.direct_access_public,
    },
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
  const user = await getCurrentUser(req);
  const pdf = await db.pdfs.findOne({ pdf_id: pdfId, user_id: user.user_id }, { _id: 0 });

  if (!pdf) {
    throw new HttpError(404, "PDF not found");
  }

  if (pdf.storage_key) {
    await deletePdfBinary(pdf);
  } else if (pdf.file_path) {
    await removeLegacyFileIfExists(pdf.file_path);
  }

  await db.pdfs.deleteOne({ pdf_id: pdfId });

  await db.users.updateOne(
    { user_id: user.user_id },
    {
      $inc: { storage_used: -Number(pdf.file_size || 0) },
    },
  );

  await db.links.updateMany(
    { pdf_id: pdfId },
    {
      $set: { status: "revoked" },
    },
  );

  await logAuditEvent(req, {
    eventType: "pdf.delete",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "pdf",
    resourceId: pdfId,
    success: true,
    message: "pdf_deleted",
    metadata: { file_size: Number(pdf.file_size || 0) },
  });

  sendJson(res, 200, { message: "PDF deleted successfully" });
}

async function handleLinksCreate(req, res) {
  const user = await getCurrentUser(req);
  const body = await getJsonBody(req);

  const pdfId = String(body.pdf_id || "");
  if (!pdfId) {
    throw new HttpError(400, "pdf_id is required");
  }

  const pdf = await db.pdfs.findOne({ pdf_id: pdfId, user_id: user.user_id }, { _id: 0 });
  if (!pdf) {
    throw new HttpError(404, "PDF not found");
  }

  if (user.subscription_status !== "active") {
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
    customDomainId = user.preferred_domain_id || null;
  } else {
    const rawDomainId = String(body.custom_domain_id || "").trim();
    customDomainId = rawDomainId && rawDomainId !== "platform" ? rawDomainId : null;
  }

  let customDomain = null;
  if (customDomainId) {
    customDomain = await db.domains.findOne(
      { domain_id: customDomainId, user_id: user.user_id },
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

  const linkDoc = {
    link_id: makeId("link"),
    pdf_id: pdfId,
    user_id: user.user_id,
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
    custom_domain_id: customDomainId,
    created_at: now.toISOString(),
    access_log: [],
  };

  await db.links.insertOne(linkDoc);
  await logAuditEvent(req, {
    eventType: "link.create",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "link",
    resourceId: linkDoc.link_id,
    success: true,
    message: "secure_link_created",
    metadata: {
      pdf_id: pdfId,
      expiry_mode: expiryMode,
      custom_domain_id: customDomainId,
    },
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
  const user = await getCurrentUser(req);
  const [links, { domainById }] = await Promise.all([
    db.links.find({ user_id: user.user_id }, { _id: 0 }),
    getUserDomainMap(user.user_id),
  ]);
  const limit =
    req.query.limit !== undefined
      ? parseLimit(req.query.limit, 20, 500)
      : null;
  const orderedLinks = [...links].sort((left, right) => {
    const leftTime = parseDate(left.created_at)?.getTime() || 0;
    const rightTime = parseDate(right.created_at)?.getTime() || 0;
    return rightTime - leftTime;
  });
  const visibleLinks = limit ? orderedLinks.slice(0, limit) : orderedLinks;

  const platformOrigin = buildPublicBaseUrl(req);
  const responseLinks = visibleLinks.map((link) => {
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
      custom_domain_id: link.custom_domain_id || null,
      domain: domainDoc?.domain || null,
      secure_url: buildSecureViewUrl(linkOrigin, link.token),
      created_at: link.created_at,
    };
  });

  sendJson(res, 200, responseLinks);
}

async function handleLinksStats(req, res, linkId) {
  const user = await getCurrentUser(req);
  const link = await db.links.findOne({ link_id: linkId, user_id: user.user_id }, { _id: 0 });

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
    first_open_at: link.first_open_at,
    expires_at: link.expires_at,
  });
}

async function handleLinksDelete(req, res, linkId) {
  const user = await getCurrentUser(req);
  const result = await db.links.deleteOne({ link_id: linkId, user_id: user.user_id });
  if (result.deletedCount === 0) {
    throw new HttpError(404, "Link not found");
  }
  await logAuditEvent(req, {
    eventType: "link.delete",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "link",
    resourceId: linkId,
    success: true,
    message: "link_deleted",
  });
  sendJson(res, 200, { message: "Link deleted successfully" });
}

async function handleLinksRevoke(req, res, linkId) {
  const user = await getCurrentUser(req);
  const result = await db.links.updateOne(
    { link_id: linkId, user_id: user.user_id },
    { $set: { status: "revoked" } },
  );

  if (result.matchedCount === 0) {
    throw new HttpError(404, "Link not found");
  }

  await logAuditEvent(req, {
    eventType: "link.revoke",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
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
  const sessionKey = ipSessionKey(clientIp);
  const viewerId = `${clientIp}_${tokenHex(4)}`;

  let expiresAt = null;
  let remainingSeconds = null;

  if (link.expiry_mode === "countdown") {
    const ipSessions = link.ip_sessions || {};
    const ipSession = ipSessions[sessionKey];

    if (ipSession) {
      const firstOpen = ensureDate(ipSession.first_open, "Invalid session timing");
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
        ip: clientIp,
        first_open: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      };

      const update = {
        $set: {
          [`ip_sessions.${sessionKey}`]: newSession,
        },
      };

      if (!link.first_open_at) {
        update.$set.first_open_at = now.toISOString();
      }

      await db.links.updateOne({ token }, update);
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

  await db.links.updateOne({ token }, updateOps);

  sendJson(res, 200, {
    status: "active",
    pdf_url: `/api/view/${token}/pdf`,
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    remaining_seconds: remainingSeconds,
    watermark_data: {
      ip: clientIp,
      timestamp: now.toISOString(),
      link_id: link.link_id,
    },
    custom_expired_url: link.custom_expired_url,
    custom_expired_message: link.custom_expired_message,
    viewer_id: viewerId,
  });
}

async function handleViewTokenPdf(req, res, token) {
  const link = await db.links.findOne({ token }, { _id: 0 });
  if (!link || link.status === "revoked") {
    throw new HttpError(404, "Link not found or revoked");
  }

  const clientIp = getClientIp(req);
  const sessionKey = ipSessionKey(clientIp);
  const now = nowUtc();

  if (link.expiry_mode === "countdown") {
    const ipSessions = link.ip_sessions || {};
    let ipSession = ipSessions[sessionKey] || null;

    if (!ipSession) {
      for (const value of Object.values(ipSessions)) {
        if (value && typeof value === "object" && value.ip === clientIp && value.expires_at) {
          ipSession = value;
          break;
        }
      }
    }

    if (ipSession) {
      const expiresAt = ensureDate(ipSession.expires_at, "Invalid session timing");
      if (now >= expiresAt) {
        throw new HttpError(410, "Your viewing session has expired");
      }
    } else {
      const duration = Number(link.expiry_duration_seconds || 0);
      const expiresAt = new Date(now.getTime() + duration * 1000);
      const newSession = {
        ip: clientIp,
        first_open: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      };

      const update = {
        $set: {
          [`ip_sessions.${sessionKey}`]: newSession,
        },
      };
      if (!link.first_open_at) {
        update.$set.first_open_at = now.toISOString();
      }
      await db.links.updateOne({ token }, update);
    }
  } else if (link.expiry_mode === "fixed" && link.expires_at) {
    const expiresAt = ensureDate(link.expires_at, "Invalid expiry time");
    if (now >= expiresAt) {
      throw new HttpError(410, "Link expired");
    }
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
    const canAccess =
      viewer.user_id === normalizedPdf.user_id || isAdminRole(viewer.role) || isSuperAdminUser(viewer);
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

  if (!SUBSCRIPTION_PLANS[plan]) {
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

  const planInfo = SUBSCRIPTION_PLANS[plan];
  const stripeConfig = await getActiveStripeConfig();
  const stripeKey = stripeConfig.active_key;

  if (!stripeKey) {
    if (stripeConfig.mode === "sandbox") {
      throw new HttpError(400, "Stripe sandbox key is not configured");
    }
    throw new HttpError(400, "Stripe live key is not configured");
  }

  const amountCents = Math.round(Number(planInfo.price) * 100);
  const stripeSession = await stripeApiRequest("POST", "/v1/checkout/sessions", stripeKey, {
    mode: "payment",
    success_url: `${originUrl}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${originUrl}/pricing?payment=cancelled`,
    "metadata[user_id]": user.user_id,
    "metadata[plan]": plan,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][product_data][name]": `${planInfo.name} Plan`,
    "line_items[0][price_data][product_data][description]": `${planInfo.storage_mb} MB storage`,
  });

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
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    stripeKey,
  );

  const paymentStatus = stripeSession.payment_status || "unpaid";
  const checkoutStatus = stripeSession.status || "open";
  const amountTotal = Number(stripeSession.amount_total || 0);

  if (paymentStatus === "paid" && txn.payment_status !== "completed") {
    await db.payment_transactions.updateOne(
      { session_id: sessionId },
      {
        $set: {
          payment_status: "completed",
        },
      },
    );

    const plan = txn.plan || "basic";
    await db.users.updateOne(
      { user_id: user.user_id },
      {
        $set: {
          subscription_status: "active",
          plan,
          subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      },
    );

    await logAuditEvent(req, {
      eventType: "subscription.activated",
      actorUserId: user.user_id,
      targetUserId: user.user_id,
      resourceType: "subscription",
      resourceId: sessionId,
      success: true,
      message: "subscription_activated_via_status",
      metadata: { plan },
    });
  }

  sendJson(res, 200, {
    status: checkoutStatus,
    payment_status: paymentStatus,
    amount: amountTotal / 100,
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

  if (event.type === "checkout.session.completed") {
    const sessionData = event?.data?.object || {};
    const metadata = sessionData.metadata || {};
    const userId = metadata.user_id;
    const plan = metadata.plan || "basic";
    const sessionId = sessionData.id;

    if (userId) {
      await db.users.updateOne(
        { user_id: userId },
        {
          $set: {
            subscription_status: "active",
            plan,
            subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
        },
      );

      if (sessionId) {
        await db.payment_transactions.updateOne(
          { session_id: sessionId },
          {
            $set: {
              payment_status: "completed",
            },
          },
        );
      }

      await logAuditEvent(req, {
        eventType: "subscription.activated",
        actorUserId: null,
        targetUserId: userId,
        resourceType: "subscription",
        resourceId: sessionId || null,
        success: true,
        message: "subscription_activated_via_webhook",
        metadata: { plan, source: "stripe_webhook" },
      });
    }
  }

  sendJson(res, 200, { received: true });
}

async function handleSubscriptionPlans(_req, res) {
  sendJson(res, 200, SUBSCRIPTION_PLANS);
}

async function handleAdminUsersGet(req, res) {
  await getCurrentAdmin(req);

  const [users, allPdfs, allLinks] = await Promise.all([
    db.users.find({}, { _id: 0, password_hash: 0 }),
    db.pdfs.find({}, { _id: 0, user_id: 1 }),
    db.links.find({}, { _id: 0, user_id: 1 }),
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
  }

  sendJson(res, 200, users);
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
    db.links.find({}, { _id: 0 }),
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

  const [users, pdfs, links] = await Promise.all([
    db.users.find({}, { _id: 0, subscription_status: 1, storage_used: 1 }),
    db.pdfs.find({}, { _id: 0, pdf_id: 1 }),
    db.links.find({}, { _id: 0, status: 1, open_count: 1, unique_ips: 1 }),
  ]);

  const totalUsers = users.length;
  const activeSubscribers = users.filter((user) => user.subscription_status === "active").length;
  const totalPdfs = pdfs.length;
  const totalLinks = links.length;
  const activeLinks = links.filter((link) => link.status === "active").length;
  const totalStorage = users.reduce((sum, user) => sum + Number(user.storage_used || 0), 0);
  const totalViews = links.reduce((sum, link) => sum + Number(link.open_count || 0), 0);
  const uniqueViewerSet = new Set();
  for (const link of links) {
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
  await getCurrentAdmin(req);
  const config = await getActiveStripeConfig();
  sendJson(res, 200, config);
}

async function handleAdminStripePut(req, res) {
  const admin = await getCurrentAdmin(req);
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

  await db.platform_settings.updateOne(
    { key: "stripe" },
    {
      $set: updateData,
    },
    { upsert: true },
  );

  await logAuditEvent(req, {
    eventType: "admin.stripe_settings_update",
    actorUserId: admin.user_id,
    targetUserId: admin.user_id,
    resourceType: "platform_settings",
    resourceId: "stripe",
    success: true,
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
  await getCurrentSuperAdmin(req);
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
  const admin = await getCurrentSuperAdmin(req);
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

  await db.platform_settings.updateOne(
    { key: "storage" },
    {
      $set: updateData,
    },
    { upsert: true },
  );

  await logAuditEvent(req, {
    eventType: "admin.storage_settings_update",
    actorUserId: admin.user_id,
    targetUserId: admin.user_id,
    resourceType: "platform_settings",
    resourceId: "storage",
    success: true,
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

async function handleAdminVercelGet(req, res) {
  await getCurrentSuperAdmin(req);
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
  const admin = await getCurrentSuperAdmin(req);
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

  await db.platform_settings.updateOne(
    { key: "vercel" },
    {
      $set: updateData,
    },
    { upsert: true },
  );

  await logAuditEvent(req, {
    eventType: "admin.vercel_settings_update",
    actorUserId: admin.user_id,
    targetUserId: admin.user_id,
    resourceType: "platform_settings",
    resourceId: "vercel",
    success: true,
    message: "super_admin_updated_vercel_settings",
    metadata: {
      updated_fields: updatedFields,
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

async function handleAdminBrandingGet(req, res) {
  await getCurrentSuperAdmin(req);
  const config = await getActiveBrandingConfig();
  sendJson(res, 200, config);
}

async function handleAdminBrandingPut(req, res) {
  const admin = await getCurrentSuperAdmin(req);
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

  await db.platform_settings.updateOne(
    { key: "branding" },
    {
      $set: updateData,
    },
    { upsert: true },
  );

  await logAuditEvent(req, {
    eventType: "admin.branding_settings_update",
    actorUserId: admin.user_id,
    targetUserId: admin.user_id,
    resourceType: "platform_settings",
    resourceId: "branding",
    success: true,
    message: "super_admin_updated_branding_settings",
    metadata: {
      updated_fields: updatedFields,
    },
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
  await getCurrentSuperAdmin(req);
  const config = await getActiveSeoConfig();
  sendJson(res, 200, config);
}

async function handleAdminSeoPut(req, res) {
  const admin = await getCurrentSuperAdmin(req);
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

  await db.platform_settings.updateOne(
    { key: "seo" },
    {
      $set: updateData,
    },
    { upsert: true },
  );

  await logAuditEvent(req, {
    eventType: "admin.seo_settings_update",
    actorUserId: admin.user_id,
    targetUserId: admin.user_id,
    resourceType: "platform_settings",
    resourceId: "seo",
    success: true,
    message: "super_admin_updated_seo_settings",
    metadata: {
      updated_fields: updatedFields,
    },
  });

  const config = await getActiveSeoConfig();
  sendJson(res, 200, {
    message: "SEO settings updated successfully",
    ...config,
  });
}

async function handleDomainsCreate(req, res) {
  const user = await getCurrentUser(req);

  const body = await getJsonBody(req);
  const domain = normalizeDomainHost(body.domain || "");
  const existingDomain = await db.domains.findOne(
    { user_id: user.user_id, domain },
    { _id: 0, domain_id: 1 },
  );
  if (existingDomain) {
    throw new HttpError(400, "Domain already exists");
  }

  const domainId = makeId("dom");
  const shouldSetDefault =
    parseOptionalBoolean(body.set_default, "set_default") ??
    !user.preferred_domain_id;
  const now = isoNow();

  const domainDoc = {
    domain_id: domainId,
    user_id: user.user_id,
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
    { domain_id: domainId, user_id: user.user_id },
    {
      $set: vercelUpdate,
    },
  );

  await logAuditEvent(req, {
    eventType: "domain.create",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "domain",
    resourceId: domainId,
    success: true,
    message: "custom_domain_created",
    metadata: {
      domain,
      set_default: shouldSetDefault,
      vercel_status: vercelUpdate.vercel_status,
      vercel_auto_attach: vercelConfig.auto_attach,
      vercel_configured: vercelConfig.configured,
    },
  });

  const preferredDomainId = user.preferred_domain_id || null;
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
  const user = await getCurrentUser(req);
  const domains = await db.domains.find({ user_id: user.user_id }, { _id: 0 });
  const preferredDomainId = user.preferred_domain_id || null;
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
  const user = await getCurrentUser(req);
  const domain = await db.domains.findOne(
    { domain_id: domainId, user_id: user.user_id },
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
    { domain_id: domainId, user_id: user.user_id },
    {
      $set: updateData,
    },
  );

  if (isDomainReadyForLinks({ ...domain, ...updateData })) {
    const latestUser = await db.users.findOne({ user_id: user.user_id }, { _id: 0, preferred_domain_id: 1 });
    const requestedDefault = parseOptionalBoolean(req.query?.set_default, "set_default");
    if (!latestUser?.preferred_domain_id || requestedDefault === true) {
      await db.users.updateOne(
        { user_id: user.user_id },
        {
          $set: { preferred_domain_id: domainId },
        },
      );
    }
  }

  await logAuditEvent(req, {
    eventType: "domain.verify",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "domain",
    resourceId: domainId,
    success: isDomainReadyForLinks({ ...domain, ...updateData }),
    message: "custom_domain_dns_ssl_check",
    metadata: {
      dns_verified: dnsCheck.dns_verified,
      ssl_status: nextSslStatus,
      routing_ok: dnsCheck.routing_ok,
      txt_ok: dnsCheck.txt_ok,
      vercel_status: vercelCheck.status,
      vercel_error: vercelCheck.error || null,
      verification_error: verificationError,
    },
  });

  const latestUser = await db.users.findOne({ user_id: user.user_id }, { _id: 0, preferred_domain_id: 1 });
  const updatedDomain = {
    ...domain,
    ...updateData,
  };
  const responseDoc = buildDomainResponse(updatedDomain, req, latestUser?.preferred_domain_id || null);
  sendJson(res, 200, responseDoc);
}

async function handleDomainsDefaultPut(req, res) {
  const user = await getCurrentUser(req);
  const body = await getJsonBody(req);
  const rawDomainId = body.domain_id;
  const domainId = rawDomainId ? String(rawDomainId).trim() : null;

  if (domainId) {
    const domain = await db.domains.findOne(
      { domain_id: domainId, user_id: user.user_id },
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
    { user_id: user.user_id },
    {
      $set: { preferred_domain_id: domainId || null },
    },
  );

  await logAuditEvent(req, {
    eventType: "domain.default_update",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "domain",
    resourceId: domainId,
    success: true,
    message: "default_custom_domain_updated",
    metadata: { domain_id: domainId || null },
  });

  sendJson(res, 200, {
    message: "Default domain updated",
    preferred_domain_id: domainId || null,
  });
}

async function handleDomainsDelete(req, res, domainId) {
  const user = await getCurrentUser(req);
  const result = await db.domains.deleteOne({ domain_id: domainId, user_id: user.user_id });
  if (result.deletedCount === 0) {
    throw new HttpError(404, "Domain not found");
  }

  await db.links.updateMany(
    { user_id: user.user_id, custom_domain_id: domainId },
    {
      $set: { custom_domain_id: null },
    },
  );
  if (user.preferred_domain_id === domainId) {
    await db.users.updateOne(
      { user_id: user.user_id },
      {
        $set: { preferred_domain_id: null },
      },
    );
  }

  await logAuditEvent(req, {
    eventType: "domain.delete",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "domain",
    resourceId: domainId,
    success: true,
    message: "custom_domain_deleted",
  });

  sendJson(res, 200, { message: "Domain deleted successfully" });
}

async function handleDashboardStats(req, res) {
  const user = await getCurrentUser(req);

  const [pdfs, links] = await Promise.all([
    db.pdfs.find({ user_id: user.user_id }, { _id: 0, pdf_id: 1 }),
    db.links.find(
      { user_id: user.user_id },
      { _id: 0, status: 1, open_count: 1, unique_ips: 1, access_log: 1 },
    ),
  ]);

  const pdfCount = pdfs.length;
  const linkCount = links.length;
  const activeLinks = links.filter((link) => link.status === "active").length;
  const expiredLinks = links.filter((link) => link.status === "expired").length;
  const revokedLinks = links.filter((link) => link.status === "revoked").length;
  const totalViews = links.reduce((sum, link) => sum + Number(link.open_count || 0), 0);

  const uniqueViewerSet = new Set();
  for (const link of links) {
    for (const ip of link.unique_ips || []) {
      if (ip) uniqueViewerSet.add(ip);
    }
  }
  const uniqueViewers = uniqueViewerSet.size;

  const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let recentViews = 0;
  for (const link of links) {
    for (const access of link.access_log || []) {
      const timestampMs = parseDate(access?.timestamp)?.getTime() || 0;
      if (timestampMs >= sevenDaysAgoMs) {
        recentViews += 1;
      }
    }
  }

  const plan = user.plan || "none";
  const planInfo = SUBSCRIPTION_PLANS[plan] || { storage_mb: 0, links_per_month: 0 };

  sendJson(res, 200, {
    pdf_count: pdfCount,
    link_count: linkCount,
    active_links: activeLinks,
    expired_links: expiredLinks,
    revoked_links: revokedLinks,
    total_views: totalViews,
    unique_viewers: uniqueViewers,
    recent_views_7d: recentViews,
    storage_used: Number(user.storage_used || 0),
    storage_limit: Number(planInfo.storage_mb || 0) * 1024 * 1024,
    plan,
    subscription_status: user.subscription_status || "inactive",
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
    events: ordered,
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

  const allEvents = await db.audit_events.find({}, { _id: 0 });
  const filtered = allEvents.filter((eventDoc) => {
    if (eventType && eventDoc.event_type !== eventType) return false;
    if (actorUserId && eventDoc.actor_user_id !== actorUserId) return false;
    if (targetUserId && eventDoc.target_user_id !== targetUserId) return false;
    if (resourceType && eventDoc.resource_type !== resourceType) return false;
    if (success !== null && Boolean(eventDoc.success) !== success) return false;
    return true;
  });

  const ordered = sortAuditEventsDescending(filtered).slice(0, limit);
  sendJson(res, 200, {
    total: filtered.length,
    events: ordered,
  });
}

function parsePathSegments(pathSegments) {
  return (pathSegments || [])
    .map((segment) => decodeURIComponent(String(segment || "")))
    .filter((segment) => segment.length > 0);
}

async function routeRequest(req, res, pathSegments) {
  const method = String(req.method || "GET").toUpperCase();
  const segments = parsePathSegments(pathSegments);
  const routePath = `/${segments.join("/")}`;

  if (method === "GET" && segments.length === 0) {
    sendJson(res, 200, {
      message: "Autodestroy PDF Platform API",
      version: "1.0.0",
    });
    return;
  }

  if (method === "POST" && routePath === "/auth/register") return handleAuthRegister(req, res);
  if (method === "POST" && routePath === "/auth/login") return handleAuthLogin(req, res);
  if (method === "POST" && routePath === "/auth/google/session") return handleAuthGoogleSession(req, res);
  if (method === "GET" && routePath === "/auth/me") return handleAuthMe(req, res);
  if (method === "POST" && routePath === "/auth/logout") return handleAuthLogout(req, res);
  if (method === "PUT" && routePath === "/auth/language") return handleAuthLanguage(req, res);
  if (method === "POST" && routePath === "/auth/password-reset") return handleAuthPasswordReset(req, res);
  if (method === "GET" && routePath === "/auth/password-reset/validate") return handleAuthPasswordResetValidate(req, res);
  if (method === "POST" && routePath === "/auth/password-reset/confirm") return handleAuthPasswordResetConfirm(req, res);
  if (method === "POST" && routePath === "/auth/verify-email/confirm") return handleAuthVerifyEmailConfirm(req, res);
  if (method === "POST" && routePath === "/auth/verify-email/resend") return handleAuthVerifyEmailResend(req, res);
  if (method === "GET" && routePath === "/audit/events") return handleAuditEventsGet(req, res);

  if (method === "GET" && routePath === "/folders") return handleFoldersGet(req, res);
  if (method === "POST" && routePath === "/folders") return handleFoldersCreate(req, res);
  {
    const match = routePath.match(/^\/folders\/([^/]+)$/);
    if (method === "DELETE" && match) return handleFoldersDelete(req, res, match[1]);
  }

  if (method === "POST" && routePath === "/pdfs/upload") return handlePdfsUpload(req, res);
  if (method === "GET" && routePath === "/pdfs") return handlePdfsGet(req, res);
  {
    const renameMatch = routePath.match(/^\/pdfs\/([^/]+)\/rename$/);
    if (method === "PUT" && renameMatch) return handlePdfsRename(req, res, renameMatch[1]);
  }
  {
    const moveMatch = routePath.match(/^\/pdfs\/([^/]+)\/move$/);
    if (method === "PUT" && moveMatch) return handlePdfsMove(req, res, moveMatch[1]);
  }
  {
    const directAccessMatch = routePath.match(/^\/pdfs\/([^/]+)\/direct-access$/);
    if (method === "PUT" && directAccessMatch) {
      return handlePdfsDirectAccessUpdate(req, res, directAccessMatch[1]);
    }
  }
  {
    const deleteMatch = routePath.match(/^\/pdfs\/([^/]+)$/);
    if (method === "DELETE" && deleteMatch) return handlePdfsDelete(req, res, deleteMatch[1]);
  }

  if (method === "POST" && routePath === "/links") return handleLinksCreate(req, res);
  if (method === "GET" && routePath === "/links") return handleLinksGet(req, res);
  {
    const statsMatch = routePath.match(/^\/links\/([^/]+)\/stats$/);
    if (method === "GET" && statsMatch) return handleLinksStats(req, res, statsMatch[1]);
  }
  {
    const revokeMatch = routePath.match(/^\/links\/([^/]+)\/revoke$/);
    if (method === "POST" && revokeMatch) return handleLinksRevoke(req, res, revokeMatch[1]);
  }
  {
    const deleteMatch = routePath.match(/^\/links\/([^/]+)$/);
    if (method === "DELETE" && deleteMatch) return handleLinksDelete(req, res, deleteMatch[1]);
  }

  {
    const directMatch = routePath.match(/^\/direct\/([^/]+)$/);
    if (method === "GET" && directMatch) return handleDirectTokenPdf(req, res, directMatch[1]);
  }
  {
    const pdfMatch = routePath.match(/^\/view\/([^/]+)\/pdf$/);
    if (method === "GET" && pdfMatch) return handleViewTokenPdf(req, res, pdfMatch[1]);
  }
  {
    const viewMatch = routePath.match(/^\/view\/([^/]+)$/);
    if (method === "GET" && viewMatch) return handleViewToken(req, res, viewMatch[1]);
  }

  if (method === "POST" && routePath === "/subscription/checkout") return handleSubscriptionCheckout(req, res);
  {
    const statusMatch = routePath.match(/^\/subscription\/status\/([^/]+)$/);
    if (method === "GET" && statusMatch) return handleSubscriptionStatus(req, res, statusMatch[1]);
  }
  if (method === "POST" && routePath === "/webhook/stripe") return handleStripeWebhook(req, res);
  if (method === "GET" && routePath === "/subscription/plans") return handleSubscriptionPlans(req, res);
  if (method === "GET" && routePath === "/branding") return handleBrandingGet(req, res);
  if (method === "GET" && routePath === "/seo") return handleSeoGet(req, res);

  if (method === "GET" && routePath === "/admin/users") return handleAdminUsersGet(req, res);
  {
    const userMatch = routePath.match(/^\/admin\/users\/([^/]+)$/);
    if (method === "PUT" && userMatch) return handleAdminUsersUpdate(req, res, userMatch[1]);
    if (method === "DELETE" && userMatch) return handleAdminUsersDelete(req, res, userMatch[1]);
  }

  if (method === "GET" && routePath === "/admin/links") return handleAdminLinksGet(req, res);
  {
    const revokeMatch = routePath.match(/^\/admin\/links\/([^/]+)\/revoke$/);
    if (method === "POST" && revokeMatch) return handleAdminLinksRevoke(req, res, revokeMatch[1]);
  }
  {
    const deleteMatch = routePath.match(/^\/admin\/links\/([^/]+)$/);
    if (method === "DELETE" && deleteMatch) return handleAdminLinksDelete(req, res, deleteMatch[1]);
  }

  if (method === "GET" && routePath === "/admin/stats") return handleAdminStats(req, res);
  if (method === "GET" && routePath === "/admin/audit/events") return handleAdminAuditEventsGet(req, res);
  if (method === "GET" && routePath === "/admin/settings/stripe") return handleAdminStripeGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/stripe") return handleAdminStripePut(req, res);
  if (method === "GET" && routePath === "/admin/settings/storage") return handleAdminStorageGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/storage") return handleAdminStoragePut(req, res);
  if (method === "GET" && routePath === "/admin/settings/vercel") return handleAdminVercelGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/vercel") return handleAdminVercelPut(req, res);
  if (method === "GET" && routePath === "/admin/settings/branding") return handleAdminBrandingGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/branding") return handleAdminBrandingPut(req, res);
  if (method === "GET" && routePath === "/admin/settings/seo") return handleAdminSeoGet(req, res);
  if (method === "PUT" && routePath === "/admin/settings/seo") return handleAdminSeoPut(req, res);

  if (method === "POST" && routePath === "/domains") return handleDomainsCreate(req, res);
  if (method === "GET" && routePath === "/domains") return handleDomainsGet(req, res);
  if (method === "PUT" && routePath === "/domains/default") return handleDomainsDefaultPut(req, res);
  {
    const domainMatch = routePath.match(/^\/domains\/([^/]+)$/);
    if (method === "DELETE" && domainMatch) return handleDomainsDelete(req, res, domainMatch[1]);
    if (method === "POST" && domainMatch) return handleDomainsVerify(req, res, domainMatch[1]);
  }

  if (method === "GET" && routePath === "/dashboard/stats") return handleDashboardStats(req, res);

  throw new HttpError(404, "Not found");
}

export async function handleApiRequest(req, res, pathSegments = []) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    await routeRequest(req, res, pathSegments);
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
