import type { Bot } from "grammy";
import type { ResolvedProjectConfig } from "../config.js";

/** A target for a .md prompt cron at system tier. */
export interface CronTarget {
  projectId: string;
  userId?: number;
  flowResult?: boolean;
}

/** Parsed system-tier .md cron definition. */
export interface MdCronDefinition {
  type: "md";
  tier: "system";
  name: string;
  sourceFile: string;
  schedule?: string;
  runAt?: Date;
  /** Absolute datetime before which the schedule will not start. */
  scheduleStarts?: Date;
  /** Absolute datetime after which the schedule stops firing. */
  scheduleEnds?: Date;
  /** Raw relative duration string for scheduleEnds (e.g. "10s"). When set, scheduleEnds
   *  is re-resolved at the moment scheduleStarts fires so "wait Xs then run for Ys" works. */
  scheduleEndsRaw?: string;
  enabled: boolean;
  targets: CronTarget[];
  prompt: string;
}

/** Parsed system-tier .mjs cron definition. */
export interface MjsCronDefinition {
  type: "mjs";
  tier: "system";
  name: string;
  sourceFile: string;
  schedule?: string;
  runAt?: Date;
  /** Absolute datetime before which the schedule will not start. */
  scheduleStarts?: Date;
  /** Absolute datetime after which the schedule stops firing. */
  scheduleEnds?: Date;
  /** Raw relative duration string for scheduleEnds (e.g. "10s"). When set, scheduleEnds
   *  is re-resolved at the moment scheduleStarts fires so "wait Xs then run for Ys" works. */
  scheduleEndsRaw?: string;
  enabled: boolean;
  handler: (ctx: CronContext) => Promise<void>;
}

export type CronDefinition = MdCronDefinition | MjsCronDefinition;

/** Parsed project-tier .md cron definition (no targets — projectId is implicit). */
export interface ProjectMdCronDefinition {
  type: "md";
  tier: "project";
  name: string;
  sourceFile: string;
  schedule?: string;
  runAt?: Date;
  /** Absolute datetime before which the schedule will not start. */
  scheduleStarts?: Date;
  /** Absolute datetime after which the schedule stops firing. */
  scheduleEnds?: Date;
  /** Raw relative duration string for scheduleEnds (e.g. "10s"). When set, scheduleEnds
   *  is re-resolved at the moment scheduleStarts fires so "wait Xs then run for Ys" works. */
  scheduleEndsRaw?: string;
  enabled: boolean;
  /** User ID whose context (bot.userId) is injected into the prompt AND who receives the result. */
  runAs?: number;
  /** Additional user IDs that receive the result via DM (no context injection). */
  notify?: number[];
  prompt: string;
}

/** Parsed project-tier .mjs cron definition. */
export interface ProjectMjsCronDefinition {
  type: "mjs";
  tier: "project";
  name: string;
  sourceFile: string;
  schedule?: string;
  runAt?: Date;
  /** Absolute datetime before which the schedule will not start. */
  scheduleStarts?: Date;
  /** Absolute datetime after which the schedule stops firing. */
  scheduleEnds?: Date;
  /** Raw relative duration string for scheduleEnds (e.g. "10s"). When set, scheduleEnds
   *  is re-resolved at the moment scheduleStarts fires so "wait Xs then run for Ys" works. */
  scheduleEndsRaw?: string;
  enabled: boolean;
  /** User ID injected as bot.userId into the context vars built for this handler. */
  runAs?: number;
  handler: (ctx: ProjectCronContext) => Promise<void>;
}

export type ProjectCronDefinition =
  | ProjectMdCronDefinition
  | ProjectMjsCronDefinition;

/** Union of system-tier and project-tier definitions — used by CronScheduler. */
export type AnyDefinition = CronDefinition | ProjectCronDefinition;

/** Per-project context available to system-tier .mjs cron handlers and internal executors. */
export interface CronProjectContext {
  config: ResolvedProjectConfig;
  bot: Bot;
  /** Call the project's AI engine with a prompt and return the response. */
  call(prompt: string): Promise<string>;
}

/** Context object passed to system-tier .mjs handlers and used by .md executors. */
export interface CronContext {
  /** Full computed HAL configuration currently in use. */
  config: Record<string, unknown>;
  /** Map of project slug → project context. */
  projects: Record<string, CronProjectContext>;
  /** Run state for the current execution. */
  cron: CronRunState;
}

/**
 * Context passed to project-tier .mjs handlers.
 * Flat (single project), built fresh on every execution.
 */
export interface ProjectCronContext {
  /** Full resolved config for this project. */
  project: ResolvedProjectConfig;
  /** Grammy Bot instance for this project only. */
  bot: Bot;
  /**
   * Resolved context vars — same key/value map injected into .md cron prompts.
   * Built fresh on every execution; includes time-sensitive @{} values.
   */
  context: Record<string, string>;
  /** Call this project's AI engine with a prompt and return the response. */
  call(prompt: string): Promise<string>;
}

/** Run-state for a scheduled job — tracked in-memory by the scheduler. */
export interface CronRunState {
  /** How many times this job has executed so far (1 on the first run). */
  runs: number;
  /** Start timestamp of the previous execution. Undefined on the first run. */
  lastRun?: Date;
}

/** Handle returned by cron startup functions. */
export interface CronHandle {
  stop: () => Promise<void>;
}
