import { Router } from "express";
import { IDES } from "../../core/ide.js";
import { page, pageHeader, settingsGroup, esc } from "../layout.js";
import type { AppState } from "../state.js";

export function idesRouter(_st: AppState): Router {
  const router = Router();

  router.get("/ides", (_req, res) => {
    res.send(page("IDEs", "/ides", `
      ${pageHeader("IDEs", "Supported editors \u2014 deploy targets for skills and MCP.", "")}
      <div class="content-padding wide-content">
        ${settingsGroup("", `<table class="aiem">
          <thead><tr><th>ID</th><th>Display name</th><th>Skills directory</th><th>Default scope</th></tr></thead>
          <tbody>${IDES.map((ide) => `<tr>
            <td class="mono">${esc(ide.id)}</td>
            <td style="font-weight:500">${esc(ide.displayName)}</td>
            <td class="mono meta">${esc(ide.skillsDir)}</td>
            <td class="meta">${esc(ide.defaultScope)}</td>
          </tr>`).join("")}</tbody>
        </table>`)}
      </div>
    `));
  });

  return router;
}
