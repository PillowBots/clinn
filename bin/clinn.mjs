#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsxPath = path.join(__dirname, "..", "node_modules", "tsx", "dist", "esm", "index.mjs");

// Node 24+: register() is broken, re-exec with --import
if (!process.execArgv.some(a => a.includes("tsx"))) {
  const result = spawnSync(
    process.execPath,
    ["--import", tsxPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit" }
  );
  process.exit(result.status ?? 1);
}

// Running under tsx loader
await import(path.join(__dirname, "..", "Src", "index.jsx"));
