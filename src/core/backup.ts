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

const SKILLS_MCP_FILES: [string, string][] = [
  ["skills/index.json", "skills_index.json"],
  ["mcp/servers.json", "mcp_servers.json"],
];

const LOCAL_ONLY_FILES: [string, string][] = [
  ["projects.json", "projects.json"],
  ["profiles.json", "profiles.json"],
  ["secrets.json", "secrets.json"],
];

const CONFIG_FILES: [string, string][] = [...SKILLS_MCP_FILES, ...LOCAL_ONLY_FILES];

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

// ─── Skills + MCP only export (for GitHub push) ─────────────────────────────

export function exportSkillsAndMcpToDir(dest: string): string[] {
  fs.mkdirSync(dest, { recursive: true });
  const exported: string[] = [];

  for (const [rel, archiveName] of SKILLS_MCP_FILES) {
    const src = path.join(paths.home(), rel);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dest, archiveName));
      exported.push(archiveName);
    }
  }

  const bundlesDir = paths.mcpBundlesDir();
  if (fs.existsSync(bundlesDir)) {
    const bundlesDest = path.join(dest, "mcp_bundles");
    for (const entry of fs.readdirSync(bundlesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      copyDirAll(path.join(bundlesDir, entry.name), path.join(bundlesDest, entry.name));
      exported.push(`mcp_bundles/${entry.name}`);
    }
  }

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

function cleanWorkDirForPush(workDir: string): void {
  for (const badFile of ["projects.json", "profiles.json", "secrets.json"]) {
    const p = path.join(workDir, badFile);
    if (fs.existsSync(p)) fs.rmSync(p, { force: true });
  }
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

function ensureGitRepo(workDir: string, authUrl: string): void {
  if (!fs.existsSync(path.join(workDir, ".git"))) {
    gitRun(workDir, ["init"], undefined);
    try { gitRun(workDir, ["symbolic-ref", "HEAD", "refs/heads/main"], undefined); } catch {}
  }
  try {
    const remotes = gitRun(workDir, ["remote"], undefined);
    if (remotes.includes("origin")) gitRun(workDir, ["remote", "set-url", "origin", authUrl], undefined);
    else gitRun(workDir, ["remote", "add", "origin", authUrl], undefined);
  } catch {
    try { gitRun(workDir, ["remote", "add", "origin", authUrl], undefined); } catch {}
  }
  try { gitRun(workDir, ["config", "user.email", "aiem-backup@localhost"], undefined); } catch {}
  try { gitRun(workDir, ["config", "user.name", "aiem"], undefined); } catch {}
}

function gitCommitAndPush(workDir: string, proxy: string | undefined, message: string): void {
  gitRun(workDir, ["add", "-A"], undefined);
  const status = gitRun(workDir, ["status", "--porcelain"], undefined);
  if (!status.trim()) return;

  gitRun(workDir, ["commit", "-m", message], undefined);

  const branch = remoteDefaultBranch(workDir, proxy);
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
}

export function pushGithub(repoUrl: string, token?: string): void {
  const authUrl = buildAuthUrl(repoUrl, token);
  const workDir = paths.backupGitDir();
  fs.mkdirSync(workDir, { recursive: true });
  const cfg = loadBackupConfig();
  const proxy = cfg.http_proxy || undefined;

  ensureGitRepo(workDir, authUrl);
  cleanWorkDirForPush(workDir);
  exportSkillsAndMcpToDir(workDir);

  const readme = path.join(workDir, "README.md");
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, "# aiem backup\n\nAuto-generated by [aiem](https://github.com/Vaxspark/aiemhub).\nContains only skills and MCP configurations (no project/secrets/profile data).\n");
  }

  const gitignore = path.join(workDir, ".gitignore");
  if (!fs.existsSync(gitignore)) {
    fs.writeFileSync(gitignore, "projects.json\nprofiles.json\nsecrets.json\n.vault-store\n.backup-token\nbackup.json\n");
  }

  gitCommitAndPush(workDir, proxy, `aiem sync ${Date.now()} (${os.hostname()})`);

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

  ensureGitRepo(workDir, authUrl);

  const branch = remoteDefaultBranch(workDir, proxy);
  gitRun(workDir, ["fetch", "origin", branch], proxy);
  gitRun(workDir, ["reset", "--hard", `origin/${branch}`], undefined);

  try { snapshotLocal(); } catch {}

  importFromDir(workDir);
}

// ─── Remote repo management ──────────────────────────────────────────────────

