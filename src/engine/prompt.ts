import { formatContextPrompt, resolveContext } from "../context/resolver.js";
import { getDefaultEngineModel } from "../default-models.js";
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
    const defaultModel = config.engineModel
      ? undefined
      : (getDefaultEngineModel(config.engine) ?? "engine-defaults");
    const resolvedCtx = await resolveContext({
      gramCtx,
      configContext: config.context,
      bootContext,
      configDir: config.configDir,
      projectCwd: config.cwd,
      projectName: config.name,
      projectSlug: config.slug,
      logger,
      engineName: config.engine,
      engineCommand: ctx.engine.command,
      engineModel: config.engineModel,
      engineDefaultModel: defaultModel,
    });
    contextualPrompt = formatContextPrompt(resolvedCtx, prompt);
  }

  if (downloadsPath) {
    return `${contextualPrompt}\n\n[System: To send files to the user, write them to: ${downloadsPath}]`;
  }

  return contextualPrompt;
}
