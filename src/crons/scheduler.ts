import { Cron } from "croner";
import type pino from "pino";
import {
  parseDuration,
  parseRelativeSchedule,
  resolveScheduleEnds,
} from "./schedule.js";
import type { AnyDefinition, CronRunState } from "./types.js";

// ─── Timer handle types ────────────────────────────────────────────────────────

interface CronTimerHandle {
  kind: "cron";
  instance: Cron;
}

interface RelativeTimerHandle {
  kind: "relative";
  cleanup: () => void;
}

interface StartDelayHandle {
  kind: "start-delay";
  cleanup: () => void;
}

type TimerHandle = CronTimerHandle | RelativeTimerHandle | StartDelayHandle;

// ─── Internal job entry ────────────────────────────────────────────────────────

interface JobEntry {
  definition: AnyDefinition;
  /** null when the job was skipped (disabled or past runAt) */
  handle: TimerHandle | null;
  /** Mutable run state — incremented before each execution, lastRun set after. */
  state: CronRunState;
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
    /** Called when a job fires. Receives a snapshot of the run state at fire time. */
    private readonly executeJob: (
      def: AnyDefinition,
      state: CronRunState,
    ) => Promise<void>,
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

    // Preserve run state when replacing an existing job (hot reload)
    const existingState = this.jobs.get(def.name)?.state ?? { runs: 0 };
    const entry: JobEntry = {
      definition: def,
      handle: null,
      state: existingState,
    };
    this.jobs.set(def.name, entry);

    if (def.enabled !== true) {
      this.logger.debug({ jobId }, "Cron not enabled — not scheduled");
      return;
    }

    if (this.isRunAtInPast(def, jobId)) return;
    if (this.isScheduleEnded(def, jobId)) return;

    const scheduleStarts = def.scheduleStarts;
    if (scheduleStarts && scheduleStarts > new Date()) {
      const delayMs = scheduleStarts.getTime() - Date.now();
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let stopped = false;

      timeoutId = setTimeout(() => {
        if (stopped) return;
        const current = this.jobs.get(def.name);
        if (!current) return;
        // Re-resolve scheduleEnds from the raw relative string so that
        // "scheduleEnds: 10s" means "run for 10s from now" (start-delay fire time),
        // not "10s from load time".
        const firedDef =
          def.scheduleEndsRaw && parseDuration(def.scheduleEndsRaw) !== null
            ? { ...def, scheduleEnds: resolveScheduleEnds(def.scheduleEndsRaw) }
            : def;
        current.handle = this.scheduleNow(firedDef, jobId);
      }, delayMs);

      entry.handle = {
        kind: "start-delay",
        cleanup: () => {
          stopped = true;
          if (timeoutId !== null) clearTimeout(timeoutId);
        },
      };

      this.logger.info(
        { jobId, scheduleStarts: scheduleStarts.toISOString() },
        "Cron start delayed",
      );
      return;
    }

    entry.handle = this.scheduleNow(def, jobId);
  }

  private scheduleNow(def: AnyDefinition, jobId: string): TimerHandle | null {
    if (this.isRunAtInPast(def, jobId)) return null;
    // scheduleEnds is NOT re-checked here: it was already verified in add() before
    // any scheduleStarts delay, and each timer path (croner stopAt / scheduleNext)
    // enforces it at fire time with the live clock.

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

      this.logger.info(
        {
          jobId,
          pattern: def.schedule,
          mode: rel.mode,
          delayMs: rel.ms,
          scheduleStarts: def.scheduleStarts?.toISOString(),
          scheduleEnds: def.scheduleEnds?.toISOString(),
        },
        "Cron scheduled",
      );
      return handle;
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

    this.logger.info(
      {
        jobId,
        pattern: def.runAt?.toISOString() ?? def.schedule,
        scheduleStarts: def.scheduleStarts?.toISOString(),
        scheduleEnds: def.scheduleEnds?.toISOString(),
      },
      "Cron scheduled",
    );
    return { kind: "cron", instance: cronInstance };
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
    } else if (handle.kind === "start-delay") {
      handle.cleanup();
    } else {
      handle.cleanup();
    }
  }

  private isRunAtInPast(def: AnyDefinition, jobId: string): boolean {
    if (!def.runAt) return false;
    if (def.runAt > new Date()) return false;
    this.logger.debug(
      { jobId, runAt: def.runAt.toISOString() },
      "Cron runAt is in the past — skipping",
    );
    return true;
  }

  private isScheduleEnded(def: AnyDefinition, jobId: string): boolean {
    if (!def.scheduleEnds) return false;
    if (def.scheduleEnds > new Date()) return false;
    this.logger.debug(
      { jobId, scheduleEnds: def.scheduleEnds.toISOString() },
      "Cron scheduleEnds is in the past — skipping",
    );
    return true;
  }

  private async execute(def: AnyDefinition, jobId: string): Promise<void> {
    const entry = this.jobs.get(def.name);
    const startedAt = new Date();

    // Increment before execution so cron.runs == 1 on the first run
    if (entry) entry.state.runs++;
    const state: CronRunState = {
      runs: entry?.state.runs ?? 1,
      lastRun: entry?.state.lastRun,
    };

    try {
      await this.executeJob(def, state);
    } catch (err) {
      this.logger.error(
        {
          jobId,
          error: err instanceof Error ? err.message : String(err),
        },
        "Unhandled error in cron execution",
      );
    }

    // Record when this execution started so next run sees it as lastRun
    if (entry) entry.state.lastRun = startedAt;
  }
}
