import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  parseDuration,
  resolveScheduleEnds,
  resolveScheduleStarts,
} from "./schedule.js";
import { MdFrontmatterSchema, ProjectMdFrontmatterSchema } from "./schema.js";
import type { MdCronDefinition, ProjectMdCronDefinition } from "./types.js";
import { type CronVarsContext, substituteVars } from "./vars.js";

export interface CronMdLoadOptions {
  strict: boolean;
  /** When provided, ${VAR} patterns in frontmatter are resolved before YAML parsing. */
  vars?: CronVarsContext;
}

/**
 * Parse a system-tier .md cron file into a validated MdCronDefinition.
 *
 * If `options.vars` is provided, ${VAR} patterns in the frontmatter are
 * substituted before YAML parsing (resolution chain: ctx → env files → process.env).
 *
 * Throws on schema validation failure.
 * For flowResult+userId mismatch: throws an Error with { soft: true } when strict=false,
 * or a plain Error when strict=true.
 */
export function loadMdCron(
  filePath: string,
  options: CronMdLoadOptions,
): MdCronDefinition {
  const raw = readFileSync(filePath, "utf-8");

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`No YAML frontmatter found in ${filePath}`);
  }

  const [, frontmatterRaw, body] = match;

  // Apply ${VAR} substitution to frontmatter before YAML parsing
  const resolvedFrontmatter = options.vars
    ? substituteVars(frontmatterRaw, options.vars)
    : frontmatterRaw;

  const parsed = parseYaml(resolvedFrontmatter);
  const result = MdFrontmatterSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid frontmatter in ${filePath}: ${result.error.message}`,
    );
  }

  const fm = result.data;

  for (const target of fm.targets) {
    if (target.flowResult && !target.userId) {
      const msg = `flowResult: true requires userId in target (projectId="${target.projectId}") in ${filePath}`;
      if (options.strict) {
        throw new Error(msg);
      }
      throw Object.assign(new Error(msg), { soft: true });
    }
  }

  return {
    type: "md",
    tier: "system",
    name: basename(filePath, ".md"),
    sourceFile: filePath,
    schedule: fm.schedule,
    runAt: fm.runAt ? new Date(fm.runAt) : undefined,
    scheduleStarts: fm.scheduleStarts
      ? resolveScheduleStarts(fm.scheduleStarts)
      : undefined,
    scheduleEnds: fm.scheduleEnds
      ? resolveScheduleEnds(fm.scheduleEnds)
      : undefined,
    scheduleEndsRaw:
      fm.scheduleEnds && parseDuration(fm.scheduleEnds) !== null
        ? fm.scheduleEnds
        : undefined,
    enabled: fm.enabled,
    targets: fm.targets,
    prompt: body.trim(),
  };
}

/**
 * Parse a project-tier .md cron file into a validated ProjectMdCronDefinition.
 *
 * If `options.vars` is provided, ${VAR} patterns in the frontmatter are
 * substituted before YAML parsing (resolution chain: ctx → env files → process.env).
 *
 * No targets array — projectId is implicit from the scheduler scope.
 * Throws on schema validation failure.
 */
export function loadProjectMdCron(
  filePath: string,
  options: CronMdLoadOptions,
): ProjectMdCronDefinition {
  const raw = readFileSync(filePath, "utf-8");

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`No YAML frontmatter found in ${filePath}`);
  }

  const [, frontmatterRaw, body] = match;

  // Apply ${VAR} substitution to frontmatter before YAML parsing
  const resolvedFrontmatter = options.vars
    ? substituteVars(frontmatterRaw, options.vars)
    : frontmatterRaw;

  const parsed = parseYaml(resolvedFrontmatter);
  const result = ProjectMdFrontmatterSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid frontmatter in ${filePath}: ${result.error.message}`,
    );
  }

  return {
    type: "md",
    tier: "project",
    name: basename(filePath, ".md"),
    sourceFile: filePath,
    schedule: result.data.schedule,
    runAt: result.data.runAt ? new Date(result.data.runAt) : undefined,
    scheduleStarts: result.data.scheduleStarts
      ? resolveScheduleStarts(result.data.scheduleStarts)
      : undefined,
    scheduleEnds: result.data.scheduleEnds
      ? resolveScheduleEnds(result.data.scheduleEnds)
      : undefined,
    scheduleEndsRaw:
      result.data.scheduleEnds &&
      parseDuration(result.data.scheduleEnds) !== null
        ? result.data.scheduleEnds
        : undefined,
    enabled: result.data.enabled,
    runAs: result.data.runAs,
    notify: result.data.notify,
    prompt: body.trim(),
  };
}
