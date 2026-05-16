import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { readJsonFile, writeJsonFile, removePath, hashDir } from "./fs-util.js";
import * as paths from "./paths.js";
import { IDES, findIde } from "./ide.js";

export type SkillSource =
  | { type: "github"; owner: string; repo: string; ref?: string; subdir?: string }
  | { type: "local"; path: string };

export interface Skill {
  id: string;
  name: string;
  source: SkillSource;
  version: string;
  path: string;
  description?: string;
  installed_at?: string;
  deployments: Record<string, string[]>;
  file_hashes: Record<string, string>;
}

interface SkillIndex {
  skills: Record<string, Skill>;
}

export function parseGithubSource(s: string): SkillSource | null {
  let input = s.trim();
  for (const prefix of ["github:", "https://github.com/", "http://github.com/"]) {
    if (input.startsWith(prefix)) {
      input = input.slice(prefix.length);
      break;
    }
  }
  input = input.replace(/\/+$/, "").replace(/\.git$/, "");

  const parts = input.split("/");
  if (parts.length >= 4 && (parts[2] === "tree" || parts[2] === "blob")) {
    const owner = parts[0], repo = parts[1], ref_ = parts[3];
    const subdir = parts.length > 4 ? parts.slice(4).join("/") : undefined;
    if (!owner || !repo) return null;
    return { type: "github", owner, repo, ref: ref_, subdir };
  }

  let ref_: string | undefined;
  const atIdx = input.lastIndexOf("@");
  if (atIdx > 0) {
    ref_ = input.slice(atIdx + 1);
    input = input.slice(0, atIdx);
  }

  let subdir: string | undefined;
  const dblSlash = input.indexOf("//");
  if (dblSlash >= 0) {
    subdir = input.slice(dblSlash + 2).replace(/^\/+|\/+$/g, "");
    input = input.slice(0, dblSlash);
  }

  const slashIdx = input.indexOf("/");
  if (slashIdx <= 0) return null;
  const owner = input.slice(0, slashIdx);
  const repo = input.slice(slashIdx + 1);
  if (!owner || !repo) return null;
  return { type: "github", owner, repo, ref: ref_, subdir };
}

export function canonicalId(source: SkillSource): string {
  if (source.type === "github") {
    let id = `${source.owner}__${source.repo}`;
    if (source.subdir) {
      const tail = source.subdir.split("/").pop() || source.subdir;
      id += `__${tail.replace(/[/\\]/g, "_")}`;
    }
    return id;
  }
  const name = path.basename(source.path);
  return `local__${name}`;
}

export function applyGithubProxyEnv(input: string): string {
  const s = input.trim();
  for (const prefix of ["https://github.com/", "http://github.com/"]) {
    const pos = s.indexOf(prefix);
    if (pos > 0) {
      const proxyBase = s.slice(0, pos).replace(/\/+$/, "");
      process.env.GITHUB_MIRROR = `${proxyBase}/https://codeload.github.com`;
      process.env.GITHUB_API_MIRROR = `${proxyBase}/https://api.github.com`;
      return s.slice(pos);
    }
  }
  return s;
}

function normalizeSource(s: any): SkillSource {
  if (!s) return { type: "local", path: "" };
  const t = (s.type || "").toLowerCase().replace(/-/g, "");
  if (t === "github" || t === "git" || s.owner) {
    return { type: "github", owner: s.owner || "", repo: s.repo || "", ref: s.ref ?? undefined, subdir: s.subdir ?? undefined };
  }
  return { type: "local", path: s.path || "" };
}

function normalizeSkill(id: string, v: any): Skill {
  return {
    id: v.id || id,
    name: v.name || id,
    source: normalizeSource(v.source),
    version: v.version || "",
    path: v.path || "",
    description: v.description ?? undefined,
    installed_at: v.installed_at ?? undefined,
    deployments: v.deployments || {},
    file_hashes: v.file_hashes || {},
  };
}

function flattenSource(s: SkillSource): any {
  if (s.type === "github") {
    return { type: "git-hub", owner: s.owner, repo: s.repo, ref: s.ref ?? null, subdir: s.subdir ?? null };
  }
  return { type: "local", path: s.path };
}

function flattenSkill(s: Skill): any {
  return {
    id: s.id,
    name: s.name,
    source: flattenSource(s.source),
    version: s.version,
    path: s.path,
    description: s.description ?? null,
    installed_at: s.installed_at ?? null,
    deployments: s.deployments,
    file_hashes: s.file_hashes,
  };
}

export class SkillRegistry {
  private index: SkillIndex;

  constructor(index: SkillIndex) {
    this.index = index;
  }

  static load(): SkillRegistry {
    const raw = readJsonFile<any>(paths.skillsIndexFile(), { skills: {} });
    const data: SkillIndex = { skills: {} };
    for (const [id, v] of Object.entries(raw.skills || {})) {
      data.skills[id] = normalizeSkill(id, v as any);
    }
    return new SkillRegistry(data);
  }

