import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EngineName } from "./engine/types.js";

interface ProjectIdentifier {
  name?: string;
  cwd: string;
}

export function updateProjectModel(
  configDir: string,
  project: ProjectIdentifier,
  engine: EngineName,
  model: string,
): void {
  const localPath = join(configDir, "hal.config.local.json");
  const basePath = join(configDir, "hal.config.json");
  const targetPath = existsSync(localPath) ? localPath : basePath;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(readFileSync(targetPath, "utf-8"));
  } catch {
    data = {};
  }

  const projects = data.projects as Record<string, unknown>[] | undefined;

  if (projects && Array.isArray(projects)) {
    // Multi-project config — find matching entry
    const idx = projects.findIndex((p) => {
      if (project.name && p.name === project.name) return true;
      return p.cwd === project.cwd;
    });

    if (idx >= 0) {
      const entry = projects[idx] as Record<string, unknown>;
      const engineConfig = (entry.engine as Record<string, unknown>) ?? {};
      engineConfig.name = engine;
      engineConfig.model = model;
      entry.engine = engineConfig;
    } else {
      // Project not in this file — create a minimal entry
      const newEntry: Record<string, unknown> = {
        cwd: project.cwd,
        engine: { name: engine, model },
      };
      if (project.name) newEntry.name = project.name;
      projects.push(newEntry);
    }
  } else {
    // Single-project or partial override file (no projects array)
    // Patch at root level
    const engineConfig = (data.engine as Record<string, unknown>) ?? {};
    engineConfig.name = engine;
    engineConfig.model = model;
    data.engine = engineConfig;
  }

  writeFileSync(targetPath, JSON.stringify(data, null, 2), "utf-8");
}
