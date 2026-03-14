import { execSync } from "node:child_process";
import { join } from "node:path";
import type { ProjectContext } from "../../types.js";
import { findLatestCodexSessionUuidForCwd } from "../codex-sessions.js";
import { buildContextualPrompt } from "../prompt.js";
import { spawnEngineProcess } from "../spawn.js";
import type {
  EngineAdapter,
  EngineExecuteOptions,
  EngineResult,
  ParsedResponse,
} from "../types.js";

const PLACEHOLDER_SESSION_ID = "active";

const DEFAULT_COMMAND = "codex";

// eslint-disable-next-line no-control-regex
const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** Strip ANSI escape codes and truncate to maxLen chars. */
function cleanLine(line: string, maxLen = 80): string {
  return line.replace(ANSI_RE, "").trim().slice(0, maxLen);
}

/** Truncate a string to maxLen chars, appending "…" if truncated. */
function trunc(s: string, maxLen: number): string {
  if (!s) return "";
  return s.length <= maxLen ? s : `${s.slice(0, maxLen - 1)}…`;
}

/**
 * Adapter for OpenAI Codex CLI.
 * Fresh:    `codex exec -C <cwd> [-m model] [PROMPT]`
 * Continue: `codex exec resume --last [-m model] [PROMPT]`
 * Uses `--json` mode for JSONL progress streaming via `onProgress`.
 */
