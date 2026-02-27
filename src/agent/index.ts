import { join } from "node:path";
import type { Agent, ProjectContext } from "../types.js";

/**
 * Return the engine-specific skills directory for the given project.
 * Delegates to the engine adapter attached to the project context.
 * Falls back to .claude/skills/ when no engine is available (e.g. during init).
 */
export function getSkillsDir(projectCwd: string, ctx?: ProjectContext): string {
  if (ctx?.engine) {
    return ctx.engine.skillsDir(projectCwd);
  }
  return join(projectCwd, ".claude", "skills");
}

/**
 * Create an Agent for the given project context.
 *
 * This factory delegates to the engine adapter on the project context.
 * Command handlers never need to know which engine is in use.
 */
export function createAgent(projectCtx: ProjectContext): Agent {
  const { engine } = projectCtx;
  return {
    async call(prompt, options) {
      const result = await engine.execute(
        {
          prompt,
          userDir: "",
          onProgress: options?.onProgress,
          continueSession: options?.continueSession,
        },
        projectCtx,
      );
      if (!result.success) {
        throw new Error(result.error ?? "Agent call failed");
      }
      return result.output;
    },
  };
}
