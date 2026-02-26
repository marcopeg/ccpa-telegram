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

const DEFAULT_COMMAND = "opencode";

/**
 * Stub adapter for OpenCode CLI.
 * TODO: Confirm exact CLI flags, streaming support, and output format.
 */
export function createOpencodeAdapter(
  command?: string,
  model?: string,
): EngineAdapter {
  const cmd = command || DEFAULT_COMMAND;

  return {
    name: "OpenCode",
    command: cmd,

    check() {
      try {
        execSync(`${cmd} --version`, { stdio: "pipe" });
      } catch {
        throw new Error(
          `OpenCode CLI command "${cmd}" not found or not executable. ` +
            `Please ensure OpenCode CLI is installed and the command is in your PATH.`,
        );
      }
    },

    async execute(
      options: EngineExecuteOptions,
      ctx: ProjectContext,
    ): Promise<EngineResult> {
      const { config, logger } = ctx;

      const fullPrompt = await buildContextualPrompt(options, ctx);

      // TODO: Confirm exact opencode CLI flags — using best-guess values.
      const args: string[] = ["-p", fullPrompt];

      // Set model if specified
      if (model) {
        args.push("--model", model);
      }

      const cwd = config.cwd;
      logger.info({ command: cmd, cwd }, "Executing OpenCode CLI");
      logger.warn("OpenCode adapter is a stub — CLI flags may need adjustment");

      return new Promise((resolve) => {
        const proc = spawn(cmd, args, {
          cwd,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderrOutput = "";

        proc.stdout.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        proc.stderr.on("data", (data: Buffer) => {
          const chunk = data.toString().trim();
          if (chunk) {
            stderrOutput += `${chunk}\n`;
            logger.debug({ stderr: chunk }, "OpenCode stderr");
          }
        });

        proc.on("close", (code) => {
          logger.debug({ code }, "OpenCode process closed");
          if (code === 0) {
            resolve({
              success: true,
              output: stdout.trim() || "No response received",
            });
          } else {
            resolve({
              success: false,
              output: "",
              error: stderrOutput.trim() || `OpenCode exited with code ${code}`,
            });
          }
        });

        proc.on("error", (err) => {
          logger.error({ error: err.message }, "OpenCode process error");
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

    skillsDir(projectCwd: string): string {
      // All engines share .claude/skills/ for now
      return join(projectCwd, ".claude", "skills");
    },

    instructionsFile(): string {
      return "AGENTS.md";
    },
  };
}
