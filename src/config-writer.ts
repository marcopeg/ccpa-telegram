import { readFileSync, writeFileSync } from "node:fs";
import { stringify as stringifyYaml } from "yaml";
import {
  type ConfigFormat,
  parseConfigContent,
  resolveConfigFile,
} from "./config.js";
import type { EngineName } from "./engine/types.js";

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

function loadConfigData(configDir: string): {
  data: Record<string, unknown>;
  target: ReturnType<typeof resolveConfigFile>;
} {
  const localResolved = resolveConfigFile(configDir, "hal.config.local");
  const baseResolved = resolveConfigFile(configDir, "hal.config");
  const target = localResolved ?? baseResolved;
  if (!target) return { data: {}, target: null };

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
  return { data, target };
}

function getProjectEntry(
  data: Record<string, unknown>,
  projectSlug: string,
): Record<string, unknown> | undefined {
  const projects = data.projects;
  if (
    projects === null ||
    typeof projects !== "object" ||
    Array.isArray(projects)
  )
    return undefined;
  return (projects as Record<string, unknown>)[projectSlug] as
    | Record<string, unknown>
    | undefined;
}

export function updateProjectModel(
  configDir: string,
  projectSlug: string,
  engine: EngineName,
  model: string,
): void {
  const { data, target } = loadConfigData(configDir);
  if (!target) return;

  const entry = getProjectEntry(data, projectSlug);
  if (entry) {
    const engineConfig = (entry.engine as Record<string, unknown>) ?? {};
    engineConfig.name = engine;
    engineConfig.model = model;
    entry.engine = engineConfig;
  }

  writeFileSync(target.path, serializeConfig(data, target.format), "utf-8");
}

export function updateProjectEngine(
  configDir: string,
  projectSlug: string,
  engine: EngineName,
): void {
  const { data, target } = loadConfigData(configDir);
  if (!target) return;

  const entry = getProjectEntry(data, projectSlug);
  if (entry) {
    const engineConfig = (entry.engine as Record<string, unknown>) ?? {};
    engineConfig.name = engine;
    delete engineConfig.model;
    entry.engine = engineConfig;
  }

  writeFileSync(target.path, serializeConfig(data, target.format), "utf-8");
}
