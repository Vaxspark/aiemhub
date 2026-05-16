import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { readJsonFile, writeJsonFile } from "./fs-util.js";
import * as paths from "./paths.js";
import { IDES, findIde } from "./ide.js";
import { ProjectStore } from "./projects.js";

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

type McpConfigTarget =
  | { file: string; format: "json"; jsonKey: "mcpServers" | "servers" }
  | { file: string; format: "toml" };

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
    claude: "claude-code",
    claude_code: "claude-code",
    copilot: "vscode",
    github: "vscode",
    vsc: "vscode",
    wind: "windsurf",
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
  const target = mcpConfigTarget(ideId, projectPath);
  if (!target || !fs.existsSync(target.file)) return [];
  if (target.format === "toml") return readCodexTomlServers(target.file);
  try {
    const raw = readJsonFile<any>(target.file, {});
    const serverMap = raw[target.jsonKey] || {};
    if (typeof serverMap !== "object" || serverMap === null) return [];
    const servers: McpServer[] = [];
    for (const [name, cfg] of Object.entries(serverMap)) {
      try { servers.push(normalizeServer(name, cfg as any)); } catch {}
    }
    return servers;
  } catch {
    return [];
  }
}

export function mcpIsSynced(name: string, ideId: string, projectPath?: string): boolean {
  const servers = readIdeConfig(ideId, projectPath);
  return servers.some((s) => s.name === name);
}

export function projectsWithServer(name: string): string[] {
  let projects: ReturnType<ProjectStore["list"]> = [];
  try { projects = ProjectStore.load().list(); } catch { return []; }
  const deployed: string[] = [];
  for (const project of projects) {
    const recorded = project.mcp_servers.includes(name);
    const onDisk = IDES.some((ide) => mcpIsSynced(name, ide.id, project.path));
    if (recorded || onDisk) deployed.push(project.name || project.path);
  }
  return deployed;
}

export function syncOneGlobal(name: string, ides: string[]): string[] {
  const reg = McpRegistry.load();
  const server = reg.get(name);
  if (!server) throw new Error(`server ${name} not found`);
  const touched: string[] = [];
  for (const ideId of normalizedTargets(ides)) {
    const file = writeMcpServerConfig(ideId, server);
    if (file) touched.push(file);
  }
  return touched;
}

export function retractOneGlobal(name: string, ides: string[]): string[] {
  const touched: string[] = [];
  for (const ideId of normalizedTargets(ides)) {
    const file = removeMcpServerConfig(ideId, name);
    if (file) touched.push(file);
  }
  return touched;
}

export function deployToProject(name: string, projectPath: string, ides?: string[]): string[] {
  const reg = McpRegistry.load();
  const server = reg.get(name);
  if (!server) throw new Error(`server ${name} not found`);
  const targetIdes = ides && ides.length > 0 ? ides : server.targets;
  const touched: string[] = [];
  for (const ideId of normalizedTargets(targetIdes)) {
    const file = writeMcpServerConfig(ideId, server, projectPath);
    if (file) touched.push(file);
  }
  updateProjectRecord(projectPath, name, targetIdes, true);
  return touched;
}

export function undeployFromProject(name: string, projectPath: string, ides?: string[]): void {
  const reg = McpRegistry.load();
  const server = reg.get(name);
  const targetIdes = ides && ides.length > 0 ? ides : (server?.targets || IDES.map((i) => i.id));
  for (const ideId of normalizedTargets(targetIdes)) {
    removeMcpServerConfig(ideId, name, projectPath);
  }
  updateProjectRecord(projectPath, name, targetIdes, false);
}

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

