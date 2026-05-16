import { Router, Request, Response } from "express";
import * as fs from "fs";
import { IDES, findIde } from "../../core/ide.js";
import { SkillRegistry, type Skill, type SkillSource, parseGithubSource, applyGithubProxyEnv, canonicalId, createLocalSkill, deploySkill, undeploySkill, undeployAllGlobal, removeSkill, readSkillContent, listSkillFiles } from "../../core/skills.js";
import { McpRegistry } from "../../core/mcp.js";
import { ProjectStore } from "../../core/projects.js";
import { page, pageHeader, btnPrimary, btnSecondary, btnDanger, emptyState, tag, type TagKind, esc, ideOptions, settingsGroup } from "../layout.js";
import type { AppState } from "../state.js";
import { toastInfo, toastError, invalidate, taskStarted, taskFinished } from "../tasks.js";
import * as path from "path";
import * as paths from "../../core/paths.js";
import { hashDir } from "../../core/fs-util.js";
import { parseGithubInput, previewSkillsFromGithub, copyDirRecursive, materializeGithubMcpBundle, type SkillsGithubPreview } from "../../core/github.js";

export function skillsRouter(st: AppState): Router {
  const router = Router();

  router.get("/skills", (req, res) => {
    const q = ((req.query.q as string) || "").trim();
    const skills = tryLoad(() => st.skills());
    const projects = tryLoad(() => ProjectStore.load());
    const body = `
      ${pageHeader("Skills", "", `
        <form hx-post="/skills/clear-global" hx-swap="none" hx-confirm="Remove every symlinked skill from every IDE's global config?">
          ${btnDanger("Clear global")}
        </form>
        <button type="button" class="btn-secondary" onclick="document.getElementById('create-skill').toggleAttribute('hidden')">New local</button>
        <button type="button" class="btn-primary" onclick="document.getElementById('add-skill').toggleAttribute('hidden')">Add from GitHub</button>
      `)}
      <div class="content-padding skills-content">
        <div id="add-skill" hidden>${addForm()}</div>
        <div id="create-skill" hidden>${createForm()}</div>
        <form style="display:flex;gap:8px;align-items:center;margin-bottom:16px"
              hx-get="/skills/fragment" hx-target="#skills-list"
              hx-trigger="input changed delay:200ms from:input[name=q], refresh, submit"
              hx-swap="innerHTML">
          <input name="q" class="field" placeholder="Filter skills\u2026" value="${esc(q)}" style="max-width:320px">
        </form>
        <div id="skills-list" data-resource="skills"
             hx-get="/skills/fragment" hx-trigger="refresh from:body" hx-swap="innerHTML">
          ${renderList(skills, projects, q)}
        </div>
      </div>`;
    res.send(page("Skills", "/skills", body));
  });

  router.get("/skills/fragment", (req, res) => {
    const q = ((req.query.q as string) || "").trim();
    res.send(renderList(tryLoad(() => st.skills()), tryLoad(() => ProjectStore.load()), q));
  });

  router.post("/skills/github-preview", async (req, res) => {
    try {
      const source = applyGithubProxyEnv((req.body.source || "").trim());
      const subdirInput = (req.body.subdir || "").trim() || undefined;
      const refInput = (req.body.reference || "").trim() || undefined;
      if (!source) throw new Error("Source is required");
      const parsed = parseGithubInput(source);
      if (!parsed) throw new Error("Expected format: owner/repo or GitHub URL");
      const preview = await previewSkillsFromGithub(parsed.owner, parsed.repo, refInput || parsed.ref, subdirInput || parsed.subdir);
      res.send(renderSkillsPreview(preview));
    } catch (e: any) {
      res.send(`<div style="color:var(--danger);padding:8px;font-size:var(--font-xs)">\u2717 ${esc(e.message)}</div>`);
    }
  });

  router.post("/skills/github-confirm", async (req, res) => {
    try {
      const data = JSON.parse(req.body.preview_data || "{}");
      const { owner, repo, ref, sha, tempDir, topDir, skills: previewSkills, mcpServers } = data as SkillsGithubPreview;
      const skillsToInstall = previewSkills || [];
      const serversToImport = mcpServers || [];
      if (skillsToInstall.length === 0 && serversToImport.length === 0) throw new Error("Nothing to install");
      const reg = SkillRegistry.load();
      let installed = 0;
      for (const entry of skillsToInstall) {
        const srcDir = entry.subdir ? path.join(topDir, entry.subdir) : topDir;
        if (!fs.existsSync(srcDir)) continue;
        const source: SkillSource = { type: "github", owner, repo, ref, subdir: entry.subdir || undefined };
        const id = canonicalId(source);
        const destDir = path.join(paths.skillsDir(), id);
        fs.mkdirSync(destDir, { recursive: true });
        copyDirRecursive(srcDir, destDir);
        const skillMd = path.join(destDir, "SKILL.md");
        let description: string | undefined;
        try { description = fs.readFileSync(skillMd, "utf-8").split("\n").find((l) => l.trim())?.replace(/^#+\s*/, ""); } catch {}
        const skill: Skill = {
          id, name: entry.name, source, version: sha || new Date().toISOString(),
          path: destDir, description, installed_at: new Date().toISOString(),
          deployments: {}, file_hashes: hashDir(destDir),
        };
        reg.upsert(skill);
        installed++;
      }
      reg.save();
      let importedMcp = 0;
      if (serversToImport.length > 0 && req.body.import_mcp === "on") {
        const mcpReg = McpRegistry.load();
        for (const s of serversToImport) {
          mcpReg.upsert(materializeGithubMcpBundle(s, topDir));
          importedMcp++;
        }
        mcpReg.save();
        invalidate(st, "mcp");
      }
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
      toastInfo(st, `installed ${installed} skill(s), imported ${importedMcp} MCP server(s) from ${owner}/${repo}`);
      invalidate(st, "skills");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/skills/create", async (req, res) => {
    const name = (req.body.name || "").trim();
    const content = (req.body.content || "").trim();
    if (!name || !content) { toastError(st, "name and content are required"); return res.status(400).send("empty"); }
    try {
      const skill = createLocalSkill(name, content);
      toastInfo(st, `created skill: ${skill.name}`);
      invalidate(st, "skills");
    } catch (e: any) { toastError(st, `create: ${e.message}`); }
    res.send("ok");
  });

  router.post("/skills/clear-global", async (req, res) => {
    try {
      const reg = SkillRegistry.load();
      const n = undeployAllGlobal(reg);
      reg.save();
      toastInfo(st, `cleared ${n} global deployment(s)`);
      invalidate(st, "skills");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.get("/skills/view", (req, res) => {
    const id = req.query.id as string;
    try {
      const content = readSkillContent(id);
      res.send(`<pre class="skill-md-preview">${esc(content)}</pre>`);
    } catch (e: any) {
      res.send(`<div style="color:var(--danger);font-size:13px">Failed to read: ${esc(e.message)}</div>`);
    }
  });

  router.get("/skills/files", (req, res) => {
    const id = req.query.id as string;
    const files = listSkillFiles(id);
    const reg = SkillRegistry.load();
    const skill = reg.get(id);
    res.send(`<div style="max-width:900px;margin:0 auto;padding:24px">
      <h2 style="font-size:18px;font-weight:600;margin-bottom:4px">Files: ${esc(id)}</h2>
      ${skill ? `<p class="meta" style="margin-bottom:16px">${esc(skill.path)}</p>` : ""}
      ${files.length === 0 ? `<p class="meta">No files found.</p>` : `
        <table class="aiem"><thead><tr><th>File</th><th style="text-align:right">Size</th></tr></thead><tbody>
        ${files.map(([f, s]) => `<tr><td class="mono">${esc(f)}</td><td style="text-align:right;white-space:nowrap" class="meta">${formatSize(s)}</td></tr>`).join("")}
        </tbody></table>`}
    </div>`);
  });

  router.post("/skills/:id/deploy", async (req, res) => {
    const id = req.params.id;
    const ideId = req.body.ide;
    const project = (req.body.project || "").trim() || undefined;
    try {
      const reg = SkillRegistry.load();
      const skill = reg.get(id);
      if (!skill) { toastError(st, `${id} not found`); return res.status(404).send("nf"); }
      const link = deploySkill(skill, ideId, project);
      reg.upsert(skill);
      reg.save();
      toastInfo(st, `deployed \u2192 ${link}`);
      invalidate(st, "skills");
    } catch (e: any) { toastError(st, `deploy: ${e.message}`); }
    res.send("ok");
  });

  router.post("/skills/:id/undeploy", async (req, res) => {
    const id = req.params.id;
    const ideId = req.body.ide;
    const project = (req.body.project || "").trim() || undefined;
    try {
      const reg = SkillRegistry.load();
      const skill = reg.get(id);
      if (!skill) { toastError(st, `${id} not found`); return res.status(404).send("nf"); }
      undeploySkill(skill, ideId, project);
      reg.upsert(skill);
      reg.save();
      toastInfo(st, `undeployed ${id}`);
      invalidate(st, "skills");
    } catch (e: any) { toastError(st, `undeploy: ${e.message}`); }
    res.send("ok");
  });

  router.post("/skills/:id/update", (req, res) => {
    toastInfo(st, "GitHub update not yet implemented in TS build");
    res.status(202).send("ok");
  });

  router.post("/skills/:id/remove", async (req, res) => {
    try {
      const reg = SkillRegistry.load();
      removeSkill(reg, req.params.id);
      reg.save();
      toastInfo(st, `removed ${req.params.id}`);
      invalidate(st, "skills");
    } catch (e: any) { toastError(st, `remove: ${e.message}`); }
    res.send("ok");
  });

  router.post("/skills/:id/link-github", (req, res) => {
    const id = req.params.id;
    const normalized = applyGithubProxyEnv(req.body.source || "");
    const newSource = parseGithubSource(normalized);
    if (!newSource) { toastError(st, "invalid GitHub source"); return res.status(400).send("bad"); }
    try {
      const reg = SkillRegistry.load();
      const skill = reg.get(id);
      if (!skill) { toastError(st, `${id} not found`); return res.status(404).send("nf"); }
      skill.source = newSource;
      reg.upsert(skill);
      reg.save();
      toastInfo(st, `linked ${id} to GitHub`);
      invalidate(st, "skills");
    } catch (e: any) { toastError(st, `save: ${e.message}`); }
    res.send("ok");
  });

  router.post("/skills/group/:owner/:repo/sync", (req, res) => {
    toastInfo(st, "GitHub sync not yet implemented in TS build");
    res.status(202).send("ok");
  });

  router.post("/skills/group/:owner/:repo/deploy-all", (req, res) => {
    const { owner, repo } = req.params;
    const ideId = req.body.ide;
    const project = (req.body.project || "").trim() || undefined;
    try {
      const reg = SkillRegistry.load();
      const ids = reg.list().filter((s) => s.source.type === "github" && s.source.owner === owner && s.source.repo === repo).map((s) => s.id);
      let ok = 0;
      for (const id of ids) {
        const skill = reg.get(id);
        if (skill) { deploySkill(skill, ideId, project); reg.upsert(skill); ok++; }
      }
      reg.save();
      if (ok > 0) { toastInfo(st, `deployed ${ok}/${ids.length} to ${ideId}`); invalidate(st, "skills"); }
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/skills/group/:owner/:repo/undeploy-all", (req, res) => {
    const { owner, repo } = req.params;
    const ideId = req.body.ide;
    const project = (req.body.project || "").trim() || undefined;
    try {
      const reg = SkillRegistry.load();
      const ids = reg.list().filter((s) => s.source.type === "github" && s.source.owner === owner && s.source.repo === repo).map((s) => s.id);
      let ok = 0;
      for (const id of ids) {
        const skill = reg.get(id);
        if (skill) { undeploySkill(skill, ideId, project); reg.upsert(skill); ok++; }
      }
      reg.save();
      toastInfo(st, ok > 0 ? `undeployed ${ok} from ${ideId}` : "nothing to undeploy");
      invalidate(st, "skills");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/skills/group/:owner/:repo/remove-all", (req, res) => {
    const { owner, repo } = req.params;
    try {
      const reg = SkillRegistry.load();
      const ids = reg.list().filter((s) => s.source.type === "github" && s.source.owner === owner && s.source.repo === repo).map((s) => s.id);
      let ok = 0;
      for (const id of ids) { try { removeSkill(reg, id); ok++; } catch {} }
      reg.save();
      if (ok > 0) { toastInfo(st, `removed ${ok} skill(s) from ${owner}/${repo}`); invalidate(st, "skills"); }
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  return router;
}

function tryLoad<T>(fn: () => T): T | undefined {
  try { return fn(); } catch { return undefined; }
}

function addForm(): string {
  return `<div class="group-panel" style="margin-bottom:16px"><div style="padding:16px">
    <div style="font-size:14px;font-weight:600;margin-bottom:4px">Add skill from GitHub</div>
    <div class="meta" style="margin-bottom:12px">owner/repo \u00b7 owner/repo//subdir \u00b7 owner/repo@v1.2 \u00b7 or a full GitHub URL</div>
    <form hx-post="/skills/github-preview" hx-swap="innerHTML" hx-target="#skills-github-result" class="grid gap-3" style="grid-template-columns:1fr 1fr">
      <div style="grid-column:1/-1"><label class="label">Source *</label><input name="source" required class="field" placeholder="owner/repo or https://github.com/owner/repo"></div>
      <div><label class="label">Subdir (optional)</label><input name="subdir" class="field" placeholder="path/inside/repo"></div>
      <div><label class="label">Ref (optional)</label><input name="reference" class="field" placeholder="branch / tag / commit"></div>
      <div class="flex items-end gap-2"><button type="submit" class="btn-primary">Fetch & preview</button><button type="button" class="btn-ghost" onclick="document.getElementById('add-skill').setAttribute('hidden','')">Cancel</button></div>
    </form>
    <div id="skills-github-result" style="margin-top:8px"></div>
  </div></div>`;
}

function createForm(): string {
  return `<div class="group-panel" style="margin-bottom:16px"><div style="padding:16px">
    <div style="font-size:14px;font-weight:600;margin-bottom:4px">Create a new local skill</div>
    <div class="meta" style="margin-bottom:12px">Write your own SKILL.md content to create a skill.</div>
    <form hx-post="/skills/create" hx-swap="none" hx-on--after-request="this.reset();document.getElementById('create-skill').setAttribute('hidden','')" class="grid gap-3">
      <div><label class="label">Skill name *</label><input name="name" required class="field" placeholder="my-awesome-skill"></div>
      <div><label class="label">SKILL.md content *</label><textarea name="content" required class="field" rows="10" placeholder="# My Skill\n\nDescribe what this skill does."></textarea></div>
      <div class="flex items-end gap-2">${btnPrimary("Create skill")}<button type="button" class="btn-ghost" onclick="document.getElementById('create-skill').setAttribute('hidden','')">Cancel</button></div>
    </form>
  </div></div>`;
}

function renderList(reg: SkillRegistry | undefined, projects: ProjectStore | undefined, filter: string): string {
  if (!reg) return `<div style="color:var(--danger);padding:16px">Failed to load skill registry.</div>`;
  const allSkills = reg.list();
  const fl = filter.toLowerCase();
  const groups = new Map<string, Skill[]>();
  for (const s of allSkills) {
    if (fl && !s.id.toLowerCase().includes(fl) && !s.name.toLowerCase().includes(fl)) continue;
    const key = s.source.type === "github" ? `${s.source.owner}/${s.source.repo}` : "(local)";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  if (allSkills.length === 0) return emptyState("No skills installed", 'Click "Add from GitHub" to install one.');
  if (groups.size === 0) return emptyState("No matches", "Try a different filter.");

  const projectList: [string, string][] = projects ? projects.list().map((p) => [p.path, path.basename(p.path) || p.path]) : [];

  return Array.from(groups.entries()).map(([key, skills]) => renderGroup(key, skills, projectList)).join("");
}

function renderGroup(groupKey: string, skills: Skill[], projects: [string, string][]): string {
  const isGithub = groupKey !== "(local)";
  const [owner, repo] = isGithub ? groupKey.split("/") : ["", ""];
  return `<details class="group-box" open>
    <summary><span class="chev">\u25b8</span><span>${esc(groupKey)}</span><span class="meta" style="margin-left:6px;font-weight:400">(${skills.length})</span></summary>
    ${isGithub ? `<div class="group-actions">
      ${scopeSelectors(`grp-${groupKey}`, projects)}
      ${skills.length > 1 ? `
        <form style="display:inline" hx-post="/skills/group/${owner}/${repo}/deploy-all" hx-swap="none" hx-include="closest .group-actions">${btnPrimary("Deploy all")}</form>
        <form style="display:inline" hx-post="/skills/group/${owner}/${repo}/undeploy-all" hx-swap="none" hx-include="closest .group-actions">${btnSecondary("Undeploy all")}</form>
      ` : ""}
      <form style="display:inline" hx-post="/skills/group/${owner}/${repo}/sync" hx-swap="none">${btnSecondary("Update all")}</form>
      <form style="display:inline" hx-post="/skills/group/${owner}/${repo}/remove-all" hx-swap="none" hx-confirm="Remove all ${skills.length} skills from this group?">${btnDanger("Remove all")}</form>
    </div>` : ""}
    <div class="group-body">
      <table class="aiem"><thead><tr><th>Name</th><th>Version</th><th>Deployed</th><th style="text-align:right">Actions</th></tr></thead><tbody>
        ${skills.map((s) => renderSkillRow(s, projects)).join("")}
      </tbody></table>
    </div>
  </details>`;
}

function scopeSelectors(idPrefix: string, projects: [string, string][]): string {
  return `<select id="${idPrefix}-ide" name="ide" class="field" style="width:auto;min-width:120px">
    ${IDES.map((i) => `<option value="${i.id}">${esc(i.displayName)}</option>`).join("")}
  </select>
  <select id="${idPrefix}-project" name="project" class="field" style="width:auto;min-width:120px">
    <option value="">Global</option>
    ${projects.map(([p, l]) => `<option value="${esc(p)}">${esc(l)}</option>`).join("")}
  </select>`;
}

function renderSkillRow(s: Skill, projects: [string, string][]): string {
  const isLocal = s.source.type === "local";
  const short = shortId(s.id);
  const deployCount = Object.values(s.deployments).reduce((a, v) => a + v.length, 0);
  const rowId = s.id.replace(/[^a-zA-Z0-9]/g, "-");
  const encId = encodeURIComponent(s.id);
  return `<tr>
    <td><div style="display:flex;align-items:center;gap:6px"><span style="font-weight:500">${esc(short)}</span>${isLocal ? tag("local", "neutral") : ""}</div>
      ${s.description ? `<div class="meta" style="margin-top:2px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.description.split("\n")[0] || "")}</div>` : ""}
    </td>
    <td><span class="tag tag-neutral mono">${esc(s.version.slice(0, 12))}</span></td>
    <td>${deployCount > 0 ? `<span class="tag tag-success">${deployCount} target(s)</span>` : `<span class="meta">\u2014</span>`}</td>
    <td style="text-align:right;white-space:nowrap"><div class="skill-row-actions">
      <form hx-post="/skills/${encId}/deploy" hx-swap="none" style="display:inline-flex;gap:4px;align-items:center">
        <select name="ide" class="field" style="width:auto;min-width:100px;font-size:11px;padding:3px 6px;min-height:24px">${IDES.map((i) => `<option value="${i.id}">${esc(i.displayName)}</option>`).join("")}</select>
        <select name="project" class="field" style="width:auto;min-width:90px;font-size:11px;padding:3px 6px;min-height:24px"><option value="">Global</option>${projects.map(([p, l]) => `<option value="${esc(p)}">${esc(l)}</option>`).join("")}</select>
        <button type="submit" class="btn-primary" style="min-height:24px;padding:2px 8px;font-size:11px">Deploy</button>
      </form>
      ${!isLocal ? `<form hx-post="/skills/${encId}/update" hx-swap="none" style="display:inline"><button type="submit" class="btn-ghost">Update</button></form>` : ""}
      <button type="button" class="btn-ghost" onclick="document.getElementById('detail-${rowId}').toggleAttribute('hidden')">More</button>
    </div></td>
  </tr>
  <tr id="detail-${rowId}" hidden>
    <td colspan="4" style="padding:12px 16px;background:var(--surface-alt);border-bottom:1px solid var(--stroke-light)">
      <div class="detail-split">
        <div class="detail-stack skills-detail-stack">
          <div class="label">ID</div><div class="mono meta" style="word-break:break-all">${esc(s.id)}</div>
          <div class="deployment-records-panel"><div class="label">Deployment records</div>${deploymentRecordsTable(skillDeploymentRecords(s))}</div>
          <div class="${isLocal ? "detail-action-row" : "detail-action-row detail-action-row-linked"}">
            <form hx-post="/skills/${encId}/undeploy" hx-swap="none" hx-confirm="Undeploy this skill?" class="skill-undeploy-form">
              <select name="ide" class="field" style="width:auto;min-width:100px;font-size:11px;padding:3px 6px;min-height:24px">${IDES.map((i) => `<option value="${i.id}">${esc(i.displayName)}</option>`).join("")}</select>
              <select name="project" class="field" style="width:auto;min-width:90px;font-size:11px;padding:3px 6px;min-height:24px"><option value="">Global</option>${projects.map(([p, l]) => `<option value="${esc(p)}">${esc(l)}</option>`).join("")}</select>
              ${btnSecondary("Undeploy")}
            </form>
            ${isLocal ? `<form hx-post="/skills/${encId}/link-github" hx-swap="none"><input name="source" class="field" placeholder="owner/repo" style="width:160px;font-size:11px;padding:3px 6px;min-height:24px">${btnSecondary("Link GitHub")}</form>` : ""}
            <a href="/skills/files?id=${encId}" class="btn-ghost" target="_blank">View all files</a>
            <form hx-post="/skills/${encId}/remove" hx-swap="none" hx-confirm="Remove this skill and delete local files?" style="display:inline">${btnDanger("Remove")}</form>
          </div>
        </div>
        <div>
          <div class="label">SKILL.md</div>
          <div class="skill-md-slot" hx-get="/skills/view?id=${encId}" hx-trigger="intersect once" hx-swap="innerHTML">
            <div class="skill-md-preview"><span class="meta">Loading\u2026</span></div>
          </div>
        </div>
      </div>
    </td>
  </tr>`;
}

function skillDeploymentRecords(s: Skill): [string, string, string, TagKind][] {
  const rows: [string, string, string, TagKind][] = [];
  for (const [ideId, roots] of Object.entries(s.deployments)) {
    for (const root of roots) {
      const project = root === "~" ? "Global" : path.basename(root) || root;
      const ideLabel = findIde(ideId)?.displayName || ideId;
      rows.push([project, ideLabel, "Deployed", "success"]);
    }
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return rows;
}

function deploymentRecordsTable(rows: [string, string, string, TagKind][]): string {
  if (rows.length === 0) return `<div class="deploy-records deploy-records-empty"><span class="meta">No deployment records.</span></div>`;
  return `<div class="deploy-records"><table><thead><tr><th>Deploy project</th><th>Target IDE</th><th>Deployment status</th></tr></thead><tbody>
    ${rows.map(([p, i, s, k]) => `<tr><td>${esc(p)}</td><td>${esc(i)}</td><td>${tag(s, k)}</td></tr>`).join("")}
  </tbody></table></div>`;
}

function shortId(id: string): string {
  let tail = id;
  const pos = id.lastIndexOf("__");
  if (pos >= 0) tail = id.slice(pos + 2);
  const parts = tail.split(/[/\\_]/);
  return parts.filter(Boolean).pop() || tail;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderSkillsPreview(preview: SkillsGithubPreview): string {
  const { owner, repo, ref, skills, mcpServers } = preview;
  const previewData = JSON.stringify(preview);
  const skillRows = skills.map((s) => `<tr>
    <td style="font-weight:500">${esc(s.name)}</td>
    <td class="mono meta">${esc(s.subdir || "/")}</td>
    <td class="meta" style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.description)}</td>
    <td style="text-align:right">${s.fileCount} files</td>
  </tr>`).join("");
  const mcpRows = mcpServers.map((s) => {
    const t = s.transport;
    const detail = t.type === "stdio" ? `${t.command} ${t.args.join(" ")}` : (t as any).url;
    return `<tr>
      <td style="font-weight:500">${esc(s.name)}</td>
      <td>${tag(t.type, "neutral")}</td>
      <td class="mono meta" style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(detail)}</td>
    </tr>`;
  }).join("");
  return `<div class="group-panel" style="padding:12px;margin-top:8px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="color:var(--success);font-weight:600">\u2713 Preview: ${esc(owner)}/${esc(repo)}@${esc(ref)}</span>
    </div>
    ${skills.length > 0 ? `<div style="margin-bottom:12px">
      <div style="font-size:13px;font-weight:600;margin-bottom:4px">Detected skills (${skills.length})</div>
      <table class="aiem"><thead><tr><th>Name</th><th>Subdir</th><th>Description</th><th style="text-align:right">Files</th></tr></thead>
      <tbody>${skillRows}</tbody></table>
    </div>` : ""}
    ${mcpServers.length > 0 ? `<div style="margin-bottom:12px">
      <div style="font-size:13px;font-weight:600;margin-bottom:4px">Detected MCP servers (${mcpServers.length})</div>
      <table class="aiem"><thead><tr><th>Name</th><th>Transport</th><th>Command / URL</th></tr></thead>
      <tbody>${mcpRows}</tbody></table>
      <label style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:var(--font-xs)">
        <input type="checkbox" name="import_mcp" form="skills-confirm-form" checked> Also import MCP servers
      </label>
    </div>` : ""}
    ${skills.length === 0 && mcpServers.length === 0 ? `<div class="meta">No skills or MCP servers detected.</div>` : ""}
    <form id="skills-confirm-form" hx-post="/skills/github-confirm" hx-swap="none" hx-on--after-request="document.getElementById('skills-github-result').innerHTML='<span style=\\'color:var(--success)\\'>Installed!</span>'">
      <input type="hidden" name="preview_data" value="${esc(previewData)}">
      <div style="display:flex;gap:8px;align-items:center">
        ${btnPrimary("Confirm install")}
        <button type="button" class="btn-ghost" onclick="document.getElementById('skills-github-result').innerHTML=''">Cancel</button>
      </div>
    </form>
  </div>`;
}
