import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import { SkillRegistry, type Skill, type SkillSource } from "../../core/skills.js";
import { McpRegistry, type McpServer } from "../../core/mcp.js";
import { page, pageHeader, btnPrimary, settingsGroup, tag, esc } from "../layout.js";
import type { AppState } from "../state.js";
import { toastInfo, toastError, invalidate } from "../tasks.js";
import * as paths from "../../core/paths.js";
import { hashDir } from "../../core/fs-util.js";
import { isSkillDir, collectSkillSubdirs, previewSkillDir, detectMcpServers, copyDirRecursive, type SkillPreviewEntry } from "../../core/github.js";

export function discoverRouter(st: AppState): Router {
  const router = Router();

  router.get("/discover", (_req, res) => {
    res.send(page("Discover", "/discover", `
      ${pageHeader("Discover", "Scan a local directory to discover skills & MCP servers.", "")}
      <div class="content-padding wide-content">
        ${settingsGroup("", scanLocalPanel())}
      </div>
    `));
  });

  router.post("/discover/scan-preview", (req, res) => {
    try {
      const scanPath = (req.body.path || "").trim();
      if (!scanPath) throw new Error("Path is required");
      const resolved = path.resolve(scanPath);
      if (!fs.existsSync(resolved)) throw new Error(`Path not found: ${resolved}`);
      if (!fs.statSync(resolved).isDirectory()) throw new Error(`Not a directory: ${resolved}`);

      const skills: SkillPreviewEntry[] = [];
      if (isSkillDir(resolved)) {
        skills.push(previewSkillDir(resolved, ""));
      } else {
        for (const sd of collectSkillSubdirs(resolved)) {
          skills.push(previewSkillDir(resolved, sd));
        }
      }
      const mcpServers = detectMcpServers(resolved);

      if (skills.length === 0 && mcpServers.length === 0) {
        throw new Error("No skills (SKILL.md) or MCP servers found in this directory");
      }

      const previewData = JSON.stringify({ rootDir: resolved, skills, mcpServers });
      res.send(renderScanPreview(resolved, skills, mcpServers, previewData));
    } catch (e: any) {
      res.send(`<div style="color:var(--danger);padding:8px;font-size:var(--font-xs)">\u2717 ${esc(e.message)}</div>`);
    }
  });

  router.post("/discover/scan-confirm", (req, res) => {
    try {
      const data = JSON.parse(req.body.preview_data || "{}");
      const { rootDir, skills: allSkills, mcpServers: allMcp } = data;
      const allSkillsList: SkillPreviewEntry[] = allSkills || [];
      const allMcpList: McpServer[] = allMcp || [];

      const selectedSkills = new Set<number>(toIndexArray(req.body.sel_skill));
      const selectedMcp = new Set<number>(toIndexArray(req.body.sel_mcp));

      const skillsToInstall = allSkillsList.filter((_, i) => selectedSkills.has(i));
      const serversToImport = allMcpList.filter((_, i) => selectedMcp.has(i));

      if (skillsToInstall.length === 0 && serversToImport.length === 0) throw new Error("Nothing selected");

      const reg = SkillRegistry.load();
      let installed = 0;
      for (const entry of skillsToInstall) {
        const srcDir = entry.subdir ? path.join(rootDir, entry.subdir) : rootDir;
        if (!fs.existsSync(srcDir)) continue;
        const source: SkillSource = { type: "local", path: srcDir };
        const id = `local__${entry.name}`;
        const destDir = path.join(paths.skillsDir(), id);
        fs.mkdirSync(destDir, { recursive: true });
        copyDirRecursive(srcDir, destDir);
        const skillMd = path.join(destDir, "SKILL.md");
        let description: string | undefined;
        try { description = fs.readFileSync(skillMd, "utf-8").split("\n").find((l) => l.trim())?.replace(/^#+\s*/, ""); } catch {}
        const skill: Skill = {
          id, name: entry.name, source, version: new Date().toISOString(),
          path: destDir, description, installed_at: new Date().toISOString(),
          deployments: {}, file_hashes: hashDir(destDir),
        };
        reg.upsert(skill);
        installed++;
      }
      reg.save();

      let importedMcp = 0;
      if (serversToImport.length > 0) {
        const mcpReg = McpRegistry.load();
        for (const s of serversToImport) {
          mcpReg.upsert(s);
          importedMcp++;
        }
        mcpReg.save();
        invalidate(st, "mcp");
      }

      toastInfo(st, `installed ${installed} skill(s), imported ${importedMcp} MCP server(s) from local scan`);
      invalidate(st, "skills");
    } catch (e: any) {
      toastError(st, e.message);
      res.status(400).send(e.message);
      return;
    }
    res.send("ok");
  });

  return router;
}

function toIndexArray(val: unknown): number[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val.map(Number).filter((n) => !isNaN(n));
  const n = Number(val);
  return isNaN(n) ? [] : [n];
}

function toggleAllJs(group: string): string {
  return `var c=this.checked;document.querySelectorAll('input[name=${group}]').forEach(function(x){x.checked=c})`;
}

function scanLocalPanel(): string {
  return `
    <div style="padding:12px 16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div style="font-size:14px;font-weight:600">Scan local directory</div>
      </div>
      <div class="meta" style="margin-bottom:12px">Enter a local directory path to discover skills (SKILL.md) and MCP server configurations.</div>
      <form hx-post="/discover/scan-preview" hx-swap="innerHTML" hx-target="#discover-scan-result">
        <div style="display:flex;gap:8px;align-items:end">
          <div style="flex:1"><label class="label">Directory path</label><input name="path" required class="field" placeholder="/path/to/skills or C:\\path\\to\\skills"></div>
          ${btnPrimary("Scan")}
        </div>
      </form>
      <div id="discover-scan-result" style="margin-top:8px"></div>
    </div>`;
}

function renderScanPreview(rootDir: string, skills: SkillPreviewEntry[], mcpServers: McpServer[], previewData: string): string {
  const skillRows = skills.map((s, i) => `<tr>
    <td><input type="checkbox" name="sel_skill" value="${i}" form="discover-scan-confirm" checked></td>
    <td style="font-weight:500">${esc(s.name)}</td>
    <td class="mono meta">${esc(s.subdir || "/")}</td>
    <td class="meta" style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.description)}</td>
    <td style="text-align:right">${s.fileCount} files</td>
  </tr>`).join("");
  const mcpRows = mcpServers.map((s, i) => {
    const t = s.transport;
    const detail = t.type === "stdio" ? `${t.command} ${t.args.join(" ")}` : (t as any).url;
    return `<tr>
      <td><input type="checkbox" name="sel_mcp" value="${i}" form="discover-scan-confirm" checked></td>
      <td style="font-weight:500">${esc(s.name)}</td>
      <td>${tag(t.type, "neutral")}</td>
      <td class="mono meta" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(detail)}</td>
      <td>${s.runtime ? tag(s.runtime, "neutral") : '<span class="meta">\u2014</span>'}</td>
    </tr>`;
  }).join("");
  return `<div class="group-panel" style="padding:12px;margin-top:8px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="color:var(--success);font-weight:600">\u2713 Scanned: ${esc(rootDir)}</span>
    </div>
    ${skills.length > 0 ? `<div style="margin-bottom:12px">
      <div style="font-size:13px;font-weight:600;margin-bottom:4px">Skills found (${skills.length})</div>
      <table class="aiem"><thead><tr>
        <th style="width:32px"><input type="checkbox" checked onclick="${toggleAllJs("sel_skill")}"></th>
        <th>Name</th><th>Subdir</th><th>Description</th><th style="text-align:right">Files</th>
      </tr></thead>
      <tbody>${skillRows}</tbody></table>
    </div>` : ""}
    ${mcpServers.length > 0 ? `<div style="margin-bottom:12px">
      <div style="font-size:13px;font-weight:600;margin-bottom:4px">MCP servers found (${mcpServers.length})</div>
      <table class="aiem"><thead><tr>
        <th style="width:32px"><input type="checkbox" checked onclick="${toggleAllJs("sel_mcp")}"></th>
        <th>Name</th><th>Transport</th><th>Command / URL</th><th>Runtime</th>
      </tr></thead>
      <tbody>${mcpRows}</tbody></table>
    </div>` : ""}
    <form id="discover-scan-confirm" hx-post="/discover/scan-confirm" hx-swap="none"
          hx-on--after-request="if(event.detail.xhr.status>=200&&event.detail.xhr.status<300){document.getElementById('discover-scan-result').innerHTML='<span style=\\'color:var(--success)\\'>Imported successfully!</span>'}">
      <input type="hidden" name="preview_data" value="${esc(previewData)}">
      <div style="display:flex;gap:8px;align-items:center">
        ${btnPrimary("Import selected")}
        <button type="button" class="btn-ghost" onclick="document.getElementById('discover-scan-result').innerHTML=''">Cancel</button>
      </div>
    </form>
  </div>`;
}
