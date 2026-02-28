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

const DEFAULT_COMMAND = "agent";

export function createCursorAdapter(
  command?: string,
  model?: string,
): EngineAdapter {
  const cmd = command || DEFAULT_COMMAND;

  return {
    name: "Cursor",
    command: cmd,

    check() {
      try {
        execSync(`${cmd} --version`, { stdio: "pipe" });
      } catch {
        throw new Error(
          `Cursor Agent CLI command "${cmd}" not found or not executable. ` +
            `Please ensure Cursor Agent is installed and the command is in your PATH.`,
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

      const args: string[] = [
        "--print",
        "--workspace",
        config.cwd,
        "--trust",
        "--force",
      ];

      args.push("--model", model || "auto");

      if (config.engineSession && continueSession !== false) {
        args.push("--continue");
      }

      args.push(fullPrompt);

      const cwd = config.cwd;
      logger.info({ command: cmd, cwd }, "Executing Cursor Agent CLI");

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

          if (onProgress && chunk.trim()) {
            onProgress("Cursor is responding...");
          }
        });

        proc.stderr.on("data", (data: Buffer) => {
          const chunk = data.toString().trim();
          if (chunk) {
            stderrOutput += `${chunk}\n`;
            logger.info({ stderr: chunk }, "Cursor stderr");
          }
        });

        proc.on("close", (code) => {
          logger.info({ code }, "Cursor process closed");

          if (code === 0) {
            resolve({
              success: true,
              output: stdout.trim() || "No response received",
            });
          } else {
            const errorMsg =
              stderrOutput.trim() || `Cursor exited with code ${code}`;
            logger.error(
              { code, stderr: stderrOutput },
              "Cursor process failed",
            );
            resolve({
              success: false,
              output: stdout.trim(),
              error: errorMsg,
            });
          }
        });

        proc.on("error", (err) => {
          logger.error({ error: err.message }, "Cursor process error");
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
      return join(projectCwd, ".cursor", "rules");
    },

    instructionsFile(): string {
      return ".cursorrules";
    },
  };
}
