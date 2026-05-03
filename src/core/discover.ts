import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { IDES } from "./ide.js";
import { SkillRegistry, type Skill } from "./skills.js";
import { McpRegistry, type McpServer } from "./mcp.js";
import * as paths from "./paths.js";
import { hashDir } from "./fs-util.js";

export interface FoundSkill {
  path: string;
  ide_id: string;
  dir_name: string;
  is_link: boolean;
}

export interface FoundMcp {
  server: McpServer;
  source_ide: string;
}

export function discoverSkills(): FoundSkill[] {
  const reg = SkillRegistry.load();
  const managed = new Set(reg.list().map((s) => path.basename(s.path)));
  const found: FoundSkill[] = [];

  for (const ide of IDES) {
    const dir = path.join(os.homedir(), ide.skillsDir);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (managed.has(entry.name)) continue;
      found.push({
        path: path.join(dir, entry.name),
        ide_id: ide.id,
        dir_name: entry.name,
        is_link: entry.isSymbolicLink(),
      });
    }
  }
  return found;
}

export function discoverMcp(): FoundMcp[] {
  return [];
}

export function importSkill(found: FoundSkill, copy: boolean): Skill {
  let destPath: string;
  if (copy) {
    destPath = path.join(paths.skillsDir(), `local__${found.dir_name}`);
    if (destPath !== found.path) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirSync(found.path, destPath);
    }
  } else {
    destPath = found.path;
  }

  let description: string | undefined;
  const mdPath = path.join(destPath, "SKILL.md");
  if (fs.existsSync(mdPath)) {
    const content = fs.readFileSync(mdPath, "utf-8");
    description = content.split("\n")[0]?.replace(/^#\s*/, "");
  }

  const skill: Skill = {
    id: `local__${found.dir_name}`,
    name: found.dir_name,
    source: { type: "local", path: destPath },
    version: new Date().toISOString(),
    path: destPath,
    description,
    installed_at: new Date().toISOString(),
    deployments: {},
    file_hashes: hashDir(destPath),
  };
  return skill;
}

export function importAllSkills(found: FoundSkill[], copy: boolean): number {
  const reg = SkillRegistry.load();
  let count = 0;
  for (const f of found) {
    try {
      const skill = importSkill(f, copy);
      reg.upsert(skill);
      count++;
    } catch {}
  }
  reg.save();
  return count;
}

export function importMcp(_found: FoundMcp): void {}
export function importAllMcp(_found: FoundMcp[]): number { return 0; }

function copyDirSync(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}
