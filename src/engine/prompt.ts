import { formatContextPrompt, resolveContext } from "../context/resolver.js";
import type { ProjectContext } from "../types.js";
import type { EngineExecuteOptions } from "./types.js";

/**
 * Build a fully-resolved prompt from engine execute options.
 * Handles context injection and downloads-path system message.
 * Shared across all engine adapters.
 */
export async function buildContextualPrompt(
  options: EngineExecuteOptions,
  ctx: ProjectContext,
): Promise<string> {
  const { prompt, gramCtx, downloadsPath } = options;
  const { config, logger, bootContext } = ctx;

  let contextualPrompt = prompt;
  if (gramCtx) {
    const resolvedCtx = await resolveContext({
      gramCtx,
      configContext: config.context,
      bootContext,
      configDir: config.configDir,
      projectCwd: config.cwd,
      projectName: config.name,
      projectSlug: config.slug,
      logger,
    });
    contextualPrompt = formatContextPrompt(resolvedCtx, prompt);
  }

  if (downloadsPath) {
    return `${contextualPrompt}\n\n[System: To send files to the user, write them to: ${downloadsPath}]`;
  }

  return contextualPrompt;
}
