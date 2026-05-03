import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import AdmZip from "adm-zip";
import type { McpServer, McpTransport } from "./mcp.js";
import { loadBackupTokenFile } from "./backup.js";

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
  if (!ref && headers["Authorization"]) {
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
  const urls = [codeload];
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
  let lastErr = "";
  for (const url of urls) {
    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) { lastErr = `${url}: HTTP ${resp.status}`; continue; }
      const buf = Buffer.from(await resp.arrayBuffer());
      try { new AdmZip(buf); return buf; } catch (e: any) { lastErr = `${url}: invalid zip: ${e.message}`; }
    } catch (e: any) { lastErr = `${url}: ${e.message}`; }
  }
  throw new Error(`Failed to download zip after ${urls.length} attempts: ${lastErr}`);
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

export function detectMcpServers(root: string): McpServer[] {
  const servers: McpServer[] = [];
  for (const name of MCP_CONFIG_FILES) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) {
      try { servers.push(...parseMcpJson(fs.readFileSync(p, "utf-8"))); } catch {}
    }
  }
  const mcpDir = path.join(root, "mcp-servers");
  if (fs.existsSync(mcpDir) && fs.statSync(mcpDir).isDirectory()) {
    for (const entry of fs.readdirSync(mcpDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(mcpDir, entry.name);
      const { command, args } = detectEntryCommand(dir);
      if (!command) continue;
      servers.push({
        name: entry.name, targets: DEFAULT_TARGETS, tags: ["auto-detected"], disabled: false,
        auth_mode: "none",
        transport: { type: "stdio", command, args, env: {}, cwd: `mcp-servers/${entry.name}` },
      });
    }
  }
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
  return servers;
}

function detectEntryCommand(dir: string): { command: string; args: string[] } {
  if (fs.existsSync(path.join(dir, "server.py"))) return { command: "python", args: ["server.py"] };
  if (fs.existsSync(path.join(dir, "main.py"))) return { command: "python", args: ["main.py"] };
  if (fs.existsSync(path.join(dir, "index.js"))) return { command: "node", args: ["index.js"] };
  if (fs.existsSync(path.join(dir, "index.ts"))) return { command: "node", args: ["index.ts"] };
  if (fs.existsSync(path.join(dir, "package.json"))) return { command: "npx", args: ["."] };
  return { command: "", args: [] };
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
  configFile: string;
  servers: McpServer[];
}

export async function previewMcpFromGithub(owner: string, repo: string, ref?: string): Promise<McpGithubPreview> {
  const resolvedRef = ref || "main";
  const headers = githubHeaders();
  headers["Accept"] = "application/vnd.github.raw+json";
  const configFiles = [".mcp.json", "mcp.json", "mcp-config.json", "mcp_config.json", ".mcp/config.json", "claude_desktop_config.json", ".cursor/mcp.json"];
  for (const cfgFile of configFiles) {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${cfgFile}?ref=${resolvedRef}`;
    try {
      const resp = await fetch(apiUrl, { headers });
      if (!resp.ok) continue;
      const text = await resp.text();
      const servers = parseMcpJson(text);
      if (servers.length > 0) {
        for (const s of servers) s.source = { owner, repo, ref: resolvedRef };
        return { owner, repo, ref: resolvedRef, configFile: cfgFile, servers };
      }
    } catch { continue; }
  }
  throw new Error(`No MCP config found in ${owner}/${repo}@${resolvedRef}. Searched: ${configFiles.join(", ")}`);
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
  const skills: SkillPreviewEntry[] = [];
  if (isSkillDir(analysisRoot)) {
    skills.push(previewSkillDir(analysisRoot, subdir || ""));
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
