import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execFileSync } from "child_process";
import AdmZip from "adm-zip";
import type { McpServer, McpTransport } from "./mcp.js";
import { loadBackupConfig, loadBackupTokenFile } from "./backup.js";
import * as paths from "./paths.js";

const DEFAULT_TARGETS = ["claude-code", "codex", "cursor", "vscode", "windsurf", "trae", "qoder", "kiro"];

function githubApiBase(): string {
  return (process.env.GITHUB_API_MIRROR || "https://api.github.com").replace(/\/+$/, "");
}

function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN || loadBackupTokenFile() || "";
  const h: Record<string, string> = { "User-Agent": "aiemhub", Accept: "application/vnd.github+json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export async function resolveRef(owner: string, repo: string, ref?: string): Promise<{ ref: string; sha: string }> {
  const api = githubApiBase();
  const headers = githubHeaders();
  let branch = ref || "main";
  if (!ref) {
    try {
      const resp = await fetch(`${api}/repos/${owner}/${repo}`, { headers });
      if (resp.ok) {
        const data = (await resp.json()) as any;
        branch = data.default_branch || "main";
      }
    } catch {}
  }
  try {
    const resp = await fetch(`${api}/repos/${owner}/${repo}/commits/${branch}`, { headers });
    if (resp.ok) {
      const data = (await resp.json()) as any;
      return { ref: branch, sha: data.sha };
    }
  } catch {}
  return { ref: branch, sha: branch };
}

function buildZipUrls(owner: string, repo: string, ref: string): string[] {
  const codeload = `https://codeload.github.com/${owner}/${repo}/zip/${ref}`;
  const gh = `https://github.com/${owner}/${repo}/archive/${ref}.zip`;
  const apiZip = `${githubApiBase()}/repos/${owner}/${repo}/zipball/${encodeURIComponent(ref)}`;
  const urls = [codeload, apiZip];
  const mirror = process.env.GITHUB_MIRROR;
  if (mirror) {
    for (const m of mirror.split(/[,;]/)) {
      const base = m.trim().replace(/\/+$/, "");
      if (!base) continue;
      if (base.includes("codeload.github.com")) urls.push(`${base}/${owner}/${repo}/zip/${ref}`);
      else { urls.push(`${base}/${codeload}`); urls.push(`${base}/${gh}`); }
    }
  }
  urls.push(gh);
  return [...new Set(urls)];
}

export async function downloadZip(owner: string, repo: string, ref: string): Promise<Buffer> {
  const urls = buildZipUrls(owner, repo, ref);
  const headers = githubHeaders();
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) { errors.push(`${url}: HTTP ${resp.status}`); continue; }
      const buf = Buffer.from(await resp.arrayBuffer());
      try { new AdmZip(buf); return buf; } catch (e: any) { errors.push(`${url}: invalid zip: ${e.message}`); }
    } catch (e: any) { errors.push(`${url}: ${e.message}`); }
  }
  try {
    return cloneRepoAsZip(owner, repo, ref);
  } catch (e: any) {
    errors.push(`git clone fallback: ${redactSecrets(e.message || String(e))}`);
  }
  throw new Error(`Failed to download zip after ${urls.length} URL attempts and git fallback: ${errors.join("; ")}`);
}