export function createCodexAdapter(
  command?: string,
  model?: string,
): EngineAdapter {
  const cmd = command || DEFAULT_COMMAND;

  return {
    name: "Codex",
    command: cmd,
    sessionCapabilities: {
      supportsUserIsolation: true,
      defaultMode: "shared",
      sharedContinuationRequiresMarker: true,
    },

    check() {
      try {
        execSync(`${cmd} --version`, { stdio: "pipe" });
      } catch {
        throw new Error(
          `Codex CLI command "${cmd}" not found or not executable. ` +
            `Please ensure OpenAI Codex CLI is installed and the command is in your PATH.`,
        );
      }
    },

    async execute(
      options: EngineExecuteOptions,
      ctx: ProjectContext,
    ): Promise<EngineResult> {
      const { continueSession, sessionId, onProgress } = options;
      const { config, logger } = ctx;
      const fullPrompt = await buildContextualPrompt(options, ctx);
      const cwd = config.cwd;

      const hasActiveSession = sessionId != null;
      const sessionEnabled = config.engineSession !== false;
      const useResumeByUuid =
        sessionEnabled &&
        config.engineSession === "user" &&
        typeof sessionId === "string" &&
        sessionId !== PLACEHOLDER_SESSION_ID;
      const useResumeLast =
        sessionEnabled &&
        hasActiveSession &&
        continueSession !== false &&
        !useResumeByUuid;

      // Non-interactive: `codex exec` for fresh; `codex exec resume --last` or `resume <UUID>` for continue.
      // Permission flags must come right after "exec" (before "resume"/"-C") or Codex rejects them.
      const args: string[] = ["exec"];

      const codex = config.codex;
      let tier: string;
      if (codex.dangerouslyEnableYolo) {
        args.push(
          "--dangerously-bypass-approvals-and-sandbox",
          "--skip-git-repo-check",
        );
        tier = "yolo";
        logger.warn(
          "Codex running with --yolo: all sandboxing and approvals disabled",
        );
      } else if (codex.fullDiskAccess) {
        args.push("--sandbox", "danger-full-access", "--skip-git-repo-check");
        tier = "full-disk-access";
      } else if (codex.networkAccess) {
        args.push(
          "--full-auto",
          "-c",
          "sandbox_workspace_write.network_access=true",
          "--skip-git-repo-check",
        );
        tier = "network-access";
      } else {
        args.push("--full-auto", "--skip-git-repo-check");
        tier = "default";
      }

      if (model) {
        args.push("-m", model);
      }

      // Enable JSONL streaming mode and suppress ANSI on stderr.
      args.push("--json", "--color", "never");

      if (useResumeByUuid && sessionId) {
        args.push("resume", sessionId);
      } else if (useResumeLast) {
        args.push("resume", "--last");
      } else {
        args.push("-C", cwd);
      }
      args.push(fullPrompt);

      logger.info(
        {
          command: cmd,
          args: args.slice(0, -1),
          cwd,
          resume: useResumeByUuid ? "uuid" : useResumeLast ? "last" : "none",
          tier,
        },
        "Executing Codex CLI",
      );

      return new Promise((resolve) => {
        const proc = spawnEngineProcess(
          cmd,
          args,
          { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
          config.engineEnvFile,
        );

        let stdout = "";
        let stderrOutput = "";
        let lineBuffer = "";

        // --- Progress throttle state ---
        const THROTTLE_MS = 3000;
        let lastProgressTime = 0;
        let lastProgressMsg = "";

        function maybeProgress(msg: string): void {
          if (!onProgress) return;
          if (msg === lastProgressMsg) return;
          const now = Date.now();
          if (now - lastProgressTime < THROTTLE_MS) return;
          lastProgressTime = now;
          lastProgressMsg = msg;
          onProgress(msg);
        }

        // --- Elapsed-time fallback ---
        const startTime = Date.now();
        if (onProgress) {
          onProgress("Codex is working...");
        }
        const elapsedTimer = setInterval(() => {
          if (!onProgress) return;
          // Only fire elapsed-time if JSONL hasn't updated in the last tick
          if (
            lastProgressTime > 0 &&
            Date.now() - lastProgressTime < THROTTLE_MS * 2
          )
            return;
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          const msg = `Codex is working on it... ${elapsed}s`;
          if (msg !== lastProgressMsg) {
            lastProgressMsg = msg;
            onProgress(msg);
          }
        }, THROTTLE_MS);

        // --- JSONL progress message builder ---
        function progressFromEvent(
          event: Record<string, unknown>,
        ): string | null {
          const type = event.type as string | undefined;
          if (!type) return null;

          if (type === "turn.started") return "Codex is reasoning...";

          if (type === "item.started" || type === "item.completed") {
            const item = event.item as Record<string, unknown> | undefined;
            if (!item) return null;
            const itemType = item.type as string | undefined;

            switch (itemType) {
              case "command_execution": {
                const cmd = item.command as string | undefined;
                return `Running: ${trunc(cmd ?? "", 60)}`;
              }
              case "file_change":
                return "Updating files...";
              case "reasoning":
                return "Thinking...";
              case "mcp_tool_call": {
                const toolName = item.tool_name as string | undefined;
                return `Tool: ${trunc(toolName ?? "", 50)}`;
              }
              case "web_search": {
                const query = item.query as string | undefined;
                return `Searching: ${trunc(query ?? "", 50)}`;
              }
              case "agent_message":
                if (type === "item.completed") return "Responding...";
                return null;
              default:
                return null;
            }
          }

          return null;
        }

        // --- JSONL stdout parsing ---
        proc.stdout.on("data", (data: Buffer) => {
          const chunk = data.toString();
          stdout += chunk;
          lineBuffer += chunk;

          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed) as Record<string, unknown>;
              const msg = progressFromEvent(event);
              if (msg) maybeProgress(msg);
            } catch {
              // Non-JSON line — ignore
            }
          }
        });

        // --- Stderr: semantic label prefixes as supplementary fallback ---
        const STDERR_PREFIXES = [
          "exec",
          "file update",
          "thinking",
          "tool",
          "hook",
          "mcp",
          "→",
          "✓",
          "🌐",
        ];

        proc.stderr.on("data", (data: Buffer) => {
          const chunk = data.toString().trim();
          if (chunk) {
            stderrOutput += `${chunk}\n`;
            logger.debug({ stderr: chunk }, "Codex stderr");

            for (const rawLine of chunk.split("\n")) {
              const line = cleanLine(rawLine);
              if (!line) continue;
              const lower = line.toLowerCase();
              const matched = STDERR_PREFIXES.some(
                (prefix) => lower.startsWith(prefix) || line.startsWith(prefix),
              );
              if (matched) maybeProgress(line);
            }
          }
        });

        proc.on("close", (code) => {
          clearInterval(elapsedTimer);
          logger.debug({ code }, "Codex process closed");

          if (code === 0) {
            let resultSessionId: string | undefined;
            if (config.engineSession !== false) {
              if (config.engineSession === "user") {
                const discovered = findLatestCodexSessionUuidForCwd(cwd);
                resultSessionId = discovered ?? undefined;
              } else {
                resultSessionId = "active";
              }
            }

            // Extract final agent_message text from JSONL output.
            let output = "";
            for (const line of stdout.split("\n")) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const event = JSON.parse(trimmed) as Record<string, unknown>;
                if (
                  event.type === "item.completed" &&
                  event.item &&
                  (event.item as Record<string, unknown>).type ===
                    "agent_message"
                ) {
                  const text = (event.item as Record<string, unknown>).text;
                  if (typeof text === "string") output = text;
                }
              } catch {
                // ignore
              }
            }

            resolve({
              success: true,
              output: output || stdout.trim() || "No response received",
              sessionId: resultSessionId,
            });
          } else {
            resolve({
              success: false,
              output: "",
              error: stderrOutput.trim() || `Codex exited with code ${code}`,
            });
          }
        });

        proc.on("error", (err) => {
          clearInterval(elapsedTimer);
          logger.error({ error: err.message }, "Codex process error");
          resolve({
            success: false,
            output: "",
            error: `Failed to start ${cmd}: ${err.message}`,
          });
        });
      });
    },

    parse(result: EngineResult): ParsedResponse {
      if (!result.success) {
        return { text: result.error || "An unknown error occurred" };
      }
      return { text: result.output || "No response received" };
    },

    skillsDirs(projectCwd: string): string[] {
      return [join(projectCwd, ".agents", "skills")];
    },

    instructionsFile(): string {
      return "AGENTS.md";
    },
  };
}
