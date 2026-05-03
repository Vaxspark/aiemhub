import * as fs from "fs";
import * as path from "path";
import { readJsonFile, writeJsonFile } from "./fs-util.js";
import * as paths from "./paths.js";
import { IDES } from "./ide.js";

export interface Project {
  name: string;
  path: string;
  ides: string[];
  skills: string[];
  mcp_servers: string[];
}

interface ProjectsFile {
  projects: Record<string, Project>;
}

export function normalizeProjectPath(raw: string): string {
  let resolved: string;
  try {
    resolved = fs.realpathSync(raw);
  } catch {
    resolved = raw;
  }
  return resolved.replace(/\\\\/g, "/").replace(/\\/g, "/").replace(/^\\\\\\?\\\\/, "");
}

export class ProjectStore {
  private data: ProjectsFile;

  constructor(data: ProjectsFile) {
    this.data = data;
  }

  static load(): ProjectStore {
    const data = readJsonFile<ProjectsFile>(paths.projectsFile(), { projects: {} });
    return new ProjectStore(data);
  }

  save(): void {
    paths.ensureLayout();
    writeJsonFile(paths.projectsFile(), this.data);
  }

  list(): Project[] {
    return Object.values(this.data.projects);
  }

  get(p: string): Project | undefined {
    return this.data.projects[p] || this.data.projects[normalizeProjectPath(p)];
  }

  getMut(p: string): Project | undefined {
    return this.get(p);
  }

  upsert(project: Project): void {
    project.path = normalizeProjectPath(project.path);
    this.data.projects[project.path] = project;
  }

  remove(p: string): void {
    if (this.data.projects[p]) {
      delete this.data.projects[p];
      return;
    }
    const n = normalizeProjectPath(p);
    if (this.data.projects[n]) {
      delete this.data.projects[n];
      return;
    }
    throw new Error(`project ${p} not found`);
  }
}

export function detectProjectIdes(projectPath: string): string[] {
  const found: string[] = [];
  for (const ide of IDES) {
    const dir = path.join(projectPath, ide.skillsDir);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      found.push(ide.id);
    }
  }
  return found;
}