  save(): void {
    paths.ensureLayout();
    const out: any = { skills: {} };
    for (const [id, s] of Object.entries(this.index.skills)) {
      out.skills[id] = flattenSkill(s);
    }
    writeJsonFile(paths.skillsIndexFile(), out);
  }

  list(): Skill[] {
    return Object.values(this.index.skills);
  }

  get(id: string): Skill | undefined {
    return this.index.skills[id];
  }

  upsert(skill: Skill): void {
    this.index.skills[skill.id] = skill;
  }

  remove(id: string): boolean {
    if (this.index.skills[id]) {
      delete this.index.skills[id];
      return true;
    }
    return false;
  }
}

export function readSkillContent(id: string): string {
  const reg = SkillRegistry.load();
  const skill = reg.get(id);
  if (!skill) throw new Error(`skill ${id} not found`);
  const skillMd = path.join(skill.path, "SKILL.md");
  if (fs.existsSync(skillMd)) return fs.readFileSync(skillMd, "utf-8");
  throw new Error(`SKILL.md not found for ${id}`);
}

export function listSkillFiles(id: string): Array<[string, number]> {
  const reg = SkillRegistry.load();
  const skill = reg.get(id);
  if (!skill) return [];
  const result: Array<[string, number]> = [];
  const walk = (dir: string, prefix: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else {
        const stat = fs.statSync(full);
        result.push([rel, stat.size]);
      }
    }
  };
  walk(skill.path, "");
  return result;
}

export function createLocalSkill(name: string, content: string): Skill {
  const dir = path.join(paths.skillsDir(), `local__${name}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), content);
  const skill: Skill = {
    id: `local__${name}`,
    name,
    source: { type: "local", path: dir },
    version: new Date().toISOString(),
    path: dir,
    description: content.split("\n")[0]?.replace(/^#\s*/, ""),
    installed_at: new Date().toISOString(),
    deployments: {},
    file_hashes: hashDir(dir),
  };
  const reg = SkillRegistry.load();
  reg.upsert(skill);
  reg.save();
  return skill;
}

export function deploySkill(skill: Skill, ideId: string, projectPath?: string): string {
  const ide = findIde(ideId);
  if (!ide) throw new Error(`unknown IDE: ${ideId}`);
  const root = projectPath || os.homedir();
  const targetDir = path.join(root, ide.skillsDir);
  fs.mkdirSync(targetDir, { recursive: true });
  const linkName = path.basename(skill.path);
  const linkPath = path.join(targetDir, linkName);
  if (fs.existsSync(linkPath)) removePath(linkPath);
  try {
    fs.symlinkSync(skill.path, linkPath, process.platform === "win32" ? "junction" : "dir");
  } catch {
    fs.symlinkSync(skill.path, linkPath, "dir");
  }
  const deployKey = projectPath || "~";
  if (!skill.deployments[ideId]) skill.deployments[ideId] = [];
  if (!skill.deployments[ideId].includes(deployKey)) {
    skill.deployments[ideId].push(deployKey);
  }
  return linkPath;
}

export function undeploySkill(skill: Skill, ideId: string, projectPath?: string): void {
  const ide = findIde(ideId);
  if (!ide) return;
  const root = projectPath || os.homedir();
  const targetDir = path.join(root, ide.skillsDir);
  const linkName = path.basename(skill.path);
  const linkPath = path.join(targetDir, linkName);
  if (fs.existsSync(linkPath)) removePath(linkPath);
  const deployKey = projectPath || "~";
  if (skill.deployments[ideId]) {
    skill.deployments[ideId] = skill.deployments[ideId].filter((r) => r !== deployKey);
    if (skill.deployments[ideId].length === 0) delete skill.deployments[ideId];
  }
}

export function undeployAllGlobal(reg: SkillRegistry): number {
  let count = 0;
  for (const skill of reg.list()) {
    for (const [ideId, roots] of Object.entries(skill.deployments)) {
      if (roots.includes("~")) {
        undeploySkill(skill, ideId, undefined);
        reg.upsert(skill);
        count++;
      }
    }
  }
  return count;
}

export function removeSkill(reg: SkillRegistry, id: string): void {
  const skill = reg.get(id);
  if (!skill) throw new Error(`skill ${id} not found`);
  for (const [ideId, roots] of Object.entries(skill.deployments)) {
    for (const root of [...roots]) {
      undeploySkill(skill, ideId, root === "~" ? undefined : root);
    }
  }
  if (fs.existsSync(skill.path)) {
    const trashDest = path.join(paths.trashDir(), `${Date.now()}_${path.basename(skill.path)}`);
    fs.mkdirSync(paths.trashDir(), { recursive: true });
    fs.renameSync(skill.path, trashDest);
  }
  reg.remove(id);
}
