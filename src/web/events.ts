export type ToastLevel = "info" | "success" | "warn" | "error";
export type ResourceKind = "skills" | "mcp" | "secrets" | "projects" | "profiles" | "remote";

export type UiEvent =
  | { kind: "toast"; level: ToastLevel; msg: string }
  | { kind: "task_started"; id: number; label: string }
  | { kind: "task_progress"; id: number; note: string }
  | { kind: "task_finished"; id: number; ok: boolean; msg: string }
  | { kind: "invalidate"; resource: ResourceKind };
