import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export function home(): string {
  if (process.env.AIEM_HOME) return process.env.AIEM_HOME;
  return path.join(os.homedir(), ".aiem");
}

export const skillsDir = () => path.join(home(), "skills");
export const mcpDir = () => path.join(home(), "mcp");
export const backupsDir = () => path.join(home(), "backups");
export const cacheDir = () => path.join(home(), "cache");
export const mcpServersFile = () => path.join(mcpDir(), "servers.json");
export const secretsIndexFile = () => path.join(home(), "secrets.json");
export const profilesFile = () => path.join(home(), "profiles.json");
export const projectsFile = () => path.join(home(), "projects.json");
export const snapshotsDir = () => path.join(home(), "snapshots");
export const backupGitDir = () => path.join(home(), "backup-git");
export const backupConfigFile = () => path.join(home(), "backup.json");
export const backupTokenFile = () => path.join(home(), ".backup-token");
export const trashDir = () => path.join(home(), "trash");
export const mcpBundlesDir = () => path.join(mcpDir(), "bundles");
export const skillsIndexFile = () => path.join(skillsDir(), "index.json");

export function ensureLayout(): void {
  for (const dir of [home(), skillsDir(), mcpDir(), backupsDir(), cacheDir(), snapshotsDir(), mcpBundlesDir()]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function expandUser(p: string): string {
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}
