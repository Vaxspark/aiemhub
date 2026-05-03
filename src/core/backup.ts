import * as fs from "fs";
import * as path from "path";
import { readJsonFile, writeJsonFile } from "./fs-util.js";
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

export function snapshotLocal(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(paths.snapshotsDir(), ts);
  fs.mkdirSync(dest, { recursive: true });
  const files = ["skills/index.json", "mcp/servers.json", "projects.json", "profiles.json", "secrets.json"];
  for (const f of files) {
    const src = path.join(paths.home(), f);
    if (fs.existsSync(src)) {
      const dPath = path.join(dest, path.basename(f));
      fs.copyFileSync(src, dPath);
    }
  }
  return dest;
}

export function exportToDir(dest: string): string[] {
  fs.mkdirSync(dest, { recursive: true });
  const files = ["skills/index.json", "mcp/servers.json", "projects.json", "profiles.json", "secrets.json"];
  const exported: string[] = [];
  for (const f of files) {
    const src = path.join(paths.home(), f);
    if (fs.existsSync(src)) {
      const dPath = path.join(dest, path.basename(f));
      fs.copyFileSync(src, dPath);
      exported.push(path.basename(f));
    }
  }
  return exported;
}

export function importFromDir(src: string): string[] {
  const files = ["index.json", "servers.json", "projects.json", "profiles.json", "secrets.json"];
  const imported: string[] = [];
  const mapping: Record<string, string> = {
    "index.json": "skills/index.json",
    "servers.json": "mcp/servers.json",
  };
  for (const f of files) {
    const srcP = path.join(src, f);
    if (fs.existsSync(srcP)) {
      const rel = mapping[f] || f;
      const dest = path.join(paths.home(), rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(srcP, dest);
      imported.push(f);
    }
  }
  return imported;
}

export function loadBackupTokenFile(): string | null {
  const p = paths.backupTokenFile();
  try { return fs.readFileSync(p, "utf-8").trim() || null; } catch { return null; }
}

export function saveBackupTokenFile(token: string): void {
  paths.ensureLayout();
  fs.writeFileSync(paths.backupTokenFile(), token, { mode: 0o600 });
}
