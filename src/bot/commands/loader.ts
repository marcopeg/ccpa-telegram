import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type pino from "pino";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CommandEntry {
  command: string; // name without leading slash (e.g. "deploy")
  description: string; // from file's `description` export
  filePath: string; // absolute path to the .mjs file
}

// ─── Directory helpers ───────────────────────────────────────────────────────

function projectCommandDir(projectCwd: string): string {
  return join(projectCwd, ".ccpa", "commands");
}

function globalCommandDir(configDir: string): string {
  return join(configDir, ".ccpa", "commands");
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
 * Parse a SKILL.md file's YAML frontmatter and return { name, description }.
 * Returns null if the file cannot be parsed or is missing required fields.
 */
async function parseSkillMd(
  filePath: string,
  logger: pino.Logger,
): Promise<{ name: string; description: string } | null> {
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

  // Extract YAML frontmatter between the first pair of `---` delimiters
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) {
    logger.warn({ filePath }, "SKILL.md missing frontmatter block — skipping");
    return null;
  }

  const frontmatter = match[1];

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
      filePath: "", // skills have no .mjs — they fall through to the AI engine
    });
  }

  return skills;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Scan command directories and optionally the skills dir, then return the merged list.
 *
 * Precedence (lowest → highest):
 *   engine skills  <  global .ccpa/commands  <  project .ccpa/commands
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