function cloneRepoAsZip(owner: string, repo: string, ref: string): Buffer {
  const tempDir = makeTempDir("github-clone");
  const cloneDir = path.join(tempDir, "repo");
  const gitUrl = buildGitUrl(owner, repo);
  try {
    try {
      runGit(["clone", "--depth", "1", "--single-branch", "--branch", ref, gitUrl, cloneDir], tempDir);
    } catch {
      runGit(["clone", "--depth", "1", gitUrl, cloneDir], tempDir);
      if (ref && ref !== "HEAD") {
        try { runGit(["checkout", ref], cloneDir); }
        catch (e) { if (ref !== "main") throw e; }
      }
    }
    const zip = new AdmZip();
    addDirToZip(zip, cloneDir, `${repo}-${ref.replace(/[^a-zA-Z0-9._-]+/g, "-")}`);
    return zip.toBuffer();
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

function buildGitUrl(owner: string, repo: string): string {
  const token = process.env.GITHUB_TOKEN || loadBackupTokenFile() || "";
  const cleanRepo = repo.replace(/\.git$/, "");
  if (!token) return `https://github.com/${owner}/${cleanRepo}.git`;
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${owner}/${cleanRepo}.git`;
}

function runGit(args: string[], cwd: string): void {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  const proxy = loadBackupConfig().http_proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (proxy) {
    env.HTTPS_PROXY = proxy;
    env.HTTP_PROXY = proxy;
    env.https_proxy = proxy;
    env.http_proxy = proxy;
  }
  try {
    execFileSync("git", ["-c", "credential.helper=", ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"], timeout: 180_000 });
  } catch (e: any) {
    const first = gitErrorText(e);
    if (/schannel|AcquireCredentialsHandle|SEC_E_NO_CREDENTIALS/i.test(first)) {
      try {
        execFileSync("git", ["-c", "credential.helper=", "-c", "http.sslBackend=openssl", ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"], timeout: 180_000 });
        return;
      } catch (retry: any) {
        throw new Error(redactSecrets(`${first}; openssl retry: ${gitErrorText(retry)}`));
      }
    }
    throw new Error(redactSecrets(first));
  }
}

function gitErrorText(e: any): string {
  const stderr = e?.stderr ? e.stderr.toString("utf-8").trim() : "";
  const stdout = e?.stdout ? e.stdout.toString("utf-8").trim() : "";
  return stderr || stdout || e?.message || "git failed";
}

function addDirToZip(zip: AdmZip, dir: string, prefix: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    const zipPath = `${prefix}/${entry.name}`.replace(/\\/g, "/");
    if (entry.isDirectory()) addDirToZip(zip, full, zipPath);
    else if (entry.isFile()) zip.addFile(zipPath, fs.readFileSync(full));
  }
}

function redactSecrets(input: string): string {
  const token = process.env.GITHUB_TOKEN || loadBackupTokenFile() || "";
  return token ? input.replaceAll(token, "***") : input;
}

export function extractZip(buf: Buffer, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  const zip = new AdmZip(buf);
  zip.extractAllTo(destDir, true);
}

export function findSingleTopDir(dir: string): string {
  const entries = fs.readdirSync(dir).filter((e) => fs.statSync(path.join(dir, e)).isDirectory());
  return entries.length === 1 ? path.join(dir, entries[0]) : dir;
}

export function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `aiem-${prefix}-`));
}

// ─── MCP server detection ────────────────────────────────────────────────────

const MCP_CONFIG_FILES = [".mcp.json", "mcp.json", "mcp-config.json", "mcp_config.json", ".mcp/config.json"];
const MCP_GROUP_DIRS = ["mcp-servers", "mcp_servers", "mcp", "servers"];
const SKIP_SCAN_DIRS = new Set([".git", ".github", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", "target"]);

export function detectMcpServers(root: string): McpServer[] {
  const servers: McpServer[] = [];
  for (const name of MCP_CONFIG_FILES) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) {
      try { servers.push(...parseMcpJson(fs.readFileSync(p, "utf-8"))); } catch {}
    }
  }
  servers.push(...detectMcpServerDirs(root));
  if (servers.length === 0) {
    try {
      for (const entry of fs.readdirSync(root)) {
        if (!entry.endsWith(".json")) continue;
        const lower = entry.toLowerCase();
        if (lower.includes("sample") || lower.includes("example") || lower.includes("template")) continue;
        if (lower.includes("mcp") || lower.includes("server")) {
          try { servers.push(...parseMcpJson(fs.readFileSync(path.join(root, entry), "utf-8"))); } catch {}
        }
      }
    } catch {}
  }
  return dedupeServers(servers);
}

function detectMcpServerDirs(root: string): McpServer[] {
  const found = new Map<string, string>();
  const add = (dir: string) => {
    const entry = detectEntryCommand(dir);
    if (!entry.command) return;
    const rel = path.relative(root, dir).replace(/\\/g, "/") || ".";
    if (!found.has(rel)) found.set(rel, dir);
  };

  for (const group of MCP_GROUP_DIRS) {
    const dir = path.join(root, group);
    if (!isDir(dir)) continue;
    add(dir);
    for (const child of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!child.isDirectory() || SKIP_SCAN_DIRS.has(child.name)) continue;
      add(path.join(dir, child.name));
    }
  }

  if (found.size === 0) {
    const walk = (dir: string, depth: number) => {
      if (depth > 3) return;
      for (const entry of safeReadDir(dir)) {
        if (!entry.isDirectory() || SKIP_SCAN_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        const lower = entry.name.toLowerCase();
        if (lower.includes("mcp") || readmeMentionsMcp(full)) add(full);
        walk(full, depth + 1);
      }
    };
    walk(root, 0);
  }

  const servers: McpServer[] = [];
  for (const [rel, dir] of found) {
    const entry = detectEntryCommand(dir);
    if (!entry.command) continue;
    const env = detectSecretEnvHints(dir);
    const tags = ["auto-detected", "bundled"];
    if (entry.runtime) tags.push(entry.runtime);
    if (Object.keys(env).length > 0) tags.push("requires-env");
    servers.push({
      name: path.basename(dir),
      targets: DEFAULT_TARGETS,
      description: detectMcpDescription(dir),
      tags,
      disabled: false,
      auth_mode: Object.keys(env).length > 0 ? "secret-ref" : "none",
      runtime: entry.runtime,
      source: undefined,
      transport: { type: "stdio", command: entry.command, args: entry.args, env, cwd: rel },
    });
  }
  return servers;
}

interface EntryCommand {
  command: string;
  args: string[];
  runtime?: "python" | "node" | "other";
}

function detectEntryCommand(dir: string): EntryCommand {
  for (const file of ["server.py", "main.py", "mcp_server.py", "app.py", "src/server.py"]) {
    if (fs.existsSync(path.join(dir, file))) return { command: "python", args: [file.replace(/\\/g, "/")], runtime: "python" };
  }
  for (const file of ["index.js", "server.js", "main.js", "dist/index.js"]) {
    if (fs.existsSync(path.join(dir, file))) return { command: "node", args: [file.replace(/\\/g, "/")], runtime: "node" };
  }
  for (const file of ["index.ts", "server.ts", "main.ts", "src/index.ts"]) {
    if (fs.existsSync(path.join(dir, file))) return { command: "npx", args: ["tsx", file.replace(/\\/g, "/")], runtime: "node" };
  }
  const pkg = path.join(dir, "package.json");
  if (fs.existsSync(pkg)) {
    try {
      const val = JSON.parse(fs.readFileSync(pkg, "utf-8"));
      const script = val.scripts?.start ? ["run", "start"] : ["."];
      return { command: "npm", args: script, runtime: "node" };
    } catch {
      return { command: "npx", args: ["."], runtime: "node" };
    }
  }
  return { command: "", args: [] };
}

function detectSecretEnvHints(dir: string): Record<string, string> {
  const names = new Set<string>();
  const scanFile = (file: string) => {
    if (!fs.existsSync(file) || fs.statSync(file).size > 256_000) return;
    let content = "";
    try { content = fs.readFileSync(file, "utf-8"); } catch { return; }
    const patterns = [
      /(?:os\.)?environ\.get\(\s*["']([A-Z][A-Z0-9_]{2,})["']/g,
      /(?:os\.)?getenv\(\s*["']([A-Z][A-Z0-9_]{2,})["']/g,
      /(?:os\.)?environ\[\s*["']([A-Z][A-Z0-9_]{2,})["']\s*\]/g,
      /\b([A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))\b/g,
    ];
    for (const pattern of patterns) {
      for (const match of content.matchAll(pattern)) names.add(match[1]);
    }
  };
  for (const file of ["server.py", "main.py", "mcp_server.py", "app.py", "src/server.py", "README.md", ".env.example", "env.example"]) {
    scanFile(path.join(dir, file));
  }
  const env: Record<string, string> = {};
  for (const name of [...names].sort()) {
    if (!/(KEY|TOKEN|SECRET|PASSWORD)$/i.test(name)) continue;
    env[name] = "${secret:" + name + "}";
  }
  return env;
}

function detectMcpDescription(dir: string): string | undefined {
  for (const name of ["README.md", "readme.md"]) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    try {
      const lines = fs.readFileSync(file, "utf-8").split(/\r?\n/).map((l) => l.trim());
      const heading = lines.find((l) => /^#{1,3}\s+\S/.test(l));
      if (heading) return heading.replace(/^#{1,3}\s+/, "").slice(0, 180);
      const paragraph = lines.find((l) => l && !l.startsWith("```") && !l.startsWith("|"));
      if (paragraph) return paragraph.replace(/^[-*]\s+/, "").slice(0, 180);
    } catch {}
  }
  return undefined;
}

