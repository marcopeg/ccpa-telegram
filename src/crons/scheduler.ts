import { Cron } from "croner";
import type pino from "pino";
import { parseRelativeSchedule } from "./schedule.js";
import type { AnyDefinition } from "./types.js";

// ─── Timer handle types ────────────────────────────────────────────────────────

interface CronTimerHandle {
  kind: "cron";
  instance: Cron;
}

interface RelativeTimerHandle {
  kind: "relative";
  cleanup: () => void;
}

type TimerHandle = CronTimerHandle | RelativeTimerHandle;

// ─── Internal job entry ────────────────────────────────────────────────────────

interface JobEntry {
  definition: AnyDefinition;
  /** null when the job was skipped (disabled or past runAt) */
  handle: TimerHandle | null;
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Generic cron scheduler.
 *
 * Supports four schedule formats:
 *   - Standard cron expressions  ("0 9 * * *") via croner
 *   - Absolute one-offs          (runAt Date)  via croner
 *   - Relative recurring         ("5s"/"+3s")  via chained setTimeout (next countdown starts after execution completes)
 *   - Relative single-shot       ("!3s")       via setTimeout
 *
 * Accepts an `executeJob` callback that captures all tier-specific state in its
 * closure. This keeps the scheduler a pure timer manager, reusable for both
 * system-tier and project-tier crons without carrying context-specific fields.
 *
 * Usage:
 *   const scheduler = new CronScheduler(
 *     async (def) => { ... execute def ... },
 *     logger,
 *     "system",   // or project slug for project-tier
 *   );
 */
export class CronScheduler {
  private readonly jobs = new Map<string, JobEntry>();

  constructor(
    /** Called when a job fires. Closure captures all tier-specific execution state. */
    private readonly executeJob: (def: AnyDefinition) => Promise<void>,
    private readonly logger: pino.Logger,
    /** Prefix added to jobName in all log entries, e.g. "system" or a project slug. */
    private readonly scope: string,
  ) {}

  /** Load an array of definitions and schedule all eligible jobs. */
  load(definitions: AnyDefinition[]): void {
    for (const def of definitions) {
      this.add(def);
    }
  }

  /**
   * Add and schedule a single job.
   * Replaces any existing job with the same name (used by hot reload on change).
   */
  add(def: AnyDefinition): void {
    this.remove(def.name);

    const jobId = `${this.scope}/${def.name}`;

    if (def.enabled !== true) {
      this.logger.debug({ jobId }, "Cron not enabled — not scheduled");
      this.jobs.set(def.name, { definition: def, handle: null });
      return;
    }

    if (def.runAt) {
      if (def.runAt <= new Date()) {
        this.logger.debug(
          { jobId, runAt: def.runAt.toISOString() },
          "Cron runAt is in the past — skipping",
        );
        this.jobs.set(def.name, { definition: def, handle: null });
        return;
      }
    }

    if (def.scheduleEnds && def.scheduleEnds <= new Date()) {
      this.logger.debug(
        { jobId, scheduleEnds: def.scheduleEnds.toISOString() },
        "Cron scheduleEnds is in the past — skipping",
      );
      this.jobs.set(def.name, { definition: def, handle: null });
      return;
    }

    // ── Relative schedule: +Xs (interval) or !Xs (once) ───────────────────────
    const rel = def.schedule ? parseRelativeSchedule(def.schedule) : null;

    if (rel) {
      // Chain setTimeout calls so each countdown starts only AFTER the previous
      // execution fully completes: boot → +Xs → run → await → +Xs → run → …
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let stopped = false;

      const scheduleNext = (): void => {
        if (stopped) return;
        if (def.scheduleEnds && def.scheduleEnds <= new Date()) {
          this.logger.info(
            { jobId, scheduleEnds: def.scheduleEnds.toISOString() },
            "Cron schedule ended",
          );
          return;
        }
        timeoutId = setTimeout(async () => {
          timeoutId = null;
          this.logger.info({ jobId }, "Cron firing");
          await this.execute(def, jobId);
          if (rel.mode === "interval") {
            scheduleNext();
          }
        }, rel.ms);
      };

      scheduleNext();

      const handle: RelativeTimerHandle = {
        kind: "relative",
        cleanup: () => {
          stopped = true;
          if (timeoutId !== null) clearTimeout(timeoutId);
        },
      };

      this.jobs.set(def.name, { definition: def, handle });
      this.logger.info(
        {
          jobId,
          pattern: def.schedule,
          mode: rel.mode,
          delayMs: rel.ms,
          scheduleEnds: def.scheduleEnds?.toISOString(),
        },
        "Cron scheduled",
      );
      return;
    }

    // ── Standard croner path: cron expression or runAt Date ───────────────────
    const pattern: string | Date = def.runAt ?? def.schedule!;

    const cronInstance = new Cron(
      pattern,
      { protect: true, stopAt: def.scheduleEnds },
      async () => {
        this.logger.info({ jobId }, "Cron firing");
        await this.execute(def, jobId);
        // For Date-based one-offs, croner fires once and stops automatically.
      },
    );

    this.jobs.set(def.name, {
      definition: def,
      handle: { kind: "cron", instance: cronInstance },
    });
    this.logger.info(
      {
        jobId,
        pattern: def.runAt?.toISOString() ?? def.schedule,
        scheduleEnds: def.scheduleEnds?.toISOString(),
      },
      "Cron scheduled",
    );
  }

  /** Remove and stop a job by name. No-op if not found. */
  remove(name: string): void {
    const entry = this.jobs.get(name);
    if (entry?.handle) {
      this.stopHandle(entry.handle);
    }
    this.jobs.delete(name);
    this.logger.debug({ jobId: `${this.scope}/${name}` }, "Cron removed");
  }

  /** Replace a job with a new definition (used by file watcher on change). */
  replace(def: AnyDefinition): void {
    this.add(def);
  }

  /** Stop all scheduled timers and clear the jobs map. */
  stop(): void {
    for (const [name, entry] of this.jobs) {
      if (entry.handle) {
        this.stopHandle(entry.handle);
        this.logger.debug({ jobId: `${this.scope}/${name}` }, "Cron stopped");
      }
    }
    this.jobs.clear();
  }

  private stopHandle(handle: TimerHandle): void {
    if (handle.kind === "cron") {
      handle.instance.stop();
    } else {
      handle.cleanup();
    }
  }

  private async execute(def: AnyDefinition, jobId: string): Promise<void> {
    try {
      await this.executeJob(def);
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
