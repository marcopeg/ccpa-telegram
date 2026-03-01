import type { Context } from "grammy";
import type { ProjectContext } from "../../../types.js";
import { gitExec, isGitRepo } from "./exec.js";

export function createGitInitHandler(ctx: ProjectContext) {
  return async (gramCtx: Context): Promise<void> => {
    const { config, logger } = ctx;
    const cwd = config.cwd;

    try {
      if (await isGitRepo(cwd)) {
        await gramCtx.reply("Already a git repository.");
        return;
      }

      await gitExec(cwd, ["init"]);
      await gitExec(cwd, ["add", "."]);
      await gitExec(cwd, ["commit", "-m", "Initial commit"]);

      await gramCtx.reply("Git repository initialized with initial commit.");
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "/git_init failed",
      );
      await gramCtx.reply(
        `Failed to initialize git repository: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
}