function readmeMentionsMcp(dir: string): boolean {
  for (const name of ["README.md", "readme.md"]) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    try { return fs.readFileSync(file, "utf-8").slice(0, 16_000).toLowerCase().includes("mcp"); } catch {}
  }
  return false;
}

function isDir(dir: string): boolean {
  try { return fs.statSync(dir).isDirectory(); } catch { return false; }
}

function safeReadDir(dir: string): fs.Dirent[] {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

function dedupeServers(servers: McpServer[]): McpServer[] {
  const seen = new Set<string>();
  const out: McpServer[] = [];
  for (const s of servers) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
  }
  return out;
}

function parseMcpJson(content: string): McpServer[] {
  const val = JSON.parse(content);
  if (typeof val !== "object" || val === null) return [];
  const serverMap = val.mcpServers || val.servers || val;
  if (typeof serverMap !== "object" || serverMap === null) return [];
  if (serverMap.command || serverMap.url) return [configToServer("unnamed", serverMap)];
  const servers: McpServer[] = [];
  for (const [name, cfg] of Object.entries(serverMap)) {
    if (typeof cfg !== "object" || cfg === null) continue;
    try { servers.push(configToServer(name, cfg as any)); } catch {}
  }
  return servers;
}

function normalizeCommand(command: string): string {
  const base = command.replace(/\\/g, "/");
  if (/\/python\d?(\.\d+)?$/.test(base) || /[/\\]\.?venv[/\\]/.test(base) || base.endsWith("/python")) return "python";
  if (/\/node$/.test(base)) return "node";
  if (/\/npx$/.test(base)) return "npx";
  if (/\/uv$/.test(base)) return "uv";
  if (/\/uvx$/.test(base)) return "uvx";
  return command;
}

