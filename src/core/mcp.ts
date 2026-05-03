import * as fs from "fs";
import * as path from "path";
import { readJsonFile, writeJsonFile } from "./fs-util.js";
import * as paths from "./paths.js";
import { IDES, findIde } from "./ide.js";

export type McpTransport =
  | { type: "stdio"; command: string; args: string[]; env: Record<string, string>; cwd?: string; bundle?: string }
  | { type: "http"; url: string; headers: Record<string, string> }
  | { type: "sse"; url: string; headers: Record<string, string> };

export interface McpServer {
  name: string;
  transport: McpTransport;
  targets: string[];
  description?: string;
  tags: string[];
  disabled: boolean;
  source?: { owner: string; repo: string; ref?: string; subdir?: string; commit?: string };
  runtime?: "python" | "node" | "other";
  auth_mode: "none" | "secret-ref" | "external" | "missing-secret";
}

interface McpRegistryFile {
  servers: Record<string, McpServer>;
}

function normalizeServer(name: string, v: any): McpServer {
  let transport: McpTransport;
  if (v.transport) {
    transport = v.transport;
  } else if (v.command) {
    transport = { type: "stdio", command: v.command, args: v.args || [], env: v.env || {}, cwd: v.cwd, bundle: v.bundle || undefined };
  } else if (v.url) {
    const t = v.type === "http" ? "http" : "sse";
    transport = { type: t, url: v.url, headers: v.headers || {} } as McpTransport;
  } else {
    transport = { type: "stdio", command: "echo", args: [], env: {}, cwd: undefined, bundle: undefined };
  }
  return {
    name: v.name || name,
    transport,
    targets: v.targets || [],
    description: v.description ?? undefined,
    tags: v.tags || [],
    disabled: v.disabled || false,
    source: v.source ?? undefined,
    runtime: v.runtime ?? undefined,
    auth_mode: v.auth_mode || "none",
  };
}

function flattenServer(s: McpServer): any {
  const base: any = {
    name: s.name,
    type: s.transport.type,
    targets: s.targets,
    description: s.description ?? null,
    tags: s.tags,
    disabled: s.disabled,
    source: s.source ?? null,
    runtime: s.runtime ?? null,
    auth_mode: s.auth_mode,
  };
  if (s.transport.type === "stdio") {
    base.command = s.transport.command;
    base.args = s.transport.args;
    base.env = s.transport.env;
    base.cwd = s.transport.cwd;
    base.bundle = s.transport.bundle;
  } else {
    base.url = s.transport.url;
    base.headers = s.transport.headers;
  }
  return base;
}

export function canonicalAdapterId(id: string): string {
  const lower = id.toLowerCase().trim();
  const aliases: Record<string, string> = {
    "claude": "claude-code", "claude_code": "claude-code",
    "copilot": "vscode", "github": "vscode",
    "vsc": "vscode", "wind": "windsurf",
  };
  return aliases[lower] || lower;
}

export class McpRegistry {
  private data: McpRegistryFile;

  constructor(data: McpRegistryFile) {
    this.data = data;
  }

  static load(): McpRegistry {
    const raw = readJsonFile<any>(paths.mcpServersFile(), { servers: {} });
    const data: McpRegistryFile = { servers: {} };
    for (const [name, v] of Object.entries(raw.servers || {})) {
      data.servers[name] = normalizeServer(name, v as any);
    }
    return new McpRegistry(data);
  }

  save(): void {
    paths.ensureLayout();
    const flat: any = { servers: {} };
    for (const [name, s] of Object.entries(this.data.servers)) {
      flat.servers[name] = flattenServer(s);
    }
    writeJsonFile(paths.mcpServersFile(), flat);
  }

  list(): McpServer[] {
    return Object.values(this.data.servers);
  }

  get(name: string): McpServer | undefined {
    return this.data.servers[name];
  }

  getMut(name: string): McpServer | undefined {
    return this.data.servers[name];
  }

  upsert(server: McpServer): void {
    this.data.servers[server.name] = server;
  }

  remove(name: string): void {
    if (!this.data.servers[name]) throw new Error(`MCP server ${name} not found`);
    delete this.data.servers[name];
  }
}

export function readIdeConfig(ideId: string, projectPath?: string): McpServer[] {
  // Read MCP configs from IDE-specific locations (stub — returns empty for now)
  return [];
}

export function mcpIsSynced(name: string, ideId: string, _projectPath?: string): boolean {
  const servers = readIdeConfig(ideId, _projectPath);
  return servers.some((s) => s.name === name);
}

export function projectsWithServer(name: string): string[] {
  // Stub: scan project store for projects that have this server deployed
  return [];
}

export function syncOneGlobal(name: string, ides: string[]): string[] {
  const reg = McpRegistry.load();
  const server = reg.get(name);
  if (!server) throw new Error(`server ${name} not found`);
  const touched: string[] = [];
  for (const ideId of ides) {
    const ide = findIde(ideId);
    if (!ide) continue;
    touched.push(ideId);
  }
  return touched;
}

export function retractOneGlobal(name: string, ides: string[]): string[] {
  return ides;
}

export function deployToProject(name: string, projectPath: string, ides?: string[]): string[] {
  return [];
}

export function undeployFromProject(name: string, projectPath: string, ides?: string[]): void {}

export function listBundles(): string[] {
  const dir = paths.mcpBundlesDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((e) => {
    return fs.statSync(path.join(dir, e)).isDirectory();
  });
}

export function importBundle(name: string, srcPath: string): string {
  const dest = path.join(paths.mcpBundlesDir(), name);
  fs.mkdirSync(dest, { recursive: true });
  copyDirRecursive(srcPath, dest);
  return dest;
}

export function removeBundle(name: string): void {
  const src = path.join(paths.mcpBundlesDir(), name);
  if (!fs.existsSync(src)) throw new Error(`bundle ${name} not found`);
  const trash = path.join(paths.trashDir(), `${Date.now()}_bundle_${name}`);
  fs.mkdirSync(paths.trashDir(), { recursive: true });
  fs.renameSync(src, trash);
}

function copyDirRecursive(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcP = path.join(src, entry.name);
    const destP = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcP, destP);
    else fs.copyFileSync(srcP, destP);
  }
}

export function normalizedTargets(targets: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of targets) {
    const canonical = canonicalAdapterId(t);
    if (findIde(canonical) && !seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  }
  return out;
}
