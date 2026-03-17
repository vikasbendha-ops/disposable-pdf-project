import dns from "node:dns/promises";
import { Pool, Client } from "pg";

const MISSING = Symbol("missing");
const SCHEMA_MARKER_KEY = "__schema_meta";
const SCHEMA_MARKER_VERSION = 1;
const SIMPLE_FIELD_RE = /^[A-Za-z0-9_]+$/;

const DEFAULT_POOLER_REGIONS = [
  "us-east-1",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-central-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ca-central-1",
  "sa-east-1",
];

const DEFAULT_POOLER_PREFIXES = ["aws-1", "aws-0"];

function deepClone(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return JSON.parse(JSON.stringify(value));
}

function getByPath(doc, path, defaultValue = MISSING) {
  let current = doc;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return defaultValue;
    }
    current = current[part];
  }
  return current;
}

function setByPath(doc, path, value) {
  const parts = path.split(".");
  let current = doc;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function deleteByPath(doc, path) {
  const parts = path.split(".");
  let current = doc;
  for (const part of parts.slice(0, -1)) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return;
    }
    current = current[part];
  }
  if (current && typeof current === "object") {
    delete current[parts[parts.length - 1]];
  }
}

function compare(actual, operator, expected) {
  if (actual === MISSING) return false;
  try {
    switch (operator) {
      case "$gte":
        return actual >= expected;
      case "$gt":
        return actual > expected;
      case "$lte":
        return actual <= expected;
      case "$lt":
        return actual < expected;
      case "$ne":
        return actual !== expected;
      case "$in":
        return Array.isArray(expected) ? expected.includes(actual) : false;
      case "$nin":
        return Array.isArray(expected) ? !expected.includes(actual) : true;
      default:
        throw new Error(`Unsupported query operator: ${operator}`);
    }
  } catch {
    return false;
  }
}

function matchesQuery(doc, query) {
  if (!query || Object.keys(query).length === 0) return true;

  for (const [key, expected] of Object.entries(query)) {
    if (key === "$or") {
      if (!Array.isArray(expected) || !expected.some((q) => matchesQuery(doc, q))) return false;
      continue;
    }
    if (key === "$and") {
      if (!Array.isArray(expected) || !expected.every((q) => matchesQuery(doc, q))) return false;
      continue;
    }

    const actual = getByPath(doc, key, MISSING);

    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      const hasOperator = Object.keys(expected).some((k) => k.startsWith("$"));
      if (hasOperator) {
        for (const [op, opVal] of Object.entries(expected)) {
          if (!compare(actual, op, opVal)) return false;
        }
      } else if (actual !== expected) {
        return false;
      }
      continue;
    }

    if (actual === MISSING && expected === null) continue;
    if (actual !== expected) return false;
  }

  return true;
}

function applyProjection(doc, projection) {
  if (!projection || Object.keys(projection).length === 0) return deepClone(doc);

  const cleanProjection = { ...projection };
  delete cleanProjection._id;
  if (Object.keys(cleanProjection).length === 0) return deepClone(doc);

  const includeFields = Object.entries(cleanProjection)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
  const excludeFields = Object.entries(cleanProjection)
    .filter(([, value]) => !Boolean(value))
    .map(([key]) => key);

  if (includeFields.length > 0) {
    const out = {};
    for (const field of includeFields) {
      const value = getByPath(doc, field, MISSING);
      if (value !== MISSING) {
        setByPath(out, field, deepClone(value));
      }
    }
    return out;
  }

  const out = deepClone(doc);
  for (const field of excludeFields) {
    deleteByPath(out, field);
  }
  return out;
}

