import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { parse as parseEnv } from "dotenv";
import { z } from "zod";

// ─── Zod helpers ──────────────────────────────────────────────────────────────

const TranscriptionModelSchema = z.enum([
  "tiny",
  "tiny.en",
  "base",
  "base.en",
  "small",
  "small.en",
  "medium",
  "medium.en",
  "large-v1",
  "large",
  "large-v3-turbo",
]);

const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);

// ─── Globals schema (all fields optional) ─────────────────────────────────────

const GlobalsFileSchema = z
  .object({
    access: z
      .object({ allowedUserIds: z.array(z.number()) })
      .partial()
      .optional(),
    claude: z.object({ command: z.string() }).partial().optional(),
    logging: z
      .object({
        level: LogLevelSchema,
        flow: z.boolean(),
        persist: z.boolean(),
      })
      .partial()
      .optional(),
    rateLimit: z
      .object({ max: z.number().positive(), windowMs: z.number().positive() })
      .partial()
      .optional(),
    transcription: z
      .object({
        model: TranscriptionModelSchema,
        showTranscription: z.boolean(),
      })
      .partial()
      .optional(),
    dataDir: z.string().optional(),
  })
  .optional();

// ─── Per-project schema ────────────────────────────────────────────────────────

const ProjectFileSchema = z.object({
  name: z.string().optional(),
  cwd: z.string().min(1, "project.cwd is required"),
  telegram: z.object({
    botToken: z.string().min(1, "project.telegram.botToken is required"),
  }),
  access: z
    .object({ allowedUserIds: z.array(z.number()) })
    .partial()
    .optional(),
  claude: z.object({ command: z.string() }).partial().optional(),
  logging: z
    .object({
      level: LogLevelSchema,
      flow: z.boolean(),
      persist: z.boolean(),
    })
    .partial()
    .optional(),
  rateLimit: z
    .object({ max: z.number().positive(), windowMs: z.number().positive() })
    .partial()
    .optional(),
  transcription: z
    .object({
      model: TranscriptionModelSchema,
      showTranscription: z.boolean(),
    })
    .partial()
    .optional(),
  dataDir: z.string().optional(),
  context: z.record(z.string(), z.string()).optional(),
});

// ─── Multi-project config file schema ─────────────────────────────────────────

const MultiConfigFileSchema = z.object({
  globals: GlobalsFileSchema,
  context: z.record(z.string(), z.string()).optional(),
  projects: z
    .array(ProjectFileSchema)
    .min(1, "At least one project is required"),
});

// ─── Local config partial schema ──────────────────────────────────────────────

const LocalProjectSchema = ProjectFileSchema.partial().extend({
  name: z.string().optional(),
  cwd: z.string().optional(),
});

const LocalConfigFileSchema = z
  .object({
    globals: GlobalsFileSchema,
    context: z.record(z.string(), z.string()).optional(),
    projects: z.array(LocalProjectSchema).optional(),
  })
  .optional();

type ProjectFileEntry = z.infer<typeof ProjectFileSchema>;
type GlobalsFile = NonNullable<z.infer<typeof GlobalsFileSchema>>;
type MultiConfigFile = z.infer<typeof MultiConfigFileSchema>;
type LocalConfigFile = NonNullable<z.infer<typeof LocalConfigFileSchema>>;

// ─── Resolved project config (what the rest of the app uses) ──────────────────

export interface ResolvedProjectConfig {
  slug: string;
  name: string | undefined;
  cwd: string;
  configDir: string;
  dataDir: string;
  logDir: string;
  telegram: { botToken: string };
  access: { allowedUserIds: number[] };
  claude: { command: string };
  logging: { level: string; flow: boolean; persist: boolean };
  rateLimit: { max: number; windowMs: number };
  transcription: { model: string; showTranscription: boolean } | undefined;
  context: Record<string, string> | undefined;
}

// ─── Config load result ────────────────────────────────────────────────────────

export interface LoadedConfigResult {
  config: MultiConfigFile;
  loadedFiles: string[];
}

// ─── Slug derivation ──────────────────────────────────────────────────────────

