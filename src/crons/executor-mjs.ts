import type { Bot } from "grammy";
import type pino from "pino";
import { createAgent } from "../agent/index.js";
import { buildCronContextVars } from "../context/resolver.js";
import { getDefaultEngineModel } from "../default-models.js";
import type { ProjectContext } from "../types.js";
import { writeCronLog } from "./log.js";
import type {
  CronContext,
  CronRunState,
  MjsCronDefinition,
  ProjectCronContext,
  ProjectMjsCronDefinition,
} from "./types.js";

/**
 * Execute a system-tier .mjs cron definition.
 * Calls the exported handler with the full CronContext.
 * Any error thrown by the handler is caught, logged, and recorded in the execution log.
 */
export async function executeMjsCron(
  def: MjsCronDefinition,
  ctx: CronContext,
  logBaseDir: string,
  logger: pino.Logger,
  scope: string,
  state: CronRunState,
): Promise<void> {
  const startedAt = new Date();
  let output = "";
  let error: string | undefined;

  try {
    await def.handler({ ...ctx, cron: state });
    output = "(programmatic handler completed)";
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    logger.error(
      { jobName: def.name, error },
      "Cron .mjs handler threw an error",
    );
  }

  writeCronLog(logBaseDir, {
    jobName: def.name,
    sourceFile: def.sourceFile,
    scope,
    type: def.type,
    startedAt,
    finishedAt: new Date(),
    output,
    error,
  });
}

/**
 * Execute a project-tier .mjs cron definition.
 *
 * Builds a ProjectCronContext fresh on every execution — this ensures time-sensitive
 * @{} context vars (current date/time, shell output, etc.) are always up-to-date.
 * Calls the exported handler with the fresh context.
 *
 * @param projectCtx - full ProjectContext for this project
 * @param bot - Grammy Bot instance for this project
 * @param logBaseDir - configDir (centralised log base)
 * @param scope - project slug (used as log scope)
 */
export async function executeMjsProjectCron(
  def: ProjectMjsCronDefinition,
  projectCtx: ProjectContext,
  bot: Bot,
  logBaseDir: string,
  logger: pino.Logger,
  scope: string,
  state: CronRunState,
): Promise<void> {
  const startedAt = new Date();
  let output = "";
  let error: string | undefined;

  try {
    const { config, logger: pLogger, bootContext } = projectCtx;
    const defaultModel = config.engineModel
      ? undefined
      : (getDefaultEngineModel(config.engine) ?? "engine-defaults");

    // Build context vars fresh — captures time-sensitive @{} values at execution time
    const contextVars = await buildCronContextVars({
      configContext: config.context,
      bootContext,
      configDir: config.configDir,
      projectCwd: config.cwd,
      projectName: config.name,
      projectSlug: config.slug,
      logger: pLogger,
      engineName: config.engine,
      engineCommand: projectCtx.engine.command,
      engineModel: config.engineModel,
      engineDefaultModel: defaultModel,
      userId: def.runAs,
    });
    contextVars["cron.runs"] = String(state.runs);
    contextVars["cron.lastRun"] = state.lastRun?.toISOString() ?? "";

    const cronCtx: ProjectCronContext = {
      project: config,
      bot,
      context: contextVars,
      call: (prompt: string) => createAgent(projectCtx).call(prompt),
    };

    await def.handler(cronCtx);
    output = "(programmatic handler completed)";
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    logger.error(
      { jobName: def.name, error },
      "Cron .mjs project handler threw an error",
    );
  }

  writeCronLog(logBaseDir, {
    jobName: def.name,
    sourceFile: def.sourceFile,
    scope,
    type: def.type,
    startedAt,
    finishedAt: new Date(),
    output,
    error,
  });
}
