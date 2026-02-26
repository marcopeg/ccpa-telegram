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

const DEFAULT_COMMAND = "claude";

export function createClaudeAdapter(
  command?: string,
  model?: string,
): EngineAdapter {
  const cmd = command || DEFAULT_COMMAND;

  return {
    name: "Claude Code",
    command: cmd,

    check() {
      try {
        execSync(`${cmd} --version`, { stdio: "pipe" });
      } catch {
        throw new Error(
          `Claude CLI command "${cmd}" not found or not executable. ` +
            `Please ensure Claude Code is installed and the command is in your PATH.`,
        );
      }
    },

    async execute(
      options: EngineExecuteOptions,
      ctx: ProjectContext,
    ): Promise<EngineResult> {
      const { sessionId, onProgress } = options;
      const { config, logger } = ctx;

      const fullPrompt = await buildContextualPrompt(options, ctx);

      const args: string[] = [
        "-p",
        fullPrompt,
        "--output-format",
        "stream-json",
        "--verbose",
      ];

      // Set model if specified
      if (model) {
        args.push("--model", model);
      }

      // Resume previous session if we have a session ID
      if (sessionId) {
        args.push("--resume", sessionId);
      }

      const cwd = config.cwd;
      logger.info({ command: cmd, args, cwd }, "Executing Claude CLI");

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

              // Extract session ID from init message
              if (
                event.type === "system" &&
                event.subtype === "init" &&
                event.session_id
              ) {
                currentSessionId = event.session_id;
              }

              // Extract text from assistant messages and send progress updates
              if (event.type === "assistant" && event.message?.content) {
                for (const block of event.message.content) {
                  if (block.type === "text" && block.text) {
                    lastAssistantText = block.text;
                  }

                  if (block.type === "tool_use") {
                    const toolName = block.name || "unknown";
                    let progressMsg = `Using ${toolName}...`;

                    if (toolName === "Read" && block.input?.file_path) {
                      progressMsg = `Reading: ${block.input.file_path}`;
                    } else if (toolName === "Grep" && block.input?.pattern) {
                      progressMsg = `Searching for: ${block.input.pattern}`;
                    } else if (toolName === "Glob" && block.input?.pattern) {
                      progressMsg = `Finding files: ${block.input.pattern}`;
                    } else if (toolName === "Bash" && block.input?.command) {
                      const cmdStr = block.input.command.slice(0, 50);
                      progressMsg = `Running: ${cmdStr}${block.input.command.length > 50 ? "..." : ""}`;
                    } else if (toolName === "Edit" && block.input?.file_path) {
                      progressMsg = `Editing: ${block.input.file_path}`;
                    } else if (toolName === "Write" && block.input?.file_path) {
                      progressMsg = `Writing: ${block.input.file_path}`;
                    } else if (toolName === "WebSearch" && block.input?.query) {
                      progressMsg = `Searching web: ${block.input.query}`;
                    } else if (toolName === "WebFetch" && block.input?.url) {
                      progressMsg = `Fetching: ${block.input.url}`;
                    }

                    logger.info(
                      { tool: toolName, input: block.input },
                      progressMsg,
                    );
                    if (onProgress) {
                      onProgress(progressMsg);
                    }
                  }
                }
              }

              // Log tool results
              if (event.type === "user" && event.message?.content) {
                for (const block of event.message.content) {
                  if (block.type === "tool_result") {
                    const result =
                      typeof block.content === "string"
                        ? block.content.slice(0, 500)
                        : JSON.stringify(block.content).slice(0, 500);
                    logger.info(
                      {
                        toolUseId: block.tool_use_id,
                        isError: block.is_error,
                      },
                      `Tool result: ${result}${result.length >= 500 ? "..." : ""}`,
                    );
                  }
                }
              }

              // Capture the final result
              if (event.type === "result") {
                logger.debug({ event }, "Claude result event");
                const errorMessage = event.is_error
                  ? event.result ||
                    (event.errors?.length ? event.errors.join("; ") : undefined)
                  : undefined;
                lastResult = {
                  success: !event.is_error,
                  output: event.result || "",
                  sessionId: event.session_id || currentSessionId,
                  error: errorMessage,
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
            logger.debug({ stderr: chunk }, "Claude stderr");
          }
        });

        proc.on("close", (code) => {
          logger.debug({ code }, "Claude process closed");

          if (lastResult) {
            if (!lastResult.success) {
              logger.error(
                {
                  error: lastResult.error,
                  output: lastResult.output?.slice(0, 1000),
                  stderr: stderrOutput,
                },
                "Claude returned error",
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
              stderrOutput.trim() || `Claude exited with code ${code}`;
            logger.error(
              { code, stderr: stderrOutput, lastText: lastAssistantText },
              "Claude process failed",
            );
            resolve({
              success: false,
              output: lastAssistantText,
              error: errorMsg,
            });
          }
        });

        proc.on("error", (err) => {
          logger.error({ error: err.message }, "Claude process error");
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
        let text = "";

        if (typeof parsed === "string") {
          text = parsed;
        } else if (parsed.result) {
          text = parsed.result;
        } else if (parsed.message) {
          text = parsed.message;
        } else if (parsed.content) {
          if (Array.isArray(parsed.content)) {
            text = parsed.content
              .filter((block: unknown) => {
                const b = block as { type?: string };
                return b.type === "text";
              })
              .map((block: unknown) => {
                const b = block as { text?: string };
                return b.text || "";
              })
              .join("\n");
          } else {
            text = String(parsed.content);
          }
        } else {
          text = JSON.stringify(parsed, null, 2);
        }

        return {
          text: text || "No response received",
          sessionId: parsed.session_id,
          costUsd: parsed.cost_usd,
          inputTokens: parsed.input_tokens,
          outputTokens: parsed.output_tokens,
        };
      } catch {
        return {
          text: result.output || "No response received",
        };
      }
    },

    skillsDir(projectCwd: string): string {
      return join(projectCwd, ".claude", "skills");
    },

    instructionsFile(): string {
      return "CLAUDE.md";
    },
  };
}
