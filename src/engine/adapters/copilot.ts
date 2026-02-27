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

const DEFAULT_COMMAND = "copilot";

export function createCopilotAdapter(
  command?: string,
  model?: string,
): EngineAdapter {
  const cmd = command || DEFAULT_COMMAND;

  return {
    name: "GitHub Copilot",
    command: cmd,

    check() {
      try {
        execSync(`${cmd} --version`, { stdio: "pipe" });
      } catch {
        throw new Error(
          `Copilot CLI command "${cmd}" not found or not executable. ` +
            `Please ensure GitHub Copilot CLI is installed and the command is in your PATH.`,
        );
      }
    },

    async execute(
      options: EngineExecuteOptions,
      ctx: ProjectContext,
    ): Promise<EngineResult> {
      const { onProgress, continueSession } = options;
      const { config, logger } = ctx;

      const fullPrompt = await buildContextualPrompt(options, ctx);

      // Copilot CLI flags (confirmed via `copilot --help`):
      //   -p <text>       Non-interactive prompt (exits after completion)
      //   -s / --silent   Clean output for scripting (no stats banner)
      //   --allow-all     Enable all permissions (tools + paths + urls)
      //   --model <model> Override the AI model
      //   --continue      Continue the most recent session
      const args: string[] = ["-p", fullPrompt, "--allow-all"];

      // Set model if specified
      if (model) {
        args.push("--model", model);
      }

      // Continue session only when persistence is enabled and not explicitly disabled (e.g. /clean)
      if (config.engineSession && continueSession !== false) {
        args.push("--continue");
      }

      const cwd = config.cwd;
      logger.info({ command: cmd, cwd }, "Executing Copilot CLI");

      return new Promise((resolve) => {
        const proc = spawn(cmd, args, {
          cwd,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderrOutput = "";

        proc.stdout.on("data", (data: Buffer) => {
          const chunk = data.toString();
          stdout += chunk;

          // Copilot in silent mode outputs plain text.
          // Send incremental progress if a callback is provided.
          if (onProgress && chunk.trim()) {
            onProgress("Copilot is responding...");
          }
        });

        proc.stderr.on("data", (data: Buffer) => {
          const chunk = data.toString().trim();
          if (chunk) {
            stderrOutput += `${chunk}\n`;
            logger.info({ stderr: chunk }, "Copilot stderr");
          }
        });

        proc.on("close", (code) => {
          logger.info({ code }, "Copilot process closed");

          if (code === 0) {
            resolve({
              success: true,
              output: stdout.trim() || "No response received",
            });
          } else {
            const errorMsg =
              stderrOutput.trim() || `Copilot exited with code ${code}`;
            logger.error(
              { code, stderr: stderrOutput },
              "Copilot process failed",
            );
            resolve({
              success: false,
              output: stdout.trim(),
              error: errorMsg,
            });
          }
        });

        proc.on("error", (err) => {
          logger.error({ error: err.message }, "Copilot process error");
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
      return {
        text: result.output || "No response received",
      };
    },

    skillsDir(projectCwd: string): string {
      // All engines share .claude/skills/ for now (portable; revisit later)
      return join(projectCwd, ".claude", "skills");
    },

    instructionsFile(): string {
      return "AGENTS.md";
    },
  };
}
