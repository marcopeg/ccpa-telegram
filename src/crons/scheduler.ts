import { Cron } from "croner";
import type pino from "pino";
import type { ProjectContext } from "../types.js";
import { executeMdCron } from "./executor-md.js";
import { executeMjsCron } from "./executor-mjs.js";
import type { CronContext, CronDefinition } from "./types.js";

interface JobEntry {
  definition: CronDefinition;
  /** null when the job was skipped (disabled or past runAt) */
  cronInstance: Cron | null;
}

export class CronScheduler {
  private readonly jobs = new Map<string, JobEntry>();

  constructor(
    private readonly cronCtx: CronContext,
    private readonly internalProjectCtxs: Record<string, ProjectContext>,
    private readonly logBaseDir: string,
    private readonly logger: pino.Logger,
    /** Prefix added to jobName in all log entries, e.g. "system" or a project slug. */
    private readonly scope: string,
  ) {}

  /** Load an array of definitions and schedule all eligible jobs. */
  load(definitions: CronDefinition[]): void {
    for (const def of definitions) {
      this.add(def);
    }
  }

  /**
   * Add and schedule a single job.
   * Replaces any existing job with the same name (used by hot reload on change).
   */
  add(def: CronDefinition): void {
    this.remove(def.name);

    const jobId = `${this.scope}/${def.name}`;

    if (def.enabled !== true) {
      this.logger.debug({ jobId }, "Cron not enabled — not scheduled");
      this.jobs.set(def.name, { definition: def, cronInstance: null });
      return;
    }

    if (def.runAt) {
      if (def.runAt <= new Date()) {
        this.logger.debug(
          { jobId, runAt: def.runAt.toISOString() },
          "Cron runAt is in the past — skipping",
        );
        this.jobs.set(def.name, { definition: def, cronInstance: null });
        return;
      }
    }

    const pattern: string | Date = def.runAt ?? def.schedule!;

    const cronInstance = new Cron(pattern, { protect: true }, async () => {
      this.logger.info({ jobId }, "Cron firing");
      await this.execute(def, jobId);
      // For Date-based one-offs, croner fires once and stops automatically.
    });

    this.jobs.set(def.name, { definition: def, cronInstance });
    this.logger.info(
      { jobId, pattern: def.runAt?.toISOString() ?? def.schedule },
      "Cron scheduled",
    );
  }

  /** Remove and stop a job by name. No-op if not found. */
  remove(name: string): void {
    const entry = this.jobs.get(name);
    if (entry?.cronInstance) {
      entry.cronInstance.stop();
    }
    this.jobs.delete(name);
    this.logger.debug({ jobId: `${this.scope}/${name}` }, "Cron removed");
  }

  /** Replace a job with a new definition (used by file watcher on change). */
  replace(def: CronDefinition): void {
    this.add(def);
  }

  /** Stop all scheduled timers and clear the jobs map. */
  stop(): void {
    for (const [name, entry] of this.jobs) {
      if (entry.cronInstance) {
        entry.cronInstance.stop();
        this.logger.debug({ jobId: `${this.scope}/${name}` }, "Cron stopped");
      }
    }
    this.jobs.clear();
  }

  private async execute(def: CronDefinition, jobId: string): Promise<void> {
    try {
      if (def.type === "md") {
        await executeMdCron(
          def,
          this.internalProjectCtxs,
          this.cronCtx,
          this.logBaseDir,
          this.logger,
          this.scope,
        );
      } else {
        await executeMjsCron(
          def,
          this.cronCtx,
          this.logBaseDir,
          this.logger,
          this.scope,
        );
      }
    } catch (err) {
      this.logger.error(
        {
          jobId,
          error: err instanceof Error ? err.message : String(err),
        },
        "Unhandled error in cron execution",
      );
    }
  }
}
