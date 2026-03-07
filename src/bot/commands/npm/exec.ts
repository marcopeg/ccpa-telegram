import { spawn } from "node:child_process";

export interface NpmResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

/**
 * How long to wait after 'exit' fires for remaining pipe data to flush
 * before force-closing streams. Covers scripts that spawn background
 * children which inherit (but don't write to) the parent's stdio pipes.
 */
const DRAIN_GRACE_MS = 500;

/**
 * Run `npm run <script>` in the given cwd with a hard timeout.
 *
 * On timeout the process is terminated with a graceful escalation:
 * SIGINT → 3 s → SIGTERM → 2 s → SIGKILL.
 */
export function npmExec(
  cwd: string,
  script: string,
  timeoutMs: number,
): Promise<NpmResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    let timedOut = false;
    let stdoutBuf = "";
    let stderrBuf = "";
    let resolved = false;

    const child = spawn("npm", ["run", script], {
      cwd,
      stdio: "pipe",
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let drainTimer: ReturnType<typeof setTimeout> | undefined;

    const done = (code: number | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      if (drainTimer) clearTimeout(drainTimer);

      child.stdout?.removeAllListeners();
      child.stderr?.removeAllListeners();
      child.stdout?.destroy();
      child.stderr?.destroy();

      resolve({
        stdout: stdoutBuf,
        stderr: stderrBuf,
        exitCode: code,
        timedOut,
        durationMs: Date.now() - start,
      });
    };

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGINT");

      killTimer = setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGTERM");
          killTimer = setTimeout(() => {
            if (!child.killed) {
              child.kill("SIGKILL");
            }
          }, 2_000);
        }
      }, 3_000);
    }, timeoutMs);

    // Scripts that spawn background processes may exit while those children
    // keep the stdio pipes open, preventing 'close' from firing.
    // After 'exit', allow a brief drain window for final output, then resolve.
    child.on("exit", (code) => {
      drainTimer = setTimeout(() => done(code), DRAIN_GRACE_MS);
    });

    child.on("close", (code) => {
      done(code);
    });

    child.on("error", (err) => {
      if (resolved) return;
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      if (drainTimer) clearTimeout(drainTimer);
      resolved = true;

      resolve({
        stdout: stdoutBuf,
        stderr: `${stderrBuf}\n${err.message}`,
        exitCode: null,
        timedOut: false,
        durationMs: Date.now() - start,
      });
    });
  });
}
