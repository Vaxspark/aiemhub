export type Scope = "User" | "Project";

export interface IdeTarget {
  id: string;
  displayName: string;
  skillsDir: string;
  defaultScope: Scope;
}

export const IDES: readonly IdeTarget[] = [
  { id: "claude-code", displayName: "Claude Code", skillsDir: ".claude/skills", defaultScope: "User" },
  { id: "codex", displayName: "Codex", skillsDir: ".codex/skills", defaultScope: "User" },
  { id: "cursor", displayName: "Cursor", skillsDir: ".cursor/skills", defaultScope: "Project" },
  { id: "vscode", displayName: "Copilot", skillsDir: ".github/skills", defaultScope: "Project" },
  { id: "windsurf", displayName: "Windsurf", skillsDir: ".windsurf/skills", defaultScope: "Project" },
  { id: "trae", displayName: "Trae", skillsDir: ".trae/skills", defaultScope: "Project" },
  { id: "qoder", displayName: "Qoder", skillsDir: ".qoder/skills", defaultScope: "Project" },
  { id: "kiro", displayName: "Kiro", skillsDir: ".kiro/skills", defaultScope: "Project" },
] as const;

export function findIde(id: string): IdeTarget | undefined {
  return IDES.find((i) => i.id.toLowerCase() === id.toLowerCase());
}
