import type { AppState } from "./state.js";
import type { ResourceKind } from "./events.js";

export function toastInfo(st: AppState, msg: string): void {
  st.emit({ kind: "toast", level: "info", msg });
}

export function toastSuccess(st: AppState, msg: string): void {
  st.emit({ kind: "toast", level: "success", msg });
}

export function toastError(st: AppState, msg: string): void {
  st.emit({ kind: "toast", level: "error", msg });
}

export function invalidate(st: AppState, resource: ResourceKind): void {
  st.emit({ kind: "invalidate", resource });
}

export function taskStarted(st: AppState, id: number, label: string): void {
  st.emit({ kind: "task_started", id, label });
}

export function taskProgress(st: AppState, id: number, note: string): void {
  st.emit({ kind: "task_progress", id, note });
}

export function taskFinished(st: AppState, id: number, ok: boolean, msg: string): void {
  st.emit({ kind: "task_finished", id, ok, msg });
}
