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

const DEFAULT_COMMAND = "agent";
const PLACEHOLDER_SESSION_ID = "active";

export function createCursorAdapter(
  command?: string,
  model?: string,
): EngineAdapter {
  const cmd = command || DEFAULT_COMMAND;

  return {
    name: "Cursor",
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
          `Cursor Agent CLI command "${cmd}" not found or not executable. ` +
            `Please ensure Cursor Agent is installed and the command is in your PATH.`,
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

      const args: string[] = [
        "--print",
        "--workspace",
        config.cwd,
        "--trust",
        "--force",
      ];

      args.push("--model", model || "auto");

      const hasActiveSession = sessionId != null;
      const sessionEnabled = config.engineSession !== false;
      const useResumeByUuid =
        sessionEnabled &&
        config.engineSession === "user" &&
        typeof sessionId === "string" &&
        sessionId !== PLACEHOLDER_SESSION_ID;
      const useContinue =
        sessionEnabled &&
        !useResumeByUuid &&
        hasActiveSession &&
        continueSession !== false;

      if (useResumeByUuid && sessionId) {
        args.push("--resume", sessionId);
      } else if (useContinue) {
        args.push("--continue");
      }
      // When enabled=false: no --continue or --resume

      args.push(fullPrompt);

      const cwd = config.cwd;
      logger.info(
        {
          command: cmd,
          cwd,
          resume: useResumeByUuid ? "uuid" : useContinue ? "continue" : "none",
        },
        "Executing Cursor Agent CLI",
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
        let lastSessionId: string | undefined;

        proc.stdout.on("data", (data: Buffer) => {
          const chunk = data.toString();
          stdout += chunk;
          if (
            config.engineSession !== false &&
            config.engineSession === "user"
          ) {
            const lines = chunk.split("\n").filter((l) => l.trim());
            for (const line of lines) {
              try {
                const event = JSON.parse(line) as Record<string, unknown>;
                const sid = event.session_id ?? event.sessionId;
                if (typeof sid === "string") lastSessionId = sid;
              } catch {
                // Not JSON, skip
              }
            }
          }
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
            let resultSessionId: string | undefined;
            if (config.engineSession !== false) {
              if (config.engineSession === "user" && lastSessionId) {
                resultSessionId = lastSessionId;
              } else if (config.engineSession !== "user") {
                resultSessionId = PLACEHOLDER_SESSION_ID;
              }
            }
            resolve({
              success: true,
              output: stdout.trim() || "No response received",
              sessionId: resultSessionId,
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

    skillsDirs(projectCwd: string): string[] {
      return [
        join(projectCwd, ".agents", "skills"),
        join(projectCwd, ".cursor", "skills"),
      ];
    },

    instructionsFile(): string {
      return ".cursorrules";
    },
  };
}