function applyUpdate(doc, update) {
  const next = deepClone(doc);

  for (const [path, value] of Object.entries(update?.$set || {})) {
    setByPath(next, path, value);
  }

  for (const [path, value] of Object.entries(update?.$inc || {})) {
    let current = getByPath(next, path, 0);
    if (current === MISSING || current === null) current = 0;
    setByPath(next, path, current + value);
  }

  for (const [path, value] of Object.entries(update?.$addToSet || {})) {
    let current = getByPath(next, path, []);
    if (current === MISSING || current === null || !Array.isArray(current)) current = [];
    if (!current.includes(value)) current.push(value);
    setByPath(next, path, current);
  }

  for (const [path, value] of Object.entries(update?.$push || {})) {
    let current = getByPath(next, path, []);
    if (current === MISSING || current === null || !Array.isArray(current)) current = [];

    if (value && typeof value === "object" && "$each" in value) {
      current.push(...(value.$each || []));
      if ("$slice" in value) {
        const sliceVal = Number(value.$slice);
        current = sliceVal >= 0 ? current.slice(0, sliceVal) : current.slice(sliceVal);
      }
    } else {
      current.push(value);
    }

    setByPath(next, path, current);
  }

  return next;
}

function isoJson(value) {
  return JSON.stringify(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonPrimitive(value) {
  if (value === null) return true;
  const valueType = typeof value;
  return valueType === "string" || valueType === "number" || valueType === "boolean";
}

function isSimpleTopLevelFieldName(field) {
  return SIMPLE_FIELD_RE.test(String(field || ""));
}

function escapeSqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function getSqlProjectionStrategy(projection) {
  if (!isPlainObject(projection)) return null;

  const cleanProjection = { ...projection };
  delete cleanProjection._id;
  const entries = Object.entries(cleanProjection);
  if (entries.length === 0) return null;

  const includeEntries = entries.filter(([, value]) => Boolean(value));
  const excludeEntries = entries.filter(([, value]) => !Boolean(value));
  if (includeEntries.length > 0 && excludeEntries.length > 0) return null;

  const fields = (includeEntries.length > 0 ? includeEntries : excludeEntries).map(([key]) => key);
  if (fields.length === 0 || fields.some((field) => !isSimpleTopLevelFieldName(field))) {
    return null;
  }

  return {
    mode: includeEntries.length > 0 ? "include" : "exclude",
    fields,
  };
}

function buildSelectDocExpression(projection) {
  const strategy = getSqlProjectionStrategy(projection);
  if (!strategy) return "doc";

  if (strategy.mode === "exclude") {
    const fieldList = strategy.fields.map((field) => escapeSqlLiteral(field)).join(", ");
    return `doc - ARRAY[${fieldList}]`;
  }

  const parts = [];
  for (const field of strategy.fields) {
    const literal = escapeSqlLiteral(field);
    parts.push(`${literal}, doc->${literal}`);
  }
  return `jsonb_build_object(${parts.join(", ")})`;
}

function getSqlSortStrategy(sort) {
  if (!isPlainObject(sort)) return null;
  const entries = Object.entries(sort);
  if (entries.length !== 1) return null;

  const [field, direction] = entries[0];
  if (!isSimpleTopLevelFieldName(field)) return null;

  const numericDirection = Number(direction);
  if (numericDirection !== 1 && numericDirection !== -1) return null;

  return {
    field,
    direction: numericDirection === -1 ? "DESC" : "ASC",
  };
}

function canUseJsonContainmentQuery(query) {
  if (!isPlainObject(query)) return false;
  const entries = Object.entries(query);
  if (entries.length === 0) return false;

  for (const [key, value] of entries) {
    if (!key || key.includes(".") || key.startsWith("$")) {
      return false;
    }
    if (value === undefined) return false;
    if (isJsonPrimitive(value)) continue;
    if (Array.isArray(value) && value.every((item) => isJsonPrimitive(item))) continue;
    return false;
  }

  return true;
}

async function hostHasIPv4(hostname) {
  try {
    const records = await dns.resolve4(hostname);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
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

  if (!raw) return raw;

  try {
    const url = new URL(raw);
    if (url.password) {
      url.password = decodeURIComponent(url.password);
    }
    return url.toString();
  } catch {
    // Common misconfiguration: unescaped password chars like '#' break URL parsing.
    const authMatch = raw.match(/^(postgres(?:ql)?:\/\/[^:/?#]+:)([^@]*)(@.+)$/i);
    if (!authMatch) {
      return raw;
    }

    const normalizedPassword = normalizeCredentialSegment(authMatch[2]);
    const candidate = `${authMatch[1]}${normalizedPassword}${authMatch[3]}`;

    try {
      const url = new URL(candidate);
      if (url.password) {
        url.password = decodeURIComponent(url.password);
      }
      return url.toString();
    } catch {
      return candidate;
    }
  }
}

function parseCsvEnv(name, fallback = "") {
  const raw = process.env[name] || fallback;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

class DocumentCollection {
  constructor(store, name) {
    this.store = store;
    this.name = name;
  }

  async _fetchRows(query = null, options = {}, projection = null) {
    const limit = Number.isInteger(options?.limit) && options.limit > 0 ? options.limit : null;
    const sortStrategy = getSqlSortStrategy(options?.sort);
    const pool = await this.store.getPool();
    const normalizedQuery = isPlainObject(query) ? query : {};
    const hasQuery = Object.keys(normalizedQuery).length > 0;
    const canUseContainment = hasQuery && canUseJsonContainmentQuery(normalizedQuery);
    const selectDocExpr = buildSelectDocExpression(projection);

    const params = [this.name];
    let sql = `SELECT id, ${selectDocExpr} AS doc FROM app_documents WHERE collection = $1`;

    if (canUseContainment) {
      params.push(isoJson(normalizedQuery));
      sql += ` AND doc @> $${params.length}::jsonb`;
    }

    if (sortStrategy) {
      const fieldLiteral = escapeSqlLiteral(sortStrategy.field);
      sql += ` ORDER BY COALESCE(doc->>${fieldLiteral}, '') ${sortStrategy.direction}, id ${sortStrategy.direction}`;
    } else {
      sql += " ORDER BY id ASC";
    }

    const canApplySqlLimit = limit && (!hasQuery || canUseContainment);
    if (canApplySqlLimit) {
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
    }

    const result = await pool.query(sql, params);
    return result.rows.map((row) => ({
      id: row.id,
      doc: typeof row.doc === "string" ? JSON.parse(row.doc) : row.doc,
    }));
  }

  async findOne(query = {}, projection = null, options = {}) {
    const rows = await this._fetchRows(query, { ...options, limit: 1 }, projection);
    for (const row of rows) {
      if (matchesQuery(row.doc, query)) {
        return applyProjection(row.doc, projection || undefined);
      }
    }
    return null;
  }

  async find(query = {}, projection = null, options = {}) {
    const limit = Number.isInteger(options?.limit) && options.limit > 0 ? options.limit : null;
    const rows = await this._fetchRows(query, options, projection);
    const matched = [];
    for (const row of rows) {
      if (matchesQuery(row.doc, query)) {
        matched.push(applyProjection(row.doc, projection || undefined));
        if (limit && matched.length >= limit) {
          break;
        }
      }
    }
    return matched;
  }

  async insertOne(doc) {
    const pool = await this.store.getPool();
    const result = await pool.query(
      "INSERT INTO app_documents (collection, doc) VALUES ($1, $2::jsonb) RETURNING id",
      [this.name, isoJson(doc)],
    );
    return { insertedId: result.rows[0]?.id ?? null };
  }

  async updateOne(query, update, options = {}) {
    const rows = await this._fetchRows(query, { limit: 1 });
    for (const row of rows) {
      if (matchesQuery(row.doc, query)) {
        const nextDoc = applyUpdate(row.doc, update);
        const pool = await this.store.getPool();
        await pool.query("UPDATE app_documents SET doc = $1::jsonb WHERE id = $2", [
          isoJson(nextDoc),
          row.id,
        ]);
        return { matchedCount: 1, modifiedCount: 1, upsertedId: null };
      }
    }

    if (options.upsert) {
      const seedDoc = deepClone(query);
      const nextDoc = applyUpdate(seedDoc, update);
      const insertResult = await this.insertOne(nextDoc);
      return { matchedCount: 0, modifiedCount: 0, upsertedId: insertResult.insertedId };
    }

    return { matchedCount: 0, modifiedCount: 0, upsertedId: null };
  }

  async updateMany(query, update) {
    const rows = await this._fetchRows(query);
    let matched = 0;
    const pool = await this.store.getPool();
    for (const row of rows) {
      if (matchesQuery(row.doc, query)) {
        matched += 1;
        const nextDoc = applyUpdate(row.doc, update);
        await pool.query("UPDATE app_documents SET doc = $1::jsonb WHERE id = $2", [
          isoJson(nextDoc),
          row.id,
        ]);
      }
    }
    return { matchedCount: matched, modifiedCount: matched };
  }

  async deleteOne(query) {
    const rows = await this._fetchRows(query, { limit: 1 });
    for (const row of rows) {
      if (matchesQuery(row.doc, query)) {
        const pool = await this.store.getPool();
        await pool.query("DELETE FROM app_documents WHERE id = $1", [row.id]);
        return { deletedCount: 1 };
      }
    }
    return { deletedCount: 0 };
  }

  async deleteMany(query) {
    const rows = await this._fetchRows(query);
    const toDelete = rows.filter((row) => matchesQuery(row.doc, query)).map((row) => row.id);
    if (toDelete.length === 0) return { deletedCount: 0 };

    const pool = await this.store.getPool();
    await pool.query("DELETE FROM app_documents WHERE id = ANY($1::bigint[])", [toDelete]);
    return { deletedCount: toDelete.length };
  }

  async countDocuments(query = {}) {
    const pool = await this.store.getPool();
    const normalizedQuery = isPlainObject(query) ? query : {};
    const hasQuery = Object.keys(normalizedQuery).length > 0;

    if (!hasQuery) {
      const result = await pool.query(
        "SELECT COUNT(*)::bigint AS total FROM app_documents WHERE collection = $1",
        [this.name],
      );
      return Number(result.rows[0]?.total || 0);
    }

    if (canUseJsonContainmentQuery(normalizedQuery)) {
      const result = await pool.query(
        "SELECT COUNT(*)::bigint AS total FROM app_documents WHERE collection = $1 AND doc @> $2::jsonb",
        [this.name, isoJson(normalizedQuery)],
      );
      return Number(result.rows[0]?.total || 0);
    }

    const rows = await this._fetchRows();
    let count = 0;
    for (const row of rows) {
      if (matchesQuery(row.doc, query)) {
        count += 1;
      }
    }
    return count;
  }

  async sumField(query = {}, field) {
    const normalizedField = String(field || "").trim();
    if (!isSimpleTopLevelFieldName(normalizedField)) {
      throw new Error(`sumField only supports simple top-level fields. Received: ${field}`);
    }

    const pool = await this.store.getPool();
    const normalizedQuery = isPlainObject(query) ? query : {};
    const hasQuery = Object.keys(normalizedQuery).length > 0;
    const fieldLiteral = escapeSqlLiteral(normalizedField);

    if (!hasQuery || canUseJsonContainmentQuery(normalizedQuery)) {
      const params = [this.name];
      let sql = `
        SELECT COALESCE(SUM(
          CASE
            WHEN jsonb_typeof(doc->${fieldLiteral}) = 'number' THEN (doc->>${fieldLiteral})::numeric
            WHEN jsonb_typeof(doc->${fieldLiteral}) = 'string' AND (doc->>${fieldLiteral}) ~ '^-?[0-9]+(\\.[0-9]+)?$'
              THEN (doc->>${fieldLiteral})::numeric
            ELSE 0
          END
        ), 0) AS total
        FROM app_documents
        WHERE collection = $1
      `;

      if (hasQuery) {
        params.push(isoJson(normalizedQuery));
        sql += ` AND doc @> $${params.length}::jsonb`;
      }

      const result = await pool.query(sql, params);
      return Number(result.rows[0]?.total || 0);
    }

    const rows = await this.find(query, { [normalizedField]: 1 });
    return rows.reduce((sum, row) => sum + Number(row?.[normalizedField] || 0), 0);
  }

  async aggregate(pipeline = []) {
    let docs = (await this._fetchRows()).map((row) => row.doc);

    for (const stage of pipeline) {
      if (stage.$match) {
        docs = docs.filter((doc) => matchesQuery(doc, stage.$match));
        continue;
      }

      if (stage.$unwind) {
        const field = String(stage.$unwind).replace(/^\$/, "");
        const unwound = [];
        for (const doc of docs) {
          const value = getByPath(doc, field, []);
          if (Array.isArray(value)) {
            for (const item of value) {
              const nextDoc = deepClone(doc);
              setByPath(nextDoc, field, item);
              unwound.push(nextDoc);
            }
          }
        }
        docs = unwound;
        continue;
      }

      if (stage.$group) {
        const spec = stage.$group;
        const groupExpr = spec._id;
        const grouped = new Map();

        for (const doc of docs) {
          let groupKey;
          if (typeof groupExpr === "string" && groupExpr.startsWith("$")) {
            groupKey = getByPath(doc, groupExpr.slice(1), null);
          } else {
            groupKey = groupExpr;
          }

          const mapKey = JSON.stringify(groupKey);
          if (!grouped.has(mapKey)) {
            const bucket = { _id: groupKey };
            for (const [field, agg] of Object.entries(spec)) {
              if (field === "_id") continue;
              if (agg && typeof agg === "object" && "$sum" in agg) {
                bucket[field] = 0;
              }
            }
            grouped.set(mapKey, bucket);
          }

          const bucket = grouped.get(mapKey);
          for (const [field, agg] of Object.entries(spec)) {
            if (field === "_id") continue;
            if (agg && typeof agg === "object" && "$sum" in agg) {
              const sumExpr = agg.$sum;
              let addValue;
              if (typeof sumExpr === "string" && sumExpr.startsWith("$")) {
                addValue = getByPath(doc, sumExpr.slice(1), 0);
              } else {
                addValue = sumExpr;
              }
              bucket[field] += Number(addValue || 0);
            }
          }
        }

        docs = Array.from(grouped.values());
        continue;
      }

      if (stage.$count) {
        docs = [{ [stage.$count]: docs.length }];
        continue;
      }

      throw new Error(`Unsupported aggregation stage: ${JSON.stringify(stage)}`);
    }

    return docs;
  }
}

class DocumentStore {
  constructor() {
    this.databaseUrl = normalizeDatabaseUrl(
      process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "",
    );
    this.supabaseUrl = process.env.SUPABASE_URL || "";
    this.autoDiscoverPooler = ["1", "true", "yes", "on"].includes(
      String(process.env.SUPABASE_AUTO_DISCOVER_POOLER ?? "true").toLowerCase(),
    );
    this.poolerDiscoveryTimeout = Number(process.env.SUPABASE_POOLER_DISCOVERY_TIMEOUT || "2.0");
    this.poolerRegions = parseCsvEnv("SUPABASE_POOLER_REGIONS");
    if (this.poolerRegions.length === 0) {
      this.poolerRegions = [...DEFAULT_POOLER_REGIONS];
    }

    this._pool = null;
    this._initPromise = null;
    this._collections = new Map();
    this._poolerDiscoveryAttempted = false;
  }

  async _schemaMarkerExists(pool) {
    const tableCheck = await pool.query(`
      SELECT
        to_regclass('public.app_documents') IS NOT NULL AS has_documents,
        to_regclass('public.app_files') IS NOT NULL AS has_files
    `);
    const row = tableCheck.rows[0] || {};
    if (!row.has_documents || !row.has_files) {
      return false;
    }

    const marker = await pool.query(
      `
      SELECT 1
      FROM app_documents
      WHERE collection = 'platform_settings'
        AND doc @> $1::jsonb
      LIMIT 1
      `,
      [isoJson({ key: SCHEMA_MARKER_KEY, version: SCHEMA_MARKER_VERSION })],
    );
    return marker.rowCount > 0;
  }

  _sslConfigForUrl(url) {
    return url.includes("supabase.co") ? { rejectUnauthorized: false } : undefined;
  }

  async _probeDatabaseUrl(connectionString) {
    let client;
    try {
      client = new Client({
        connectionString,
        ssl: this._sslConfigForUrl(connectionString),
        connectionTimeoutMillis: Math.max(1000, Math.floor(this.poolerDiscoveryTimeout * 1000)),
      });
      await client.connect();
      await client.query("SELECT 1");
      return true;
    } catch {
      return false;
    } finally {
      if (client) {
        try {
          await client.end();
        } catch {
          // ignore
        }
      }
    }
  }

  _extractProjectRef(parsedUrl) {
    const host = (parsedUrl.hostname || "").toLowerCase();
    if (host.startsWith("db.") && host.endsWith(".supabase.co")) {
      const parts = host.split(".");
      if (parts.length >= 4) return parts[1];
    }
    try {
      if (this.supabaseUrl) {
        const supaHost = new URL(this.supabaseUrl).hostname.toLowerCase();
        if (supaHost.endsWith(".supabase.co")) {
          return supaHost.split(".")[0];
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  async _discoverPoolerUrl() {
    let parsedUrl;
    try {
      parsedUrl = new URL(this.databaseUrl);
    } catch {
      return null;
    }

    const host = (parsedUrl.hostname || "").toLowerCase();
    if (!(host.startsWith("db.") && host.endsWith(".supabase.co"))) return null;

    const dbHasV4 = await hostHasIPv4(host);
    if (dbHasV4) return null;

    const projectRef = this._extractProjectRef(parsedUrl);
    if (!projectRef) return null;

    const baseUser = decodeURIComponent(parsedUrl.username || "postgres");
    const candidateUsers = [];
    if (baseUser && !baseUser.endsWith(`.${projectRef}`)) {
      candidateUsers.push(`${baseUser}.${projectRef}`);
    }
    if (baseUser) candidateUsers.push(baseUser);
    if (!candidateUsers.includes(`postgres.${projectRef}`)) {
      candidateUsers.push(`postgres.${projectRef}`);
    }

    const tried = new Set();
    for (const prefix of DEFAULT_POOLER_PREFIXES) {
      for (const region of this.poolerRegions) {
        const poolerHost = `${prefix}-${region}.pooler.supabase.com`;
        const poolerHasV4 = await hostHasIPv4(poolerHost);
        if (!poolerHasV4) continue;

        for (const username of candidateUsers) {
          const probeUrl = new URL(parsedUrl.toString());
          probeUrl.hostname = poolerHost;
          probeUrl.port = "6543";
          probeUrl.username = encodeURIComponent(username);

          const finalUrl = probeUrl.toString();
          if (tried.has(finalUrl)) continue;
          tried.add(finalUrl);

          if (await this._probeDatabaseUrl(finalUrl)) {
            return finalUrl;
          }
        }
      }
    }

    return null;
  }

  async _createPool(connectionString) {
    const pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: this._sslConfigForUrl(connectionString),
    });

    await pool.query("SELECT 1");
    return pool;
  }

  async ensureSchema() {
    const pool = await this.getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_documents (
        id BIGSERIAL PRIMARY KEY,
        collection TEXT NOT NULL,
        doc JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_app_documents_collection ON app_documents (collection);",
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_app_documents_doc_gin ON app_documents USING GIN (doc);",
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_files (
        storage_key TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'application/pdf',
        content BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query("CREATE INDEX IF NOT EXISTS idx_app_files_user_id ON app_files (user_id);");

    const docIndexes = [
      // Users
      "CREATE INDEX IF NOT EXISTS idx_app_docs_users_email_lower ON app_documents ((lower(doc->>'email'))) WHERE collection = 'users';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_users_user_id ON app_documents ((doc->>'user_id')) WHERE collection = 'users';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_users_role ON app_documents ((doc->>'role')) WHERE collection = 'users';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_users_email_verified ON app_documents ((doc->>'email_verified')) WHERE collection = 'users';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_users_stripe_customer_id ON app_documents ((doc->>'stripe_customer_id')) WHERE collection = 'users';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_users_stripe_subscription_id ON app_documents ((doc->>'stripe_subscription_id')) WHERE collection = 'users';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_users_subscription_period_end ON app_documents ((doc->>'subscription_current_period_end')) WHERE collection = 'users';",

      // Sessions / tokens
      "CREATE INDEX IF NOT EXISTS idx_app_docs_user_sessions_token ON app_documents ((doc->>'session_token')) WHERE collection = 'user_sessions';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_user_sessions_user_id ON app_documents ((doc->>'user_id')) WHERE collection = 'user_sessions';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_password_resets_token_hash ON app_documents ((doc->>'token_hash')) WHERE collection = 'password_resets';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_password_resets_user_id ON app_documents ((doc->>'user_id')) WHERE collection = 'password_resets';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_email_verifications_token_hash ON app_documents ((doc->>'token_hash')) WHERE collection = 'email_verifications';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_email_verifications_user_id ON app_documents ((doc->>'user_id')) WHERE collection = 'email_verifications';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_email_change_requests_token_hash ON app_documents ((doc->>'token_hash')) WHERE collection = 'email_change_requests';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_email_change_requests_user_id ON app_documents ((doc->>'user_id')) WHERE collection = 'email_change_requests';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_email_change_requests_new_email ON app_documents ((lower(doc->>'new_email'))) WHERE collection = 'email_change_requests';",

      // PDFs / links
      "CREATE INDEX IF NOT EXISTS idx_app_docs_pdfs_pdf_id ON app_documents ((doc->>'pdf_id')) WHERE collection = 'pdfs';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_pdfs_user_id ON app_documents ((doc->>'user_id')) WHERE collection = 'pdfs';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_pdfs_folder ON app_documents ((doc->>'folder')) WHERE collection = 'pdfs';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_pdfs_storage_provider ON app_documents ((doc->>'storage_provider')) WHERE collection = 'pdfs';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_pdfs_direct_access_token ON app_documents ((doc->>'direct_access_token')) WHERE collection = 'pdfs';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_pdfs_direct_access_enabled ON app_documents ((doc->>'direct_access_enabled')) WHERE collection = 'pdfs';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_pdfs_direct_access_public ON app_documents ((doc->>'direct_access_public')) WHERE collection = 'pdfs';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_folders_folder_id ON app_documents ((doc->>'folder_id')) WHERE collection = 'folders';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_folders_user_id ON app_documents ((doc->>'user_id')) WHERE collection = 'folders';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_links_token ON app_documents ((doc->>'token')) WHERE collection = 'links';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_links_link_id ON app_documents ((doc->>'link_id')) WHERE collection = 'links';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_links_user_id ON app_documents ((doc->>'user_id')) WHERE collection = 'links';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_links_pdf_id ON app_documents ((doc->>'pdf_id')) WHERE collection = 'links';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_links_status ON app_documents ((doc->>'status')) WHERE collection = 'links';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_links_created_at ON app_documents ((doc->>'created_at')) WHERE collection = 'links';",

      // Other domains
      "CREATE INDEX IF NOT EXISTS idx_app_docs_domains_domain ON app_documents ((lower(doc->>'domain'))) WHERE collection = 'domains';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_domains_domain_id ON app_documents ((doc->>'domain_id')) WHERE collection = 'domains';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_domains_user_id ON app_documents ((doc->>'user_id')) WHERE collection = 'domains';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_payment_transactions_session_id ON app_documents ((doc->>'session_id')) WHERE collection = 'payment_transactions';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_payment_transactions_transaction_id ON app_documents ((doc->>'transaction_id')) WHERE collection = 'payment_transactions';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_payment_transactions_user_id ON app_documents ((doc->>'user_id')) WHERE collection = 'payment_transactions';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_payment_transactions_status ON app_documents ((doc->>'payment_status')) WHERE collection = 'payment_transactions';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_payment_transactions_created_at ON app_documents ((doc->>'created_at')) WHERE collection = 'payment_transactions';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_payment_transactions_customer_id ON app_documents ((doc->>'stripe_customer_id')) WHERE collection = 'payment_transactions';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_payment_transactions_subscription_id ON app_documents ((doc->>'stripe_subscription_id')) WHERE collection = 'payment_transactions';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_payment_transactions_invoice_id ON app_documents ((doc->>'stripe_invoice_id')) WHERE collection = 'payment_transactions';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_platform_settings_key ON app_documents ((doc->>'key')) WHERE collection = 'platform_settings';",

      // Audit events
      "CREATE INDEX IF NOT EXISTS idx_app_docs_audit_event_type ON app_documents ((doc->>'event_type')) WHERE collection = 'audit_events';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_audit_actor_user_id ON app_documents ((doc->>'actor_user_id')) WHERE collection = 'audit_events';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_audit_target_user_id ON app_documents ((doc->>'target_user_id')) WHERE collection = 'audit_events';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_audit_resource_type ON app_documents ((doc->>'resource_type')) WHERE collection = 'audit_events';",
      "CREATE INDEX IF NOT EXISTS idx_app_docs_audit_created_at ON app_documents ((doc->>'created_at')) WHERE collection = 'audit_events';",
    ];

    for (const statement of docIndexes) {
      await pool.query(statement);
    }

    await pool.query(
      `
      INSERT INTO app_documents (collection, doc)
      SELECT 'platform_settings', $1::jsonb
      WHERE NOT EXISTS (
        SELECT 1
        FROM app_documents
        WHERE collection = 'platform_settings'
          AND doc @> $2::jsonb
      )
      `,
      [
        isoJson({
          key: SCHEMA_MARKER_KEY,
          version: SCHEMA_MARKER_VERSION,
          updated_at: new Date().toISOString(),
        }),
        isoJson({ key: SCHEMA_MARKER_KEY, version: SCHEMA_MARKER_VERSION }),
      ],
    );
  }

  async getPool() {
    if (!this.databaseUrl) {
      throw new Error("SUPABASE_DB_URL (or DATABASE_URL) is required");
    }
    if (this._pool) return this._pool;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        this._pool = await this._createPool(this.databaseUrl);
      } catch (error) {
        if (!this.autoDiscoverPooler || this._poolerDiscoveryAttempted) {
          throw error;
        }
        this._poolerDiscoveryAttempted = true;
        const discovered = await this._discoverPoolerUrl();
        if (!discovered) {
          throw error;
        }
        this.databaseUrl = discovered;
        this._pool = await this._createPool(this.databaseUrl);
      }

      if (!(await this._schemaMarkerExists(this._pool))) {
        await this.ensureSchema();
      }
      return this._pool;
    })();

    return this._initPromise;
  }

  collection(name) {
    if (!this._collections.has(name)) {
      this._collections.set(name, new DocumentCollection(this, name));
    }
    return this._collections.get(name);
  }

  get users() {
    return this.collection("users");
  }
  get user_sessions() {
    return this.collection("user_sessions");
  }
  get password_resets() {
    return this.collection("password_resets");
  }
  get email_verifications() {
    return this.collection("email_verifications");
  }
  get email_change_requests() {
    return this.collection("email_change_requests");
  }
  get folders() {
    return this.collection("folders");
  }
  get pdfs() {
    return this.collection("pdfs");
  }
  get links() {
    return this.collection("links");
  }
  get payment_transactions() {
    return this.collection("payment_transactions");
  }
  get platform_settings() {
    return this.collection("platform_settings");
  }
  get domains() {
    return this.collection("domains");
  }
  get audit_events() {
    return this.collection("audit_events");
  }

  async putFile(storageKey, userId, content, contentType = "application/pdf") {
    const pool = await this.getPool();
    await pool.query(
      `
      INSERT INTO app_files (storage_key, user_id, content_type, content, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (storage_key)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        content_type = EXCLUDED.content_type,
        content = EXCLUDED.content,
        updated_at = NOW()
      `,
      [storageKey, userId, contentType, content],
    );
  }

  async getFile(storageKey) {
    const pool = await this.getPool();
    const result = await pool.query(
      "SELECT storage_key, user_id, content_type, content FROM app_files WHERE storage_key = $1",
      [storageKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      storage_key: row.storage_key,
      user_id: row.user_id,
      content_type: row.content_type,
      content: row.content,
    };
  }

  async deleteFile(storageKey) {
    const pool = await this.getPool();
    const result = await pool.query("DELETE FROM app_files WHERE storage_key = $1", [storageKey]);
    return result.rowCount > 0;
  }

  async deleteFilesByUser(userId) {
    const pool = await this.getPool();
    await pool.query("DELETE FROM app_files WHERE user_id = $1", [userId]);
  }

  async close() {
    if (this._pool) {
      await this._pool.end();
      this._pool = null;
      this._initPromise = null;
    }
  }
}

let storeSingleton = null;

export function getStore() {
  if (!storeSingleton) {
    storeSingleton = new DocumentStore();
  }
  return storeSingleton;
}
