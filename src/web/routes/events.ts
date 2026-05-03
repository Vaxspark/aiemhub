import { Router, type Request, type Response } from "express";
import type { AppState } from "../state.js";
import type { UiEvent } from "../events.js";

export function eventsRouter(st: AppState): Router {
  const router = Router();

  router.get("/events", (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const handler = (event: UiEvent) => {
      const data = JSON.stringify(event);
      res.write(`data: ${data}\n\n`);
    };

    st.emitter.on("ui", handler);

    const keepAlive = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 15000);

    req.on("close", () => {
      st.emitter.off("ui", handler);
      clearInterval(keepAlive);
    });
  });

  return router;
}
