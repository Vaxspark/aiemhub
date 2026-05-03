import { EventEmitter } from "events";
import type { UiEvent } from "./events.js";
import { SkillRegistry } from "../core/skills.js";
import { McpRegistry } from "../core/mcp.js";
import { Vault } from "../core/secrets.js";
import { ProjectStore } from "../core/projects.js";
import { ProfileStore } from "../core/profiles.js";

export class AppState {
  readonly emitter = new EventEmitter();
  private _taskCounter = 0;
  private _writeLock = false;

  emit(event: UiEvent): void {
    this.emitter.emit("ui", event);
  }

  async nextTaskId(): Promise<number> {
    return ++this._taskCounter;
  }

  async acquireWriteLock(): Promise<() => void> {
    while (this._writeLock) {
      await new Promise((r) => setTimeout(r, 10));
    }
    this._writeLock = true;
    return () => { this._writeLock = false; };
  }

  skills(): SkillRegistry { return SkillRegistry.load(); }
  mcp(): McpRegistry { return McpRegistry.load(); }
  vault(): Vault { return Vault.load(); }
  projects(): ProjectStore { return ProjectStore.load(); }
  profiles(): ProfileStore { return ProfileStore.load(); }
}
