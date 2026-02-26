import { join } from "node:path";
import { executeClaudeQuery } from "../claude/executor.js";
import type { Agent, ProjectContext } from "../types.js";

/**
 * Return the engine-specific skills directory for the given project.
 * Today Claude Code stores skills in `.claude/skills/`.
 * When new engines are supported this function will branch on the engine type.
 */
export function getSkillsDir(projectCwd: string): string {
  return join(projectCwd, ".claude", "skills");
}

/**
 * Create an Agent for the given project context.
 *
 * This factory is the single place where the underlying AI engine is selected.
 * Today it always returns a Claude Code-backed agent. When support for other
 * providers (Codex, Copilot, …) is added, engine selection will happen here
 * based on project config — command handlers never need to change.
 */
export function createAgent(projectCtx: ProjectContext): Agent {
  return {
    async call(prompt, options) {
      const result = await executeClaudeQuery(
        { prompt, userDir: "", onProgress: options?.onProgress },
        projectCtx,
      );
      if (!result.success) {
        throw new Error(result.error ?? "Agent call failed");
      }
      return result.output;
    },
  };
}
