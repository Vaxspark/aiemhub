import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { readJsonFile, writeJsonFile, removePath } from "./fs-util.js";
import * as paths from "./paths.js";

export type AutoInterval = "never" | "daily" | "weekly";

export interface BackupConfig {
  github_repo?: string;
  http_proxy?: string;
  auto_interval: AutoInterval;
  last_backup_ts?: string;
}

export function loadBackupConfig(): BackupConfig {
  return readJsonFile<BackupConfig>(paths.backupConfigFile(), { auto_interval: "never" });
}

export function saveBackupConfig(cfg: BackupConfig): void {
  paths.ensureLayout();
  writeJsonFile(paths.backupConfigFile(), cfg);
}

export function timeAgo(isoStr: string): string {
  const d = new Date(isoStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function loadBackupTokenFile(): string | null {
  const p = paths.backupTokenFile();
  try { return fs.readFileSync(p, "utf-8").trim() || null; } catch { return null; }
}

export function saveBackupTokenFile(token: string): void {
  paths.ensureLayout();
  fs.writeFileSync(paths.backupTokenFile(), token, { mode: 0o600 });
}

// ─── Config file mapping ─────────────────────────────────────────────────────

const CONFIG_FILES: [string, string][] = [
  ["skills/index.json", "skills_index.json"],
  ["mcp/servers.json", "mcp_servers.json"],
  ["projects.json", "projects.json"],
  ["profiles.json", "profiles.json"],
  ["secrets.json", "secrets.json"],
];

function copyDirAll(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirAll(s, d);
    else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
    }
  }
}

// ─── Export / Snapshot ────────────────────────────────────────────────────────

export function exportToDir(dest: string): string[] {
  fs.mkdirSync(dest, { recursive: true });
  const exported: string[] = [];

  for (const [rel, archiveName] of CONFIG_FILES) {
    const src = path.join(paths.home(), rel);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dest, archiveName));
      exported.push(archiveName);
    }
  }

  // MCP bundles
  const bundlesDir = paths.mcpBundlesDir();
  if (fs.existsSync(bundlesDir)) {
    const bundlesDest = path.join(dest, "mcp_bundles");
    if (fs.existsSync(bundlesDest)) removePath(bundlesDest);
    for (const entry of fs.readdirSync(bundlesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      copyDirAll(path.join(bundlesDir, entry.name), path.join(bundlesDest, entry.name));
      exported.push(`mcp_bundles/${entry.name}`);
    }
  }

  // Skill contents (all skills)
  try {
    const indexRaw = readJsonFile<any>(paths.skillsIndexFile(), { skills: {} });
    const skills = indexRaw.skills || {};
    for (const [id, skill] of Object.entries<any>(skills)) {
      const skillPath = skill.path || path.join(paths.skillsDir(), id);
      if (!fs.existsSync(skillPath) || !fs.existsSync(path.join(skillPath, "SKILL.md"))) continue;
      copyDirAll(skillPath, path.join(dest, "skill_contents", id));
      exported.push(`skill_contents/${id}`);
      const isLocal = skill.source?.type === "local" || skill.source?.type === "Local";
      if (isLocal) {
        copyDirAll(skillPath, path.join(dest, "custom_skills", id));
        exported.push(`custom_skills/${id}`);
      }
    }
  } catch {}

  return exported;
}

export function snapshotLocal(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(paths.snapshotsDir(), ts);
  exportToDir(dest);
  return dest;
}

// ─── Import / Restore ────────────────────────────────────────────────────────

