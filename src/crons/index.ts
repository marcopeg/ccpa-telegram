import { join } from "node:path";
import type { Bot } from "grammy";
import type pino from "pino";
import type { ProjectContext } from "../types.js";
import { buildCronContext } from "./context.js";
import { executeMdCron, executeMdProjectCron } from "./executor-md.js";
import { executeMjsCron, executeMjsProjectCron } from "./executor-mjs.js";
import { loadCronsFromDir, loadProjectCronsFromDir } from "./loader-dir.js";
import { CronScheduler } from "./scheduler.js";
import type {
  AnyDefinition,
  CronHandle,
  CronRunState,
  MdCronDefinition,
  MjsCronDefinition,
  ProjectMdCronDefinition,
  ProjectMjsCronDefinition,
} from "./types.js";
import type { CronVarsContext } from "./vars.js";
import { startCronWatcher } from "./watcher.js";

// ─── System-tier ──────────────────────────────────────────────────────────────

export interface StartSystemCronsOptions {
  configDir: string;
  multiConfig: Record<string, unknown>;
  /** Map of project slug → { projectCtx, bot } */
  projects: Record<string, { projectCtx: ProjectContext; bot: Bot }>;
  logger: pino.Logger;
}

/**
 * Load, validate, and schedule all system-level cron files from
 * {configDir}/.hal/crons/. Starts a file watcher for hot reload.
 *
 * ${VAR} patterns in .md frontmatter are resolved against:
 *   ctx (multiConfig.context) → .env.local (configDir) → .env (configDir) → process.env
 *
 * Throws on the first invalid file at boot (strict mode).
 * Returns a handle that stops the scheduler and the file watcher.
 */
export async function startSystemCrons(
  options: StartSystemCronsOptions,
): Promise<CronHandle> {
  const { configDir, multiConfig, projects, logger } = options;
  const cronDir = join(configDir, ".hal", "crons");

  const { cronCtx, internalProjectCtxs } = buildCronContext(
    multiConfig,
    projects,
  );

  // Build ${VAR} substitution context for system-tier .md frontmatter
  const vars: CronVarsContext = {
    ctx: (multiConfig.context as Record<string, string>) ?? {},
    envDirs: [configDir],
  };

  const { definitions } = await loadCronsFromDir(cronDir, logger, {
    strict: true,
    vars,
  });
  logger.info({ count: definitions.length }, "System crons loaded");

  const scheduler = new CronScheduler(
    async (def: AnyDefinition, state: CronRunState) => {
      // System-tier scheduler is only ever loaded with system-tier definitions
      if (def.type === "md") {
        await executeMdCron(
          def as MdCronDefinition,
          internalProjectCtxs,
          cronCtx,
          configDir,
          logger,
          "system",
          state,
        );
      } else {
        await executeMjsCron(
          def as MjsCronDefinition,
          cronCtx,
          configDir,
          logger,
          "system",
          state,
        );
      }
    },
    logger,
    "system",
  );
  scheduler.load(definitions);

  const watcher = startCronWatcher(cronDir, scheduler, logger, {
    tier: "system",
    vars,
  });

  return {
    stop: async () => {
      await watcher.stop();
      scheduler.stop();
      logger.info("System cron scheduler stopped");
    },
  };
}

// ─── Project-tier ─────────────────────────────────────────────────────────────

export interface StartProjectCronsOptions {
  projectCtx: ProjectContext;
  bot: Bot;
  /** configDir — used as the centralised log base (logs go to {configDir}/.hal/logs/crons/projects/{slug}/...) */
  configDir: string;
  logger: pino.Logger;
}

/**
 * Load, validate, and schedule all project-level cron files from
 * {projectCwd}/.hal/crons/. Starts a file watcher for hot reload.
 *
 * ${VAR} patterns in .md frontmatter are resolved against:
 *   ctx (project config.context + bootContext.shellCache)
 *   → .env.local (projectCwd) → .env (projectCwd)
 *   → .env.local (configDir)  → .env (configDir)
 *   → process.env
 *
 * Non-strict: invalid files are logged and skipped without failing project boot.
 * Returns a handle that stops the scheduler and the file watcher.
 */
export async function startProjectCrons(
  options: StartProjectCronsOptions,
): Promise<CronHandle> {
  const { projectCtx, bot, configDir, logger } = options;
  const { config } = projectCtx;
  const cronDir = join(config.cwd, ".hal", "crons");
  const scope = config.slug;

  // Build ${VAR} substitution context for project-tier .md frontmatter.
  // Merge raw config.context with boot-evaluated shell cache values — shell cache wins.
  const vars: CronVarsContext = {
    ctx: {
      ...(config.context ?? {}),
      ...projectCtx.bootContext.shellCache,
    },
    envDirs: [config.cwd, configDir],
  };

  const { definitions } = await loadProjectCronsFromDir(cronDir, logger, {
    strict: false,
    vars,
  });
  logger.info(
    { count: definitions.length, project: scope },
    "Project crons loaded",
  );

  const scheduler = new CronScheduler(
    async (def: AnyDefinition, state: CronRunState) => {
      // Project-tier scheduler is only ever loaded with project-tier definitions
      if (def.type === "md") {
        await executeMdProjectCron(
          def as ProjectMdCronDefinition,
          projectCtx,
          bot,
          configDir,
          logger,
          scope,
          state,
        );
      } else {
        await executeMjsProjectCron(
          def as ProjectMjsCronDefinition,
          projectCtx,
          bot,
          configDir,
          logger,
          scope,
          state,
        );
      }
    },
    logger,
    scope,
  );
  scheduler.load(definitions);

  const watcher = startCronWatcher(cronDir, scheduler, logger, {
    tier: "project",
    vars,
  });

  return {
    stop: async () => {
      await watcher.stop();
      scheduler.stop();
      logger.info({ project: scope }, "Project cron scheduler stopped");
    },
  };
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { buildCronContext } from "./context.js";
export { loadCronsFromDir, loadProjectCronsFromDir } from "./loader-dir.js";
export { CronScheduler } from "./scheduler.js";
// System-tier types
// Project-tier types
export type {
  AnyDefinition,
  CronContext,
  CronDefinition,
  CronHandle,
  ProjectCronContext,
  ProjectCronDefinition,
} from "./types.js";
export { startCronWatcher } from "./watcher.js";
