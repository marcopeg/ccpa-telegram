import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type pino from "pino";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CommandEntry {
  command: string; // name without leading slash (e.g. "deploy")
  description: string; // from file's `description` export
  filePath: string; // absolute path to the .mjs file, or "" for skills
  skillPrompt?: string; // prompt body from SKILL.md (skills only)
}

// ─── Directory helpers ───────────────────────────────────────────────────────

function projectCommandDir(projectCwd: string): string {
  return join(projectCwd, ".telegrapp", "commands");
}

function globalCommandDir(configDir: string): string {
  return join(configDir, ".telegrapp", "commands");
}

// ─── Single-file import ──────────────────────────────────────────────────────

async function importCommandFile(
  filePath: string,
  logger: pino.Logger,
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

    return {
      command,
      description: mod.description,
      filePath,
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
    const entry = await importCommandFile(filePath, logger);
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
): Promise<{ name: string; description: string; prompt: string } | null> {
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

    skills.push({
      command: folder,
      description: parsed.description,
      filePath: "",
      skillPrompt: parsed.prompt,
    });
  }

  return skills;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Scan command directories and optionally the skills dir, then return the merged list.
 *
 * Precedence (lowest → highest):
 *   engine skills  <  global .telegrapp/commands  <  project .telegrapp/commands
 */
export async function loadCommands(
  projectCwd: string,
  configDir: string,
  logger: pino.Logger,
  skillsDir?: string,
): Promise<CommandEntry[]> {
  const globalDir = globalCommandDir(configDir);
  const projectDir = projectCommandDir(projectCwd);

  // Load in ascending precedence order; later entries overwrite earlier ones
  const skillEntries = skillsDir ? await scanSkillsDir(skillsDir, logger) : [];
  const globalEntries = await scanCommandDir(globalDir, logger);
  const projectEntries = await scanCommandDir(projectDir, logger);

  const map = new Map<string, CommandEntry>();

  for (const entry of skillEntries) {
    map.set(entry.command, entry);
  }
  for (const entry of globalEntries) {
    map.set(entry.command, entry);
  }
  for (const entry of projectEntries) {
    map.set(entry.command, entry);
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
