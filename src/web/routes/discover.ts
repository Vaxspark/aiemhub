import { Router } from "express";
import { discoverSkills, discoverMcp, importSkill, importAllSkills, importAllMcp, type FoundSkill } from "../../core/discover.js";
import { SkillRegistry } from "../../core/skills.js";
import { page, pageHeader, btnPrimary, btnSecondary, emptyState, settingsGroup, esc } from "../layout.js";
import type { AppState } from "../state.js";
import { toastInfo, toastError, invalidate } from "../tasks.js";

export function discoverRouter(st: AppState): Router {
  const router = Router();

  router.get("/discover", (_req, res) => {
    const skills = (() => { try { return discoverSkills(); } catch { return []; } })();
    const mcps = (() => { try { return discoverMcp(); } catch { return []; } })();
    res.send(page("Discover", "/discover", `
      ${pageHeader("Discover", "Scan your IDEs for unmanaged skills & MCP servers.", "")}
      <div class="content-padding wide-content">
        ${settingsGroup("", `
          <div style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:14px;font-weight:600">Unmanaged skills (${skills.length})</div>
            ${skills.length > 0 ? `<form hx-post="/discover/import-all-skills" hx-swap="none" class="flex gap-2 items-center">
              <label class="meta"><input type="checkbox" name="copy" value="true" checked> Copy to ~/.aiem</label>
              ${btnPrimary("Import all")}
            </form>` : ""}
          </div>
          ${skills.length === 0 ? emptyState("Nothing to import", "All skills on disk are already managed.") : `
            <table class="aiem"><thead><tr><th>Directory</th><th>IDE</th><th>Path</th><th style="text-align:right">Actions</th></tr></thead><tbody>
              ${skills.map((s) => `<tr>
                <td style="font-weight:500">${esc(s.dir_name)}</td>
                <td class="meta">${esc(s.ide_id)}</td>
                <td class="mono meta" style="word-break:break-all">${esc(s.path)}</td>
                <td style="text-align:right"><form hx-post="/discover/import-skill" hx-swap="none" class="flex gap-2 items-center justify-end">
                  <input type="hidden" name="path" value="${esc(s.path)}">
                  <input type="hidden" name="ide" value="${esc(s.ide_id)}">
                  <input type="hidden" name="name" value="${esc(s.dir_name)}">
                  <label class="meta"><input type="checkbox" name="copy" value="true" checked> Copy</label>
                  ${btnSecondary("Import")}
                </form></td>
              </tr>`).join("")}
            </tbody></table>`}
        `)}
        ${settingsGroup("", `
          <div style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:14px;font-weight:600">Unmanaged MCP servers (${mcps.length})</div>
            ${mcps.length > 0 ? `<form hx-post="/discover/import-all-mcp" hx-swap="none">${btnPrimary("Import all")}</form>` : ""}
          </div>
          ${mcps.length === 0 ? emptyState("Nothing to import", "No unmanaged MCP servers detected.") : `
            <table class="aiem"><thead><tr><th>Name</th><th>IDE</th><th>Transport</th><th style="text-align:right">Actions</th></tr></thead><tbody>
              ${mcps.map((m) => `<tr>
                <td style="font-weight:500">${esc(m.server.name)}</td>
                <td class="meta">${esc(m.source_ide)}</td>
                <td class="mono meta">${esc(m.server.transport.type)}</td>
                <td style="text-align:right"><form hx-post="/discover/import-mcp" hx-swap="none"><input type="hidden" name="name" value="${esc(m.server.name)}">${btnSecondary("Import")}</form></td>
              </tr>`).join("")}
            </tbody></table>`}
        `)}
      </div>
    `));
  });

  router.post("/discover/import-skill", (req, res) => {
    const found: FoundSkill = { path: req.body.path, ide_id: req.body.ide, dir_name: req.body.name, is_link: false };
    try {
      const skill = importSkill(found, req.body.copy === "true");
      const reg = SkillRegistry.load();
      reg.upsert(skill);
      reg.save();
      toastInfo(st, `imported ${req.body.name}`);
      invalidate(st, "skills");
    } catch (e: any) { toastError(st, `import: ${e.message}`); }
    res.send("ok");
  });

  router.post("/discover/import-all-skills", (req, res) => {
    try {
      const found = discoverSkills();
      const n = importAllSkills(found, req.body.copy === "true");
      toastInfo(st, `imported ${n} skill(s)`);
      invalidate(st, "skills");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/discover/import-mcp", (req, res) => {
    toastInfo(st, "MCP import (stub)");
    res.send("ok");
  });

  router.post("/discover/import-all-mcp", (req, res) => {
    toastInfo(st, "MCP import all (stub)");
    res.send("ok");
  });

  return router;
}
