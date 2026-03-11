import type { Bot } from "grammy";
import type pino from "pino";
import { createAgent } from "../agent/index.js";
import {
  buildCronContextVars,
  buildSystemContext,
  formatContextPrompt,
} from "../context/resolver.js";
import { getDefaultEngineModel } from "../default-models.js";
import type { ProjectContext } from "../types.js";
import { writeCronLog } from "./log.js";
import type {
  CronContext,
  CronRunState,
  MdCronDefinition,
  ProjectMdCronDefinition,
} from "./types.js";

/**
 * Execute a system-tier .md cron definition.
 *
 * For each target: calls the project engine anonymously with the prompt body,
 * then optionally sends the result to a Telegram user if flowResult: true.
 * One log file is written per target run.
 *
 * Context (sys.*, project.*, engine.*, bot.userId) is injected into the prompt
 * the same way as user-driven messages. bot.messageId and bot.chatId are empty
 * since there is no inbound Telegram message.
 *
 * @param internalProjectCtxs - full ProjectContext per project slug; not exposed in CronContext
 * @param logBaseDir - base directory for execution logs (configDir for system tier)
 */
export async function executeMdCron(
  def: MdCronDefinition,
  internalProjectCtxs: Record<string, ProjectContext>,
  cronCtx: CronContext,
  logBaseDir: string,
  logger: pino.Logger,
  scope: string,
  state: CronRunState,
): Promise<void> {
  for (const target of def.targets) {
    const projectCtx = internalProjectCtxs[target.projectId];

    if (!projectCtx) {
      logger.error(
        { jobName: def.name, projectId: target.projectId },
        "Cron target projectId not found — skipping target",
      );
      // Still log the attempt with whatever context we can build.
      writeCronLog(logBaseDir, {
        jobName: def.name,
        sourceFile: def.sourceFile,
        scope,
        type: def.type,
        startedAt: new Date(),
        finishedAt: new Date(),
        output: "",
        error: `projectId not found: ${target.projectId}`,
        prompt: def.prompt,
        context: buildSystemContext(),
        projectId: target.projectId,
      });
      continue;
    }

    const startedAt = new Date();
    let output = "";
    let error: string | undefined;
    let contextVars: Record<string, string> | undefined;

    try {
      const { config, logger: pLogger, bootContext } = projectCtx;
      const defaultModel = config.engineModel
        ? undefined
        : (getDefaultEngineModel(config.engine) ?? "engine-defaults");

      contextVars = await buildCronContextVars({
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
        userId: target.userId,
      });
      contextVars["cron.runs"] = String(state.runs);
      contextVars["cron.lastRun"] = state.lastRun?.toISOString() ?? "";
      const contextualPrompt = formatContextPrompt(contextVars, def.prompt);

      const agent = createAgent(projectCtx);
      output = await agent.call(contextualPrompt);

      if (target.flowResult && target.userId) {
        const projectCronCtx = cronCtx.projects[target.projectId];
        await projectCronCtx.bot.api.sendMessage(target.userId, output);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      logger.error(
        { jobName: def.name, projectId: target.projectId, error },
        "Cron .md execution failed",
      );
    }

    const cfg = projectCtx.config;
    writeCronLog(logBaseDir, {
      jobName: def.name,
      sourceFile: def.sourceFile,
      scope,
      type: def.type,
      startedAt,
      finishedAt: new Date(),
      output,
      error,
      prompt: def.prompt,
      context: contextVars,
      projectId: target.projectId,
      projectConfig: {
        slug: cfg.slug,
        name: cfg.name,
        cwd: cfg.cwd,
        engine: cfg.engine,
        engineModel: cfg.engineModel,
        engineSession: cfg.engineSession,
        context: cfg.context,
      },
    });
  }
}

/**
 * Execute a project-tier .md cron definition.
 *
 * The projectId is implicit (scheduler scope). Context is built fresh on every
 * execution to capture time-sensitive @{} values. Result is sent via DM to
 * the runAs user (if set) and all notify users (if set). Silent if neither.
 *
 * @param projectCtx - full ProjectContext for this project
 * @param bot - Grammy Bot instance for this project
 * @param logBaseDir - configDir (centralised log base)
 * @param scope - project slug (used as log scope)
 */
export async function executeMdProjectCron(
  def: ProjectMdCronDefinition,
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
  let contextVars: Record<string, string> | undefined;

  try {
    const { config, logger: pLogger, bootContext } = projectCtx;
    const defaultModel = config.engineModel
      ? undefined
      : (getDefaultEngineModel(config.engine) ?? "engine-defaults");

    contextVars = await buildCronContextVars({
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

    const contextualPrompt = formatContextPrompt(contextVars, def.prompt);
    const agent = createAgent(projectCtx);
    output = await agent.call(contextualPrompt);

    // Dispatch result to runAs user and all notify users
    const recipients = [
      ...(def.runAs != null ? [def.runAs] : []),
      ...(def.notify ?? []),
    ];
    for (const userId of recipients) {
      try {
        await bot.api.sendMessage(userId, output);
      } catch (sendErr) {
        logger.warn(
          {
            jobName: def.name,
            userId,
            error: sendErr instanceof Error ? sendErr.message : String(sendErr),
          },
          "Cron result DM failed",
        );
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    logger.error(
      { jobName: def.name, error },
      "Cron .md project execution failed",
    );
  }

  const cfg = projectCtx.config;
  writeCronLog(logBaseDir, {
    jobName: def.name,
    sourceFile: def.sourceFile,
    scope,
    type: def.type,
    startedAt,
    finishedAt: new Date(),
    output,
    error,
    prompt: def.prompt,
    context: contextVars,
    projectId: cfg.slug,
    projectConfig: {
      slug: cfg.slug,
      name: cfg.name,
      cwd: cfg.cwd,
      engine: cfg.engine,
      engineModel: cfg.engineModel,
      engineSession: cfg.engineSession,
      context: cfg.context,
    },
  });
}
