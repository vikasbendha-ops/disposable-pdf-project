#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const isVercel = process.env.VERCEL === "1";
const isProductionDeploy = String(process.env.VERCEL_ENV || "").toLowerCase() === "production";
const defaultMigrateOnBuild = isVercel && isProductionDeploy;
const migrateOnBuild = parseBool(process.env.RUN_DB_MIGRATIONS_ON_BUILD, defaultMigrateOnBuild);
const skipMigrate = parseBool(process.env.SKIP_DB_MIGRATE, false);

if (migrateOnBuild && !skipMigrate) {
  if (!process.env.SUPABASE_DB_URL && !process.env.DATABASE_URL) {
    console.error(
      "Build aborted: RUN_DB_MIGRATIONS_ON_BUILD is enabled but SUPABASE_DB_URL/DATABASE_URL is missing.",
    );
    process.exit(1);
  }
  console.log("Running DB migration before Next.js build...");
  runCommand(process.execPath, ["scripts/db/migrate.cjs"]);
} else {
  console.log("Skipping DB migration during build.");
}

console.log("Running Next.js build...");
runCommand("next", ["build"]);