export function deriveSlug(name: string | undefined, cwd: string): string {
  if (name) return name;
  return cwd
    .replace(/^\.\//, "") // strip leading ./
    .replace(/^\//, "") // strip leading /
    .replace(/[/\\]/g, "-") // path separators → dash
    .replace(/[^a-zA-Z0-9_-]/g, "-") // sanitize remaining chars
    .replace(/-+/g, "-") // collapse multiple dashes
    .replace(/^-|-$/g, ""); // trim leading/trailing dashes
}

// ─── dataDir resolution ────────────────────────────────────────────────────────

function resolveDataDir(
  dataDirRaw: string | undefined,
  projectCwd: string,
  configDir: string,
  slug: string,
): string {
  if (!dataDirRaw) {
    return resolve(projectCwd, ".telegrapp", "users");
  }
  if (dataDirRaw === "~") {
    return resolve(configDir, ".telegrapp", slug, "data");
  }
  if (isAbsolute(dataDirRaw)) {
    return dataDirRaw;
  }
  return resolve(projectCwd, dataDirRaw);
}

// ─── Merge: project over globals over defaults ─────────────────────────────────

export function resolveProjectConfig(
  project: ProjectFileEntry,
  globals: GlobalsFile,
  configDir: string,
  rootContext?: Record<string, string>,
): ResolvedProjectConfig {
  const resolvedCwd = isAbsolute(project.cwd)
    ? project.cwd
    : resolve(configDir, project.cwd);

  const slug = deriveSlug(project.name, project.cwd);
  const logDir = resolve(configDir, ".telegrapp", slug, "logs");

  const dataDir = resolveDataDir(
    project.dataDir ?? globals.dataDir,
    resolvedCwd,
    configDir,
    slug,
  );

  const hasTranscription =
    project.transcription !== undefined || globals.transcription !== undefined;

  const hasContext = rootContext !== undefined || project.context !== undefined;

  return {
    slug,
    name: project.name,
    cwd: resolvedCwd,
    configDir,
    dataDir,
    logDir,
    telegram: { botToken: project.telegram.botToken },
    access: {
      allowedUserIds:
        project.access?.allowedUserIds ?? globals.access?.allowedUserIds ?? [],
    },
    claude: {
      command: project.claude?.command ?? globals.claude?.command ?? "claude",
    },
    logging: {
      level: project.logging?.level ?? globals.logging?.level ?? "info",
      flow: project.logging?.flow ?? globals.logging?.flow ?? true,
      persist: project.logging?.persist ?? globals.logging?.persist ?? false,
    },
    rateLimit: {
      max: project.rateLimit?.max ?? globals.rateLimit?.max ?? 10,
      windowMs:
        project.rateLimit?.windowMs ?? globals.rateLimit?.windowMs ?? 60000,
    },
    transcription: hasTranscription
      ? {
          model:
            project.transcription?.model ??
            globals.transcription?.model ??
            "base.en",
          showTranscription:
            project.transcription?.showTranscription ??
            globals.transcription?.showTranscription ??
            true,
        }
      : undefined,
    context: hasContext ? { ...rootContext, ...project.context } : undefined,
  };
}

// ─── Boot-time uniqueness validation ──────────────────────────────────────────

export function validateProjects(projects: ResolvedProjectConfig[]): void {
  const cwds = new Set<string>();
  const tokens = new Set<string>();
  const names = new Set<string>();

  for (const project of projects) {
    if (cwds.has(project.cwd)) {
      console.error(
        `Configuration error: duplicate project cwd "${project.cwd}". Each project must have a unique cwd.`,
      );
      process.exit(1);
    }
    cwds.add(project.cwd);

    if (tokens.has(project.telegram.botToken)) {
      console.error(
        `Configuration error: duplicate botToken in project "${project.slug}". Each project must use a unique Telegram bot token.`,
      );
      process.exit(1);
    }
    tokens.add(project.telegram.botToken);

    if (project.name) {
      if (names.has(project.name)) {
        console.error(
          `Configuration error: duplicate project name "${project.name}". Each named project must have a unique name.`,
        );
        process.exit(1);
      }
      names.add(project.name);
    }
  }
}

// ─── Phase 1: .env file loading ───────────────────────────────────────────────

interface EnvSources {
  vars: Record<string, string>;
  loadedFiles: string[];
}

function loadEnvFiles(configDir: string, projectCwds: string[]): EnvSources {
  const loadedFiles: string[] = [];
  const vars: Record<string, string> = {};

  // Candidates in ascending priority order (later entries win)
  const candidates: string[] = [];

  // Per-project .env files (lower priority than config-dir)
  for (const cwd of projectCwds) {
    candidates.push(join(cwd, ".env"));
    candidates.push(join(cwd, ".env.local"));
  }

  // Config-dir .env files (higher priority)
  candidates.push(join(configDir, ".env"));
  candidates.push(join(configDir, ".env.local"));

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    try {
      const content = readFileSync(filePath, "utf-8");
      const parsed = parseEnv(content);
      Object.assign(vars, parsed);
      loadedFiles.push(filePath);
    } catch {
      // non-fatal: missing read permission etc. — skip silently
    }
  }

  return { vars, loadedFiles };
}

// ─── Phase 2: Variable substitution ──────────────────────────────────────────

function substituteEnvVars(
  obj: unknown,
  env: Record<string, string>,
  path = "",
): unknown {
  if (typeof obj === "string") {
    return obj.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
      const value = env[varName] ?? process.env[varName];
      if (value === undefined) {
        console.error(
          `Configuration error: environment variable "${varName}" is not defined\n` +
            `  (referenced in field: ${path || "<root>"})`,
        );
        process.exit(1);
      }
      return value;
    });
  }

  if (Array.isArray(obj)) {
    return obj.map((item, i) =>
      substituteEnvVars(item, env, path ? `${path}[${i}]` : `[${i}]`),
    );
  }

  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Skip "context" keys — their ${} patterns are resolved at message time
      // by the context resolver, not at boot time as env vars.
      if (key === "context") {
        result[key] = value;
        continue;
      }
      result[key] = substituteEnvVars(
        value,
        env,
        path ? `${path}.${key}` : key,
      );
    }
    return result;
  }

  return obj;
}

