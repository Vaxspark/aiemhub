#!/usr/bin/env node

import { main } from "./index.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import * as net from "net";

const AIEM_HOME = process.env.AIEM_HOME || path.join(os.homedir(), ".aiem");
const PID_FILE = path.join(AIEM_HOME, "aiem.pid");
const LOG_FILE = path.join(AIEM_HOME, "aiem.log");

const args = process.argv.slice(2);
const subcommand = args.find((a) => !a.startsWith("-")) || "";

// Parse CLI arguments (skip subcommand)
const flags: Record<string, string | boolean> = {};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (["start", "stop", "status"].includes(arg)) continue;
  if (arg === "--help" || arg === "-h") {
    flags.help = true;
  } else if (arg === "--version" || arg === "-v") {
    flags.version = true;
  } else if (arg.startsWith("--")) {
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("-")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
}

// --- version ---
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

// --- help ---
if (flags.help) {
  console.log(`
  aiemhub — AI Extension Manager (Web UI)

  Usage:
    aiem [command] [options]

  Commands:
    (none)          Start in foreground (Ctrl+C to stop)
    start           Start as background daemon
    stop            Stop the background daemon
    status          Check if the daemon is running

  Options:
    --host <host>     Host to bind (default: 127.0.0.1)
    --port <port>     Port to listen on (default: 8787)
    --open            Open browser on start
    --help, -h        Show this help message
    --version, -v     Show version

  Environment Variables:
    AIEM_HOME         Data directory (default: ~/.aiem)
    AIEM_HOST         Override default host
    AIEM_PORT         Override default port
    AIEM_OPEN_BROWSER Set to "1" or "true" to open browser

  Examples:
    aiem                      Start in foreground on port 8787
    aiem start                Start as background daemon
    aiem start --port 3000    Start on port 3000 in background
    aiem stop                 Stop the daemon
    aiem status               Check daemon status
    aiem --open               Start in foreground and open browser
  `);
  process.exit(0);
}

// --- helper: read PID file ---
function readPid(): number | null {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

// --- helper: check if process is alive ---
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// --- helper: check if port is in use ---
function isPortInUse(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host }, () => {
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
    sock.setTimeout(2000, () => { sock.destroy(); resolve(false); });
  });
}

// --- stop ---
if (subcommand === "stop") {
  const pid = readPid();
  if (!pid) {
    console.log("aiem is not running (no PID file).");
    process.exit(0);
  }
  if (!isAlive(pid)) {
    console.log(`aiem is not running (stale PID ${pid}). Cleaning up.`);
    try { fs.unlinkSync(PID_FILE); } catch {}
    process.exit(0);
  }
  try {
    process.kill(pid, "SIGTERM");
    // Wait briefly for exit
    for (let i = 0; i < 20; i++) {
      if (!isAlive(pid)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (isAlive(pid)) {
      process.kill(pid, "SIGKILL");
    }
    try { fs.unlinkSync(PID_FILE); } catch {}
    console.log(`aiem stopped (PID ${pid}).`);
  } catch (err: any) {
    console.error(`Failed to stop aiem: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

// --- status ---
if (subcommand === "status") {
  const pid = readPid();
  if (!pid) {
    console.log("aiem is not running.");
    process.exit(0);
  }
  if (!isAlive(pid)) {
    console.log(`aiem is not running (stale PID ${pid}).`);
    try { fs.unlinkSync(PID_FILE); } catch {}
    process.exit(0);
  }
  const host = process.env.AIEM_HOST || "127.0.0.1";
  const port = parseInt(process.env.AIEM_PORT || "8787", 10);
  console.log(`aiem is running (PID ${pid}) on http://${host}:${port}`);
  process.exit(0);
}

// --- start (daemon) ---
if (subcommand === "start") {
  // Check if already running
  const existingPid = readPid();
  if (existingPid && isAlive(existingPid)) {
    console.log(`aiem is already running (PID ${existingPid}).`);
    process.exit(0);
  }

  // Ensure data directory exists
  fs.mkdirSync(AIEM_HOME, { recursive: true });

  // Build args for the child process
  const childArgs: string[] = [];
  if (flags.host && typeof flags.host === "string") childArgs.push("--host", flags.host);
  if (flags.port && typeof flags.port === "string") childArgs.push("--port", flags.port);
  if (flags.open) childArgs.push("--open");

  // Resolve the path to this same script so the child runs `cli.js` (foreground mode)
  const { fileURLToPath: f2p } = await import("url");
  const selfPath = f2p(import.meta.url);

  const logFd = fs.openSync(LOG_FILE, "a");
  const child = spawn(process.execPath, [selfPath, ...childArgs], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env },
  });

  if (!child.pid) {
    console.error("Failed to start daemon.");
    process.exit(1);
  }

  child.unref();

  // Write PID
  fs.writeFileSync(PID_FILE, String(child.pid), "utf-8");

  // Wait briefly to check it didn't crash immediately
  await new Promise((r) => setTimeout(r, 600));
  if (!isAlive(child.pid)) {
    try { fs.unlinkSync(PID_FILE); } catch {}
    console.error("aiem failed to start. Check log:");
    try {
      const log = fs.readFileSync(LOG_FILE, "utf-8");
      const lines = log.trim().split("\n");
      console.error(lines.slice(-10).join("\n"));
    } catch {}
    process.exit(1);
  }

  const host = (typeof flags.host === "string" ? flags.host : process.env.AIEM_HOST) || "127.0.0.1";
  const port = (typeof flags.port === "string" ? flags.port : process.env.AIEM_PORT) || "8787";
  console.log(`aiem started (PID ${child.pid}).`);
  console.log(`  URL: http://${host}:${port}`);
  console.log(`  Log: ${LOG_FILE}`);
  console.log(`  Stop: aiem stop`);
  process.exit(0);
}

// --- foreground (default, no subcommand) ---
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
