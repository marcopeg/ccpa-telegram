import type { Context } from "grammy";
import { resolveContext, substituteMessage } from "../../context/resolver.js";
import type { ProjectContext } from "../../types.js";
import { BUILTIN_COMMANDS, type CommandEntry, loadCommands } from "./loader.js";

const BUILTIN_NAMES = new Set(BUILTIN_COMMANDS.map((c) => c.command));

function escapeMarkdown(text: string): string {
  return text.replace(/[_*`[]/g, "\\$&").replace(/@/g, "@\u200B");
}

function formatCommandList(entries: CommandEntry[]): string {
  return entries
    .map(
      (e) =>
        `• /${escapeMarkdown(e.command)} — ${escapeMarkdown(e.description)}`,
    )
    .join("\n");
}

/**
 * Build the HAL_COMMANDS formatted string divided into 3 sections:
 * built-in commands, programmatic (.mjs) commands, and public skill commands.
 */
async function buildHalCommands(ctx: ProjectContext): Promise<string> {
  const { config, logger, engine } = ctx;
  const skillsDir = engine.skillsDir(config.cwd);
  const all = await loadCommands(
    config.cwd,
    config.configDir,
    logger,
    skillsDir,
  );

  const builtins: CommandEntry[] = [];
  const programmatic: CommandEntry[] = [];
  const skills: CommandEntry[] = [];

  for (const entry of all) {
    if (BUILTIN_NAMES.has(entry.command)) {
      builtins.push(entry);
    } else if (entry.skillPrompt && entry.public) {
      skills.push(entry);
    } else if (!entry.skillPrompt) {
      programmatic.push(entry);
    }
  }

  const sections: string[] = [];

  if (builtins.length > 0) {
    sections.push(`*Commands:*\n${formatCommandList(builtins)}`);
  }
  if (programmatic.length > 0) {
    sections.push(`*Custom Commands:*\n${formatCommandList(programmatic)}`);
  }
  if (skills.length > 0) {
    sections.push(`*Skills:*\n${formatCommandList(skills)}`);
  }

  return sections.join("\n\n");
}

/**
 * Resolve a message template with context variable substitution and
 * the HAL_COMMANDS placeholder. Shared by /start, /help, /reset, and /clean.
 */
export async function resolveCommandMessage(
  template: string,
  ctx: ProjectContext,
  gramCtx: Context,
): Promise<string> {
  const { config, logger, bootContext } = ctx;

  const vars = await resolveContext({
    gramCtx,
    configContext: config.context,
    bootContext,
    configDir: config.configDir,
    projectCwd: config.cwd,
    projectName: config.name,
    projectSlug: config.slug,
    logger,
  });

  vars.HAL_COMMANDS = await buildHalCommands(ctx);

  return substituteMessage(template, vars, logger);
}
