import { Router } from "express";
import { IDES, findIde } from "../../core/ide.js";
import { McpRegistry, type McpServer, type McpTransport, canonicalAdapterId, normalizedTargets, mcpIsSynced, projectsWithServer, syncOneGlobal, retractOneGlobal, deployToProject, undeployFromProject, listBundles, importBundle, removeBundle } from "../../core/mcp.js";
import { ProjectStore } from "../../core/projects.js";
import { page, pageHeader, btnPrimary, btnSecondary, btnDanger, emptyState, tag, type TagKind, esc, settingsGroup } from "../layout.js";
import type { AppState } from "../state.js";
import { toastInfo, toastError, invalidate } from "../tasks.js";
import * as paths from "../../core/paths.js";

const TEMPLATE = `{
  "server-name": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\\\"],
    "env": {},
    "targets": ["claude-code", "codex", "cursor", "vscode", "windsurf", "trae", "qoder", "kiro"]
  }
}`;

export function mcpRouter(st: AppState): Router {
  const router = Router();

  router.get("/mcp", (req, res) => {
    const q = ((req.query.q as string) || "").trim();
    const reg = tryLoad(() => st.mcp());
    const body = `
      ${pageHeader("MCP Servers", "", `
        <form hx-post="/mcp/sync" hx-swap="none">${btnSecondary("Sync all IDEs")}</form>
        <button type="button" class="btn-primary" onclick="document.getElementById('mcp-add').toggleAttribute('hidden')">Add server</button>
        <button type="button" class="btn-ghost" onclick="document.getElementById('mcp-bundles').toggleAttribute('hidden')">Bundles</button>
      `)}
      <div class="content-padding wide-content mcp-content">
        <div id="mcp-add" hidden>${addForms()}</div>
        <div id="mcp-bundles" hidden>${bundlesPanel()}</div>
        <form style="display:flex;gap:8px;align-items:center;margin-bottom:16px" hx-get="/mcp/fragment" hx-target="#mcp-list" hx-trigger="input changed delay:200ms from:input[name=q], refresh" hx-swap="innerHTML">
          <input name="q" class="field" placeholder="Filter servers\u2026" value="${esc(q)}" style="max-width:320px">
        </form>
        <div id="mcp-list" data-resource="mcp" hx-get="/mcp/fragment" hx-trigger="refresh from:body" hx-swap="innerHTML">${render(reg, q)}</div>
      </div>`;
    res.send(page("MCP", "/mcp", body));
  });

  router.get("/mcp/fragment", (req, res) => {
    res.send(render(tryLoad(() => st.mcp()), ((req.query.q as string) || "").trim()));
  });

  router.post("/mcp/add-json", (req, res) => {
    try {
      const servers = parseJsonServers(req.body.json || "");
      const reg = McpRegistry.load();
      for (const s of servers) reg.upsert(s);
      reg.save();
      toastInfo(st, `saved ${servers.length} server(s)`);
      invalidate(st, "mcp");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/mcp/add-quick", (req, res) => {
    try {
      const reg = McpRegistry.load();
      const args = (req.body.args || "").split(/\s+/).filter(Boolean);
      const targets = (req.body.targets || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      const bundle = (req.body.bundle || "").trim() || undefined;
      reg.upsert({
        name: req.body.name, transport: { type: "stdio", command: req.body.command, args, env: {}, cwd: undefined, bundle },
        targets, description: undefined, tags: [], disabled: false, source: undefined, runtime: undefined, auth_mode: "none",
      });
      reg.save();
      toastInfo(st, `added ${req.body.name}`);
      invalidate(st, "mcp");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/mcp/add-url", (req, res) => {
    try {
      const reg = McpRegistry.load();
      const targets = (req.body.targets || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      const transport: McpTransport = req.body.transport_type === "http"
        ? { type: "http", url: req.body.url, headers: {} }
        : { type: "sse", url: req.body.url, headers: {} };
      reg.upsert({
        name: req.body.name, transport, targets,
        description: undefined, tags: [], disabled: false, source: undefined, runtime: undefined, auth_mode: "none",
      });
      reg.save();
      toastInfo(st, `added ${req.body.name}`);
      invalidate(st, "mcp");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/mcp/:name/toggle", (req, res) => {
    try {
      const reg = McpRegistry.load();
      const s = reg.getMut(req.params.name);
      if (!s) { toastError(st, "not found"); return res.send("ok"); }
      s.disabled = !s.disabled;
      reg.save();
      toastInfo(st, `${req.params.name} ${s.disabled ? "disabled" : "enabled"}`);
      invalidate(st, "mcp");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/mcp/:name/remove", (req, res) => {
    try {
      const reg = McpRegistry.load();
      reg.remove(req.params.name);
      reg.save();
      toastInfo(st, `removed ${req.params.name}`);
      invalidate(st, "mcp");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/mcp/:name/deploy-action", (req, res) => {
    const name = req.params.name;
    const ide = (req.body.ide || "claude-code").trim();
    const action = req.body.action;
    const scope = req.body.scope;
    const remove = action === "remove";
    if (scope === "global") {
      try {
        const touched = remove ? retractOneGlobal(name, [ide]) : syncOneGlobal(name, [ide]);
        toastInfo(st, `${remove ? "removed" : "synced"} ${name} \u2192 ${ide} (${touched.length} file(s))`);
        invalidate(st, "mcp");
      } catch (e: any) { toastError(st, `sync: ${e.message}`); }
    } else {
      try {
        if (remove) undeployFromProject(name, scope, [ide]);
        else deployToProject(name, scope, [ide]);
        toastInfo(st, `${remove ? "undeployed" : "deployed"} ${name} \u2192 ${ide}`);
        invalidate(st, "mcp");
      } catch (e: any) { toastError(st, e.message); }
    }
    res.send("ok");
  });

  router.post("/mcp/sync", (req, res) => {
    toastInfo(st, "synced (stub)");
    invalidate(st, "mcp");
    res.send("ok");
  });

  router.post("/mcp/deploy-all-project", (req, res) => {
    toastInfo(st, "deploy all to project (stub)");
    res.send("ok");
  });

  router.post("/mcp/bundle/import", (req, res) => {
    try {
      const p = importBundle(req.body.name.trim(), req.body.src_path.trim());
      toastInfo(st, `bundle imported to ${p}`);
      invalidate(st, "mcp");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/mcp/bundle/:name/remove", (req, res) => {
    try {
      removeBundle(req.params.name);
      toastInfo(st, `bundle \`${req.params.name}\` moved to trash`);
      invalidate(st, "mcp");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  return router;
}

function tryLoad<T>(fn: () => T): T | undefined { try { return fn(); } catch { return undefined; } }

function addForms(): string {
  return `<div class="group-panel" style="margin-bottom:16px"><div style="padding:16px">
    <div style="font-size:14px;font-weight:600;margin-bottom:4px">Add MCP server \u2014 paste JSON</div>
    <div class="meta" style="margin-bottom:12px">Supports a single server or a map of name \u2192 config.</div>
    <form hx-post="/mcp/add-json" hx-swap="none" hx-on--after-request="this.reset();document.getElementById('mcp-add').setAttribute('hidden','');">
      <textarea name="json" class="field" rows="8" required>${esc(TEMPLATE)}</textarea>
      <div class="flex items-center gap-2" style="margin-top:8px">
        ${btnPrimary("Save")}
        <button type="button" class="btn-ghost" onclick="document.getElementById('mcp-quick').toggleAttribute('hidden')">Quick form</button>
        <button type="button" class="btn-ghost" onclick="document.getElementById('mcp-add').setAttribute('hidden','')">Cancel</button>
      </div>
    </form>
    <div id="mcp-quick" hidden style="margin-top:12px;border-top:1px solid var(--stroke-light);padding-top:12px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Stdio server</div>
      <form hx-post="/mcp/add-quick" hx-swap="none" hx-on--after-request="this.reset()" class="grid gap-3" style="grid-template-columns:repeat(4,1fr)">
        <div><label class="label">Name *</label><input name="name" required class="field"></div>
        <div><label class="label">Command *</label><input name="command" required placeholder="npx" class="field"></div>
        <div style="grid-column:span 2"><label class="label">Args</label><input name="args" placeholder="-y @mcp/server C:\\" class="field"></div>
        <div style="grid-column:span 2"><label class="label">Targets (comma)</label><input name="targets" value="claude-code,codex,cursor,vscode,windsurf,trae,qoder,kiro" class="field"></div>
        <div style="grid-column:span 2"><label class="label">Bundle (optional)</label><input name="bundle" class="field"></div>
        <div class="flex items-end">${btnPrimary("Add stdio")}</div>
      </form>
      <div style="font-size:13px;font-weight:600;margin:16px 0 8px">SSE / HTTP server</div>
      <form hx-post="/mcp/add-url" hx-swap="none" hx-on--after-request="this.reset()" class="grid gap-3" style="grid-template-columns:repeat(3,1fr)">
        <div><label class="label">Name *</label><input name="name" required class="field"></div>
        <div style="grid-column:span 2"><label class="label">URL *</label><input name="url" required class="field" placeholder="http://localhost:8080/sse"></div>
        <div><label class="label">Type</label><select name="transport_type" class="field"><option value="sse">SSE</option><option value="http">HTTP</option></select></div>
        <div style="grid-column:span 2"><label class="label">Targets (comma)</label><input name="targets" value="claude-code,codex,cursor,vscode,windsurf,trae,qoder,kiro" class="field"></div>
        <div class="flex items-end">${btnPrimary("Add URL server")}</div>
      </form>
    </div>
  </div></div>`;
}

function render(reg: McpRegistry | undefined, filter: string): string {
  if (!reg) return `<div style="color:var(--danger);padding:16px">Failed to load MCP registry.</div>`;
  const all = reg.list();
  const fl = filter.toLowerCase();
  const items = all.filter((s) => !fl || s.name.toLowerCase().includes(fl));
  if (all.length === 0) return emptyState("No MCP servers yet", 'Click "Add server" to register one.');
  if (items.length === 0) return emptyState("No matches", "Try a different filter.");
  const projects: [string, string][] = (() => { try { return ProjectStore.load().list().map((p) => [p.path, p.name] as [string, string]); } catch { return []; } })();

  return `<div class="group-panel"><table class="aiem">
    <thead><tr><th>Name</th><th>Transport</th><th>Targets</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${items.map((s) => renderRow(s, projects)).join("")}</tbody>
  </table></div>`;
}

function renderRow(s: McpServer, projects: [string, string][]): string {
  const kind = s.transport.type;
  const detail = s.transport.type === "stdio" ? `${s.transport.command} ${s.transport.args.join(" ")}` : (s.transport as any).url;
  const deployedOn = projectsWithServer(s.name);
  const rowId = s.name.replace(/[^a-zA-Z0-9]/g, "-");
  return `<tr>
    <td><span style="font-weight:500">${esc(s.name)}</span>${s.description ? `<div class="meta" style="margin-top:1px">${esc(s.description)}</div>` : ""}</td>
    <td>${tag(kind, "neutral")}</td>
    <td><div class="row-gap">${s.targets.map((t) => tag(t, "success")).join("")}</div></td>
    <td>${s.disabled ? tag("disabled", "danger") : `<span class="meta">\u2014</span>`}</td>
    <td style="text-align:right;white-space:nowrap"><div style="display:flex;gap:4px;justify-content:flex-end;align-items:center">
      <form hx-post="/mcp/${encodeURIComponent(s.name)}/deploy-action" hx-swap="none" class="mcp-action-bar">
        <select name="ide" class="field" style="width:auto;min-width:106px">${IDES.map((i) => `<option value="${i.id}">${esc(i.displayName)}</option>`).join("")}</select>
        <select name="scope" class="field" style="width:auto;min-width:94px"><option value="global">Global</option>${projects.map(([p, n]) => `<option value="${esc(p)}">${esc(n)}</option>`).join("")}</select>
        <button type="submit" name="action" value="deploy" class="btn-primary">Deploy</button>
        <button type="submit" name="action" value="remove" class="btn-danger" hx-confirm="Remove from the selected IDE/scope?">Remove</button>
      </form>
      <button type="button" class="btn-ghost" onclick="document.getElementById('mcp-detail-${rowId}').toggleAttribute('hidden')">More</button>
    </div></td>
  </tr>
  <tr id="mcp-detail-${rowId}" hidden>
    <td colspan="5" style="padding:12px 16px;background:var(--surface-alt);border-bottom:1px solid var(--stroke-light)">
      <div class="detail-split"><div class="detail-stack">
        <div><div class="label">Transport</div><div class="mono meta" style="word-break:break-all">${esc(detail)}</div></div>
        <div class="detail-action-row">
          <form hx-post="/mcp/${encodeURIComponent(s.name)}/toggle" hx-swap="none" style="display:inline">${btnSecondary(s.disabled ? "Enable" : "Disable")}</form>
          <form hx-post="/mcp/${encodeURIComponent(s.name)}/remove" hx-swap="none" hx-confirm="Remove this MCP server?" style="display:inline">${btnDanger("Remove")}</form>
        </div>
      </div><div>
        <div class="label">Project scope</div>
        ${deployedOn.length > 0 ? `<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">${deployedOn.map((n) => tag(n, "neutral")).join("")}</div>` : `<div class="meta">No projects deployed.</div>`}
      </div></div>
    </td>
  </tr>`;
}

function bundlesPanel(): string {
  const bundles = listBundles();
  const bundleDir = (() => { try { return paths.mcpBundlesDir(); } catch { return ""; } })();
  return `<div class="group-panel" style="margin-bottom:16px"><div style="padding:16px">
    <div style="font-size:14px;font-weight:600;margin-bottom:8px">MCP Bundles</div>
    <p class="meta" style="margin-bottom:12px">Copy a local script directory into <code class="mono">${esc(bundleDir)}</code>. Reference the deployed path via <code class="mono">{BUNDLE}</code>.</p>
    <form hx-post="/mcp/bundle/import" hx-swap="none" hx-on--after-request="this.reset()" class="grid gap-3" style="grid-template-columns:repeat(3,1fr);align-items:end;margin-bottom:12px">
      <div><label class="label">Bundle name *</label><input name="name" required placeholder="my-mcp" class="field"></div>
      <div style="grid-column:span 2"><label class="label">Source directory *</label><input name="src_path" required placeholder="/path/to/local/mcp" class="field"></div>
      <div>${btnPrimary("Import bundle")}</div>
    </form>
    ${bundles.length === 0 ? `<p class="meta">No bundles yet.</p>` : `<table class="aiem"><thead><tr><th>Name</th><th>Path</th><th style="text-align:right">Actions</th></tr></thead><tbody>
      ${bundles.map((b) => `<tr><td class="mono">${esc(b)}</td><td class="meta">${esc(bundleDir)}/${esc(b)}</td><td style="text-align:right"><form hx-post="/mcp/bundle/${encodeURIComponent(b)}/remove" hx-swap="none" hx-confirm="Move bundle ${esc(b)} to trash?" style="display:inline">${btnDanger("Delete")}</form></td></tr>`).join("")}
    </tbody></table>`}
  </div></div>`;
}

function parseJsonServers(input: string): McpServer[] {
  const val = JSON.parse(input.trim());
  if (typeof val !== "object" || val === null) throw new Error("Expected a JSON object");
  const servers: McpServer[] = [];
  if (val.command || val.url) {
    servers.push(jsonToServer(val.name || "unnamed", val));
  } else {
    for (const [name, config] of Object.entries(val)) {
      servers.push(jsonToServer(name, config as any));
    }
  }
  if (servers.length === 0) throw new Error("No servers found in JSON");
  return servers;
}

function jsonToServer(name: string, val: any): McpServer {
  let transport: McpTransport;
  if (val.command) {
    transport = { type: "stdio", command: val.command, args: val.args || [], env: val.env || {}, cwd: val.cwd, bundle: val.bundle || undefined };
  } else if (val.url) {
    transport = val.type === "http" ? { type: "http", url: val.url, headers: val.headers || {} } : { type: "sse", url: val.url, headers: val.headers || {} };
  } else {
    throw new Error(`${name}: need 'command' (stdio) or 'url' (http/sse)`);
  }
  return {
    name, transport, targets: val.targets || ["claude-code", "codex", "cursor", "vscode", "windsurf", "trae", "qoder", "kiro"],
    description: val.description, tags: [], disabled: false, source: undefined, runtime: undefined, auth_mode: "none",
  };
}
