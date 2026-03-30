#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "../..");
const OUTPUT_DIR = path.join(REPO_ROOT, "docs");
const OUTPUT_MD = path.join(OUTPUT_DIR, "PROJECT_CONTEXT_EXPORT.md");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "PROJECT_CONTEXT_EXPORT.json");
const MAINTAINER = {
  name: "Vikas Bendha",
  website: "https://vikasbendha.com",
  about_url: "https://vikasbendha.com/about-us/",
  summary:
    "Public site copy describes Vikas Bendha as a full-stack developer focused on intuitive websites, smart AI automations, effective digital strategies, and end-to-end tech partnership from strategy to launch and beyond.",
};

function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function exec(command) {
  try {
    return childProcess.execSync(command, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, sortObjectKeys(value[key])]),
  );
}

function toMarkdownTable(rows, headers) {
  const head = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`);
  return [head, divider, ...body].join("\n");
}

function formatCode(value) {
  return `\`${String(value || "").replace(/`/g, "\\`")}\``;
}

function parseEnvExample(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  let currentSection = "General";
  let pendingComments = [];
  let previousLineBlank = true;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      pendingComments = [];
      previousLineBlank = true;
      continue;
    }

    if (trimmed.startsWith("#")) {
      const comment = trimmed.replace(/^#\s?/, "").trim();
      const nextTrimmed = (lines[index + 1] || "").trim();
      if (
        previousLineBlank &&
        comment &&
        nextTrimmed &&
        (nextTrimmed.startsWith("#") || /^[A-Z0-9_]+=/.test(nextTrimmed))
      ) {
        currentSection = comment.replace(/:$/, "");
      }
      if (comment) {
        pendingComments.push(comment);
      }
      previousLineBlank = false;
      continue;
    }

    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      entries.push({
        section: currentSection,
        key: match[1],
        example: match[2],
        comments: [...pendingComments],
      });
    }
    pendingComments = [];
    previousLineBlank = false;
  }

  return entries;
}

function parseLazyImports(text) {
  const imports = {};
  const pattern = /const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\('([^']+)'\)\);/g;
  let match;
  while ((match = pattern.exec(text))) {
    imports[match[1]] = match[2];
  }
  return imports;
}

function parseFrontendRoutes(text) {
  const routes = [];
  const lazyImports = parseLazyImports(text);

  for (const line of text.split(/\r?\n/)) {
    const pathMatch = line.match(/<Route\s+path="([^"]+)"/);
    if (!pathMatch) continue;

    const pathName = pathMatch[1];
    const components = Array.from(line.matchAll(/<([A-Z][A-Za-z0-9_]*)\s*\/>/g)).map((match) => match[1]);
    const targetComponent = components.length > 0 ? components[components.length - 1] : null;
    let access = "public";
    if (line.includes("ProtectedRoute adminOnly")) access = "admin";
    else if (line.includes("ProtectedRoute")) access = "authenticated";

    routes.push({
      path: pathName,
      access,
      component: targetComponent,
      source: targetComponent ? lazyImports[targetComponent] || null : null,
      redirects: line.includes("<Navigate"),
    });
  }

  return routes;
}

function humanizeDynamicRoute(regexLiteral) {
  let route = String(regexLiteral || "")
    .replace(/^\/\^/, "")
    .replace(/\$\/$/, "")
    .replace(/\\\//g, "/");
  let paramIndex = 1;
  while (route.includes("([^/]+)")) {
    route = route.replace("([^/]+)", `:param${paramIndex}`);
    paramIndex += 1;
  }
  return route;
}

function parseApiRoutes(text) {
  const exactRoutes = [];
  const dynamicPatterns = {};
  const dynamicRoutes = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const exactMatch = line.match(
      /if \(method === "([A-Z]+)" && routePath === "([^"]+)"\) return h\.(\w+)\(/,
    );
    if (exactMatch) {
      exactRoutes.push({
        method: exactMatch[1],
        path: exactMatch[2],
        handler: exactMatch[3],
      });
      continue;
    }

    const patternMatch = line.match(/const (\w+) = routePath\.match\((\/\^.*\$\/)\);/);
    if (patternMatch) {
      dynamicPatterns[patternMatch[1]] = patternMatch[2];
      continue;
    }

    const dynamicMatch = line.match(/if \(method === "([A-Z]+)" && (\w+)\) return h\.(\w+)\(/);
    if (dynamicMatch && dynamicPatterns[dynamicMatch[2]]) {
      dynamicRoutes.push({
        method: dynamicMatch[1],
        route_key: dynamicMatch[2],
        regex: dynamicPatterns[dynamicMatch[2]],
        path: humanizeDynamicRoute(dynamicPatterns[dynamicMatch[2]]),
        handler: dynamicMatch[3],
      });
    }
  }

  const groupByPrefix = (items) => {
    const grouped = {};
    for (const item of items) {
      const firstSegment = item.path.split("/").filter(Boolean)[0] || "root";
      if (!grouped[firstSegment]) grouped[firstSegment] = [];
      grouped[firstSegment].push(item);
    }
    return sortObjectKeys(grouped);
  };

  return {
    exact: exactRoutes,
    dynamic: dynamicRoutes,
    exact_by_prefix: groupByPrefix(exactRoutes),
    dynamic_by_prefix: groupByPrefix(dynamicRoutes),
  };
}

