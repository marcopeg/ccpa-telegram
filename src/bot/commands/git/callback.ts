import type { Context, NextFunction } from "grammy";
import { InlineKeyboard } from "grammy";
import type { ProjectContext } from "../../../types.js";
import { gitExec } from "./exec.js";

/**
 * Callback query handler for `/git_clean` inline keyboard interactions.
 * Recognizes data prefixed with `gc:` and ignores all other callbacks.
 */
export function createGitCallbackHandler(ctx: ProjectContext) {
  return async (gramCtx: Context, next: NextFunction): Promise<void> => {
    const data = gramCtx.callbackQuery?.data;
    if (!data?.startsWith("gc:")) {
      return next();
    }

    const { config, logger } = ctx;
    const cwd = config.cwd;

    try {
      if (data.startsWith("gc:select:")) {
        const file = data.slice("gc:select:".length);
        const keyboard = new InlineKeyboard()
          .text("Confirm", `gc:confirm:${file}`)
          .text("Cancel", "gc:cancel");

        await gramCtx.editMessageText(
          `Revert \`${file}\` and lose the changes?`,
          { parse_mode: "Markdown", reply_markup: keyboard },
        );
        await gramCtx.answerCallbackQuery();
        return;
      }

      if (data === "gc:all") {
        const keyboard = new InlineKeyboard()
          .text("Confirm", "gc:confirm:__all__")
          .text("Cancel", "gc:cancel");

        await gramCtx.editMessageText(
          "Revert *all* uncommitted changes and lose them?",
          { parse_mode: "Markdown", reply_markup: keyboard },
        );
        await gramCtx.answerCallbackQuery();
        return;
      }

      if (data.startsWith("gc:confirm:")) {
        const target = data.slice("gc:confirm:".length);

        if (target === "__all__") {
          await gitExec(cwd, ["restore", "."]);
          // Also clean untracked files
          await gitExec(cwd, ["clean", "-fd"]).catch(() => {});
          await gramCtx.editMessageText("All uncommitted changes reverted.", {
            reply_markup: undefined,
          });
        } else {
          await gitExec(cwd, ["restore", target]);
          await gramCtx.editMessageText(`Restored \`${target}\`.`, {
            parse_mode: "Markdown",
            reply_markup: undefined,
          });
        }

        await gramCtx.answerCallbackQuery();
        return;
      }

      if (data === "gc:cancel") {
        await gramCtx.editMessageText("Cancelled.", {
          reply_markup: undefined,
        });
        await gramCtx.answerCallbackQuery();
        return;
      }
    } catch (err) {
      logger.error(
        { data, error: err instanceof Error ? err.message : String(err) },
        "git_clean callback failed",
      );
      try {
        await gramCtx.answerCallbackQuery({ text: "Operation failed." });
      } catch {
        // ignore
      }
    }
  };
}