function normalizeArgs(args: string[], command: string): string[] {
  return args.map((a) => {
    if (!a.startsWith("/") && !a.match(/^[A-Z]:\\/)) return a;
    const ext = path.extname(a).toLowerCase();
    if ([".py", ".js", ".ts", ".mjs"].includes(ext)) return path.basename(a);
    return a;
  });
}

function detectRuntime(command: string, args: string[]): "python" | "node" | "other" | undefined {
  const c = command.toLowerCase().replace(/\\/g, "/");
  if (c.includes("python") || c === "uv" || c === "uvx") return "python";
  if (c.includes("node") || c === "npx" || c === "tsx" || c === "ts-node") return "node";
  const hasExt = (ext: string) => args.some((a) => a.endsWith(ext));
  if (hasExt(".py")) return "python";
  if (hasExt(".js") || hasExt(".ts") || hasExt(".mjs")) return "node";
  return undefined;
}

function configToServer(name: string, cfg: any): McpServer {
  let transport: McpTransport;
  let runtime: "python" | "node" | "other" | undefined;
  if (cfg.command) {
    const cmd = normalizeCommand(cfg.command);
    const args = normalizeArgs(cfg.args || [], cmd);
    runtime = detectRuntime(cmd, args);
    transport = {
      type: "stdio", command: cmd,
      args, env: cfg.env || {},
      cwd: cfg.cwd, bundle: cfg.bundle || undefined,
    };
  } else if (cfg.url) {
    transport = cfg.type === "http"
      ? { type: "http", url: cfg.url, headers: cfg.headers || {} }
      : { type: "sse", url: cfg.url, headers: cfg.headers || {} };
  } else {
    throw new Error(`${name}: need 'command' or 'url'`);
  }
  return {
    name, transport, targets: cfg.targets || DEFAULT_TARGETS,
    description: cfg.description, tags: [], disabled: false,
    source: undefined, runtime, auth_mode: "none",
  };
}

// ─── Skill detection ─────────────────────────────────────────────────────────

export function isSkillDir(dir: string): boolean {
  return fs.existsSync(path.join(dir, "SKILL.md"));
}

