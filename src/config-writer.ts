import { readFileSync, writeFileSync } from "node:fs";
import { stringify as stringifyYaml } from "yaml";
import {
  type ConfigFormat,
  parseConfigContent,
  resolveConfigFile,
} from "./config.js";
import type { EngineName } from "./engine/types.js";

interface ProjectIdentifier {
  name?: string;
  cwd: string;
}

function serializeConfig(
  data: Record<string, unknown>,
  format: ConfigFormat,
): string {
  if (format === "yaml") {
    return stringifyYaml(data, { indent: 2 });
  }
  // jsonc → plain JSON on write (comments are not preserved)
  return JSON.stringify(data, null, 2);
}

export function updateProjectModel(
  configDir: string,
  project: ProjectIdentifier,
  engine: EngineName,
  model: string,
): void {
  const localResolved = resolveConfigFile(configDir, "hal.config.local");
  const baseResolved = resolveConfigFile(configDir, "hal.config");

  const target = localResolved ?? baseResolved;
  if (!target) return;

  let data: Record<string, unknown>;
  try {
    const content = readFileSync(target.path, "utf-8");
    data = parseConfigContent(content, target.format, target.path) as Record<
      string,
      unknown
    >;
  } catch {
    data = {};
  }

  const projects = data.projects as Record<string, unknown>[] | undefined;

  if (projects && Array.isArray(projects)) {
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
      const newEntry: Record<string, unknown> = {
        cwd: project.cwd,
        engine: { name: engine, model },
      };
      if (project.name) newEntry.name = project.name;
      projects.push(newEntry);
    }
  } else {
    const engineConfig = (data.engine as Record<string, unknown>) ?? {};
    engineConfig.name = engine;
    engineConfig.model = model;
    data.engine = engineConfig;
  }

  writeFileSync(target.path, serializeConfig(data, target.format), "utf-8");
}
