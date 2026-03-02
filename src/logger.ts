import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import pino from "pino";
import type { ResolvedProjectConfig } from "./config.js";

const LEVEL_NAMES: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
};

/**
 * Human-readable stream for terminal logs: parses pino NDJSON and writes
 * "[HH:mm:ss] LEVEL  message" so boot and runtime output is readable.
 */
function createPrettyLogStream(
  out: NodeJS.WritableStream = process.stdout,
): Writable {
  let buffer = "";
  return new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as {
            level?: number;
            time?: number;
            msg?: string;
            [k: string]: unknown;
          };
          const time = obj.time != null ? new Date(obj.time) : new Date();
          const ts = time.toTimeString().slice(0, 8);
          const levelName = LEVEL_NAMES[obj.level ?? 30] ?? "INFO";
          const msg = obj.msg ?? "";
          const rest: string[] = [];
          for (const [k, v] of Object.entries(obj)) {
            if (
              k === "level" ||
              k === "time" ||
              k === "msg" ||
              k === "pid" ||
              k === "hostname"
            )
              continue;
            if (v !== undefined && v !== null)
              rest.push(`${k}=${JSON.stringify(v)}`);
          }
          const suffix = rest.length > 0 ? ` ${rest.join(" ")}` : "";
          out.write(`${ts} ${levelName}  ${msg}${suffix}\n`);
        } catch {
          out.write(line + "\n");
        }
      }
      cb();
    },
  });
}

/**
 * A startup logger for CLI-level messages. Writes human-readable lines to stdout
 * at info level and flushes synchronously so boot order is stable.
 * Used before per-project loggers are created, and for process-level notices.
 */
export function createStartupLogger(): pino.Logger {
  return pino({ level: "info" }, createPrettyLogStream());
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
    streams.push({ stream: createPrettyLogStream() });
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
