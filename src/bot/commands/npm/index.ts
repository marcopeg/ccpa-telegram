import type { Context, NextFunction } from "grammy";
import { InlineKeyboard, InputFile } from "grammy";
import type { ProjectContext } from "../../../types.js";
import { npmExec } from "./exec.js";
import { formatNpmResult } from "./format.js";
import {
  NpmScriptError,
  readPackageScripts,
  resolveAllowedScripts,
} from "./scripts.js";

// Per-project concurrency lock: only one npm run at a time per slug.
const activeRuns = new Map<string, boolean>();

function getAllowedScripts(ctx: ProjectContext): string[] {
  const { config } = ctx;
  const scripts = readPackageScripts(config.cwd);
  const available = Object.keys(scripts);
  return resolveAllowedScripts(
    available,
    config.commands.npm.whitelist,
    config.commands.npm.blacklist,
  );
}

function buildScriptKeyboard(allowed: string[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < allowed.length; i++) {
    kb.text(allowed[i], `npm:${allowed[i]}`);
    if ((i + 1) % 3 === 0) kb.row();
  }
  return kb;
}

async function runScript(
  ctx: ProjectContext,
  gramCtx: Context,
  script: string,
): Promise<void> {
  const { config, logger } = ctx;
  const slug = config.slug;

  if (activeRuns.get(slug)) {
    await gramCtx.reply(
      "An npm command is already running for this project. Please wait for it to finish.",
    );
    return;
  }

  let allowed: string[];
  try {
    allowed = getAllowedScripts(ctx);
  } catch (err) {
    if (err instanceof NpmScriptError) {
      await gramCtx.reply(err.message);
      return;
    }
    throw err;
  }

  if (allowed.length === 0) {
    await gramCtx.reply(
      "No scripts are available after applying whitelist/blacklist filters.",
    );
    return;
  }

  if (!allowed.includes(script)) {
    await gramCtx.reply(
      `Script "${script}" is not allowed or not found.\n\nYou don't need to type the script name manually. Just send /npm to get a list of available commands as buttons.`,
    );
    return;
  }

  activeRuns.set(slug, true);
  const statusMsg = await gramCtx.reply(`⏳ Running \`npm run ${script}\`…`, {
    parse_mode: "Markdown",
  });

  try {
    const result = await npmExec(
      config.cwd,
      script,
      config.commands.npm.timeoutMs,
    );

    const { summary, fullLog, truncated } = formatNpmResult(
      script,
      result,
      config.commands.npm.maxOutputChars,
    );

    try {
      await gramCtx.api.editMessageText(
        statusMsg.chat.id,
        statusMsg.message_id,
        summary,
        { parse_mode: "Markdown" },
      );
    } catch {
      await gramCtx.reply(summary, { parse_mode: "Markdown" });
    }

    if (truncated && config.commands.npm.sendAsFileWhenLarge) {
      const buf = Buffer.from(fullLog, "utf-8");
      await gramCtx.replyWithDocument(
        new InputFile(buf, `npm-run-${script}.log`),
      );
    }
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), script },
      "/npm execution failed",
    );
    try {
      await gramCtx.api.editMessageText(
        statusMsg.chat.id,
        statusMsg.message_id,
        `Failed to run \`npm run ${script}\`: ${err instanceof Error ? err.message : String(err)}`,
        { parse_mode: "Markdown" },
      );
    } catch {
      await gramCtx.reply(
        `Failed to run \`npm run ${script}\`: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } finally {
    activeRuns.delete(slug);
  }
}

export function createNpmHandler(ctx: ProjectContext) {
  return async (gramCtx: Context): Promise<void> => {
    const messageText = gramCtx.message?.text ?? "";
    const script = messageText.replace(/^\/npm(@\w+)?\s*/, "").trim();

    let allowed: string[];
    try {
      allowed = getAllowedScripts(ctx);
    } catch (err) {
      if (err instanceof NpmScriptError) {
        await gramCtx.reply(err.message);
        return;
      }
      throw err;
    }

    if (allowed.length === 0) {
      await gramCtx.reply(
        "No scripts are available after applying whitelist/blacklist filters.",
      );
      return;
    }

    if (!script) {
      const kb = buildScriptKeyboard(allowed);
      await gramCtx.reply("Choose a script to run:", { reply_markup: kb });
      return;
    }

    await runScript(ctx, gramCtx, script);
  };
}

export function createNpmCallbackHandler(ctx: ProjectContext) {
  return async (gramCtx: Context, next: NextFunction): Promise<void> => {
    const data = gramCtx.callbackQuery?.data;
    if (!data?.startsWith("npm:")) {
      return next();
    }

    const script = data.slice(4);
    await gramCtx.answerCallbackQuery();

    try {
      await gramCtx.editMessageText(`Running \`npm run ${script}\`…`, {
        parse_mode: "Markdown",
        reply_markup: undefined,
      });
    } catch {
      // keyboard may already be gone
    }

    await runScript(ctx, gramCtx, script);
  };
}
