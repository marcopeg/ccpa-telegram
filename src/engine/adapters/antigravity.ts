import { execSync, spawn } from "node:child_process";
import { join } from "node:path";
import type { ProjectContext } from "../../types.js";
import { buildContextualPrompt } from "../prompt.js";
import type {
  EngineAdapter,
  EngineExecuteOptions,
  EngineResult,
  ParsedResponse,
} from "../types.js";

const DEFAULT_COMMAND = "gemini";

/**
 * Gemini CLI JSONL event types (--output-format stream-json):
 * - init: session metadata (session ID, model)
 * - message: user/assistant message chunks
 * - tool_use: tool call requests
 * - tool_result: tool execution output
 * - thought: model reasoning traces
 * - error: non-fatal warnings
 * - result: final outcome with aggregated stats
 */

export function createAntigravityAdapter(
  command?: string,
  model?: string,
): EngineAdapter {
  const cmd = command || DEFAULT_COMMAND;

  return {
    name: "Antigravity (Gemini CLI)",
    command: cmd,

    check() {
      try {
        execSync(`${cmd} --version`, { stdio: "pipe" });
      } catch {
        throw new Error(
          `Gemini CLI command "${cmd}" not found or not executable. ` +
            `Please ensure Gemini CLI is installed and the command is in your PATH.`,
        );
      }
    },

    async execute(
      options: EngineExecuteOptions,
      ctx: ProjectContext,
    ): Promise<EngineResult> {
      const { sessionId, onProgress, continueSession } = options;
      const { config, logger } = ctx;

      const fullPrompt = await buildContextualPrompt(options, ctx);

      const args: string[] = [
        "-p",
        fullPrompt,
        "--output-format",
        "stream-json",
        "--approval-mode",
        config.antigravity.approvalMode,
      ];

      if (model) {
        args.push("--model", model);
      }

      if (sessionId && config.engineSession && continueSession !== false) {
        args.push("--resume", sessionId);
      }

      if (config.antigravity.sandbox) {
        args.push("--sandbox");
      }

      const cwd = config.cwd;
      logger.info({ command: cmd, args, cwd }, "Executing Gemini CLI");

      return new Promise((resolve) => {
        const proc = spawn(cmd, args, {
          cwd,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stderrOutput = "";
        let lastResult: EngineResult | null = null;
        let currentSessionId: string | undefined;
        let lastAssistantText = "";

        proc.stdout.on("data", (data: Buffer) => {
          const chunk = data.toString();
          const lines = chunk.split("\n").filter((line) => line.trim());

          for (const line of lines) {
            try {
              const event = JSON.parse(line);

              // Extract session ID from init event
              if (event.type === "init") {
                currentSessionId =
                  event.sessionId ?? event.session_id ?? event.id;
              }

              // Progress from tool_use events
              if (event.type === "tool_use") {
                const toolName = event.name || event.tool || "unknown";
                let progressMsg = `Using ${toolName}...`;

                if (
                  toolName === "read_file" &&
                  (event.args?.path || event.arguments?.path)
                ) {
                  progressMsg = `Reading: ${event.args?.path || event.arguments?.path}`;
                } else if (
                  toolName === "search_files" &&
                  (event.args?.pattern || event.arguments?.pattern)
                ) {
                  progressMsg = `Searching for: ${event.args?.pattern || event.arguments?.pattern}`;
                } else if (
                  toolName === "run_command" &&
                  (event.args?.command || event.arguments?.command)
                ) {
                  const runCmd: string =
                    event.args?.command ?? event.arguments?.command ?? "";
                  const cmdStr = runCmd.slice(0, 50);
                  progressMsg = `Running: ${cmdStr}${runCmd.length > 50 ? "..." : ""}`;
                } else if (
                  toolName === "edit_file" &&
                  (event.args?.path || event.arguments?.path)
                ) {
                  progressMsg = `Editing: ${event.args?.path || event.arguments?.path}`;
                } else if (
                  toolName === "write_file" &&
                  (event.args?.path || event.arguments?.path)
                ) {
                  progressMsg = `Writing: ${event.args?.path || event.arguments?.path}`;
                }

                logger.info({ tool: toolName }, progressMsg);
                if (onProgress) {
                  onProgress(progressMsg);
                }
              }

              // Accumulate assistant text from message events
              if (event.type === "message") {
                if (event.role === "assistant" || event.role === "model") {
                  const text = event.text ?? event.content ?? event.response;
                  if (typeof text === "string") {
                    lastAssistantText = text;
                  }
                }
              }

              // Log thought events at debug level
              if (event.type === "thought") {
                logger.debug({ thought: event.text }, "Gemini thought");
              }

              // Log error events at warn level
              if (event.type === "error") {
                logger.warn(
                  { error: event.message || event.text },
                  "Gemini error event",
                );
              }

              // Capture tool_result for logging
              if (event.type === "tool_result") {
                const result =
                  typeof event.output === "string"
                    ? event.output.slice(0, 500)
                    : JSON.stringify(event.output ?? event.result ?? "").slice(
                        0,
                        500,
                      );
                logger.info(
                  { toolName: event.name, isError: event.is_error },
                  `Tool result: ${result}${result.length >= 500 ? "..." : ""}`,
                );
              }

              // Capture the final result event
              // Gemini's result event contains stats but the response text
              // comes from preceding message events (accumulated in lastAssistantText).
              // We pack both into output as JSON so parse() can extract text + stats.
              if (event.type === "result") {
                logger.debug({ event }, "Gemini result event");
                lastResult = {
                  success: event.status === "success" && !event.error,
                  output: JSON.stringify({
                    text: lastAssistantText,
                    stats: event.stats,
                  }),
                  sessionId: currentSessionId,
                  error: event.error?.message,
                };
              }
            } catch {
              // Not valid JSON, ignore
            }
          }
        });

        proc.stderr.on("data", (data: Buffer) => {
          const chunk = data.toString().trim();
          if (chunk) {
            stderrOutput += `${chunk}\n`;
            logger.debug({ stderr: chunk }, "Gemini stderr");
          }
        });

        proc.on("close", (code) => {
          logger.debug({ code }, "Gemini process closed");

          if (lastResult) {
            if (!lastResult.success) {
              logger.error(
                {
                  error: lastResult.error,
                  output: lastResult.output?.slice(0, 1000),
                  stderr: stderrOutput,
                },
                "Gemini returned error",
              );
            }
            resolve(lastResult);
          } else if (code === 0) {
            resolve({
              success: true,
              output: lastAssistantText || "No response received",
              sessionId: currentSessionId,
            });
          } else {
            const errorMsg =
              stderrOutput.trim() || `Gemini exited with code ${code}`;
            logger.error(
              { code, stderr: stderrOutput, lastText: lastAssistantText },
              "Gemini process failed",
            );
            resolve({
              success: false,
              output: lastAssistantText,
              error: errorMsg,
            });
          }
        });

        proc.on("error", (err) => {
          logger.error({ error: err.message }, "Gemini process error");
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

      try {
        const parsed = JSON.parse(result.output);

        // Response text was accumulated from message events and packed
        // into { text, stats } by execute(). Stats come from the result event.
        const text = parsed.text || "";

        // Extract token stats — Gemini CLI uses flat fields on stats:
        // { total_tokens, input_tokens, output_tokens, cached, input, duration_ms }
        const inputTokens: number | undefined =
          parsed.stats?.input_tokens ?? parsed.stats?.input;
        const outputTokens: number | undefined =
          parsed.stats?.output_tokens ?? parsed.stats?.output;

        return {
          text: text || "No response received",
          sessionId: result.sessionId,
          inputTokens,
          outputTokens,
        };
      } catch {
        return {
          text: result.output || "No response received",
        };
      }
    },

    skillsDirs(projectCwd: string): string[] {
      return [join(projectCwd, ".agent", "skills")];
    },

    instructionsFile(): string {
      return "GEMINI.md";
    },
  };
}
