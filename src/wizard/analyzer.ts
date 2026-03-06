import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseEnv } from "dotenv";
import {
  type ConfigFormat,
  parseConfigContent,
  resolveConfigFile,
  resolveCustomEnvPaths,
} from "../config.js";
import type { PartialConfig } from "./types.js";

export interface AnalyzeResult {
  configExists: boolean;
  configPath: string | null;
  configFormat: ConfigFormat | null;
  missingFields: string[];
}

/** Placeholder pattern — e.g. "${SOME_VAR}" */
const PLACEHOLDER_RE = /^\$\{[^}]+\}$/;

function isPlaceholder(value: unknown): boolean {
  return typeof value === "string" && PLACEHOLDER_RE.test(value.trim());
}

function placeholderVar(value: unknown): string | null {
  if (!isPlaceholder(value)) return null;
  const s = (value as string).trim();
  return s.slice(2, -1).trim() || null;
}

function loadEnvFromConfigDir(configDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of [join(configDir, ".env"), join(configDir, ".env.local")]) {
    if (!existsSync(file)) continue;
    try {
      const parsed = parseEnv(readFileSync(file, "utf-8"));
      Object.assign(out, parsed);
    } catch {
      // ignore
    }
  }
  return out;
}

function loadEnvForParsedConfig(
  configDir: string,
  parsed: PartialConfig,
): Record<string, string> {
  if (typeof parsed.env === "string" && parsed.env.trim() !== "") {
    const { mainPath, localPath } = resolveCustomEnvPaths(
      configDir,
      parsed.env,
    );
    const out: Record<string, string> = {};
    for (const file of [mainPath, localPath]) {
      if (!existsSync(file)) continue;
      try {
        const parsedEnv = parseEnv(readFileSync(file, "utf-8"));
        Object.assign(out, parsedEnv);
      } catch {
        // ignore
      }
    }
    return out;
  }
  return loadEnvFromConfigDir(configDir);
}

function _hasRealUserId(ids: unknown[] | undefined): boolean {
  if (!ids || ids.length === 0) return false;
  return ids.some((id) => {
    if (typeof id === "number") return id > 0;
    if (typeof id === "string") {
      const trimmed = id.trim();
      // Reject template placeholders like "${YOUR_TELEGRAM_USER_ID}"
      if (PLACEHOLDER_RE.test(trimmed)) return false;
      const n = Number(trimmed);
      return Number.isInteger(n) && n > 0;
    }
    return false;
  });
}

function hasResolvableUserId(
  ids: unknown[] | undefined,
  env: Record<string, string>,
): boolean {
  if (!ids || ids.length === 0) return false;
  return ids.some((id) => {
    if (typeof id === "number") return id > 0;
    if (typeof id !== "string") return false;
    const trimmed = id.trim();
    if (!PLACEHOLDER_RE.test(trimmed)) {
      const n = Number(trimmed);
      return Number.isInteger(n) && n > 0;
    }
    const varName = placeholderVar(trimmed);
    if (!varName) return false;
    const raw = (process.env[varName] ?? env[varName]) || "";
    const n = Number(raw);
    return Number.isInteger(n) && n > 0;
  });
}

/**
 * Inspect an existing config (raw parse, no env substitution) and return
 * which wizard-coverable fields are missing or still placeholder values.
 */
export function analyzeConfig(cwd: string): AnalyzeResult {
  const resolved = resolveConfigFile(cwd, "hal.config");

  if (!resolved) {
    return {
      configExists: false,
      configPath: null,
      configFormat: null,
      missingFields: ["project-name", "cwd", "bot-token", "user-id", "engine"],
    };
  }

  let raw: PartialConfig;
  try {
    const content = readFileSync(resolved.path, "utf-8");
    raw = parseConfigContent(
      content,
      resolved.format,
      resolved.path,
    ) as PartialConfig;
  } catch {
    // Can't parse — treat as if all fields are missing
    return {
      configExists: true,
      configPath: resolved.path,
      configFormat: resolved.format,
      missingFields: ["project-name", "cwd", "bot-token", "user-id", "engine"],
    };
  }

  const env = loadEnvForParsedConfig(cwd, raw);

  const missing: string[] = [];

  // Inspect the first project key (wizard manages a single project)
  const projects = raw.projects ?? {};
  const projectKeys = Object.keys(projects);
  const firstProject =
    projectKeys.length > 0 ? projects[projectKeys[0]] : undefined;

  // project-name: skip if a project key already exists (gap-fill mode)
  if (projectKeys.length === 0) {
    missing.push("project-name");
  }

  // cwd: must be present and non-placeholder
  const projectCwd = firstProject?.cwd;
  if (!projectCwd || isPlaceholder(projectCwd) || projectCwd === "") {
    missing.push("cwd");
  }

  // bot-token: check first project's telegram.botToken
  const botToken = firstProject?.telegram?.botToken;
  const varName = placeholderVar(botToken);
  const placeholderResolved =
    varName != null && ((process.env[varName] ?? env[varName]) || "") !== "";
  if (!botToken || (isPlaceholder(botToken) && !placeholderResolved)) {
    missing.push("bot-token");
  }

  // user-id: check globals or first project
  const globalIds = raw.globals?.access?.allowedUserIds;
  const projectIds = firstProject?.access?.allowedUserIds;
  if (
    !hasResolvableUserId(globalIds, env) &&
    !hasResolvableUserId(projectIds, env)
  ) {
    missing.push("user-id");
  }

  // engine: check globals or first project
  const globalEngine = raw.globals?.engine?.name;
  const projectEngine = firstProject?.engine?.name;
  if (!globalEngine && !projectEngine) {
    missing.push("engine");
  }

  // session is optional; do not treat missing as incomplete (resolver defaults to true).

  return {
    configExists: true,
    configPath: resolved.path,
    configFormat: resolved.format,
    missingFields: missing,
  };
}

/**
 * Returns true when the wizard should run (config missing or incomplete).
 */
export function needsWizard(cwd: string): boolean {
  const { missingFields } = analyzeConfig(cwd);
  return missingFields.length > 0;
}