export function collectSkillSubdirs(root: string): string[] {
  const results: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skip = [".git", ".github", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", "target"];
        if (skip.includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (isSkillDir(full)) {
          const rel = path.relative(root, full).replace(/\\/g, "/");
          results.push(rel);
        } else {
          walk(full, depth + 1);
        }
      }
    } catch {}
  };
  walk(root, 0);
  return results;
}

export interface SkillPreviewEntry {
  subdir: string;
  name: string;
  description: string;
  fileCount: number;
}

export function previewSkillDir(root: string, subdir: string): SkillPreviewEntry {
  const dir = subdir ? path.join(root, subdir) : root;
  const skillMd = path.join(dir, "SKILL.md");
  let description = "";
  try {
    const content = fs.readFileSync(skillMd, "utf-8");
    description = content.split("\n").find((l) => l.trim().length > 0)?.replace(/^#+\s*/, "") || "";
  } catch {}
  let fileCount = 0;
  const count = (d: string) => {
    try {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isFile()) fileCount++;
        else if (e.isDirectory() && e.name !== ".git" && e.name !== "node_modules") count(path.join(d, e.name));
      }
    } catch {}
  };
  count(dir);
  const name = subdir ? subdir.split("/").pop() || subdir : path.basename(root);
  return { subdir, name, description, fileCount };
}

// ─── GitHub source parsing ───────────────────────────────────────────────────

export function parseGithubInput(input: string): { owner: string; repo: string; ref?: string; subdir?: string } | null {
  let s = input.trim();
  const ghMatch = s.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)(?:\/(.+))?)?(?:\/?$)/);
  if (ghMatch) {
    return { owner: ghMatch[1], repo: ghMatch[2], ref: ghMatch[3], subdir: ghMatch[4] };
  }
  s = s.replace(/\.git$/, "");
  let ref: string | undefined;
  const atIdx = s.lastIndexOf("@");
  if (atIdx > 0) { ref = s.slice(atIdx + 1); s = s.slice(0, atIdx); }
  let subdir: string | undefined;
  const dblSlash = s.indexOf("//");
  if (dblSlash >= 0) { subdir = s.slice(dblSlash + 2).replace(/^\/+|\/+$/g, ""); s = s.slice(0, dblSlash); }
  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return { owner: parts[0], repo: parts[1], ref, subdir };
}

// ─── Fetch & preview for MCP from GitHub (API-based, no zip) ─────────────────

export interface McpGithubPreview {
  owner: string;
  repo: string;
  ref: string;
  sha?: string;
  tempDir?: string;
  topDir?: string;
  configFile: string;
  servers: McpServer[];
}

export async function previewMcpFromGithub(owner: string, repo: string, ref?: string): Promise<McpGithubPreview> {
  const resolved = await resolveRef(owner, repo, ref);
  const api = githubApiBase();
  const headers = githubHeaders();
  headers["Accept"] = "application/vnd.github.raw+json";
  const configFiles = [".mcp.json", "mcp.json", "mcp-config.json", "mcp_config.json", ".mcp/config.json", "claude_desktop_config.json", ".cursor/mcp.json"];
  for (const cfgFile of configFiles) {
    const apiUrl = `${api}/repos/${owner}/${repo}/contents/${cfgFile}?ref=${encodeURIComponent(resolved.ref)}`;
    try {
      const resp = await fetch(apiUrl, { headers });
      if (!resp.ok) continue;
      const text = await resp.text();
      const servers = parseMcpJson(text);
      if (servers.length > 0) {
        for (const s of servers) s.source = { owner, repo, ref: resolved.ref, commit: resolved.sha };
        return { owner, repo, ref: resolved.ref, sha: resolved.sha, configFile: cfgFile, servers };
      }
    } catch { continue; }
  }
  const zipBuf = await downloadZip(owner, repo, resolved.ref);
  const tempDir = makeTempDir("mcp-preview");
  extractZip(zipBuf, tempDir);
  const topDir = findSingleTopDir(tempDir);
  const servers = detectMcpServers(topDir);
  if (servers.length > 0) {
    for (const s of servers) {
      const detectedSubdir = s.source?.subdir || (s.transport.type === "stdio" ? s.transport.cwd : undefined);
      s.source = { owner, repo, ref: resolved.ref, subdir: detectedSubdir, commit: resolved.sha };
    }
    return { owner, repo, ref: resolved.ref, sha: resolved.sha, tempDir, topDir, configFile: "auto-detected server directories", servers };
  }
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  throw new Error(`No MCP config or server directories found in ${owner}/${repo}@${resolved.ref}. Searched: ${configFiles.join(", ")}`);
}

