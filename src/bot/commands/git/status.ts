import type { Context } from "grammy";
import type { ProjectContext } from "../../../types.js";
import { gitExec } from "./exec.js";

export function createGitStatusHandler(ctx: ProjectContext) {
  return async (gramCtx: Context): Promise<void> => {
    const { config, logger } = ctx;

    try {
      const { stdout } = await gitExec(config.cwd, ["status"]);
      const output = stdout.trim() || "Nothing to report.";
      await gramCtx.reply(`\`\`\`\n${output}\n\`\`\``, {
        parse_mode: "Markdown",
      });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "/git_status failed",
      );
      await gramCtx.reply(
        `Failed to get git status: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
}
