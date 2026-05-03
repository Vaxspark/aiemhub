import { Router } from "express";
import * as path from "path";
import * as fs from "fs";
import { IDES } from "../../core/ide.js";
import { ProjectStore, type Project, detectProjectIdes } from "../../core/projects.js";
import { SkillRegistry, deploySkill, undeploySkill } from "../../core/skills.js";
import { McpRegistry } from "../../core/mcp.js";
import { page, pageHeader, btnPrimary, btnSecondary, btnDanger, emptyState, settingsGroup, card, tag, esc } from "../layout.js";
import type { AppState } from "../state.js";
import { toastInfo, toastError, invalidate } from "../tasks.js";

export function projectsRouter(st: AppState): Router {
  const router = Router();

  router.get("/projects", (req, res) => {
    const store = tryLoad(() => st.projects());
    const skills = tryLoad(() => SkillRegistry.load());
    const mcp = tryLoad(() => McpRegistry.load());
    const editPath = (req.query.edit as string) || undefined;
    res.send(page("Projects", "/projects", `
      ${pageHeader("Projects", "", "")}
      <div class="content-padding wide-content">
        ${settingsGroup("Register project", `<div style="padding:12px 16px">
          <form hx-post="/projects/add" hx-swap="none" class="grid gap-3" style="grid-template-columns:2fr 1fr auto">
            <div><label class="label">Absolute path *</label><input name="path" required placeholder="/home/user/my-project" class="field"></div>
            <div><label class="label">Name</label><input name="name" placeholder="auto from folder" class="field"></div>
            <div class="flex items-end">${btnPrimary("Register")}</div>
          </form>
        </div>`)}
        ${editPath && store ? (() => { const p = store.get(editPath); return p ? renderEditor(p, skills, mcp) : ""; })() : ""}
        <div data-resource="projects" hx-get="/projects/fragment" hx-trigger="refresh from:body, load" hx-swap="innerHTML">${renderProjects(store)}</div>
      </div>
    `));
  });

  router.get("/projects/fragment", (req, res) => {
    res.send(renderProjects(tryLoad(() => st.projects())));
  });

  router.post("/projects/add", (req, res) => {
    const p = (req.body.path || "").trim();
    if (!p) { toastError(st, "path is required"); return res.send("ok"); }
    if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) { toastError(st, "directory does not exist on this server"); return res.send("ok"); }
    const name = (req.body.name || "").trim() || path.basename(p) || "project";
    try {
      const store = ProjectStore.load();
      store.upsert({ name, path: p, ides: detectProjectIdes(p), skills: [], mcp_servers: [] });
      store.save();
      toastInfo(st, `registered ${name}`);
      invalidate(st, "projects");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/projects/save", (req, res) => {
    const body = req.body;
    const projectPath = body.path;
    const ides = toArray(body.ides);
    const skills = toArray(body.skills);
    const mcpServers = toArray(body.mcp_servers);
    const deploy = !!body.deploy;
    try {
      const store = ProjectStore.load();
      const project = store.getMut(projectPath);
      if (!project) { toastError(st, "project not found"); return res.send("ok"); }
      project.ides = ides;
      project.skills = skills;
      project.mcp_servers = mcpServers;
      store.save();
      if (deploy) {
        const reg = SkillRegistry.load();
        let count = 0;
        for (const sid of skills) {
          for (const ide of ides) {
            const skill = reg.get(sid);
            if (skill) { deploySkill(skill, ide, projectPath); reg.upsert(skill); count++; }
          }
        }
        reg.save();
        toastInfo(st, `deployed ${count} skill\u00d7IDE link(s)`);
      } else {
        toastInfo(st, "project config saved");
      }
      invalidate(st, "projects"); invalidate(st, "skills"); invalidate(st, "mcp");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/projects/sync", (req, res) => {
    toastInfo(st, "synced (stub)");
    invalidate(st, "skills"); invalidate(st, "mcp");
    res.send("ok");
  });

  router.post("/projects/remove", (req, res) => {
    try {
      const store = ProjectStore.load();
      store.remove(req.body.path);
      store.save();
      toastInfo(st, "removed");
      invalidate(st, "projects"); invalidate(st, "skills"); invalidate(st, "mcp");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  return router;
}

function tryLoad<T>(fn: () => T): T | undefined { try { return fn(); } catch { return undefined; } }
function toArray(v: unknown): string[] { if (Array.isArray(v)) return v; if (typeof v === "string" && v) return [v]; return []; }

function shortId(id: string): string {
  let tail = id;
  const pos = id.lastIndexOf("__");
  if (pos >= 0) tail = id.slice(pos + 2);
  return tail.split(/[/\\_]/).filter(Boolean).pop() || tail;
}

function renderProjects(store: ProjectStore | undefined): string {
  if (!store) return `<div style="color:var(--danger);padding:16px">Load failed.</div>`;
  const items = store.list();
  if (items.length === 0) return emptyState("No projects registered", "Register one above, then configure skills and MCP for that project.");
  return settingsGroup("", `<table class="aiem">
    <thead><tr><th>Name</th><th>Path</th><th>IDEs</th><th>Skills</th><th>MCP</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${items.map((p) => `<tr>
      <td style="font-weight:500">${esc(p.name)}</td>
      <td class="mono meta" style="word-break:break-all">${esc(p.path)}</td>
      <td class="meta">${p.ides.length === 0 ? "\u2014" : p.ides.map((i) => tag(i, "neutral")).join(" ")}</td>
      <td class="meta">${p.skills.length}</td>
      <td class="meta">${p.mcp_servers.length}</td>
      <td style="text-align:right;white-space:nowrap">
        <a class="btn" href="/projects?edit=${encodeURIComponent(p.path)}">Configure</a>
        <form hx-post="/projects/sync" hx-swap="none" style="display:inline"><input type="hidden" name="path" value="${esc(p.path)}">${btnSecondary("Sync")}</form>
        <form hx-post="/projects/remove" hx-swap="none" hx-confirm="Remove project entry and undeploy its managed skills/MCP?" style="display:inline"><input type="hidden" name="path" value="${esc(p.path)}">${btnDanger("Remove")}</form>
      </td>
    </tr>`).join("")}</tbody>
  </table>`);
}

function renderEditor(project: Project, skills: SkillRegistry | undefined, mcp: McpRegistry | undefined): string {
  const selectedIdes = new Set(project.ides);
  const selectedSkills = new Set(project.skills);
  const selectedMcp = new Set(project.mcp_servers);
  return card(`
    <div class="flex items-center justify-between mb-2">
      <div><div class="text-sm font-semibold">Configure: ${esc(project.name)}</div><div class="meta mono" style="word-break:break-all">${esc(project.path)}</div></div>
      <a class="btn-ghost" href="/projects">Close</a>
    </div>
    <form hx-post="/projects/save" hx-swap="none" class="grid gap-4">
      <input type="hidden" name="path" value="${esc(project.path)}">
      <div><div class="text-xs font-semibold mb-1">Target IDEs</div><div class="row-gap">
        ${IDES.map((t) => `<label class="tag"><input type="checkbox" name="ides" value="${t.id}"${selectedIdes.has(t.id) ? " checked" : ""}> ${esc(t.displayName)}</label>`).join("")}
      </div></div>
      <div class="project-picker-grid">
        <div class="project-picker"><div class="text-xs font-semibold mb-1">Skills</div><div class="meta mb-2">Choose skills to link into this project.</div>
          <div class="check-list project-check-list">
            ${skills ? skills.list().map((s) => `<label><input type="checkbox" name="skills" value="${esc(s.id)}"${selectedSkills.has(s.id) ? " checked" : ""}> ${esc(shortId(s.id))}</label>`).join("") : `<span class="meta">Failed to load skills.</span>`}
          </div>
        </div>
        <div class="project-picker"><div class="text-xs font-semibold mb-1">MCP Servers</div><div class="meta mb-2">Choose servers to write into project MCP configs.</div>
          <div class="check-list project-check-list">
            ${mcp ? mcp.list().map((s) => `<label><input type="checkbox" name="mcp_servers" value="${esc(s.name)}"${selectedMcp.has(s.name) ? " checked" : ""}> ${esc(s.name)}</label>`).join("") : `<span class="meta">Failed to load MCP servers.</span>`}
          </div>
        </div>
      </div>
      <div class="flex gap-2"><button type="submit" name="deploy" value="true" class="btn-primary">Save & Deploy</button>${btnSecondary("Save only")}</div>
    </form>
  `);
}
