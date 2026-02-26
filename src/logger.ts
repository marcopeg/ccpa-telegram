import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import pino from "pino";
import type { ResolvedProjectConfig } from "./config.js";

/**
 * A startup logger for CLI-level messages. Always writes to stdout at info level.
 * Used before per-project loggers are created, and for process-level notices.
 */
export function createStartupLogger(): pino.Logger {
  return pino({ level: "info" });
}

/**
 * Create a per-project logger that respects flow and persist settings.
 *
 * - flow: false → no terminal output
 * - persist: true → append to <logDir>/YYYY-MM-DD.txt
 *
 * If both are false/disabled, a no-op stream is used to keep the logger valid.
 */
export function createProjectLogger(
  config: ResolvedProjectConfig,
): pino.Logger {
  const { level, flow, persist } = config.logging;

  const streams: pino.StreamEntry[] = [];

  if (flow) {
    streams.push({ stream: process.stdout });
  }

  if (persist) {
    mkdirSync(config.logDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const logFile = join(config.logDir, `${date}.txt`);
    streams.push({ stream: createWriteStream(logFile, { flags: "a" }) });
  }

  if (streams.length === 0) {
    // Both flow and persist are off — use a no-op sink so the logger is valid
    streams.push({
      stream: new Writable({
        write(_chunk, _enc, cb) {
          cb();
        },
      }),
    });
  }

  return pino({ level }, pino.multistream(streams));
}
