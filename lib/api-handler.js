import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseCookie, serialize as serializeCookie } from "cookie";
import bcrypt from "bcryptjs";
import formidable from "formidable";
import jwt from "jsonwebtoken";
import { getStore } from "./store";

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
const AUTH_DEBUG_TOKENS = ["1", "true", "yes", "on"].includes(
  String(process.env.AUTH_DEBUG_TOKENS || "").toLowerCase(),
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
    return user;
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

  return user;
}

async function getCurrentAdmin(req) {
  const user = await getCurrentUser(req);
  if (user.role !== "admin") {
    throw new HttpError(403, "Admin access required");
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

  const userDoc = {
    user_id: userId,
    name,
    email,
    password_hash: await bcrypt.hash(password, 12),
    role: "user",
    subscription_status: "inactive",
    plan: "none",
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

  if (user.email_verified === false) {
    await logAuditEvent(req, {
      eventType: "auth.login",
      actorUserId: user.user_id,
      targetUserId: user.user_id,
      success: false,
      message: "email_not_verified",
      metadata: { email },
    });
    throw new HttpError(
      403,
      "Please verify your email before signing in. Use resend verification if needed.",
    );
  }

  const accessToken = createAccessToken({ sub: user.user_id });
  setSessionCookie(res, accessToken);

  await logAuditEvent(req, {
    eventType: "auth.login",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "user",
    resourceId: user.user_id,
    success: true,
    message: "login_success",
  });

  sendJson(res, 200, {
    access_token: accessToken,
    token_type: "bearer",
    user: sanitizeUser(user),
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

  if (existingUser) {
    userId = existingUser.user_id;
    await db.users.updateOne(
      { user_id: userId },
      {
        $set: {
          name,
          picture,
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
      role: "user",
      subscription_status: "inactive",
      plan: "none",
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

  await db.putFile(storageKey, user.user_id, content, "application/pdf");

  const now = isoNow();
  const pdfDoc = {
    pdf_id: pdfId,
    user_id: user.user_id,
    filename,
    original_filename: filename,
    storage_key: storageKey,
    file_path: null,
    file_size: fileSize,
    folder: null,
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
    metadata: { filename, file_size: fileSize },
  });

  sendJson(res, 200, {
    pdf_id: pdfId,
    filename,
    file_size: fileSize,
    folder: null,
    created_at: now,
  });
}

async function handlePdfsGet(req, res) {
  const user = await getCurrentUser(req);
  const folder = typeof req.query.folder === "string" ? req.query.folder : undefined;

  const query = { user_id: user.user_id };
  if (folder) {
    query.folder = folder;
  }

  const pdfs = await db.pdfs.find(query, { _id: 0 });
  const normalized = pdfs.map((pdf) => {
    if (!Object.prototype.hasOwnProperty.call(pdf, "original_filename")) {
      return { ...pdf, original_filename: pdf.filename };
    }
    return pdf;
  });

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
    await db.deleteFile(pdf.storage_key);
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
    },
  });
  sendJson(res, 200, linkDoc);
}

async function handleLinksGet(req, res) {
  const user = await getCurrentUser(req);
  const links = await db.links.find({ user_id: user.user_id }, { _id: 0 });
  sendJson(res, 200, links);
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
    const fileRow = await db.getFile(pdf.storage_key);
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

  const users = await db.users.find({}, { _id: 0, password_hash: 0 });
  for (const user of users) {
    user.pdf_count = await db.pdfs.countDocuments({ user_id: user.user_id });
    user.link_count = await db.links.countDocuments({ user_id: user.user_id });
  }

  sendJson(res, 200, users);
}

async function handleAdminUsersUpdate(req, res, userId) {
  const admin = await getCurrentAdmin(req);
  const body = await getJsonBody(req);

  const update = {};
  for (const key of ["subscription_status", "plan", "role"]) {
    if (body[key] !== undefined && body[key] !== null) {
      update[key] = body[key];
    }
  }

  if (Object.keys(update).length === 0) {
    throw new HttpError(400, "No update data provided");
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

  const userPdfs = await db.pdfs.find({ user_id: userId }, { _id: 0 });
  for (const pdf of userPdfs) {
    if (pdf.storage_key) {
      await db.deleteFile(pdf.storage_key);
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

  const links = await db.links.find({}, { _id: 0 });
  for (const link of links) {
    const user = await db.users.findOne(
      { user_id: link.user_id },
      { _id: 0, name: 1, email: 1 },
    );
    const pdf = await db.pdfs.findOne({ pdf_id: link.pdf_id }, { _id: 0, filename: 1 });

    link.user_name = user?.name || "Unknown";
    link.user_email = user?.email || "Unknown";
    link.pdf_name = pdf?.filename || "Unknown";
  }

  sendJson(res, 200, links);
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

  const totalUsers = await db.users.countDocuments({});
  const activeSubscribers = await db.users.countDocuments({ subscription_status: "active" });
  const totalPdfs = await db.pdfs.countDocuments({});
  const totalLinks = await db.links.countDocuments({});
  const activeLinks = await db.links.countDocuments({ status: "active" });

  const storageResult = await db.users.aggregate([
    { $group: { _id: null, total_storage: { $sum: "$storage_used" } } },
  ]);
  const totalStorage = storageResult.length ? Number(storageResult[0].total_storage || 0) : 0;

  const viewsResult = await db.links.aggregate([
    { $group: { _id: null, total_views: { $sum: "$open_count" } } },
  ]);
  const totalViews = viewsResult.length ? Number(viewsResult[0].total_views || 0) : 0;

  const uniqueResult = await db.links.aggregate([
    { $unwind: "$unique_ips" },
    { $group: { _id: "$unique_ips" } },
    { $count: "total" },
  ]);
  const totalUniqueViewers = uniqueResult.length ? Number(uniqueResult[0].total || 0) : 0;

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

async function handleDomainsCreate(req, res) {
  const user = await getCurrentUser(req);
  if (user.plan !== "enterprise") {
    throw new HttpError(403, "Custom domains require Enterprise plan");
  }

  const body = await getJsonBody(req);
  const domain = String(body.domain || "").trim().toLowerCase();
  if (!domain) {
    throw new HttpError(400, "Domain is required");
  }

  const domainId = makeId("dom");
  const verificationToken = tokenUrlSafe(32);

  await db.domains.insertOne({
    domain_id: domainId,
    user_id: user.user_id,
    domain,
    verification_token: verificationToken,
    verification_status: "pending",
    ssl_status: "pending",
    created_at: isoNow(),
  });

  await logAuditEvent(req, {
    eventType: "domain.create",
    actorUserId: user.user_id,
    targetUserId: user.user_id,
    resourceType: "domain",
    resourceId: domainId,
    success: true,
    message: "custom_domain_created",
    metadata: { domain },
  });

  sendJson(res, 200, {
    domain_id: domainId,
    verification_token: verificationToken,
    cname_target: "autodestroy.example.com",
    instructions: `Add a TXT record with value: autodestroy-verify=${verificationToken}`,
  });
}

async function handleDomainsGet(req, res) {
  const user = await getCurrentUser(req);
  const domains = await db.domains.find({ user_id: user.user_id }, { _id: 0 });
  sendJson(res, 200, domains);
}

async function handleDomainsDelete(req, res, domainId) {
  const user = await getCurrentUser(req);
  const result = await db.domains.deleteOne({ domain_id: domainId, user_id: user.user_id });
  if (result.deletedCount === 0) {
    throw new HttpError(404, "Domain not found");
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

  const pdfCount = await db.pdfs.countDocuments({ user_id: user.user_id });
  const linkCount = await db.links.countDocuments({ user_id: user.user_id });
  const activeLinks = await db.links.countDocuments({ user_id: user.user_id, status: "active" });
  const expiredLinks = await db.links.countDocuments({ user_id: user.user_id, status: "expired" });
  const revokedLinks = await db.links.countDocuments({ user_id: user.user_id, status: "revoked" });

  const viewsResult = await db.links.aggregate([
    { $match: { user_id: user.user_id } },
    { $group: { _id: null, total_views: { $sum: "$open_count" } } },
  ]);
  const totalViews = viewsResult.length ? Number(viewsResult[0].total_views || 0) : 0;

  const uniqueResult = await db.links.aggregate([
    { $match: { user_id: user.user_id } },
    { $unwind: "$unique_ips" },
    { $group: { _id: "$unique_ips" } },
    { $count: "total" },
  ]);
  const uniqueViewers = uniqueResult.length ? Number(uniqueResult[0].total || 0) : 0;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const activityResult = await db.links.aggregate([
    { $match: { user_id: user.user_id } },
    { $unwind: "$access_log" },
    { $match: { "access_log.timestamp": { $gte: sevenDaysAgo } } },
    { $count: "recent_views" },
  ]);
  const recentViews = activityResult.length ? Number(activityResult[0].recent_views || 0) : 0;

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

  if (method === "POST" && routePath === "/domains") return handleDomainsCreate(req, res);
  if (method === "GET" && routePath === "/domains") return handleDomainsGet(req, res);
  {
    const domainMatch = routePath.match(/^\/domains\/([^/]+)$/);
    if (method === "DELETE" && domainMatch) return handleDomainsDelete(req, res, domainMatch[1]);
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