// ─── Phase 3: Deep merge ──────────────────────────────────────────────────────

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base } as Record<string, unknown>;

  for (const [key, overrideVal] of Object.entries(override)) {
    if (overrideVal === undefined) continue;
    const baseVal = result[key];
    if (
      overrideVal !== null &&
      typeof overrideVal === "object" &&
      !Array.isArray(overrideVal) &&
      baseVal !== null &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as object,
        overrideVal as Partial<object>,
      );
    } else {
      result[key] = overrideVal;
    }
  }

  return result as T;
}

// ─── Phase 3: Local config loading ───────────────────────────────────────────

function loadLocalConfig(configDir: string): LocalConfigFile | null {
  const localPath = join(configDir, ".telegrapp", "config.local.json");
  if (!existsSync(localPath)) return null;

  let raw: unknown;
  try {
    const content = readFileSync(localPath, "utf-8");
    raw = JSON.parse(content);
  } catch (err) {
    console.error(
      `Configuration error: failed to read .telegrapp/config.local.json — ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  const result = LocalConfigFileSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(
      `Configuration error in .telegrapp/config.local.json:\n${issues}`,
    );
    process.exit(1);
  }

  return result.data ?? null;
}

// ─── Phase 3: Merge local into base ──────────────────────────────────────────

function mergeLocalIntoBase(
  base: MultiConfigFile,
  local: LocalConfigFile,
): MultiConfigFile {
  const mergedGlobals =
    local.globals !== undefined
      ? deepMerge(base.globals ?? {}, local.globals)
      : base.globals;

  const mergedContext =
    local.context !== undefined
      ? base.context
        ? { ...base.context, ...local.context }
        : local.context
      : base.context;

  if (!local.projects || local.projects.length === 0) {
    return { ...base, globals: mergedGlobals, context: mergedContext };
  }

  const mergedProjects = [...base.projects] as ProjectFileEntry[];

  for (const localProject of local.projects) {
    const matchKey = localProject.name ?? localProject.cwd;

    const idx = mergedProjects.findIndex((bp) => {
      if (localProject.name) return bp.name === localProject.name;
      if (localProject.cwd) return bp.cwd === localProject.cwd;
      return false;
    });

    if (idx === -1) {
      console.error(
        `Configuration error: local project "${matchKey}" not found in .telegrapp/config.json.\n` +
          `  Every entry in .telegrapp/config.local.json projects must match a base project by name or cwd.`,
      );
      process.exit(1);
    }

    mergedProjects[idx] = deepMerge(
      mergedProjects[idx],
      localProject as Partial<ProjectFileEntry>,
    );
  }

  return {
    globals: mergedGlobals,
    context: mergedContext,
    projects: mergedProjects,
  };
}

// ─── Phase 4: Config file loading (public API) ────────────────────────────────

export function loadMultiConfig(configDir: string): LoadedConfigResult {
  const configPath = join(configDir, ".telegrapp", "config.json");
  const localPath = join(configDir, ".telegrapp", "config.local.json");
  const loadedFiles: string[] = [];

  // 1. Load base config
  if (!existsSync(configPath)) {
    console.error(
      `Configuration error: .telegrapp/config.json not found in ${configDir}\n` +
        `Run "npx @marcopeg/telegrapp init" to create one.`,
    );
    process.exit(1);
  }

  let rawBase: unknown;
  try {
    const content = readFileSync(configPath, "utf-8");
    rawBase = JSON.parse(content);
  } catch (err) {
    console.error(
      `Configuration error: failed to read .telegrapp/config.json — ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  loadedFiles.push(configPath);

  // 2. Validate base config schema
  const baseResult = MultiConfigFileSchema.safeParse(rawBase);
  if (!baseResult.success) {
    const issues = baseResult.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`Configuration error in .telegrapp/config.json:\n${issues}`);
    process.exit(1);
  }

  let merged = baseResult.data;

  // 3. Load and merge local config
  const localConfig = loadLocalConfig(configDir);
  if (localConfig !== null) {
    loadedFiles.push(localPath);
    merged = mergeLocalIntoBase(merged, localConfig);
  }

  // 4. Load .env files (using raw cwds from merged config for path resolution)
  const rawCwds = merged.projects.map((p) =>
    isAbsolute(p.cwd) ? p.cwd : resolve(configDir, p.cwd),
  );
  const envSources = loadEnvFiles(configDir, rawCwds);

  // 5. Substitute env vars in the merged raw object (before final Zod pass)
  const substituted = substituteEnvVars(
    merged,
    envSources.vars,
  ) as MultiConfigFile;

  // 6. Re-validate after substitution to catch required fields left empty
  const finalResult = MultiConfigFileSchema.safeParse(substituted);
  if (!finalResult.success) {
    const issues = finalResult.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(
      `Configuration error after environment variable substitution:\n${issues}`,
    );
    process.exit(1);
  }

  return {
    config: finalResult.data,
    loadedFiles: [...loadedFiles, ...envSources.loadedFiles],
  };
}