// ─── Fetch & preview for Skills from GitHub (zip-based) ──────────────────────

export interface SkillsGithubPreview {
  owner: string;
  repo: string;
  ref: string;
  sha: string;
  tempDir: string;
  topDir: string;
  skills: SkillPreviewEntry[];
  mcpServers: McpServer[];
}

export async function previewSkillsFromGithub(owner: string, repo: string, ref?: string, subdir?: string): Promise<SkillsGithubPreview> {
  const resolved = await resolveRef(owner, repo, ref);
  const zipBuf = await downloadZip(owner, repo, resolved.ref);
  const tempDir = makeTempDir("skills-preview");
  extractZip(zipBuf, tempDir);
  const topDir = findSingleTopDir(tempDir);
  const analysisRoot = subdir ? path.join(topDir, subdir) : topDir;
  if (subdir && !fs.existsSync(analysisRoot)) {
    throw new Error(`Subdirectory '${subdir}' not found in ${owner}/${repo}`);
  }
  const mcpServers = detectMcpServers(analysisRoot);
  for (const s of mcpServers) {
    const detectedSubdir = s.source?.subdir || (s.transport.type === "stdio" ? s.transport.cwd : undefined);
    const fullSubdir = [subdir, detectedSubdir].filter(Boolean).join("/") || undefined;
    s.source = { owner, repo, ref: resolved.ref, subdir: fullSubdir, commit: resolved.sha };
  }
  const skills: SkillPreviewEntry[] = [];
  if (isSkillDir(analysisRoot)) {
    skills.push(previewSkillDir(topDir, subdir || ""));
  } else {
    for (const sd of collectSkillSubdirs(analysisRoot)) {
      const fullSd = subdir ? `${subdir}/${sd}` : sd;
      skills.push(previewSkillDir(topDir, fullSd));
    }
  }
  if (skills.length === 0 && mcpServers.length === 0) {
    throw new Error("No skills (SKILL.md) or MCP servers found in this repository");
  }
  return { owner, repo, ref: resolved.ref, sha: resolved.sha, tempDir, topDir, skills, mcpServers };
}

export function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

export function materializeGithubMcpBundle(server: McpServer, topDir: string): McpServer {
  if (server.transport.type !== "stdio" || !server.source?.subdir) return server;
  const srcDir = path.join(topDir, server.source.subdir);
  if (!isDir(srcDir)) return server;
  const bundle = githubMcpBundleName(server.source.owner, server.source.repo, server.name);
  const destDir = path.join(paths.mcpBundlesDir(), bundle);
  try { fs.rmSync(destDir, { recursive: true, force: true }); } catch {}
  copyDirRecursive(srcDir, destDir);
  const next = JSON.parse(JSON.stringify(server)) as McpServer;
  if (next.transport.type === "stdio") {
    next.transport.bundle = bundle;
    next.transport.cwd = "{BUNDLE}";
    next.transport.args = next.transport.args.map((arg) => rewriteBundleArg(arg, server.source?.subdir || "", srcDir));
  }
  if (!next.tags.includes("bundled")) next.tags.push("bundled");
  return next;
}

function githubMcpBundleName(owner: string, repo: string, serverName: string): string {
  return [owner, repo, serverName]
    .map((p) => p.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("__");
}

function rewriteBundleArg(arg: string, subdir: string, srcDir: string): string {
  const normalized = arg.replace(/\\/g, "/");
  const normalizedSubdir = subdir.replace(/\\/g, "/");
  if (normalizedSubdir && normalized === normalizedSubdir) return ".";
  if (normalizedSubdir && normalized.startsWith(`${normalizedSubdir}/`)) return normalized.slice(normalizedSubdir.length + 1);
  if (path.isAbsolute(arg)) {
    try {
      const rel = path.relative(srcDir, arg).replace(/\\/g, "/");
      if (rel && !rel.startsWith("..")) return rel;
    } catch {}
  }
  return arg;
}
