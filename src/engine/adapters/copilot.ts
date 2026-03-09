import { execSync } from "node:child_process";
import { join } from "node:path";
import type { ProjectContext } from "../../types.js";
import { buildContextualPrompt } from "../prompt.js";
import { spawnEngineProcess } from "../spawn.js";
import type {
  EngineAdapter,
  EngineExecuteOptions,
  EngineResult,
  ParsedResponse,
} from "../types.js";

const DEFAULT_COMMAND = "copilot";

/**
 * Best-effort extraction of the final answer when Copilot (e.g. with Codex-style
 * model) outputs reasoning/tool runs followed by a clear answer. Codex CLI with
 * --json emits item.type === "agent_message" for the final message; Copilot
 * streams plain text, so we approximate by finding the last line that matches
 * common "final answer" lead-ins (headers, bold labels, or natural-language
 * phrases) and return from that line to the end.
 * Returns undefined if no such line is found, so callers fall back to full output.
 */
function extractFinalAnswer(output: string): string | undefined {
  const lines = output.split(/\r?\n/);
  // Recurring patterns: markdown headers (## Answer, ## Summary), bold labels
  // (**Answer:**), and natural-language lead-ins (Here are the..., Answer:, etc.).
  const leadInPatterns = [
    /^#{1,6}\s*(Answer|Summary|Result|Output|Final answer|Conclusion)\s*$/i,
    /^\*\*(Answer|Summary|Result|Output):\s*\*\*/i,
    /^(Here are the |Here is the )/i,
    /^(Answer|Summary|Result|Output|Conclusion):\s*/i,
    /^(Final answer|In summary|To summarize):\s*/i,
    /^The (last |following )?\d+ (commits?|results?|items?):\s*/i,
  ];
  let lastMatchIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (leadInPatterns.some((re) => re.test(line))) lastMatchIndex = i;
  }
  if (lastMatchIndex < 0) return undefined;
  const slice = lines.slice(lastMatchIndex).join("\n").trim();
  return slice.length > 20 ? slice : undefined;
}

export function createCopilotAdapter(
  command?: string,
  model?: string,
): EngineAdapter {
  const cmd = command || DEFAULT_COMMAND;

  return {
    name: "GitHub Copilot",
    command: cmd,
    sessionCapabilities: {
      supportsUserIsolation: false,
      defaultMode: "shared",
      sharedContinuationRequiresMarker: true,
    },

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
      const { onProgress, continueSession, sessionId } = options;
      const { config, logger } = ctx;

      const fullPrompt = await buildContextualPrompt(options, ctx);

      // Copilot CLI flags (confirmed via `copilot --help`):
      //   -p <text>       Non-interactive prompt (exits after completion)
      //   -s / --silent   Clean output for scripting (no stats banner)
      //   --allow-all     Enable all permissions (tools + paths + urls)
      //   --model <model> Override the AI model
      //   --continue      Continue the most recent session
      const args: string[] = ["-p", fullPrompt, "--allow-all"];

      if (model) {
        args.push("--model", model);
      }

      const hasActiveSession = sessionId != null;
      if (
        config.engineSession !== false &&
        hasActiveSession &&
        continueSession !== false
      ) {
        args.push("--continue");
      }

      const cwd = config.cwd;
      const willContinue = args.includes("--continue");
      logger.info(
        { command: cmd, cwd, continue: willContinue },
        "Executing Copilot CLI",
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
              sessionId: config.engineSession !== false ? "active" : undefined,
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
      const raw = (result.output || "No response received").trim();
      const extracted = extractFinalAnswer(raw);
      return {
        text: extracted ?? raw,
      };
    },

    skillsDirs(projectCwd: string): string[] {
      return [
        join(projectCwd, ".agents", "skills"),
        join(projectCwd, ".github", "skills"),
        join(projectCwd, ".claude", "skills"),
      ];
    },

    instructionsFile(): string {
      return "AGENTS.md";
    },
  };
}
