#!/usr/bin/env node

import { main } from "./index.js";

const args = process.argv.slice(2);

// Parse CLI arguments
const flags: Record<string, string | boolean> = {};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--help" || arg === "-h") {
    flags.help = true;
  } else if (arg === "--version" || arg === "-v") {
    flags.version = true;
  } else if (arg.startsWith("--")) {
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
}

if (flags.version) {
  const { readFileSync } = await import("fs");
  const { join, dirname } = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
    console.log(`aiemhub v${pkg.version}`);
  } catch {
    console.log("aiemhub v0.1.0");
  }
  process.exit(0);
}

if (flags.help) {
  console.log(`
  aiemhub — AI Extension Manager (Web UI)

  Usage:
    aiem [options]

  Options:
    --host <host>     Host to bind (default: 127.0.0.1)
    --port <port>     Port to listen on (default: 8787)
    --open            Open browser on start
    --help, -h        Show this help message
    --version, -v     Show version

  Environment Variables:
    AIEM_HOST          Override default host
    AIEM_PORT          Override default port
    AIEM_OPEN_BROWSER  Set to "1" or "true" to open browser

  Examples:
    aiem                     Start on default port 8787
    aiem --port 3000         Start on port 3000
    aiem --host 0.0.0.0      Listen on all interfaces
    aiem --open              Start and open browser
  `);
  process.exit(0);
}

// Apply CLI flags to env vars
if (flags.host && typeof flags.host === "string") {
  process.env.AIEM_HOST = flags.host;
}
if (flags.port && typeof flags.port === "string") {
  process.env.AIEM_PORT = flags.port;
}
if (flags.open) {
  process.env.AIEM_OPEN_BROWSER = "true";
}

await main();
