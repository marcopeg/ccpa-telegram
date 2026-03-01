import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type pino from "pino";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CommandSource = "builtin" | "git" | "project" | "system" | "skill";

export interface CommandEntry {
  command: string; // name without leading slash (e.g. "deploy")
  description: string; // from file's `description` export
  filePath: string; // absolute path to the .mjs file, or "" for built-ins/skills
  skillPrompt?: string; // prompt body from SKILL.md (skills only)
  public?: boolean; // from SKILL.md frontmatter `public: true`
  source: CommandSource; // where the command comes from
}

export interface CommandEnabledFlags {
  start: boolean;
  help: boolean;
  reset: boolean;
  clean: boolean;
  git: boolean;
}

const TELEGRAM_COMMAND_RE = /^[a-z0-9_]{1,32}$/;

function isValidTelegramCommandName(name: string): boolean {
  return TELEGRAM_COMMAND_RE.test(name);
}

// ─── Directory helpers ───────────────────────────────────────────────────────

function projectCommandDir(projectCwd: string): string {
  return join(projectCwd, ".hal", "commands");
}

function globalCommandDir(configDir: string): string {
  return join(configDir, ".hal", "commands");
}

// ─── Single-file import ──────────────────────────────────────────────────────

async function importCommandFile(
  filePath: string,
  logger: pino.Logger,
  source: CommandSource,
): Promise<CommandEntry | null> {
  try {
    // Cache-bust on every import so hot-reload always gets the latest version
    const mod = await import(`${filePath}?t=${Date.now()}`);

    if (typeof mod.description !== "string" || !mod.description.trim()) {
      logger.warn(
        { filePath },
        "Command file missing or empty `description` export — skipping",
      );
      return null;
    }

    // Derive command name from filename (strip .mjs extension)
    const fileName = filePath.split("/").pop() ?? "";
    const command = fileName.replace(/\.mjs$/, "");

    if (!isValidTelegramCommandName(command)) {
      logger.warn(
        { filePath, command },
        "Invalid Telegram command name from filename — skipping",
      );
      return null;
    }

    return {
      command,
      description: mod.description,
      filePath,
      source,
    };
  } catch (err) {
    logger.error(
      {
        filePath,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      "Failed to import command file — skipping",
    );
    return null;
  }
}

// ─── Directory scan ──────────────────────────────────────────────────────────

async function scanCommandDir(
  dir: string,
  logger: pino.Logger,
  source: CommandSource,
): Promise<CommandEntry[]> {
  if (!existsSync(dir)) {
    return [];
  }

  let files: string[];
  try {
    files = await readdir(dir);
  } catch (err) {
    logger.error(
      { dir, error: err instanceof Error ? err.message : String(err) },
      "Failed to read command directory — skipping",
    );
    return [];
  }

  const mjsFiles = files.filter((f) => f.endsWith(".mjs"));
  const entries: CommandEntry[] = [];

  for (const file of mjsFiles) {
    const filePath = join(dir, file);
    const entry = await importCommandFile(filePath, logger, source);
    if (entry !== null) {
      entries.push(entry);
    }
  }

  return entries;
}

// ─── Skills scan ─────────────────────────────────────────────────────────────

/**
 * Parse a SKILL.md file and return { name, description, prompt }.
 * `prompt` is the body text after the closing frontmatter delimiter.
 * Returns null if the file cannot be parsed or is missing required fields.
 */
async function parseSkillMd(
  filePath: string,
  logger: pino.Logger,
): Promise<{
  name: string;
  description: string;
  prompt: string;
  public: boolean;
} | null> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (err) {
    logger.error(
      { filePath, error: err instanceof Error ? err.message : String(err) },
      "Failed to read SKILL.md — skipping",
    );
    return null;
  }

  // Match frontmatter block and capture everything after the closing ---
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)/);
  if (!match) {
    logger.warn({ filePath }, "SKILL.md missing frontmatter block — skipping");
    return null;
  }

  const frontmatter = match[1];
  const prompt = match[2].trim();

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  const publicMatch = frontmatter.match(/^public:\s*(.+)$/m);

  if (!nameMatch || !descMatch) {
    logger.warn(
      { filePath },
      "SKILL.md frontmatter missing name or description — skipping",
    );
    return null;
  }

  return {
    name: nameMatch[1].trim(),
    description: descMatch[1].trim(),
    prompt,
    public: publicMatch?.[1].trim().toLowerCase() === "true",
  };
}

/**
 * Scan the engine's skills directory and return a CommandEntry for each skill.
 * The command name is derived from the folder name (how the engine resolves it).
 * A warning is logged when the frontmatter `name` differs from the folder name.
 * Skills have no .mjs filePath — they fall through to the AI engine when invoked.
 */
