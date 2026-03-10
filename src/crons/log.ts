import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface CronLogProjectConfig {
  slug: string;
  name: string | undefined;
  cwd: string;
  engine: string;
  engineModel: string | undefined;
  engineSession: unknown;
  context: Record<string, string> | undefined;
}

export interface CronLogEntry {
  jobName: string;
  sourceFile: string;
  /** Scope tier: "system", or project slug for 032b. */
  scope: string;
  /** Cron file type — drives the subfolder name and filename suffix. */
  type: "md" | "mjs";
  startedAt: Date;
  finishedAt: Date;
  output: string;
  error?: string;
  /** The raw prompt body before context injection (.md only). */
  prompt?: string;
  /** The resolved context vars injected into the prompt (.md only). */
  context?: Record<string, string>;
  /** Project this run targeted (undefined when no project available). */
  projectId?: string;
  /** Subset of the project's resolved config (no secrets). */
  projectConfig?: CronLogProjectConfig;
}

/**
 * Write a cron execution log to:
 *
 *   System:  {logBaseDir}/.hal/logs/crons/system/{jobName}.{type}/{timestamp}.{jobName}.txt
 *   Project: {logBaseDir}/.hal/logs/crons/project/{slug}/{jobName}.{type}/{timestamp}.{jobName}.txt
 *
 * The folder name includes the file extension (.md / .mjs) so same-named
 * .md and .mjs crons never collide. For .md crons with multiple targets,
 * one file is written per target run and the project ID is appended to the filename.
 */
export function writeCronLog(logBaseDir: string, entry: CronLogEntry): void {
  const scopePath =
    entry.scope === "system" ? join("system") : join("project", entry.scope);

  const logDir = join(
    logBaseDir,
    ".hal",
    "logs",
    "crons",
    scopePath,
    `${entry.jobName}.${entry.type}`,
  );
  mkdirSync(logDir, { recursive: true });

  const ts = entry.startedAt
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("Z", "");
  const projectSuffix = entry.projectId ? `.${entry.projectId}` : "";
  const filename = `${ts}.${entry.jobName}${projectSuffix}.txt`;
  const filePath = join(logDir, filename);

  const lines: string[] = [
    `job:     ${entry.jobName}`,
    `source:  ${entry.sourceFile}`,
  ];

  if (entry.projectId) {
    lines.push(`project: ${entry.projectId}`);
  }

  lines.push(
    `started: ${entry.startedAt.toISOString()}`,
    `ended:   ${entry.finishedAt.toISOString()}`,
    `status:  ${entry.error ? "error" : "ok"}`,
  );

  if (entry.prompt != null) {
    lines.push("", "--- prompt ---", entry.prompt.trimEnd());
  }

  if (entry.context && Object.keys(entry.context).length > 0) {
    lines.push("", "--- context ---");
    for (const [k, v] of Object.entries(entry.context)) {
      lines.push(`${k}: ${v}`);
    }
  }

  if (entry.projectConfig) {
    const cfg = entry.projectConfig;
    lines.push("", "--- project config ---");
    lines.push(`slug:    ${cfg.slug}`);
    lines.push(`name:    ${cfg.name ?? "(none)"}`);
    lines.push(`cwd:     ${cfg.cwd}`);
    lines.push(`engine:  ${cfg.engine}`);
    lines.push(`model:   ${cfg.engineModel ?? "(default)"}`);
    lines.push(`session: ${String(cfg.engineSession)}`);
    if (cfg.context && Object.keys(cfg.context).length > 0) {
      lines.push("context:");
      for (const [k, v] of Object.entries(cfg.context)) {
        lines.push(`  ${k}: ${v}`);
      }
    }
  }

  lines.push("", "--- output ---", entry.output);

  if (entry.error) {
    lines.push("", "--- error ---", entry.error);
  }

  appendFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
}
