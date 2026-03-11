#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
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

async function run() {
  loadEnvFile(path.join(ROOT, ".env"));
  loadEnvFile(path.join(ROOT, ".env.local"));

  const dbUrl = normalizeDatabaseUrl(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "");
  if (!dbUrl) {
    throw new Error("SUPABASE_DB_URL (or DATABASE_URL) is required");
  }

  const schemaPath = path.join(ROOT, "db", "supabase_schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  const client = new Client({
    connectionString: dbUrl,
    ssl: sslForUrl(dbUrl),
  });

  await client.connect();
  try {
    await client.query(schemaSql);
    console.log("Migration complete: db/supabase_schema.sql applied.");
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});