async function scanSkillsDir(
  dir: string,
  logger: pino.Logger,
): Promise<CommandEntry[]> {
  if (!existsSync(dir)) {
    return [];
  }

  let folders: string[];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    folders = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    logger.error(
      { dir, error: err instanceof Error ? err.message : String(err) },
      "Failed to read skills directory — skipping",
    );
    return [];
  }

  const skills: CommandEntry[] = [];

  for (const folder of folders) {
    const skillMdPath = join(dir, folder, "SKILL.md");
    if (!existsSync(skillMdPath)) {
      continue;
    }

    const parsed = await parseSkillMd(skillMdPath, logger);
    if (!parsed) {
      continue;
    }

    // Command name is the folder name; warn if frontmatter `name` disagrees
    if (parsed.name !== folder) {
      logger.warn(
        { folder, frontmatterName: parsed.name },
        "Skill frontmatter `name` differs from folder name — using folder name as command",
      );
    }

    if (!isValidTelegramCommandName(folder)) {
      logger.warn(
        { folder, skillMdPath },
        "Invalid Telegram command name from skill folder — skipping",
      );
      continue;
    }

    skills.push({
      command: folder,
      description: parsed.description,
      filePath: "",
      skillPrompt: parsed.prompt,
      public: parsed.public,
      source: "skill",
    });
  }

  return skills;
}

// ─── Built-in commands ───────────────────────────────────────────────────────

export const BUILTIN_COMMANDS: CommandEntry[] = [
  {
    command: "start",
    description: "Welcome message",
    filePath: "",
    source: "builtin",
  },
  {
    command: "help",
    description: "Show help",
    filePath: "",
    source: "builtin",
  },
  {
    command: "reset",
    description: "Wipes out all user data and resets the LLM session",
    filePath: "",
    source: "builtin",
  },
  {
    command: "clean",
    description: "Resets the LLM session",
    filePath: "",
    source: "builtin",
  },
];

export const GIT_COMMANDS: CommandEntry[] = [
  {
    command: "git_init",
    description: "Initialize a git repository",
    filePath: "",
    source: "git",
  },
  {
    command: "git_status",
    description: "Show git status",
    filePath: "",
    source: "git",
  },
  {
    command: "git_commit",
    description: "Commit changes",
    filePath: "",
    source: "git",
  },
  {
    command: "git_clean",
    description: "Revert uncommitted changes",
    filePath: "",
    source: "git",
  },
];

const BUILTIN_ENABLED_MAP: Record<string, keyof CommandEnabledFlags> = {
  start: "start",
  help: "help",
  reset: "reset",
  clean: "clean",
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Scan command directories and optionally the skills dir, then return the merged list.
 * When `enabled` flags are provided, disabled built-in/git commands are excluded.
 *
 * Precedence (lowest → highest):
 *   engine skills  <  global .hal/commands  <  project .hal/commands
 */
export async function loadCommands(
  projectCwd: string,
  configDir: string,
  logger: pino.Logger,
  skillsDir?: string,
  enabled?: CommandEnabledFlags,
): Promise<CommandEntry[]> {
  const globalDir = globalCommandDir(configDir);
  const projectDir = projectCommandDir(projectCwd);

  const skillEntries = skillsDir ? await scanSkillsDir(skillsDir, logger) : [];
  const globalEntries = await scanCommandDir(globalDir, logger, "system");
  const projectEntries = await scanCommandDir(projectDir, logger, "project");

  const map = new Map<string, CommandEntry>();

  for (const entry of BUILTIN_COMMANDS) {
    map.set(entry.command, entry);
  }

  if (enabled?.git) {
    for (const entry of GIT_COMMANDS) {
      map.set(entry.command, entry);
    }
  }

  for (const entry of skillEntries) {
    map.set(entry.command, entry);
  }
  for (const entry of globalEntries) {
    map.set(entry.command, entry);
  }
  for (const entry of projectEntries) {
    map.set(entry.command, entry);
  }

  if (enabled) {
    for (const [cmd, flag] of Object.entries(BUILTIN_ENABLED_MAP)) {
      if (!enabled[flag]) {
        map.delete(cmd);
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Resolve a skill entry by command name from the engine's skills directory.
 * Returns null if the skill doesn't exist or its SKILL.md can't be parsed.
 */
export async function resolveSkillEntry(
  commandName: string,
  skillsDir: string,
  logger: pino.Logger,
): Promise<CommandEntry | null> {
  if (!isValidTelegramCommandName(commandName)) {
    return null;
  }

  const skillMdPath = join(skillsDir, commandName, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    return null;
  }

  const parsed = await parseSkillMd(skillMdPath, logger);
  if (!parsed) {
    return null;
  }

  if (parsed.name !== commandName) {
    logger.warn(
      { commandName, frontmatterName: parsed.name },
      "Skill frontmatter `name` differs from folder name — using folder name as command",
    );
  }

  return {
    command: commandName,
    description: parsed.description,
    filePath: "",
    skillPrompt: parsed.prompt,
    source: "skill",
  };
}

/**
 * Resolve the file path for a single command name.
 * Returns null if not found in either directory.
 * Project-specific takes precedence over global.
 */
export function resolveCommandPath(
  commandName: string,
  projectCwd: string,
  configDir: string,
): string | null {
  // Check project-specific first (higher priority)
  const projectPath = join(projectCommandDir(projectCwd), `${commandName}.mjs`);
  if (existsSync(projectPath)) {
    return projectPath;
  }

  // Fall back to global
  const globalPath = join(globalCommandDir(configDir), `${commandName}.mjs`);
  if (existsSync(globalPath)) {
    return globalPath;
  }

  return null;
}
