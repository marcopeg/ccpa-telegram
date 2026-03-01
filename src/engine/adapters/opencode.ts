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
 * Adapter for OpenCode CLI. Non-interactive: opencode run [-m model] [-c] "<prompt>".
 * Sessions and config are scoped by process CWD — always spawn with cwd: config.cwd.
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
      const { onProgress, continueSession } = options;
      const { config, logger } = ctx;

      const fullPrompt = await buildContextualPrompt(options, ctx);

      const continueSessionRequested =
        config.engineSession && continueSession !== false;

      const args: string[] = ["run"];
      if (model) {
        args.push("-m", model);
      }
      if (continueSessionRequested) {
        args.push("-c");
      }
      args.push(fullPrompt);

      const cwd = config.cwd;
      logger.info(
        {
          command: cmd,
          args: args.slice(0, -1),
          cwd,
          continue: continueSessionRequested,
        },
        "Executing OpenCode CLI",
      );

      // Don't load ~/.claude/CLAUDE.md so the model doesn't say "I'm Claude"
      const env = {
        ...process.env,
        OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: "true",
      };

      return new Promise((resolve) => {
        const proc = spawn(cmd, args, {
          cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderrOutput = "";

        proc.stdout.on("data", (data: Buffer) => {
          const chunk = data.toString();
          stdout += chunk;
          if (onProgress && chunk.trim()) {
            onProgress("OpenCode is responding...");
          }
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
      return join(projectCwd, ".claude", "skills");
    },

    instructionsFile(): string {
      return "AGENTS.md";
    },
  };
}