export function importFromDir(src: string): string[] {
  const imported: string[] = [];

  for (const [rel, archiveName] of CONFIG_FILES) {
    const srcP = path.join(src, archiveName);
    if (!fs.existsSync(srcP)) continue;
    const dest = path.join(paths.home(), rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(srcP, dest);
    imported.push(archiveName);
  }

  // MCP bundles
  const bundlesSrc = path.join(src, "mcp_bundles");
  if (fs.existsSync(bundlesSrc) && fs.statSync(bundlesSrc).isDirectory()) {
    const bundlesDest = paths.mcpBundlesDir();
    fs.mkdirSync(bundlesDest, { recursive: true });
    for (const entry of fs.readdirSync(bundlesSrc, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dst = path.join(bundlesDest, entry.name);
      if (fs.existsSync(dst)) removePath(dst);
      copyDirAll(path.join(bundlesSrc, entry.name), dst);
      imported.push(`mcp_bundles/${entry.name}`);
    }
  }

  // Skill contents
  for (const dirName of ["skill_contents", "custom_skills"]) {
    const skillsSrc = path.join(src, dirName);
    if (!fs.existsSync(skillsSrc) || !fs.statSync(skillsSrc).isDirectory()) continue;
    for (const entry of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dst = path.join(paths.skillsDir(), entry.name);
      if (fs.existsSync(dst)) removePath(dst);
      copyDirAll(path.join(skillsSrc, entry.name), dst);
      imported.push(`${dirName}/${entry.name}`);
    }
  }

  normalizeRestoredSkillIndex();
  return imported;
}

function normalizeRestoredSkillIndex(): void {
  try {
    const indexPath = paths.skillsIndexFile();
    if (!fs.existsSync(indexPath)) return;
    const raw = readJsonFile<any>(indexPath, { skills: {} });
    const skills = raw.skills || {};
    let changed = false;
    for (const [id, skill] of Object.entries<any>(skills)) {
      const localDir = path.join(paths.skillsDir(), id);
      if (fs.existsSync(localDir) && fs.existsSync(path.join(localDir, "SKILL.md"))) {
        if (skill.path !== localDir) { skill.path = localDir; changed = true; }
        const src = skill.source;
        if (src && (src.type === "local" || src.type === "Local") && src.path !== localDir) {
          src.path = localDir; changed = true;
        }
      }
    }
    if (changed) writeJsonFile(indexPath, raw);
  } catch {}
}

// ─── GitHub git push / pull ──────────────────────────────────────────────────

function gitRun(dir: string, args: string[], proxy?: string): string {
  const env: Record<string, string> = { ...process.env as any };
  if (proxy) { env.HTTPS_PROXY = proxy; env.HTTP_PROXY = proxy; env.https_proxy = proxy; env.http_proxy = proxy; }
  return execSync(`git ${args.map(a => `"${a}"`).join(" ")}`, { cwd: dir, env, encoding: "utf-8", timeout: 120_000, stdio: ["pipe", "pipe", "pipe"] });
}

function buildAuthUrl(repoUrl: string, token?: string): string {
  const tok = token || process.env.GITHUB_TOKEN || loadBackupTokenFile() || "";
  if (!tok) return repoUrl;
  if (repoUrl.startsWith("https://")) {
    const rest = repoUrl.slice(8).replace(/^[^@]*@/, "");
    return `https://${tok}@${rest}`;
  }
  return repoUrl;
}

function remoteDefaultBranch(dir: string, proxy?: string): string {
  try {
    const out = gitRun(dir, ["ls-remote", "--symref", "origin", "HEAD"], proxy);
    for (const line of out.split("\n")) {
      const m = line.match(/^ref: refs\/heads\/(\S+)/);
      if (m) return m[1];
    }
  } catch {}
  return "main";
}

export function pushGithub(repoUrl: string, token?: string): void {
  const authUrl = buildAuthUrl(repoUrl, token);
  const workDir = paths.backupGitDir();
  fs.mkdirSync(workDir, { recursive: true });
  const cfg = loadBackupConfig();
  const proxy = cfg.http_proxy || undefined;

  if (!fs.existsSync(path.join(workDir, ".git"))) {
    gitRun(workDir, ["init"], undefined);
    try { gitRun(workDir, ["symbolic-ref", "HEAD", "refs/heads/main"], undefined); } catch {}
  }

  exportToDir(workDir);

  const readme = path.join(workDir, "README.md");
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, "# aiem backup\n\nAuto-generated by [aiem](https://github.com/Vaxspark/aiemhub). Do not edit by hand.\n");
  }

  try { const remotes = gitRun(workDir, ["remote"], undefined); if (remotes.includes("origin")) gitRun(workDir, ["remote", "set-url", "origin", authUrl], undefined); else gitRun(workDir, ["remote", "add", "origin", authUrl], undefined); }
  catch { try { gitRun(workDir, ["remote", "add", "origin", authUrl], undefined); } catch {} }

  const branch = remoteDefaultBranch(workDir, proxy);
  try { gitRun(workDir, ["config", "user.email", "aiem-backup@localhost"], undefined); } catch {}
  try { gitRun(workDir, ["config", "user.name", "aiem"], undefined); } catch {}

  gitRun(workDir, ["add", "."], undefined);
  const status = gitRun(workDir, ["status", "--porcelain"], undefined);
  if (status.trim()) {
    const msg = `aiem backup ${Date.now()} (${os.hostname()})`;
    gitRun(workDir, ["commit", "-m", msg], undefined);
  }

  const pushRef = `HEAD:${branch}`;
  let fetchOk = false;
  try { gitRun(workDir, ["fetch", "origin", branch], proxy); fetchOk = true; } catch {}
  if (fetchOk) {
    const remoteRef = `origin/${branch}`;
    let hasRemote = false;
    try { gitRun(workDir, ["rev-parse", "--verify", remoteRef], undefined); hasRemote = true; } catch {}
    if (hasRemote) {
      let rebaseOk = false;
      try { gitRun(workDir, ["rebase", remoteRef], undefined); rebaseOk = true; } catch { try { gitRun(workDir, ["rebase", "--abort"], undefined); } catch {} }
      if (rebaseOk) gitRun(workDir, ["push", "--set-upstream", "origin", pushRef], proxy);
      else gitRun(workDir, ["push", "--set-upstream", "origin", pushRef, "--force"], proxy);
    } else {
      gitRun(workDir, ["push", "--set-upstream", "origin", pushRef], proxy);
    }
  } else {
    gitRun(workDir, ["push", "--set-upstream", "origin", pushRef, "--force"], proxy);
  }

  const now = new Date().toISOString();
  const newCfg = loadBackupConfig();
  newCfg.github_repo = repoUrl;
  newCfg.last_backup_ts = now;
  saveBackupConfig(newCfg);
}

export function pullGithub(repoUrl: string, token?: string): void {
  const authUrl = buildAuthUrl(repoUrl, token);
  const workDir = paths.backupGitDir();
  fs.mkdirSync(workDir, { recursive: true });
  const cfg = loadBackupConfig();
  const proxy = cfg.http_proxy || undefined;

  if (!fs.existsSync(path.join(workDir, ".git"))) {
    gitRun(workDir, ["init"], undefined);
    try { gitRun(workDir, ["symbolic-ref", "HEAD", "refs/heads/main"], undefined); } catch {}
    gitRun(workDir, ["remote", "add", "origin", authUrl], undefined);
  } else {
    try { gitRun(workDir, ["remote", "set-url", "origin", authUrl], undefined); }
    catch { gitRun(workDir, ["remote", "add", "origin", authUrl], undefined); }
  }

  const branch = remoteDefaultBranch(workDir, proxy);
  gitRun(workDir, ["fetch", "origin", branch], proxy);
  gitRun(workDir, ["reset", "--hard", `origin/${branch}`], undefined);

  // Safety snapshot before overwriting
  try { snapshotLocal(); } catch {}

  importFromDir(workDir);
}
