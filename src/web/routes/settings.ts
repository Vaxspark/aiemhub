import { Router } from "express";
import * as os from "os";
import * as fs from "fs";
import { Vault } from "../../core/secrets.js";
import { loadBackupConfig, saveBackupConfig, timeAgo, snapshotLocal, exportToDir, importFromDir, loadBackupTokenFile, saveBackupTokenFile, pushGithub, pullGithub, syncRemoteToLocal, listRemoteContents, deleteRemoteItems, pushRemoteChanges, type BackupConfig, type RemoteItem } from "../../core/backup.js";
import * as paths from "../../core/paths.js";
import { removePath } from "../../core/fs-util.js";
import { page, pageHeader, btnPrimary, btnSecondary, btnDanger, tag, esc } from "../layout.js";
import type { AppState } from "../state.js";
import { toastInfo, toastError, invalidate, taskStarted, taskFinished } from "../tasks.js";

const GH_TOKEN_NAME = "github_token";
const VERSION = "0.2.0";

export function settingsRouter(st: AppState): Router {
  const router = Router();

  router.get("/settings", (req, res) => {
    const hasToken = !!(process.env.GITHUB_TOKEN);
    const aiemHome = (() => { try { return paths.home(); } catch { return "?"; } })();
    const backupCfg = loadBackupConfig();
    const lastBackup = backupCfg.last_backup_ts ? timeAgo(backupCfg.last_backup_ts) : "never";
    res.send(page("Settings", "/settings", `
      ${pageHeader("Settings", "", "")}
      <div class="content-padding wide-content settings-grid">
        <div class="settings-col">
          ${ghTokenCard(hasToken)}
          ${backupCard(backupCfg, lastBackup)}
        </div>
        <div class="settings-col">
          ${hostInfoCard(aiemHome)}
          ${remoteRepoCard(!!backupCfg.github_repo)}
          ${trashCard()}
          ${aboutCard()}
        </div>
      </div>
    `));
  });

  router.post("/settings/github-token", async (req, res) => {
    try {
      const token = (req.body.token || "").trim();
      if (!token) { toastError(st, "Token is required"); return res.send("ok"); }
      const vault = Vault.load();
      await vault.set(GH_TOKEN_NAME, token, "GitHub Personal Access Token");
      process.env.GITHUB_TOKEN = token;
      saveBackupTokenFile(token);
      toastInfo(st, "GITHUB_TOKEN saved");
    } catch (e: any) { toastError(st, `save token: ${e.message}`); }
    res.send("ok");
  });

  router.post("/settings/github-token/clear", async (req, res) => {
    try {
      const vault = Vault.load();
      await vault.del(GH_TOKEN_NAME);
      delete process.env.GITHUB_TOKEN;
      toastInfo(st, "cleared");
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/settings/backup/save-config", (req, res) => {
    try {
      const cfg = loadBackupConfig();
      cfg.github_repo = (req.body.repo || "").trim() || undefined;
      cfg.http_proxy = (req.body.proxy || "").trim() || undefined;
      saveBackupConfig(cfg);
      const token = (req.body.token || "").trim();
      if (token) {
        saveBackupTokenFile(token);
        process.env.GITHUB_TOKEN = token;
        toastInfo(st, "Backup config and token saved");
      } else {
        toastInfo(st, "Backup config saved");
      }
    } catch (e: any) { toastError(st, e.message); }
    res.send("ok");
  });

  router.post("/settings/backup/snapshot", async (req, res) => {
    const id = await st.nextTaskId();
    taskStarted(st, id, "Taking local snapshot");
    try {
      const p = snapshotLocal();
      taskFinished(st, id, true, `Snapshot saved: ${p}`);
    } catch (e: any) { taskFinished(st, id, false, `Snapshot failed: ${e.message}`); }
    res.send("ok");
  });

  router.post("/settings/backup/export", async (req, res) => {
    const id = await st.nextTaskId();
    const dest = (req.body.dest || "").trim();
    taskStarted(st, id, `Exporting to ${dest}`);
    try {
      const files = exportToDir(dest);
      taskFinished(st, id, true, `Exported ${files.length} file(s) to ${dest}`);
    } catch (e: any) { taskFinished(st, id, false, `Export failed: ${e.message}`); }
    res.send("ok");
  });

  router.post("/settings/backup/import", async (req, res) => {
    const id = await st.nextTaskId();
    const src = (req.body.src || "").trim();
    taskStarted(st, id, `Restoring from ${src}`);
    try {
      const files = importFromDir(src);
      taskFinished(st, id, true, `Restored ${files.length} file(s)`);
      invalidate(st, "skills"); invalidate(st, "mcp"); invalidate(st, "projects");
    } catch (e: any) { taskFinished(st, id, false, `Restore failed: ${e.message}`); }
    res.send("ok");
  });

  router.post("/settings/backup/push", async (req, res) => {
    const id = await st.nextTaskId();
    taskStarted(st, id, "Pushing to GitHub...");
    try {
      const cfg = loadBackupConfig();
      const repo = cfg.github_repo;
      if (!repo) throw new Error("No GitHub repo configured");
      const token = loadBackupTokenFile() || process.env.GITHUB_TOKEN;
      pushGithub(repo, token || undefined);
      taskFinished(st, id, true, "Pushed to GitHub successfully");
      invalidate(st, "skills"); invalidate(st, "mcp");
    } catch (e: any) { taskFinished(st, id, false, `Push failed: ${e.message}`); }
    res.send("ok");
  });

  router.post("/settings/backup/pull", async (req, res) => {
    const id = await st.nextTaskId();
    taskStarted(st, id, "Pulling from GitHub...");
    try {
      const cfg = loadBackupConfig();
      const repo = cfg.github_repo;
      if (!repo) throw new Error("No GitHub repo configured");
      const token = loadBackupTokenFile() || process.env.GITHUB_TOKEN;
      pullGithub(repo, token || undefined);
      taskFinished(st, id, true, "Pulled from GitHub and restored");
      invalidate(st, "skills"); invalidate(st, "mcp"); invalidate(st, "projects");
    } catch (e: any) { taskFinished(st, id, false, `Pull failed: ${e.message}`); }
    res.send("ok");
  });

  router.post("/settings/backup/interval", (req, res) => {
    const cfg = loadBackupConfig();
    cfg.auto_interval = (req.body.interval === "daily" ? "daily" : req.body.interval === "weekly" ? "weekly" : "never");
    saveBackupConfig(cfg);
    res.redirect("/settings");
  });

  router.post("/settings/verify-repo", async (req, res) => {
    try {
      const repo = (req.body.repo || "").trim();
      const token = (req.body.token || "").trim() || loadBackupTokenFile() || process.env.GITHUB_TOKEN;
      if (!repo) throw new Error("Repo URL is required");
      const url = repo.replace(/\/+$/, "");
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) throw new Error("Only GitHub HTTPS URLs are supported");
      const [, owner, repoName] = match;
      const apiUrl = `https://api.github.com/repos/${owner}/${repoName.replace(/\.git$/, "")}`;
      const headers: Record<string, string> = { "Accept": "application/vnd.github+json", "User-Agent": "aiemhub" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const resp = await fetch(apiUrl, { headers });
      if (resp.ok) {
        const data = await resp.json() as any;
        const vis = data.private ? "private" : "public";
        res.send(`<span style="color:var(--success);font-size:var(--font-xs);font-weight:500">\u2713 Connected (${vis}, ${data.default_branch || "main"})</span>`);
      } else if (resp.status === 404) {
        res.send(`<span style="color:var(--danger);font-size:var(--font-xs);font-weight:500">\u2717 Not found (check URL or token)</span>`);
      } else if (resp.status === 401 || resp.status === 403) {
        res.send(`<span style="color:var(--danger);font-size:var(--font-xs);font-weight:500">\u2717 Auth failed (${resp.status})</span>`);
      } else {
        res.send(`<span style="color:var(--warning);font-size:var(--font-xs);font-weight:500">\u2717 HTTP ${resp.status}</span>`);
      }
    } catch (e: any) {
      res.send(`<span style="color:var(--danger);font-size:var(--font-xs);font-weight:500">\u2717 ${esc(e.message)}</span>`);
    }
  });

  // ─── Remote repo management ────────────────────────────────────────────────

  router.get("/settings/remote", async (req, res) => {
    const cfg = loadBackupConfig();
    if (!cfg.github_repo) {
      return res.send(page("Remote Repo", "/settings", `
        ${pageHeader("Remote Repo Management", "", "")}
        <div class="content-padding wide-content">
          <div class="empty-state">
            <div class="empty-state-title">No GitHub repo configured</div>
            <div class="empty-state-sub">Configure a backup repo in <a href="/settings" style="color:var(--accent)">Settings</a> first.</div>
          </div>
        </div>
      `));
    }
    const subtitle = "Manage contents of " + (cfg.github_repo || "");
    const actions = '<form hx-post="/settings/remote/sync" hx-swap="none">' + btnPrimary("Sync from remote") + "</form>";
    res.send(page("Remote Repo", "/settings",
      pageHeader("Remote Repo Management", subtitle, actions) +
      '<div class="content-padding wide-content">' +
        '<div id="remote-items" data-resource="remote"' +
        ' hx-get="/settings/remote/fragment" hx-trigger="refresh from:body, load" hx-swap="innerHTML">' +
        '<span class="meta">Loading...</span>' +
        '</div></div>'
    ));
  });

  router.get("/settings/remote/fragment", (req, res) => {
    try {
      const items = listRemoteContents();
      res.send(renderRemoteItems(items));
    } catch (e: any) {
      res.send(`<div class="empty-state">
        <div class="empty-state-title">Could not load remote contents</div>
        <div class="empty-state-sub">${esc(e.message)}. Click "Sync from remote" to fetch latest data.</div>
      </div>`);
    }
  });

  router.post("/settings/remote/sync", async (req, res) => {
    const id = await st.nextTaskId();
    taskStarted(st, id, "Syncing remote repo...");
    try {
      syncRemoteToLocal();
      taskFinished(st, id, true, "Remote contents synced");
      invalidate(st, "remote");
    } catch (e: any) { taskFinished(st, id, false, `Sync failed: ${e.message}`); }
    res.send("ok");
  });

  router.post("/settings/remote/delete", async (req, res) => {
    const id = await st.nextTaskId();
    taskStarted(st, id, "Deleting selected items...");
    try {
      const rawItems = req.body.items;
      if (!rawItems) throw new Error("No items selected");
      const parsed: { type: string; id: string }[] = (Array.isArray(rawItems) ? rawItems : [rawItems]).map((s: string) => JSON.parse(s));
      if (parsed.length === 0) throw new Error("No items selected");
      const result = deleteRemoteItems(parsed);
      pushRemoteChanges(`aiem: removed ${parsed.length} item(s)`);
      taskFinished(st, id, true, `Deleted ${result.deleted} item(s) and pushed to remote`);
      invalidate(st, "remote");
    } catch (e: any) { taskFinished(st, id, false, `Delete failed: ${e.message}`); }
    res.send("ok");
  });

  router.post("/settings/remote/delete-one", async (req, res) => {
    const id = await st.nextTaskId();
    const itemType = req.body.type;
    const itemId = req.body.id;
    const itemName = req.body.name || itemId;
    taskStarted(st, id, `Deleting ${itemName}...`);
    try {
      if (!itemType || !itemId) throw new Error("Missing type or id");
      deleteRemoteItems([{ type: itemType, id: itemId }]);
      pushRemoteChanges(`aiem: removed ${itemName}`);
      taskFinished(st, id, true, `Deleted "${itemName}" from remote`);
      invalidate(st, "remote");
    } catch (e: any) { taskFinished(st, id, false, `Delete failed: ${e.message}`); }
    res.send("ok");
  });

  router.get("/settings/trash", (req, res) => {
    const entries = listTrashEntries();
    const td = (() => { try { return paths.trashDir(); } catch { return ""; } })();
    const body = `
      ${pageHeader("Trash", "Items removed from aiem's managed content. Delete entries here to reclaim disk space.", "")}
      ${entries.length === 0 ? `<div class="empty-state"><div class="empty-state-title">Trash is empty</div><div class="empty-state-sub">${esc(td)}</div></div>` : `
        <div class="content-padding wide-content">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
            <form method="post" action="/settings/trash/empty" hx-post="/settings/trash/empty" hx-swap="none">${btnDanger("Empty trash")}</form>
            <span class="meta">${entries.length} entries \u2022 ${esc(td)}</span>
          </div>
          <div class="group-panel"><table class="aiem"><thead><tr><th>Name</th><th>Path</th><th style="text-align:right">Actions</th></tr></thead><tbody>
            ${entries.map(([name, p]) => `<tr><td><span class="mono" style="font-size:var(--font-xs)">${esc(name)}</span></td><td class="meta" style="font-size:var(--font-xs)">${esc(p)}</td><td style="text-align:right">
              <form method="post" action="/settings/trash/${encodeURIComponent(name)}/delete" hx-post="/settings/trash/${encodeURIComponent(name)}/delete" hx-swap="none" style="display:inline">${btnDanger("Delete")}</form>
            </td></tr>`).join("")}
          </tbody></table></div>
        </div>
      `}`;
    res.send(page("Trash \u2014 aiem", "/settings", body));
  });

  router.post("/settings/trash/empty", (req, res) => {
    let removed = 0;
    try {
      const td = paths.trashDir();
      if (fs.existsSync(td)) {
        for (const e of fs.readdirSync(td)) {
          removePath(require("path").join(td, e));
          removed++;
        }
      }
    } catch {}
    toastInfo(st, `deleted ${removed} trash entries`);
    res.redirect("/settings/trash");
  });

  router.post("/settings/trash/:name/delete", (req, res) => {
    const name = req.params.name;
    if (name.includes("/") || name.includes("\\") || name.includes("..")) {
      toastError(st, "invalid name");
      return res.redirect("/settings/trash");
    }
    try {
      const target = require("path").join(paths.trashDir(), name);
      removePath(target);
      toastInfo(st, `deleted \`${name}\``);
    } catch (e: any) { toastError(st, e.message); }
    res.redirect("/settings/trash");
  });

  return router;
}

function listTrashEntries(): [string, string][] {
  try {
    const td = paths.trashDir();
    if (!fs.existsSync(td)) return [];
    return fs.readdirSync(td).map((name) => [name, require("path").join(td, name)] as [string, string]).sort((a, b) => b[0].localeCompare(a[0]));
  } catch { return []; }
}

function ghTokenCard(hasToken: boolean): string {
  return `<div class="settings-card">
    <div class="settings-card-header">
      <div class="settings-card-icon">&#x1F511;</div>
      <div>
        <div class="settings-card-title">GitHub Token</div>
        <div class="settings-card-desc">Personal access token for GitHub API</div>
      </div>
      <div class="settings-card-badge">${hasToken ? tag("configured", "success") : tag("not set", "neutral")}</div>
    </div>
    <div class="settings-card-body">
      <form hx-post="/settings/github-token" hx-swap="none">
        <div class="settings-form-row">
          <input name="token" type="password" placeholder="ghp_..." required class="field settings-input-med">
          ${btnPrimary("Save")}
        </div>
      </form>
      <form hx-post="/settings/github-token/clear" hx-swap="none" hx-confirm="Clear stored token?" style="margin-top:8px">${btnDanger("Clear")}</form>
    </div>
  </div>`;
}

function backupCard(cfg: BackupConfig, lastBackup: string): string {
  const repoVal = cfg.github_repo || "";
  const hasToken = !!(process.env.GITHUB_TOKEN) || !!loadBackupTokenFile();
  return `<div class="settings-card">
    <div class="settings-card-header">
      <div class="settings-card-icon">&#x1F4BE;</div>
      <div>
        <div class="settings-card-title">Backup & Restore</div>
        <div class="settings-card-desc">Local snapshots and GitHub sync</div>
      </div>
      <div class="settings-card-badge"><span class="meta text-xs">Last: ${esc(lastBackup)}</span></div>
    </div>
    <div class="settings-card-body">
      <div class="settings-section">
        <div class="settings-section-label">Auto-backup interval</div>
        <form hx-post="/settings/backup/interval" hx-swap="none" style="display:flex;gap:6px">
          ${(["never", "daily", "weekly"] as const).map((val) => {
            const label = val.charAt(0).toUpperCase() + val.slice(1);
            const selected = cfg.auto_interval === val;
            return `<button type="submit" name="interval" value="${val}" class="${selected ? "btn-primary" : "btn-ghost"}" style="font-size:var(--font-xs);padding:4px 12px">${label}</button>`;
          }).join("")}
        </form>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">Local snapshot</div>
        <p class="meta text-xs" style="margin-bottom:8px">Saves registries into <code class="mono">~/.aiem/snapshots/&lt;ts&gt;/</code></p>
        <form hx-post="/settings/backup/snapshot" hx-swap="none">${btnPrimary("Snapshot now")}</form>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">Export / Restore</div>
        <form hx-post="/settings/backup/export" hx-swap="none">
          <div class="settings-form-row">
            <input name="dest" type="text" placeholder="/path/to/export" class="field settings-input-wide">
            ${btnPrimary("Export")}
          </div>
        </form>
        <form hx-post="/settings/backup/import" hx-swap="none" hx-confirm="Overwrite current config from this snapshot?" style="margin-top:6px">
          <div class="settings-form-row">
            <input name="src" type="text" placeholder="/path/to/snapshot" class="field settings-input-wide">
            ${btnDanger("Restore")}
          </div>
        </form>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">GitHub backup</div>
        <form hx-post="/settings/backup/save-config" hx-swap="none">
          <div class="settings-field-group">
            <label class="label">Repo URL (HTTPS)</label>
            <input name="repo" type="text" value="${esc(repoVal)}" placeholder="https://github.com/you/repo" class="field settings-input-wide">
          </div>
          <div class="settings-field-group">
            <label class="label">GitHub Token ${hasToken ? tag("\u25cf saved", "success") : ""}</label>
            <input name="token" type="password" placeholder="ghp_... (leave blank to keep)" class="field settings-input-wide">
          </div>
          <div class="settings-field-group">
            <label class="label">Proxy (optional)</label>
            <input name="proxy" type="text" value="${esc(cfg.http_proxy || "")}" placeholder="socks5h://127.0.0.1:1080" class="field settings-input-med">
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
            ${btnPrimary("Save config")}
            <button type="button" class="btn-ghost" hx-post="/settings/verify-repo" hx-include="closest form" hx-target="#verify-result" hx-swap="innerHTML" style="font-size:var(--font-xs)">Verify</button>
            <span id="verify-result" style="display:inline-flex;align-items:center"></span>
          </div>
        </form>
        <div style="display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--stroke-light)">
          <form hx-post="/settings/backup/push" hx-swap="none">${btnPrimary("Push to GitHub")}</form>
          <form hx-post="/settings/backup/pull" hx-swap="none" hx-confirm="Restore config from GitHub? This overwrites current data.">${btnDanger("Pull from GitHub")}</form>
        </div>
      </div>
    </div>
  </div>`;
}

function hostInfoCard(aiemHome: string): string {
  return `<div class="settings-card">
    <div class="settings-card-header">
      <div class="settings-card-icon">&#x1F4BB;</div>
      <div>
        <div class="settings-card-title">Host Info</div>
        <div class="settings-card-desc">Runtime environment details</div>
      </div>
    </div>
    <div class="settings-card-body">
      <div class="info-grid">
        <div class="info-item"><span class="info-label">AIEM_HOME</span><span class="mono info-value">${esc(aiemHome)}</span></div>
        <div class="info-item"><span class="info-label">Hostname</span><span class="mono info-value">${esc(os.hostname())}</span></div>
        <div class="info-item"><span class="info-label">User</span><span class="mono info-value">${esc(os.userInfo().username)}</span></div>
        <div class="info-item"><span class="info-label">OS</span><span class="mono info-value">${esc(process.platform)} / ${esc(process.arch)}</span></div>
      </div>
    </div>
  </div>`;
}

function remoteRepoCard(hasRepo: boolean): string {
  return `<div class="settings-card settings-card-compact">
    <div class="settings-card-header">
      <div class="settings-card-icon">&#x1F310;</div>
      <div>
        <div class="settings-card-title">Remote Repo Management</div>
        <div class="settings-card-desc">View and delete skills/MCPs from your GitHub backup repo</div>
      </div>
      <div class="settings-card-badge">${hasRepo ? tag("configured", "success") : tag("not set", "neutral")}</div>
    </div>
    <div class="settings-card-body">
      <a href="/settings/remote" class="btn-primary" style="text-decoration:none">${hasRepo ? "Manage remote" : "Configure repo first"}</a>
    </div>
  </div>`;
}

function trashCard(): string {
  return `<div class="settings-card settings-card-compact">
    <div class="settings-card-header">
      <div class="settings-card-icon">&#x1F5D1;</div>
      <div>
        <div class="settings-card-title">Trash</div>
        <div class="settings-card-desc">Removed items are moved to trash, not hard-deleted</div>
      </div>
    </div>
    <div class="settings-card-body">
      <a href="/settings/trash" class="btn-secondary" style="text-decoration:none">Open trash</a>
    </div>
  </div>`;
}

function aboutCard(): string {
  return `<div class="settings-card settings-card-compact">
    <div class="settings-card-header">
      <div class="settings-card-icon">&#x2139;</div>
      <div>
        <div class="settings-card-title">About</div>
        <div class="settings-card-desc">aiem-web \u2014 headless management for skills & MCP across IDEs</div>
      </div>
      <div class="settings-card-badge"><span class="mono" style="font-size:var(--font-sm);font-weight:600">${VERSION}</span></div>
    </div>
  </div>`;
}

function renderRemoteItems(items: RemoteItem[]): string {
  if (items.length === 0) {
    return `<div class="empty-state">
      <div class="empty-state-title">Remote repo is empty</div>
      <div class="empty-state-sub">Push your skills and MCPs first, or click "Sync from remote" to refresh.</div>
    </div>`;
  }

  const skills = items.filter(i => i.type === "skill");
  const mcps = items.filter(i => i.type === "mcp");
  const bundles = items.filter(i => i.type === "mcp_bundle");

  let html = `<form hx-post="/settings/remote/delete" hx-swap="none" hx-confirm="Delete selected items from remote repo? This cannot be undone.">`;

  if (skills.length > 0) {
    html += `<div class="group-panel" style="margin-bottom:16px">
      <div class="group-panel-title">Skills (${skills.length})</div>
      <table class="aiem"><thead><tr><th style="width:32px"></th><th>Name</th><th>ID</th><th>Description</th><th style="text-align:right">Actions</th></tr></thead><tbody>`;
    for (const s of skills) {
      const encoded = esc(JSON.stringify({ type: s.type, id: s.id }));
      html += `<tr>
        <td><input type="checkbox" name="items" value="${encoded}"></td>
        <td style="font-weight:500">${esc(s.name)}</td>
        <td class="mono meta" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.id)}</td>
        <td class="meta" style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.description || "")}</td>
        <td style="text-align:right">
          <form hx-post="/settings/remote/delete-one" hx-swap="none" hx-confirm="Delete skill '${esc(s.name)}' from remote?" style="display:inline">
            <input type="hidden" name="type" value="skill">
            <input type="hidden" name="id" value="${esc(s.id)}">
            <input type="hidden" name="name" value="${esc(s.name)}">
            ${btnDanger("Delete")}
          </form>
        </td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
  }

  if (mcps.length > 0) {
    html += `<div class="group-panel" style="margin-bottom:16px">
      <div class="group-panel-title">MCP Servers (${mcps.length})</div>
      <table class="aiem"><thead><tr><th style="width:32px"></th><th>Name</th><th>Description</th><th style="text-align:right">Actions</th></tr></thead><tbody>`;
    for (const s of mcps) {
      const encoded = esc(JSON.stringify({ type: s.type, id: s.id }));
      html += `<tr>
        <td><input type="checkbox" name="items" value="${encoded}"></td>
        <td style="font-weight:500">${esc(s.name)}</td>
        <td class="meta">${esc(s.description || "")}</td>
        <td style="text-align:right">
          <form hx-post="/settings/remote/delete-one" hx-swap="none" hx-confirm="Delete MCP '${esc(s.name)}' from remote?" style="display:inline">
            <input type="hidden" name="type" value="mcp">
            <input type="hidden" name="id" value="${esc(s.id)}">
            <input type="hidden" name="name" value="${esc(s.name)}">
            ${btnDanger("Delete")}
          </form>
        </td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
  }

  if (bundles.length > 0) {
    html += `<div class="group-panel" style="margin-bottom:16px">
      <div class="group-panel-title">MCP Bundles (${bundles.length})</div>
      <table class="aiem"><thead><tr><th style="width:32px"></th><th>Name</th><th style="text-align:right">Actions</th></tr></thead><tbody>`;
    for (const s of bundles) {
      const encoded = esc(JSON.stringify({ type: s.type, id: s.id }));
      html += `<tr>
        <td><input type="checkbox" name="items" value="${encoded}"></td>
        <td class="mono">${esc(s.name)}</td>
        <td style="text-align:right">
          <form hx-post="/settings/remote/delete-one" hx-swap="none" hx-confirm="Delete bundle '${esc(s.name)}' from remote?" style="display:inline">
            <input type="hidden" name="type" value="mcp_bundle">
            <input type="hidden" name="id" value="${esc(s.id)}">
            <input type="hidden" name="name" value="${esc(s.name)}">
            ${btnDanger("Delete")}
          </form>
        </td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
  }

  html += `<div style="display:flex;gap:8px;align-items:center;padding:8px 0">
    ${btnDanger("Delete selected")}
    <span class="meta">Select items above and click to remove from the remote repository</span>
  </div></form>`;

  return html;
}
