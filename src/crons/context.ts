import type { Bot } from "grammy";
import { createAgent } from "../agent/index.js";
import type { ProjectContext } from "../types.js";
import type { CronContext } from "./types.js";

export interface CronRuntimeEntry {
  projectCtx: ProjectContext;
  bot: Bot;
}

/**
 * Build the public CronContext (passed to .mjs handlers) and the internal
 * projectCtxs map (used by .md executors to call createAgent()).
 *
 * Keeping these separate means .mjs handlers only see what they need
 * (config + bot) while the executor layer retains access to the full
 * ProjectContext required for engine.execute().
 */
export function buildCronContext(
  multiConfig: Record<string, unknown>,
  entries: Record<string, CronRuntimeEntry>,
): {
  cronCtx: CronContext;
  internalProjectCtxs: Record<string, ProjectContext>;
} {
  const projects: CronContext["projects"] = {};
  const internalProjectCtxs: Record<string, ProjectContext> = {};

  for (const [slug, { projectCtx, bot }] of Object.entries(entries)) {
    projects[slug] = {
      config: projectCtx.config,
      bot,
      call: (prompt: string) => createAgent(projectCtx).call(prompt),
    };
    internalProjectCtxs[slug] = projectCtx;
  }

  return {
    cronCtx: { config: multiConfig, projects },
    internalProjectCtxs,
  };
}