function parseCollections(schemaText) {
  const collectionMatches = Array.from(schemaText.matchAll(/where collection = '([^']+)'/g)).map((match) => match[1]);
  return unique(collectionMatches).sort((left, right) => left.localeCompare(right));
}

function parseSupportedLanguages(text) {
  const match = text.match(/SUPPORTED_LANGUAGE_CODES\s*=\s*\[([^\]]+)\]/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((item) => item.replace(/['"\s]/g, ""))
    .filter(Boolean);
}

function getRootEntries() {
  return fs
    .readdirSync(REPO_ROOT, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith(".git") && entry.name !== "node_modules")
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildKeyFiles() {
  return [
    {
      path: "README.md",
      purpose: "Deployment and main operator runbook for Vercel, domains, and env configuration.",
    },
    {
      path: "pages/[[...slug]].jsx",
      purpose: "Next.js catch-all page that mounts the React SPA and injects SSR SEO metadata.",
    },
    {
      path: "frontend/src/App.js",
      purpose: "Client app shell, React Router route map, providers, auth context, and shared config loading.",
    },
    {
      path: "pages/api/[...path].js",
      purpose: "Catch-all Next.js API entrypoint.",
    },
    {
      path: "lib/api/router.js",
      purpose: "Route dispatcher that maps API paths and methods to handlers.",
    },
    {
      path: "lib/api-handler.js",
      purpose: "Main backend business logic for auth, PDFs, links, billing, domains, team workspaces, and admin features.",
    },
    {
      path: "lib/store.js",
      purpose: "Supabase Postgres-backed document store abstraction built on app_documents/app_files.",
    },
    {
      path: "db/supabase_schema.sql",
      purpose: "Schema and indexes for app_documents/app_files plus JSONB collection indexes.",
    },
    {
      path: "frontend/src/contexts/LanguageContext.jsx",
      purpose: "Runtime language resolution, translation overrides, and localization bootstrapping.",
    },
    {
      path: "frontend/src/components/DashboardLayout.jsx",
      purpose: "Shared authenticated layout, sidebar navigation, workspace switching, and account footer.",
    },
    {
      path: "frontend/src/pages/SecureViewer.jsx",
      purpose: "Secure PDF viewing surface with anti-copy deterrence, watermarking, NDA, focus lock, and timers.",
    },
    {
      path: "frontend/src/pages/PDFManagement.jsx",
      purpose: "Primary workspace for PDFs, folders, links, bulk actions, and secure-link editing.",
    },
    {
      path: "frontend/src/pages/AdminDashboard.jsx",
      purpose: "Admin reporting dashboard including revenue, subscription, refund, and usage drilldowns.",
    },
    {
      path: "frontend/src/pages/AdminSettings.jsx",
      purpose: "Platform control surface wrapping grouped settings tabs.",
    },
    {
      path: "frontend/src/components/admin-settings/AdminSettingsTabs.jsx",
      purpose: "Extracted admin settings tab UI bodies.",
    },
    {
      path: "frontend/src/pages/Settings.jsx",
      purpose: "User account settings wrapper including billing, security, link defaults, domains, and team access.",
    },
    {
      path: "frontend/src/components/settings/SettingsTabs.jsx",
      purpose: "Extracted end-user settings tab UI bodies.",
    },
    {
      path: "scripts/db/migrate.cjs",
      purpose: "Applies Supabase/Postgres schema migrations.",
    },
    {
      path: "scripts/db/seed.cjs",
      purpose: "Seeds admin/sample users and starter platform data.",
    },
    {
      path: "scripts/vercel/build.cjs",
      purpose: "Vercel production build wrapper that can run DB migrations before next build.",
    },
  ];
}

function buildCapabilitySections() {
  return [
    {
      name: "Authentication and Identity",
      items: [
        "Email/password auth",
        "Google login and signup through Supabase OAuth",
        "Email verification and password reset",
        "Verified email change flow",
        "Admin and super admin two-factor authentication (QR plus TOTP)",
        "Role model: user, admin, super_admin",
      ],
    },
    {
      name: "Secure PDF and Link Controls",
      items: [
        "PDF upload and storage",
        "Secure link generation with countdown, fixed date, and manual revoke modes",
        "Direct access tokens for non-secure PDF viewing when enabled",
        "Focus lock, idle timeout, fullscreen requirement, NDA gate, single-viewer session lock",
        "Watermark modes: basic details, custom text, uploaded logo",
        "IP allowlist, first-IP lock, country allow/block restrictions",
        "Expired page customization and manual link revocation",
      ],
    },
    {
      name: "Storage and Delivery",
      items: [
        "Supabase Postgres-backed app_files storage provider",
        "Wasabi S3-compatible storage provider",
        "Admin storage settings with migration jobs and operations health",
        "Same-origin /api deployment model on Vercel",
      ],
    },
    {
      name: "Billing, Plans, and Revenue",
      items: [
        "Stripe subscriptions and checkout",
        "Admin-managed plans with public visibility toggles and direct plan links",
        "Billing portal support",
        "Admin refund workflow with full and partial refund support",
        "Admin revenue, subscription, and refund reporting with date-range filters",
        "Invoice template customization and PDF invoice generation",
      ],
    },
    {
      name: "Localization and Content",
      items: [
        "Supported languages: English, Spanish, French, German, Italian, Hindi, Slovenian",
        "Platform default language plus per-user override",
        "Admin manual translation manager with string overrides and advanced JSON editing",
        "Editable branding, SEO, public-site, and auth email content from admin settings",
      ],
    },
    {
      name: "Custom Domains and White Label",
      items: [
        "User custom domains for secure and direct PDF links",
        "DNS verification with TXT, CNAME, and apex A-record support",
        "Optional Vercel API automation for domain attach and verification",
        "SSL state tracking and enforcement before domain use",
      ],
    },
    {
      name: "Team Workspaces and Auditing",
      items: [
        "Owner/admin/member workspace roles for customer accounts",
        "Team invitations with accept and decline flows",
        "Workspace switching in the authenticated UI",
        "Audit events for platform settings, PDFs, links, folders, billing, and team actions",
        "Settings permissions, settings history, and background jobs for admin operations",
      ],
    },
  ];
}

function buildKnownConstraints() {
  return [
    "The active runtime is the root Next.js app. The historical backend/ directory may still exist in the repo, but the production deployment path is pages/ plus frontend/src/.",
    "The app is a React SPA mounted inside a Next.js catch-all page, not a pure App Router Next.js app.",
    "Screenshot prevention is deterrence-only. Browser code can increase friction, but cannot reliably block OS-level screenshots.",
    "Countdown links are per public IP. Browsers or devices sharing the same public IP share the same countdown state for that link.",
    "Billing and subscriptions are owner-account based. Team members act inside the owner's workspace but do not have separate subscription billing.",
    "The document store uses JSONB collections inside public.app_documents, so schema evolution is mostly application-level rather than table-per-entity.",
    "NEXT_PUBLIC_BACKEND_URL is usually left empty on Vercel so the frontend uses same-origin /api. Setting it to another host can cause custom-domain or CORS issues.",
    "Build-time DB migration is enabled by default on Vercel production builds through scripts/vercel/build.cjs. Local builds do not run DB migrations unless asked explicitly.",
  ];
}

function buildOperationalChecklist() {
  return [
    "Copy .env.example values into Vercel or local env files. Do not store real secrets in the context export.",
    "Run npm install before local development.",
    "Run npm run db:migrate when schema/index changes land.",
    "Use npm run db:seed only when you intentionally want seed data.",
    "Use npm run build before pushing structural changes.",
    "Use npm run context:export after major changes to routes, env vars, schema, admin controls, storage, billing, or security flows.",
    "Commit docs/PROJECT_CONTEXT_EXPORT.md and docs/PROJECT_CONTEXT_EXPORT.json with the related code changes so another Codex instance gets an accurate snapshot.",
  ];
}

function buildOfflineBootstrapPrompt() {
  return [
    "Read docs/PROJECT_CONTEXT_EXPORT.md first for the full system map.",
    "Treat README.md as the operator deployment runbook.",
    "Start backend orientation from lib/api/router.js, then lib/api-handler.js, then lib/store.js.",
    "Start frontend orientation from pages/[[...slug]].jsx, then frontend/src/App.js, then DashboardLayout, Settings, AdminSettings, PDFManagement, and SecureViewer.",
    "Assume the live app is deployed as a single Vercel project using same-origin /api.",
    "Do not assume the legacy backend/ folder is the active runtime unless the code explicitly references it.",
    "Regenerate the context export before handoff if you change routes, env vars, schema, auth, billing, security, storage, translations, or team-workspace behavior.",
  ];
}

function buildProjectSummary(packageJson, supportedLanguages) {
  return {
    name: packageJson.name,
    version: packageJson.version,
    maintainer: MAINTAINER,
    deployment_model: "Single Vercel project using Next.js pages plus a client-side React SPA mounted at the catch-all route.",
    active_runtime: "Next.js at repository root",
    legacy_areas: ["frontend/ (source assets and legacy CRA-era structure reused by the Next app)", "backend/ (historical Python-era area, not the primary runtime)"],
    supported_languages: supportedLanguages,
    primary_storage_modes: ["supabase_db", "wasabi_s3"],
    email_delivery_modes: ["supabase", "gmail", "mailgun", "outlook", "smtp", "resend"],
    team_roles: ["owner", "admin", "member"],
    user_roles: ["user", "admin", "super_admin"],
  };
}

function buildContextData() {
  const packageJson = readJson("package.json");
  const envExample = readText(".env.example");
  const routerSource = readText("lib/api/router.js");
  const appSource = readText("frontend/src/App.js");
  const readme = readText("README.md");
  const prd = readText("memory/PRD.md");
  const nextConfig = readText("next.config.js");
  const schema = readText("db/supabase_schema.sql");
  const translationOverrides = readText("frontend/src/i18n/translation-overrides.js");

  const supportedLanguages = parseSupportedLanguages(translationOverrides);
  const frontendRoutes = parseFrontendRoutes(appSource);
  const apiRoutes = parseApiRoutes(routerSource);
  const envVars = parseEnvExample(envExample);
  const collections = parseCollections(schema);

  const generatedAt = new Date().toISOString();
  const gitCommit = exec("git rev-parse HEAD");
  const gitShortCommit = exec("git rev-parse --short HEAD");
  const gitBranch = exec("git branch --show-current");
  const gitStatus = exec("git status --short");

  const projectSummary = buildProjectSummary(packageJson, supportedLanguages);
  const rootEntries = getRootEntries();
  const capabilitySections = buildCapabilitySections();
  const knownConstraints = buildKnownConstraints();
  const operationalChecklist = buildOperationalChecklist();
  const keyFiles = buildKeyFiles();
  const offlineBootstrap = buildOfflineBootstrapPrompt();

  return {
    generated_at: generatedAt,
    generator: "scripts/context/export.cjs",
    repository: {
      root: REPO_ROOT,
      branch: gitBranch || null,
      commit: gitCommit || null,
      short_commit: gitShortCommit || null,
      clean_worktree: gitStatus === "",
      git_status_short: gitStatus ? gitStatus.split("\n") : [],
    },
    project_summary: projectSummary,
    architecture: {
      next_config_summary: "React SPA is mounted through pages/[[...slug]].jsx with same-origin API rewrites for /direct/:token.",
      readme_summary: readme.split(/\r?\n/).slice(0, 40),
      prd_note:
        "memory/PRD.md is historically useful but partially outdated. It still references the earlier FastAPI/Mongo architecture and should be treated as product history, not the active runtime design.",
      next_config_excerpt: nextConfig.split(/\r?\n/),
      top_level_entries: rootEntries,
      key_files: keyFiles,
    },
    commands: {
      npm_scripts: packageJson.scripts,
      notable_commands: [
        "npm install",
        "npm run dev",
        "npm run build",
        "npm run db:migrate",
        "npm run db:seed",
        "npm run i18n:validate",
        "npm run context:export",
      ],
    },
    environment: {
      source: ".env.example",
      entries: envVars,
      note: "This export includes placeholders and examples only. Real secrets must stay in local env files or Vercel/Supabase settings.",
    },
    frontend: {
      route_count: frontendRoutes.length,
      routes: frontendRoutes,
    },
    api: {
      exact_route_count: apiRoutes.exact.length,
      dynamic_route_count: apiRoutes.dynamic.length,
      exact_routes: apiRoutes.exact,
      dynamic_routes: apiRoutes.dynamic,
      exact_routes_by_prefix: apiRoutes.exact_by_prefix,
      dynamic_routes_by_prefix: apiRoutes.dynamic_by_prefix,
    },
    data_model: {
      primary_pattern: "Document collections stored in public.app_documents (jsonb) plus binary payloads in public.app_files.",
      collections,
      schema_file: "db/supabase_schema.sql",
      store_file: "lib/store.js",
    },
    capabilities: capabilitySections,
    operational_notes: operationalChecklist,
    known_constraints: knownConstraints,
    offline_codex_bootstrap: offlineBootstrap,
  };
}

function buildMarkdown(context) {
  const envTable = toMarkdownTable(
    context.environment.entries.map((entry) => [
      entry.section,
      formatCode(entry.key),
      formatCode(entry.example || ""),
      entry.comments.length > 0 ? entry.comments.join("<br>") : "",
    ]),
    ["Section", "Variable", "Example", "Notes"],
  );

  const routeTable = toMarkdownTable(
    context.frontend.routes.map((route) => [
      formatCode(route.path),
      route.access,
      route.component || "",
      route.source ? formatCode(route.source) : "",
    ]),
    ["Path", "Access", "Component", "Source"],
  );

  const exactApiLines = Object.entries(context.api.exact_routes_by_prefix)
    .map(([prefix, items]) => {
      const rows = items.map((item) => `- ${formatCode(`${item.method} ${item.path}`)} -> ${formatCode(item.handler)}`);
      return `#### ${prefix}\n${rows.join("\n")}`;
    })
    .join("\n\n");

  const dynamicApiLines = Object.entries(context.api.dynamic_routes_by_prefix)
    .map(([prefix, items]) => {
      const rows = items.map(
        (item) =>
          `- ${formatCode(`${item.method} ${item.path}`)} -> ${formatCode(item.handler)} (regex: ${formatCode(item.regex)})`,
      );
      return `#### ${prefix}\n${rows.join("\n")}`;
    })
    .join("\n\n");

  const capabilityBlocks = context.capabilities
    .map(
      (section) =>
        `### ${section.name}\n${section.items.map((item) => `- ${item}`).join("\n")}`,
    )
    .join("\n\n");

  const keyFileTable = toMarkdownTable(
    context.architecture.key_files.map((file) => [formatCode(file.path), file.purpose]),
    ["File", "Purpose"],
  );

  return `# PROJECT_CONTEXT_EXPORT

Generated by ${formatCode(context.generator)} on ${formatCode(context.generated_at)}.

This file is the primary human-readable handoff pack for another Codex instance or offline emergency workstation. It is intended to reduce cold-start time, explain the active architecture, and point directly to the files that matter. The machine-readable companion lives at ${formatCode("docs/PROJECT_CONTEXT_EXPORT.json")}.

## 1. Project Snapshot

- Repository root: ${formatCode(context.repository.root)}
- Branch: ${formatCode(context.repository.branch || "unknown")}
- Commit: ${formatCode(context.repository.short_commit || context.repository.commit || "unknown")}
- Clean worktree at export time: ${context.repository.clean_worktree ? "Yes" : "No"}
- Active runtime: ${context.project_summary.active_runtime}
- Deployment model: ${context.project_summary.deployment_model}
- Supported languages: ${context.project_summary.supported_languages.map((item) => formatCode(item)).join(", ")}
- Storage providers: ${context.project_summary.primary_storage_modes.map((item) => formatCode(item)).join(", ")}
- Email providers: ${context.project_summary.email_delivery_modes.map((item) => formatCode(item)).join(", ")}
- Team roles: ${context.project_summary.team_roles.map((item) => formatCode(item)).join(", ")}
- User roles: ${context.project_summary.user_roles.map((item) => formatCode(item)).join(", ")}

## 2. Project Steward and Maintainer

- Maintainer: ${context.project_summary.maintainer.name}
- Website: ${context.project_summary.maintainer.website}
- About page: ${context.project_summary.maintainer.about_url}
- Summary: ${context.project_summary.maintainer.summary}

## 3. Architecture and Runtime Model

- The active app is a **single Next.js deployment at repo root**.
- ${formatCode("pages/[[...slug]].jsx")} mounts the client-side React app from ${formatCode("frontend/src/App.js")} and injects SSR SEO metadata.
- ${formatCode("pages/api/[...path].js")} and ${formatCode("pages/api/index.js")} expose the API.
- ${formatCode("lib/api/router.js")} dispatches route paths and methods to handlers inside ${formatCode("lib/api-handler.js")}.
- ${formatCode("lib/store.js")} provides a JSON document store on top of Supabase Postgres tables ${formatCode("public.app_documents")} and ${formatCode("public.app_files")}.
- ${formatCode("db/supabase_schema.sql")} is the authoritative schema and index reference.
- ${formatCode("frontend/src")} contains the UI source even though the app is served by Next.js at the repository root.
- The ${formatCode("backend/")} directory is historical. It should not be treated as the primary runtime unless current code explicitly references it.

### Key Files

${keyFileTable}

## 4. Core Capabilities

${capabilityBlocks}

## 5. Commands and Local Workflow

### npm scripts

${Object.entries(context.commands.npm_scripts)
  .map(([name, command]) => `- ${formatCode(name)} -> ${formatCode(command)}`)
  .join("\n")}

### Standard command set

${context.commands.notable_commands.map((command) => `- ${formatCode(command)}`).join("\n")}

## 6. Environment Variables

The export only includes placeholders from ${formatCode(".env.example")}. Real secrets are intentionally excluded.

${envTable}

## 7. Frontend Route Inventory

${routeTable}

## 8. API Route Inventory

### Exact routes

${exactApiLines}

### Dynamic routes

${dynamicApiLines}

## 9. Data Model

- Primary persistence pattern: ${context.data_model.primary_pattern}
- Schema file: ${formatCode(context.data_model.schema_file)}
- Store implementation: ${formatCode(context.data_model.store_file)}

### Collections present in schema/index definitions

${context.data_model.collections.map((collection) => `- ${formatCode(collection)}`).join("\n")}

## 10. Operational Notes

${context.operational_notes.map((item) => `- ${item}`).join("\n")}

## 11. Known Constraints and Design Decisions

${context.known_constraints.map((item) => `- ${item}`).join("\n")}

## 12. Offline Codex Bootstrap Checklist

${context.offline_codex_bootstrap.map((item) => `- ${item}`).join("\n")}

## 13. Historical and Source Notes

- ${formatCode("README.md")} is the current deployment and operator runbook.
- ${formatCode("memory/PRD.md")} is historically useful for product intent, but parts of it still describe the earlier FastAPI/Mongo era. Use it for background, not as the current architecture source of truth.
- The machine-readable companion file is ${formatCode("docs/PROJECT_CONTEXT_EXPORT.json")}.
- Maintainer source pages: ${context.project_summary.maintainer.website} and ${context.project_summary.maintainer.about_url}

## 14. Regeneration Contract

Run ${formatCode("npm run context:export")} and commit both export files whenever any of the following change:

- API routes
- frontend routes
- env vars or integration settings
- DB schema or collections
- auth or billing flows
- secure link rules
- storage providers or migration logic
- localization model
- team/workspace behavior
- admin settings structure

This keeps the git-tracked emergency handoff current for another offline Codex instance.
`;
}

function main() {
  const context = buildContextData();
  const markdown = buildMarkdown(context);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(sortObjectKeys(context), null, 2)}\n`, "utf8");
  fs.writeFileSync(OUTPUT_MD, `${markdown}\n`, "utf8");
  process.stdout.write(
    `Context export written to ${path.relative(REPO_ROOT, OUTPUT_MD)} and ${path.relative(REPO_ROOT, OUTPUT_JSON)}\n`,
  );
}

main();
