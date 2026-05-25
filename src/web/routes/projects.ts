import { Router } from "express";
import * as path from "path";
import * as fs from "fs";
import { ProjectStore, detectProjectIdes } from "../../core/projects.js";
import { page, pageHeader, btnPrimary, btnDanger, emptyState, settingsGroup, esc } from "../layout.js";
import type { AppState } from "../state.js";
import { toastInfo, toastError, invalidate } from "../tasks.js";

export function projectsRouter(st: AppState): Router {
  const router = Router();

  router.get("/projects", (_req, res) => {
    const store = tryLoad(() => st.projects());
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

function renderProjects(store: ProjectStore | undefined): string {
  if (!store) return `<div style="color:var(--danger);padding:16px">Load failed.</div>`;
  const items = store.list();
  if (items.length === 0) return emptyState("No projects registered", "Register one above.");
  return settingsGroup("", `<table class="aiem">
    <thead><tr><th>Name</th><th>Path</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${items.map((p) => `<tr>
      <td style="font-weight:500">${esc(p.name)}</td>
      <td class="mono meta" style="word-break:break-all">${esc(p.path)}</td>
      <td style="text-align:right;white-space:nowrap">
        <form hx-post="/projects/remove" hx-swap="none" hx-confirm="Remove this project entry?" style="display:inline"><input type="hidden" name="path" value="${esc(p.path)}">${btnDanger("Remove")}</form>
      </td>
    </tr>`).join("")}</tbody>
  </table>`);
}
