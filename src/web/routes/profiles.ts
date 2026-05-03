import { Router } from "express";
import { ProfileStore, type Profile } from "../../core/profiles.js";
import { page, pageHeader, btnPrimary, btnSecondary, btnDanger, emptyState, settingsGroup, tag, esc } from "../layout.js";
import type { AppState } from "../state.js";
import { toastInfo, toastError, invalidate } from "../tasks.js";

export function profilesRouter(st: AppState): Router {
  const router = Router();

  router.get("/profiles", (_req, res) => {
    res.send(page("Profiles", "/profiles", `
      ${pageHeader("Profiles", "", "")}
      <div class="content-padding">
        ${settingsGroup("Create profile", `<div style="padding:12px 16px">
          <form hx-post="/profiles/create" hx-swap="none" class="grid gap-3" style="grid-template-columns:1fr 1fr auto">
            <div><label class="label">Name *</label><input name="name" required class="field"></div>
            <div><label class="label">Description</label><input name="description" class="field"></div>
            <div class="flex items-end">${btnPrimary("Create")}</div>
          </form>
        </div>`)}
        <div data-resource="profiles" hx-get="/profiles/fragment" hx-trigger="refresh from:body, load" hx-swap="innerHTML">${renderProfiles(tryLoad(() => st.profiles()))}</div>
      </div>
    `));
  });

  router.get("/profiles/fragment", (_req, res) => {
    res.send(renderProfiles(tryLoad(() => st.profiles())));
  });

  router.post("/profiles/create", (req, res) => {
    try {
      const store = ProfileStore.load();
      store.upsert({ name: req.body.name, description: (req.body.description || "").trim() || undefined, skills: [], mcp_servers: [] });
      store.save();
      toastInfo(st, `created ${req.body.name}`);
      invalidate(st, "profiles");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/profiles/:name/activate", (req, res) => {
    try {
      const store = ProfileStore.load();
      store.setActive(req.params.name);
      store.save();
      toastInfo(st, `activated ${req.params.name}`);
      invalidate(st, "profiles");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/profiles/deactivate", (_req, res) => {
    try {
      const store = ProfileStore.load();
      store.setActive(null);
      store.save();
      toastInfo(st, "deactivated");
      invalidate(st, "profiles");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/profiles/:name/remove", (req, res) => {
    try {
      const store = ProfileStore.load();
      store.remove(req.params.name);
      store.save();
      toastInfo(st, `removed ${req.params.name}`);
      invalidate(st, "profiles");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  return router;
}

function tryLoad<T>(fn: () => T): T | undefined { try { return fn(); } catch { return undefined; } }

function renderProfiles(store: ProfileStore | undefined): string {
  if (!store) return `<div style="color:var(--danger);padding:16px">Load failed.</div>`;
  const items = store.list();
  if (items.length === 0) return emptyState("No profiles yet", "Create one above to bundle skills & MCP servers.");
  const active = store.activeName();
  return settingsGroup("", `<table class="aiem">
    <thead><tr><th>Name</th><th>Description</th><th>Skills / MCP</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${items.map((p) => {
      const isActive = active === p.name;
      return `<tr>
        <td style="font-weight:500">${esc(p.name)}</td>
        <td class="meta">${esc(p.description || "")}</td>
        <td class="meta">${p.skills.length} skills \u00b7 ${p.mcp_servers.length} MCP</td>
        <td>${isActive ? tag("active", "success") : `<span class="meta">\u2014</span>`}</td>
        <td style="text-align:right;white-space:nowrap"><div class="row-gap" style="justify-content:flex-end">
          ${isActive
            ? `<form hx-post="/profiles/deactivate" hx-swap="none">${btnSecondary("Deactivate")}</form>`
            : `<form hx-post="/profiles/${encodeURIComponent(p.name)}/activate" hx-swap="none">${btnSecondary("Activate")}</form>`}
          <form hx-post="/profiles/${encodeURIComponent(p.name)}/remove" hx-swap="none" hx-confirm="Delete profile?">${btnDanger("Delete")}</form>
        </div></td>
      </tr>`;
    }).join("")}</tbody>
  </table>`);
}
