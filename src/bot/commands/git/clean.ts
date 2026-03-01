import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { ProjectContext } from "../../../types.js";
import { gitExec } from "./exec.js";

/** Parse `git status --short` into a list of file paths. */
function parseChangedFiles(statusOutput: string): string[] {
  return statusOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(3)); // strip status flags + space (e.g. " M src/file.ts")
}

export function createGitCleanHandler(ctx: ProjectContext) {
  return async (gramCtx: Context): Promise<void> => {
    const { config, logger } = ctx;
    const cwd = config.cwd;
    const messageText = gramCtx.message?.text ?? "";
    const fileArg = messageText.replace(/^\/git_clean\s*/, "").trim();

    try {
      const { stdout } = await gitExec(cwd, ["status", "--short"]);
      const files = parseChangedFiles(stdout);

      if (files.length === 0) {
        await gramCtx.reply("Working tree is clean.");
        return;
      }

      if (fileArg) {
        if (!files.includes(fileArg)) {
          await gramCtx.reply(
            `File \`${fileArg}\` has no uncommitted changes.`,
            { parse_mode: "Markdown" },
          );
          return;
        }

        await gitExec(cwd, ["restore", fileArg]);
        await gramCtx.reply(`Restored \`${fileArg}\`.`, {
          parse_mode: "Markdown",
        });
        return;
      }

      const keyboard = new InlineKeyboard();
      for (const file of files) {
        keyboard.text(file, `gc:select:${file}`).row();
      }
      keyboard.text("Reset all", "gc:all").row();

      await gramCtx.reply("Select file(s) to revert:", {
        reply_markup: keyboard,
      });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "/git_clean failed",
      );
      await gramCtx.reply(
        `Failed to check changes: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
}
