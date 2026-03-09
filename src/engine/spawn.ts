import type { ChildProcessByStdio, SpawnOptions } from "node:child_process";
import { spawn } from "node:child_process";
import type { Readable } from "node:stream";

/**
 * Wraps a string in single quotes and escapes embedded single quotes.
 * Safe for use inside `sh -c '...'` shell commands.
 */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Spawn an engine CLI child process, optionally sourcing an env file first.
 *
 * Always uses `stdio: ['ignore', 'pipe', 'pipe']` (stdin ignored, stdout/stderr piped).
 * Returns `ChildProcessByStdio<null, Readable, Readable>` so callers can access
 * `.stdout` and `.stderr` without null checks.
 *
 * - No envFilePath: behaves exactly like `spawn(cmd, args, options)`.
 * - With envFilePath: runs `sh -c "set -a; . '<envFile>'; set +a; exec '<cmd>' <args>"`.
 *   Variables from the sourced file are exported into the command's environment.
 *   Adapter-provided `options.env` overrides are passed to the shell process and
 *   remain in effect alongside the sourced file's exports.
 */
export function spawnEngineProcess(
  cmd: string,
  args: string[],
  options: SpawnOptions & { stdio: ["ignore", "pipe", "pipe"] },
  envFilePath?: string,
): ChildProcessByStdio<null, Readable, Readable> {
  if (!envFilePath) {
    return spawn(cmd, args, options);
  }

  const quotedParts = [cmd, ...args].map(shellQuote).join(" ");
  const shellCmd = `set -a; . ${shellQuote(envFilePath)}; set +a; exec ${quotedParts}`;
  return spawn("sh", ["-c", shellCmd], options);
}
