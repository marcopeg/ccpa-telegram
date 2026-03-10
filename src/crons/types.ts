import type { Bot } from "grammy";
import type { ResolvedProjectConfig } from "../config.js";

/** A target for a .md prompt cron at system tier. */
export interface CronTarget {
  projectId: string;
  userId?: number;
  flowResult?: boolean;
}

/** Parsed .md cron definition. */
export interface MdCronDefinition {
  type: "md";
  name: string;
  sourceFile: string;
  schedule?: string;
  runAt?: Date;
  enabled: boolean;
  targets: CronTarget[];
  prompt: string;
}

/** Parsed .mjs cron definition. */
export interface MjsCronDefinition {
  type: "mjs";
  name: string;
  sourceFile: string;
  schedule?: string;
  runAt?: Date;
  enabled: boolean;
  handler: (ctx: CronContext) => Promise<void>;
}

export type CronDefinition = MdCronDefinition | MjsCronDefinition;

/** Per-project context available to .mjs cron handlers and internal executors. */
export interface CronProjectContext {
  config: ResolvedProjectConfig;
  bot: Bot;
  /** Call the project's AI engine with a prompt and return the response. */
  call(prompt: string): Promise<string>;
}

/** Context object passed to .mjs handlers and used by .md executors. */
export interface CronContext {
  /** Full computed HAL configuration currently in use. */
  config: Record<string, unknown>;
  /** Map of project slug → project context. */
  projects: Record<string, CronProjectContext>;
}

/** Handle returned by the system cron startup. */
export interface CronHandle {
  stop: () => Promise<void>;
}
