#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

const ROOT = path.resolve(__dirname, "..", "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    let value = match[2] || "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function normalizeCredentialSegment(value) {
  if (!value) return value;
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

function normalizeDatabaseUrl(databaseUrl) {
  const raw = String(databaseUrl || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    if (parsed.password) {
      parsed.password = decodeURIComponent(parsed.password);
    }
    return parsed.toString();
  } catch {
    const authMatch = raw.match(/^(postgres(?:ql)?:\/\/[^:/?#]+:)([^@]*)(@.+)$/i);
    if (!authMatch) return raw;
    const normalizedPassword = normalizeCredentialSegment(authMatch[2]);
    return `${authMatch[1]}${normalizedPassword}${authMatch[3]}`;
  }
}

function sslForUrl(connectionString) {
  return connectionString.includes("supabase.co") ? { rejectUnauthorized: false } : undefined;
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function boolFromEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

async function getUserByEmail(client, email) {
  const result = await client.query(
    `
    SELECT id, doc
    FROM app_documents
    WHERE collection = 'users'
      AND lower(doc->>'email') = lower($1)
    ORDER BY id ASC
    LIMIT 1
    `,
    [email],
  );
  if (result.rowCount === 0) return null;
  return {
    id: result.rows[0].id,
    doc: result.rows[0].doc,
  };
}

async function upsertUser(client, { name, email, password, role, plan, subscriptionStatus }) {
  const now = new Date().toISOString();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Seed email is required");
  }
  if (String(password || "").length < 8) {
    throw new Error(`Password for ${normalizedEmail} must be at least 8 characters`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await getUserByEmail(client, normalizedEmail);

  if (existing) {
    const nextDoc = {
      ...existing.doc,
      name,
      email: normalizedEmail,
      password_hash: passwordHash,
      role,
      plan,
      subscription_status: subscriptionStatus,
      email_verified: true,
      email_verified_at: existing.doc.email_verified_at || now,
      updated_at: now,
    };
    await client.query("UPDATE app_documents SET doc = $1::jsonb WHERE id = $2", [
      JSON.stringify(nextDoc),
      existing.id,
    ]);
    return { action: "updated", userId: nextDoc.user_id, email: normalizedEmail };
  }

  const userDoc = {
    user_id: makeId("user"),
    name,
    email: normalizedEmail,
    password_hash: passwordHash,
    role,
    subscription_status: subscriptionStatus,
    plan,
    storage_used: 0,
    language: "en",
    email_verified: true,
    email_verified_at: now,
    created_at: now,
  };

  await client.query("INSERT INTO app_documents (collection, doc) VALUES ('users', $1::jsonb)", [
    JSON.stringify(userDoc),
  ]);
  return { action: "created", userId: userDoc.user_id, email: normalizedEmail };
}

async function addAuditEvent(client, event) {
  const eventDoc = {
    event_id: makeId("evt"),
    created_at: new Date().toISOString(),
    ...event,
  };
  await client.query("INSERT INTO app_documents (collection, doc) VALUES ('audit_events', $1::jsonb)", [
    JSON.stringify(eventDoc),
  ]);
}

async function run() {
  loadEnvFile(path.join(ROOT, ".env"));
  loadEnvFile(path.join(ROOT, ".env.local"));

  const dbUrl = normalizeDatabaseUrl(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "");
  if (!dbUrl) {
    throw new Error("SUPABASE_DB_URL (or DATABASE_URL) is required");
  }

  const schemaPath = path.join(ROOT, "db", "supabase_schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@autodestroy.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@123456";
  const seedSampleUser = boolFromEnv(process.env.SEED_CREATE_SAMPLE_USER, true);
  const sampleUserEmail = process.env.SEED_USER_EMAIL || "connect@vikasbendha.com";
  const sampleUserPassword = process.env.SEED_USER_PASSWORD || "User@123456";

  const client = new Client({
    connectionString: dbUrl,
    ssl: sslForUrl(dbUrl),
  });

  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(schemaSql);

    const adminResult = await upsertUser(client, {
      name: "Platform Admin",
      email: adminEmail,
      password: adminPassword,
      role: "admin",
      plan: "enterprise",
      subscriptionStatus: "active",
    });

    let userResult = null;
    if (seedSampleUser) {
      userResult = await upsertUser(client, {
        name: "Sample User",
        email: sampleUserEmail,
        password: sampleUserPassword,
        role: "user",
        plan: "basic",
        subscriptionStatus: "active",
      });
    }

    await addAuditEvent(client, {
      event_type: "system.seed",
      actor_user_id: null,
      target_user_id: adminResult.userId,
      resource_type: "seed",
      resource_id: "phase2",
      success: true,
      message: "database_seed_completed",
      metadata: {
        admin_email: adminResult.email,
        sample_user_email: userResult?.email || null,
      },
    });

    await client.query("COMMIT");

    console.log("Seed complete.");
    console.log(`Admin (${adminResult.action}): ${adminResult.email}`);
    if (userResult) {
      console.log(`Sample user (${userResult.action}): ${userResult.email}`);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(`Seed failed: ${error.message}`);
  process.exit(1);
});
