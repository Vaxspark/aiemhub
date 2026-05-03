import { Router } from "express";
import * as os from "os";
import * as fs from "fs";
import { Vault } from "../../core/secrets.js";
import { loadBackupConfig, saveBackupConfig, timeAgo, snapshotLocal, exportToDir, importFromDir, loadBackupTokenFile, saveBackupTokenFile, type BackupConfig } from "../../core/backup.js";
import * as paths from "../../core/paths.js";
import { removePath } from "../../core/fs-util.js";
import { page, pageHeader, btnPrimary, btnDanger, settingsGroup, settingsRow, tag, card, emptyState, esc } from "../layout.js";
import type { AppState } from "../state.js";
import { toastInfo, toastError, invalidate, taskStarted, taskFinished } from "../tasks.js";

const GH_TOKEN_NAME = "github_token";
const VERSION = "0.1.0";

export function settingsRouter(st: AppState): Router {
  const router = Router();

  router.get("/settings", (req, res) => {
    const hasToken = !!(process.env.GITHUB_TOKEN);
    const aiemHome = (() => { try { return paths.home(); } catch { return "?"; } })();
    const backupCfg = loadBackupConfig();
    const lastBackup = backupCfg.last_backup_ts ? timeAgo(backupCfg.last_backup_ts) : "never";
    res.send(page("Settings", "/settings", `
      ${pageHeader("Settings", "", "")}
      <div class="content-padding wide-content">
        ${settingsGroup("GitHub Token", `
          ${settingsRow("Personal Access Token", "Stored in the OS keyring. Avoids 60-req/h anonymous rate limit.",
            hasToken ? tag("configured", "success") : `<span class="meta">not set</span>`
          )}
          <div style="padding:12px 16px;border-top:1px solid var(--stroke-light)">
            <form hx-post="/settings/github-token" hx-swap="none" class="flex gap-2 items-end">
              <input name="token" type="password" placeholder="ghp_..." required class="field" style="flex:1">
              ${btnPrimary("Save")}
            </form>
            <form hx-post="/settings/github-token/clear" hx-swap="none" hx-confirm="Clear stored token?" style="margin-top:8px">${btnDanger("Clear")}</form>
          </div>
        `)}
        ${backupCard(backupCfg, lastBackup)}
        ${settingsGroup("Host Info", `
          ${settingsRow("AIEM_HOME", "", `<span class="mono">${esc(String(aiemHome))}</span>`)}
          ${settingsRow("Hostname", "", `<span class="mono">${esc(os.hostname())}</span>`)}
          ${settingsRow("User", "", `<span class="mono">${esc(os.userInfo().username)}</span>`)}
          ${settingsRow("OS", "", `<span class="mono">${esc(process.platform)} / ${esc(process.arch)}</span>`)}
        `)}
        ${settingsGroup("Trash", `
          ${settingsRow("Removed content", "Items are moved to a local trash folder instead of being hard-deleted.",
            `<a href="/settings/trash" class="btn-secondary" style="text-decoration:none">Open trash</a>`
          )}
        `)}
        ${settingsGroup("About", `
          ${settingsRow("Version", "aiem-web \u2014 headless management for skills & MCP across IDEs (TypeScript build).",
            `<span class="mono">${VERSION}</span>`
          )}
        `)}
      </div>
    `));
  });

  router.post("/settings/github-token", async (req, res) => {
    try {
      const vault = Vault.load();
      await vault.set(GH_TOKEN_NAME, req.body.token, "GitHub Personal Access Token");
      process.env.GITHUB_TOKEN = req.body.token;
      toastInfo(st, "GITHUB_TOKEN saved to keyring");
    } catch (e: any) { toastError(st, `keyring: ${e.message}`); }
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

  router.post("/settings/backup/push", (req, res) => {
    toastInfo(st, "GitHub push not yet implemented in TS build");
    res.send("ok");
  });

  router.post("/settings/backup/pull", (req, res) => {
    toastInfo(st, "GitHub pull not yet implemented in TS build");
    res.send("ok");
  });

  router.post("/settings/backup/interval", (req, res) => {
    const cfg = loadBackupConfig();
    cfg.auto_interval = (req.body.interval === "daily" ? "daily" : req.body.interval === "weekly" ? "weekly" : "never");
    saveBackupConfig(cfg);
    res.redirect("/settings");
  });

  router.get("/settings/trash", (req, res) => {
    const entries = listTrashEntries();
    const td = (() => { try { return paths.trashDir(); } catch { return ""; } })();
    const body = `
      ${pageHeader("Trash", "Items removed from aiem's managed content. Delete entries here to reclaim disk space.", "")}
      ${entries.length === 0 ? emptyState("Trash is empty", `Location: ${td}`) : `
        <div class="row" style="margin-bottom:12px;gap:8px">
          <form method="post" action="/settings/trash/empty" hx-post="/settings/trash/empty" hx-swap="none">${btnDanger("Empty trash")}</form>
          <span class="muted" style="align-self:center">${entries.length} entries \u2022 ${esc(td)}</span>
        </div>
        ${card(`<table class="table" style="width:100%"><thead><tr><th>Name</th><th>Path</th><th>Actions</th></tr></thead><tbody>
          ${entries.map(([name, p]) => `<tr><td><code>${esc(name)}</code></td><td class="muted" style="font-size:12px">${esc(p)}</td><td>
            <form method="post" action="/settings/trash/${encodeURIComponent(name)}/delete" hx-post="/settings/trash/${encodeURIComponent(name)}/delete" hx-swap="none" style="display:inline">${btnDanger("Delete")}</form>
          </td></tr>`).join("")}
        </tbody></table>`)}
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

function backupCard(cfg: BackupConfig, lastBackup: string): string {
  const repoVal = cfg.github_repo || "";
  const hasToken = !!(process.env.GITHUB_TOKEN) || !!loadBackupTokenFile();
  return card(`
    <div class="flex items-center justify-between mb-3">
      <div class="text-sm font-semibold">Backup & Restore</div>
      <span class="meta text-xs">Last backup: ${esc(lastBackup)}</span>
    </div>
    <div class="mb-4">
      <p class="meta text-xs mb-2">Auto-backup interval</p>
      <form hx-post="/settings/backup/interval" hx-swap="none" class="flex gap-2 flex-wrap">
        ${(["never", "daily", "weekly"] as const).map((val) => {
          const label = val.charAt(0).toUpperCase() + val.slice(1);
          const selected = cfg.auto_interval === val;
          return `<button type="submit" name="interval" value="${val}" class="px-3 py-1 rounded text-xs border ${selected ? "border-[var(--accent)] text-[var(--accent)] font-semibold" : "border-[var(--border)] text-[var(--muted)]"}">${label}</button>`;
        }).join("")}
      </form>
    </div>
    <hr class="border-[var(--border)] mb-4">
    <div class="mb-4">
      <p class="text-xs font-semibold mb-2">Local snapshot</p>
      <p class="meta text-xs mb-2">Saves skills_index.json, mcp_servers.json, projects.json into <code class="mono">~/.aiem/snapshots/&lt;ts&gt;/</code></p>
      <form hx-post="/settings/backup/snapshot" hx-swap="none" class="mb-3">${btnPrimary("Snapshot now")}</form>
      <p class="meta text-xs mb-1">Export to directory</p>
      <form hx-post="/settings/backup/export" hx-swap="none" class="flex gap-2"><input name="dest" type="text" placeholder="/path/to/export" class="field" style="flex:1">${btnPrimary("Export")}</form>
      <p class="meta text-xs mb-1 mt-3">Restore from directory</p>
      <form hx-post="/settings/backup/import" hx-swap="none" hx-confirm="Overwrite current config from this snapshot?" class="flex gap-2"><input name="src" type="text" placeholder="/path/to/snapshot" class="field" style="flex:1">${btnDanger("Restore")}</form>
    </div>
    <hr class="border-[var(--border)] mb-4">
    <div>
      <p class="text-xs font-semibold mb-2">GitHub backup</p>
      <form hx-post="/settings/backup/save-config" hx-swap="none" class="mb-3">
        <p class="meta text-xs mb-1">Repo URL (HTTPS)</p>
        <input name="repo" type="text" value="${esc(repoVal)}" placeholder="https://github.com/you/my-aiem-backup" class="field w-full mb-2">
        <p class="meta text-xs mb-1">GitHub Token ${hasToken ? tag("\u25cf saved", "success") : ""}</p>
        <input name="token" type="password" placeholder="ghp_... (leave blank to keep existing)" class="field w-full mb-2">
        <p class="meta text-xs mb-1">Proxy (optional)</p>
        <input name="proxy" type="text" value="${esc(cfg.http_proxy || "")}" placeholder="socks5h://127.0.0.1:1080" class="field w-full mb-2">
        <div class="flex gap-2">${btnPrimary("Save config")}</div>
      </form>
      <div class="flex gap-2">
        <form hx-post="/settings/backup/push" hx-swap="none">${btnPrimary("Push to GitHub")}</form>
        <form hx-post="/settings/backup/pull" hx-swap="none" hx-confirm="Restore config from GitHub? This overwrites current data.">${btnDanger("Pull from GitHub")}</form>
      </div>
    </div>
  `);
}