function mcpConfigTarget(ideId: string, projectPath?: string): McpConfigTarget | undefined {
  const id = canonicalAdapterId(ideId);
  if (!findIde(id)) return undefined;
  if (projectPath) {
    const projectTargets: Record<string, McpConfigTarget> = {
      "claude-code": { file: path.join(projectPath, ".mcp.json"), format: "json", jsonKey: "mcpServers" },
      cursor: { file: path.join(projectPath, ".cursor", "mcp.json"), format: "json", jsonKey: "mcpServers" },
      vscode: { file: path.join(projectPath, ".vscode", "mcp.json"), format: "json", jsonKey: "servers" },
      windsurf: { file: path.join(projectPath, ".windsurf", "mcp_config.json"), format: "json", jsonKey: "mcpServers" },
      trae: { file: path.join(projectPath, ".trae", "mcp.json"), format: "json", jsonKey: "mcpServers" },
      qoder: { file: path.join(projectPath, ".qoder", "mcp.json"), format: "json", jsonKey: "mcpServers" },
      kiro: { file: path.join(projectPath, ".kiro", "mcp.json"), format: "json", jsonKey: "mcpServers" },
      codex: { file: path.join(projectPath, ".codex", "config.toml"), format: "toml" },
    };
    return projectTargets[id];
  }
  const home = os.homedir();
  const globalTargets: Record<string, McpConfigTarget> = {
    "claude-code": { file: path.join(home, ".claude.json"), format: "json", jsonKey: "mcpServers" },
    cursor: { file: path.join(home, ".cursor", "mcp.json"), format: "json", jsonKey: "mcpServers" },
    vscode: { file: path.join(home, ".vscode", "mcp.json"), format: "json", jsonKey: "servers" },
    windsurf: { file: path.join(home, ".codeium", "windsurf", "mcp_config.json"), format: "json", jsonKey: "mcpServers" },
    trae: { file: path.join(home, ".trae", "mcp.json"), format: "json", jsonKey: "mcpServers" },
    qoder: { file: path.join(home, ".qoder", "mcp.json"), format: "json", jsonKey: "mcpServers" },
    kiro: { file: path.join(home, ".kiro", "mcp.json"), format: "json", jsonKey: "mcpServers" },
    codex: { file: path.join(home, ".codex", "config.toml"), format: "toml" },
  };
  return globalTargets[id];
}

function writeMcpServerConfig(ideId: string, server: McpServer, projectPath?: string): string | undefined {
  const target = mcpConfigTarget(ideId, projectPath);
  if (!target) return undefined;
  if (target.format === "toml") {
    writeCodexTomlServer(target.file, server);
    return target.file;
  }
  const current = readJsonFile<any>(target.file, {});
  if (typeof current[target.jsonKey] !== "object" || current[target.jsonKey] === null) current[target.jsonKey] = {};
  current[target.jsonKey][server.name] = serverToConfig(server);
  writeJsonFile(target.file, current);
  return target.file;
}

function removeMcpServerConfig(ideId: string, name: string, projectPath?: string): string | undefined {
  const target = mcpConfigTarget(ideId, projectPath);
  if (!target || !fs.existsSync(target.file)) return undefined;
  if (target.format === "toml") {
    removeCodexTomlServer(target.file, name);
    return target.file;
  }
  const current = readJsonFile<any>(target.file, {});
  const map = current[target.jsonKey];
  if (map && typeof map === "object") delete map[name];
  writeJsonFile(target.file, current);
  return target.file;
}

function serverToConfig(server: McpServer): any {
  if (server.transport.type === "stdio") {
    const transport = server.transport;
    return {
      type: "stdio",
      command: resolveBundleToken(transport.command, transport.bundle),
      args: transport.args.map((a) => resolveBundleToken(a, transport.bundle)),
      env: transport.env || {},
      ...(transport.cwd ? { cwd: resolveBundleToken(transport.cwd, transport.bundle) } : {}),
    };
  }
  return {
    type: server.transport.type,
    url: server.transport.url,
    ...(Object.keys(server.transport.headers || {}).length ? { headers: server.transport.headers } : {}),
  };
}

