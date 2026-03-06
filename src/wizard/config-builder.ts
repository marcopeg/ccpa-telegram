import { stringify as stringifyYaml } from "yaml";
import type { ConfigFormat } from "../config.js";
import type { PartialConfig, WizardContext } from "./types.js";

export interface BuildResult {
  content: string;
  targetPath: string;
  /** Key-value pairs to append to .env (e.g. bot token). */
  envEntries?: Record<string, string>;
  /** If secretsMode=env, the env file contents we plan to write. */
  envPath?: string;
}

const DOCS_CONFIG =
  "https://github.com/marcopeg/hal/blob/main/docs/config/README.md";

/**
 * Build the final config object by merging wizard results over the existing
 * config (if any), then serialize it in the appropriate format.
 */
export function buildConfigFromResults(ctx: WizardContext): BuildResult {
  const results = ctx.results as Record<string, unknown>;
  const secretsMode =
    (results.secretsMode as "env" | "inline" | undefined) ?? "env";

  // Determine project key and name
  const projectKey =
    (results.projectKey as string | undefined) ??
    (ctx.existingConfig?.projects
      ? Object.keys(ctx.existingConfig.projects)[0]
      : undefined) ??
    "prj1";

  const projectName = results.projectName as string | undefined;

  // Start from existing config or a fresh skeleton
  const base: PartialConfig = ctx.existingConfig
    ? JSON.parse(JSON.stringify(ctx.existingConfig)) // deep clone
    : {};

  // Ensure projects map exists
  if (!base.projects) base.projects = {};
  if (!base.projects[projectKey]) base.projects[projectKey] = {};

  const project = base.projects[projectKey];

  // Apply project name
  if (projectName) {
    project.name = projectName;
  } else {
    delete project.name;
  }

  // Apply cwd
  if (results.cwd) {
    project.cwd = results.cwd as string;
  }

  // Engines enabled (providers) + default engine (globals)
  if (Array.isArray(results.enabledEngines)) {
    // Create a providers map that enables /engine switching.
    // Use null so it stays lean; runtime CLI discovery can still populate names.
    const enabled = results.enabledEngines as string[];
    base.providers = base.providers ?? ({} as unknown);
    const providers: Record<string, unknown> = {};
    for (const e of enabled) providers[e] = null;
    (base as unknown as { providers?: unknown }).providers = providers;
  }

  if (results.engine || results.model || results.session !== undefined) {
    base.globals = base.globals ?? {};
    base.globals.engine = base.globals.engine ?? {};
    const globalsEngine = base.globals.engine as {
      name?: string;
      model?: string;
      session?: unknown;
    };
    if (results.engine) globalsEngine.name = results.engine as string;
    if (results.model) globalsEngine.model = results.model as string;
    if (results.session !== undefined) {
      globalsEngine.session = results.session as boolean | "shared" | "user";
    }

    // Keep project config lean: remove project.engine when it only duplicates globals
    if (project.engine && results.engine) {
      const pe = project.engine;
      const sameName = pe.name === globalsEngine.name;
      const sameModel =
        (pe as { model?: string }).model === globalsEngine.model;
      const sameSession =
        (pe as { session?: unknown }).session === globalsEngine.session ||
        (pe as { session?: unknown }).session === undefined;
      if (sameName && sameModel && sameSession) {
        delete project.engine;
      }
    }
  }

  // Secrets: bot token + user IDs can be inline or via .env placeholders
  let envEntries: Record<string, string> | undefined;
  if (results.botToken) {
    const token = results.botToken as string;
    if (!project.telegram) project.telegram = {};
    if (secretsMode === "inline") {
      project.telegram.botToken = token;
    } else {
      // Intentional config placeholder — not a template literal
      project.telegram.botToken = "$" + "{TELEGRAM_BOT_TOKEN}";
      envEntries = { ...(envEntries ?? {}), TELEGRAM_BOT_TOKEN: token };
    }
  }

  // Apply user IDs to globals.access
  const allUserIds: number[] = [];
  if (results.userId) allUserIds.push(results.userId as number);
  if (Array.isArray(results.additionalUserIds)) {
    allUserIds.push(...(results.additionalUserIds as number[]));
  }
  if (allUserIds.length > 0) {
    base.globals = base.globals ?? {};
    base.globals.access = base.globals.access ?? {};
    if (secretsMode === "inline") {
      base.globals.access.allowedUserIds = allUserIds;
    } else {
      const placeholders: string[] = [];
      allUserIds.forEach((id, idx) => {
        const key =
          idx === 0 ? "TELEGRAM_USER_ID" : `TELEGRAM_USER_ID_${idx + 1}`;
        placeholders.push(`\${${key}}`);
        envEntries = { ...(envEntries ?? {}), [key]: String(id) };
      });
      base.globals.access.allowedUserIds = placeholders;
    }
  }

  // Serialize with fixed key order: providers, globals, projects
  const format: ConfigFormat = ctx.existingConfigFormat ?? "yaml";
  const targetPath = ctx.existingConfigPath ?? `${ctx.cwd}/hal.config.yaml`;

  let content: string;
  if (format === "yaml") {
    content = buildYamlContent(base);
  } else {
    const ordered = orderTopLevelKeys(base);
    content = `${JSON.stringify(ordered, null, 2)}\n`;
  }

  return { content, targetPath, envEntries };
}

/** Top-level key order and blank line between sections. */
const TOP_LEVEL_ORDER: (keyof PartialConfig)[] = [
  "providers",
  "globals",
  "projects",
];

function orderTopLevelKeys(config: PartialConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of TOP_LEVEL_ORDER) {
    const v = config[key as keyof PartialConfig];
    if (v !== undefined && v !== null) out[key] = v;
  }
  return out;
}

function buildYamlContent(config: PartialConfig): string {
  const header = [
    "# HAL configuration",
    `# Full config docs: ${DOCS_CONFIG}`,
    "",
  ].join("\n");
  const ordered = orderTopLevelKeys(config);
  const body = stringifyYaml(ordered, { indent: 2 });
  // Insert blank line before each top-level key except the first
  const withBlanks = body
    .replace(/\n(globals:)/m, "\n\n$1")
    .replace(/\n(projects:)/m, "\n\n$1");
  return `${header}\n${withBlanks}`;
}
