import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
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

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Scan both command directories, import all .mjs files, and return the merged list.
 * Project-specific commands take precedence over global commands on name collision.
 */
export async function loadCommands(
  projectCwd: string,
  configDir: string,
  logger: pino.Logger,
): Promise<CommandEntry[]> {
  const globalDir = globalCommandDir(configDir);
  const projectDir = projectCommandDir(projectCwd);

  // Load globals first, then project-specific (project wins on collision)
  const globalEntries = await scanCommandDir(globalDir, logger);
  const projectEntries = await scanCommandDir(projectDir, logger);

  // Merge: globals first, project overwrites on collision
  const map = new Map<string, CommandEntry>();

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