function resolveBundleToken(value: string, bundle?: string): string {
  if (!bundle) return value;
  return value.replace(/\{BUNDLE\}/g, path.join(paths.mcpBundlesDir(), bundle));
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlArray(values: string[]): string {
  return `[${values.map(tomlString).join(", ")}]`;
}

function tomlInlineObject(values: Record<string, string>): string {
  return `{ ${Object.entries(values).map(([k, v]) => `${tomlString(k)} = ${tomlString(v)}`).join(", ")} }`;
}

function writeCodexTomlServer(file: string, server: McpServer): void {
  const withoutExisting = stripCodexTomlServer(fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "", server.name).trimEnd();
  const cfg = serverToConfig(server);
  const lines = [`[mcp_servers.${JSON.stringify(server.name)}]`];
  if (server.transport.type === "stdio") {
    lines.push(`command = ${tomlString(cfg.command)}`);
    if (cfg.args?.length) lines.push(`args = ${tomlArray(cfg.args)}`);
    if (cfg.cwd) lines.push(`cwd = ${tomlString(cfg.cwd)}`);
    if (cfg.env && Object.keys(cfg.env).length) lines.push(`env = ${tomlInlineObject(cfg.env)}`);
  } else {
    lines.push(`url = ${tomlString(cfg.url)}`);
    lines.push(`transport = ${tomlString(cfg.type)}`);
    if (cfg.headers && Object.keys(cfg.headers).length) lines.push(`headers = ${tomlInlineObject(cfg.headers)}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${withoutExisting ? `${withoutExisting}\n\n` : ""}${lines.join("\n")}\n`);
}

function removeCodexTomlServer(file: string, name: string): void {
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stripCodexTomlServer(current, name));
}

function stripCodexTomlServer(content: string, name: string): string {
  const header = `[mcp_servers.${JSON.stringify(name)}]`;
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (line.trim() === header) {
      skipping = true;
      continue;
    }
    if (skipping && /^\s*\[/.test(line)) skipping = false;
    if (!skipping) out.push(line);
  }
  const compact = out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  return compact ? `${compact}\n` : "";
}

function readCodexTomlServers(file: string): McpServer[] {
  const content = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
  const sections = content.split(/^\s*\[mcp_servers\.(.+?)\]\s*$/m);
  const servers: McpServer[] = [];
  for (let i = 1; i < sections.length; i += 2) {
    const rawName = sections[i].trim();
    const name = rawName.startsWith("\"") ? JSON.parse(rawName) : rawName;
    const body = sections[i + 1].split(/^\s*\[/m)[0];
    const command = unescapeTomlString(body.match(/^\s*command\s*=\s*"((?:\\.|[^"])*)"/m)?.[1]);
    const url = unescapeTomlString(body.match(/^\s*url\s*=\s*"((?:\\.|[^"])*)"/m)?.[1]);
    if (command) {
      const argsRaw = body.match(/^\s*args\s*=\s*\[(.*?)\]/m)?.[1] || "";
      const args = Array.from(argsRaw.matchAll(/"((?:\\.|[^"])*)"/g)).map((m) => unescapeTomlString(m[1]) || "");
      servers.push({ name, targets: ["codex"], tags: [], disabled: false, auth_mode: "none", transport: { type: "stdio", command, args, env: {} } });
    } else if (url) {
      const transport = body.includes('transport = "http"') ? "http" : "sse";
      servers.push({ name, targets: ["codex"], tags: [], disabled: false, auth_mode: "none", transport: { type: transport, url, headers: {} } as McpTransport });
    }
  }
  return servers;
}

function unescapeTomlString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(`"${value}"`);
}

function updateProjectRecord(projectPath: string, serverName: string, ides: string[], deployed: boolean): void {
  try {
    const store = ProjectStore.load();
    const project = store.getMut(projectPath);
    if (!project) return;
    if (deployed) {
      for (const ide of normalizedTargets(ides)) {
        if (!project.ides.includes(ide)) project.ides.push(ide);
      }
      if (!project.mcp_servers.includes(serverName)) project.mcp_servers.push(serverName);
    } else {
      const stillOnDisk = IDES.some((ide) => mcpIsSynced(serverName, ide.id, project.path));
      if (!stillOnDisk) project.mcp_servers = project.mcp_servers.filter((s) => s !== serverName);
    }
    store.save();
  } catch {}
}
