import express from "express";
import * as net from "net";
import { ensureLayout } from "./core/paths.js";
import { AppState } from "./web/state.js";
import { skillsRouter } from "./web/routes/skills.js";
import { mcpRouter } from "./web/routes/mcp.js";
import { secretsRouter } from "./web/routes/secrets.js";
import { settingsRouter } from "./web/routes/settings.js";
import { idesRouter } from "./web/routes/ides.js";
import { projectsRouter } from "./web/routes/projects.js";
import { discoverRouter } from "./web/routes/discover.js";
import { profilesRouter } from "./web/routes/profiles.js";
import { eventsRouter } from "./web/routes/events.js";

async function main() {
  const host = process.env.AIEM_HOST || "127.0.0.1";
  const port = parseInt(process.env.AIEM_PORT || "8787", 10);
  const openBrowser = process.env.AIEM_OPEN_BROWSER === "1" || process.env.AIEM_OPEN_BROWSER === "true";

  ensureLayout();

  const state = new AppState();
  const app = express();

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.get("/", (_req, res) => res.redirect("/skills"));
  app.use(skillsRouter(state));
  app.use(mcpRouter(state));
  app.use(secretsRouter(state));
  app.use(settingsRouter(state));
  app.use(idesRouter(state));
  app.use(projectsRouter(state));
  app.use(discoverRouter(state));
  app.use(profilesRouter(state));
  app.use(eventsRouter(state));

  const actualPort = await bindWithFallback(app, host, port, 10);

  console.log(`\n  aiem-web is running:  http://${host}:${actualPort}\n`);
  if (host !== "127.0.0.1" && host !== "localhost") {
    console.log(`  (on a remote box, use:  ssh -L ${actualPort}:localhost:${actualPort} user@host)\n`);
  }
  if (actualPort !== port) {
    console.log(`  Note: port ${port} was in use — using ${actualPort} instead.\n`);
  }

  if (openBrowser) {
    const url = `http://${host}:${actualPort}`;
    const { exec } = await import("child_process");
    if (process.platform === "win32") exec(`start "" "${url}"`);
    else if (process.platform === "darwin") exec(`open "${url}"`);
    else exec(`xdg-open "${url}"`);
  }
}

async function bindWithFallback(
  app: express.Express,
  host: string,
  startPort: number,
  maxTries: number
): Promise<number> {
  for (let offset = 0; offset < maxTries; offset++) {
    const tryPort = startPort + offset;
    const available = await isPortAvailable(host, tryPort);
    if (available) {
      return new Promise((resolve, reject) => {
        const server = app.listen(tryPort, host, () => resolve(tryPort));
        server.on("error", reject);
      });
    }
  }
  throw new Error(`Could not bind to any port in range ${startPort}\u2013${startPort + maxTries - 1}`);
}

function isPortAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => { server.close(() => resolve(true)); });
    server.listen(port, host);
  });
}

export { main };

// Run if executed directly (not imported by CLI)
const isDirect = process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index");

if (isDirect) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
