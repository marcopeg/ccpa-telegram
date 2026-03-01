import type { Context } from "grammy";
import { resolveContext, substituteMessage } from "../../context/resolver.js";
import { getDefaultEngineModel } from "../../default-models.js";
import type { ProjectContext } from "../../types.js";
import { type CommandEntry, loadCommands } from "./loader.js";

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
 * Build the HAL_COMMANDS formatted string divided into 5 sections by source:
 * Project Commands, Project Skills, System Commands, Hal Commands, Versioning.
 */
async function buildHalCommands(ctx: ProjectContext): Promise<string> {
  const { config, logger, engine } = ctx;
  const skillsDirs = engine.skillsDirs(config.cwd);

  const enabled = {
    start: config.commands.start.enabled,
    help: config.commands.help.enabled,
    reset: config.commands.reset.enabled,
    clean: config.commands.clean.enabled,
    git: config.commands.git.enabled,
  };

  const all = await loadCommands(
    config.cwd,
    config.configDir,
    logger,
    skillsDirs,
    enabled,
  );

  const projectCommands: CommandEntry[] = [];
  const skills: CommandEntry[] = [];
  const systemCommands: CommandEntry[] = [];
  const halCommands: CommandEntry[] = [];
  const gitCommands: CommandEntry[] = [];

  for (const entry of all) {
    switch (entry.source) {
      case "project":
        projectCommands.push(entry);
        break;
      case "skill":
        if (entry.public) skills.push(entry);
        break;
      case "system":
        systemCommands.push(entry);
        break;
      case "builtin":
        halCommands.push(entry);
        break;
      case "git":
        gitCommands.push(entry);
        break;
    }
  }

  const sections: string[] = [];

  if (projectCommands.length > 0)
    sections.push(`*Project Commands:*\n${formatCommandList(projectCommands)}`);
  if (skills.length > 0)
    sections.push(`*Project Skills:*\n${formatCommandList(skills)}`);
  if (systemCommands.length > 0)
    sections.push(`*System Commands:*\n${formatCommandList(systemCommands)}`);
  if (halCommands.length > 0)
    sections.push(`*Hal Commands:*\n${formatCommandList(halCommands)}`);
  if (gitCommands.length > 0)
    sections.push(`*Versioning:*\n${formatCommandList(gitCommands)}`);

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
    engineName: config.engine,
    engineCommand: ctx.engine.command,
    engineModel: config.engineModel,
    engineDefaultModel: config.engineModel
      ? undefined
      : (getDefaultEngineModel(config.engine) ?? "engine-defaults"),
  });

  vars.HAL_COMMANDS = await buildHalCommands(ctx);

  return substituteMessage(template, vars, logger);
}
