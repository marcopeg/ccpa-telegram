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

const DEFAULT_COMMAND = "codex";

/**
 * Adapter for OpenAI Codex CLI.
 * Fresh:    `codex exec -C <cwd> [-m model] [PROMPT]`
 * Continue: `codex exec resume --last [-m model] [PROMPT]`
 * Buffered stdout only (no streaming).
 */
export function createCodexAdapter(
  command?: string,
  model?: string,
): EngineAdapter {
  const cmd = command || DEFAULT_COMMAND;

  return {
    name: "Codex",
    command: cmd,

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
      const { continueSession } = options;
      const { config, logger } = ctx;
      const fullPrompt = await buildContextualPrompt(options, ctx);
      const cwd = config.cwd;

      const continueSessionRequested =
        config.engineSession && continueSession !== false;

      // Non-interactive: `codex exec` for fresh; `codex exec resume --last` for continue
      const args: string[] = ["exec"];
      if (continueSessionRequested) {
        args.push("resume", "--last");
      } else {
        args.push("-C", cwd);
      }
      if (model) {
        args.push("-m", model);
      }
      args.push("--full-auto", "--skip-git-repo-check");
      args.push(fullPrompt);

      logger.info(
        {
          command: cmd,
          args: args.slice(0, -1),
          cwd,
          continue: continueSessionRequested,
        },
        "Executing Codex CLI",
      );

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
            logger.debug({ stderr: chunk }, "Codex stderr");
          }
        });

        proc.on("close", (code) => {
          logger.debug({ code }, "Codex process closed");
          if (code === 0) {
            resolve({
              success: true,
              output: stdout.trim() || "No response received",
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

    skillsDir(projectCwd: string): string {
      // All engines share .claude/skills/ for now
      return join(projectCwd, ".claude", "skills");
    },

    instructionsFile(): string {
      return "AGENTS.md";
    },
  };
}
