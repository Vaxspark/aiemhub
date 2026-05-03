import { Router } from "express";
import { Vault } from "../../core/secrets.js";
import { page, pageHeader, btnPrimary, btnDanger, emptyState, settingsGroup, esc } from "../layout.js";
import type { AppState } from "../state.js";
import { toastInfo, toastError, invalidate } from "../tasks.js";

export function secretsRouter(st: AppState): Router {
  const router = Router();

  router.get("/secrets", (req, res) => {
    const vault = tryLoad(() => st.vault());
    res.send(page("Secrets", "/secrets", `
      ${pageHeader("Secrets", "OS-keyring backed vault. Reference via \${secret:NAME} in MCP env/headers.", "")}
      <div class="content-padding wide-content">
        ${formView()}
        <div data-resource="secrets" hx-get="/secrets/fragment" hx-trigger="refresh from:body, load" hx-swap="innerHTML">${renderSecrets(vault)}</div>
      </div>
    `));
  });

  router.get("/secrets/fragment", (req, res) => {
    res.send(renderSecrets(tryLoad(() => st.vault())));
  });

  router.post("/secrets/set", async (req, res) => {
    try {
      const vault = Vault.load();
      const desc = (req.body.description || "").trim() || undefined;
      await vault.set(req.body.name, req.body.value, desc);
      toastInfo(st, `saved ${req.body.name}`);
      invalidate(st, "secrets");
    } catch (e: any) { toastError(st, `set: ${e.message}`); }
    res.send("ok");
  });

  router.post("/secrets/:name/remove", async (req, res) => {
    try {
      const vault = Vault.load();
      await vault.del(req.params.name);
      toastInfo(st, `deleted ${req.params.name}`);
      invalidate(st, "secrets");
    } catch (e: any) { toastError(st, `delete: ${e.message}`); }
    res.send("ok");
  });

  return router;
}

function tryLoad<T>(fn: () => T): T | undefined { try { return fn(); } catch { return undefined; } }

function formView(): string {
  return settingsGroup("Set secret", `<div style="padding:12px 16px">
    <form hx-post="/secrets/set" hx-swap="none" class="grid gap-3" style="grid-template-columns:1fr 2fr auto">
      <div><label class="label">Name *</label><input name="name" required class="field"></div>
      <div><label class="label">Value *</label><input name="value" type="password" required class="field"></div>
      <div class="flex items-end">${btnPrimary("Save")}</div>
      <div style="grid-column:1/-1"><label class="label">Description</label><input name="description" class="field"></div>
    </form>
  </div>`);
}

function renderSecrets(vault: Vault | undefined): string {
  if (!vault) return `<div style="color:var(--danger);padding:16px">Failed to load vault.</div>`;
  const names = vault.names();
  if (names.length === 0) return emptyState("No secrets stored", "Add one above \u2014 values live in the OS keyring, not on disk.");
  return settingsGroup("", `<table class="aiem">
    <thead><tr><th>Name</th><th>Description</th><th>Updated</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${names.map((n) => {
      const m = vault.meta(n);
      return `<tr>
        <td class="mono">${esc(n)}</td>
        <td class="meta">${esc(m?.description || "")}</td>
        <td class="meta">${esc(m?.updated_at || "")}</td>
        <td style="text-align:right"><form hx-post="/secrets/${encodeURIComponent(n)}/remove" hx-swap="none" hx-confirm="Delete secret?">${btnDanger("Delete")}</form></td>
      </tr>`;
    }).join("")}</tbody>
  </table>`);
}