export interface RemoteItem {
  type: "skill" | "mcp" | "mcp_bundle";
  id: string;
  name: string;
  description?: string;
}

export function listRemoteContents(): RemoteItem[] {
  const workDir = paths.backupGitDir();
  const items: RemoteItem[] = [];

  const skillsIdx = path.join(workDir, "skills_index.json");
  if (fs.existsSync(skillsIdx)) {
    try {
      const raw = readJsonFile<any>(skillsIdx, { skills: {} });
      for (const [id, skill] of Object.entries<any>(raw.skills || {})) {
        items.push({
          type: "skill",
          id,
          name: skill.name || id,
          description: skill.description || undefined,
        });
      }
    } catch {}
  }

  const mcpFile = path.join(workDir, "mcp_servers.json");
  if (fs.existsSync(mcpFile)) {
    try {
      const raw = readJsonFile<any>(mcpFile, { servers: {} });
      for (const [name, srv] of Object.entries<any>(raw.servers || {})) {
        items.push({
          type: "mcp",
          id: name,
          name: (srv as any).name || name,
          description: (srv as any).description || undefined,
        });
      }
    } catch {}
  }

  const bundlesDir = path.join(workDir, "mcp_bundles");
  if (fs.existsSync(bundlesDir)) {
    try {
      for (const e of fs.readdirSync(bundlesDir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        if (!items.some(i => i.type === "mcp_bundle" && i.id === e.name)) {
          items.push({ type: "mcp_bundle", id: e.name, name: e.name });
        }
      }
    } catch {}
  }

  return items;
}

export function syncRemoteToLocal(): void {
  const cfg = loadBackupConfig();
  const repo = cfg.github_repo;
  if (!repo) throw new Error("No GitHub repo configured");
  const token = loadBackupTokenFile() || process.env.GITHUB_TOKEN;
  const authUrl = buildAuthUrl(repo, token || undefined);
  const workDir = paths.backupGitDir();
  fs.mkdirSync(workDir, { recursive: true });
  const proxy = cfg.http_proxy || undefined;

  ensureGitRepo(workDir, authUrl);

  const branch = remoteDefaultBranch(workDir, proxy);
  gitRun(workDir, ["fetch", "origin", branch], proxy);
  gitRun(workDir, ["reset", "--hard", `origin/${branch}`], undefined);
}

export function deleteRemoteItems(itemIds: { type: string; id: string }[]): { deleted: number } {
  const workDir = paths.backupGitDir();
  let deleted = 0;

  for (const item of itemIds) {
    if (item.type === "skill") {
      const skillsIdx = path.join(workDir, "skills_index.json");
      if (fs.existsSync(skillsIdx)) {
        try {
          const raw = readJsonFile<any>(skillsIdx, { skills: {} });
          if (raw.skills?.[item.id]) {
            delete raw.skills[item.id];
            writeJsonFile(skillsIdx, raw);
          }
        } catch {}
      }
      for (const dir of ["skill_contents", "custom_skills"]) {
        const p = path.join(workDir, dir, item.id);
        if (fs.existsSync(p)) { removePath(p); deleted++; }
      }
    } else if (item.type === "mcp") {
      const mcpFile = path.join(workDir, "mcp_servers.json");
      if (fs.existsSync(mcpFile)) {
        try {
          const raw = readJsonFile<any>(mcpFile, { servers: {} });
          if (raw.servers?.[item.id]) {
            delete raw.servers[item.id];
            writeJsonFile(mcpFile, raw);
            deleted++;
          }
        } catch {}
      }
    } else if (item.type === "mcp_bundle") {
      const p = path.join(workDir, "mcp_bundles", item.id);
      if (fs.existsSync(p)) { removePath(p); deleted++; }
    }
  }

  return { deleted };
}

export function pushRemoteChanges(message?: string): void {
  const cfg = loadBackupConfig();
  const repo = cfg.github_repo;
  if (!repo) throw new Error("No GitHub repo configured");
  const token = loadBackupTokenFile() || process.env.GITHUB_TOKEN;
  const authUrl = buildAuthUrl(repo, token || undefined);
  const workDir = paths.backupGitDir();
  const proxy = cfg.http_proxy || undefined;

  ensureGitRepo(workDir, authUrl);
  gitCommitAndPush(workDir, proxy, message || `aiem: remote cleanup ${Date.now()}`);

  const newCfg = loadBackupConfig();
  newCfg.last_backup_ts = new Date().toISOString();
  saveBackupConfig(newCfg);
}
