import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { parse as parseEnv } from "dotenv";
import stripJsonComments from "strip-json-comments";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { isCliAvailable } from "./engine/cli-available.js";
import { getEngineSessionCapabilities } from "./engine/registry.js";

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

const EngineNameSchema = z.enum([
  "claude",
  "copilot",
  "codex",
  "opencode",
  "cursor",
  "antigravity",
]);

const CodexEngineConfigSchema = z
  .object({
    networkAccess: z.boolean(),
    fullDiskAccess: z.boolean(),
    dangerouslyEnableYolo: z.boolean(),
  })
  .partial()
  .optional();

const AntigravityEngineConfigSchema = z
  .object({
    approvalMode: z.enum(["default", "auto_edit", "yolo"]),
    sandbox: z.boolean(),
  })
  .partial()
  .optional();

/** Resolved session mode: false = stateless, true = adapter default, "shared" = force shared, "user" = force per-user (rejected at boot for OpenCode/Copilot). */
export type SessionMode = false | true | "shared" | "user";

const SessionSchema = z
  .union([z.boolean(), z.enum(["shared", "user"])])
  .optional();

const EngineConfigSchema = z
  .object({
    name: EngineNameSchema,
    command: z.string(),
    model: z.string(),
    session: SessionSchema,
    sessionMsg: z.string(),
    codex: CodexEngineConfigSchema,
    antigravity: AntigravityEngineConfigSchema,
  })
  .partial()
  .optional();

const CommandMessageSchema = z
  .object({
    text: z.string().optional(),
    from: z.string().optional(),
  })
  .refine((m) => !!m.text !== !!m.from, {
    message: "commands.*.message must have exactly one of 'text' or 'from'",
  });

const StartConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    session: z.object({ reset: z.boolean() }).partial().optional(),
    message: CommandMessageSchema.optional(),
  })
  .optional();

const SimpleCommandConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    message: CommandMessageSchema.optional(),
  })
  .optional();

const ResetCommandConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    session: z.object({ reset: z.boolean() }).partial().optional(),
    message: z
      .object({
        confirm: z.string().optional(),
        done: z.string().optional(),
      })
      .optional(),
    timeout: z.number().positive().optional(),
  })
  .optional();

const GitConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
  })
  .optional();

const NpmConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    whitelist: z.array(z.string()).optional(),
    blacklist: z.array(z.string()).optional(),
    timeoutMs: z.number().positive().optional(),
    maxOutputChars: z.number().positive().optional(),
    sendAsFileWhenLarge: z.boolean().optional(),
  })
  .optional();

const InfoConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    cwd: z.boolean().optional(),
    engineModel: z.boolean().optional(),
    session: z.boolean().optional(),
    context: z.boolean().optional(),
  })
  .optional();

const CommandsConfigSchema = z
  .object({
    start: StartConfigSchema,
    help: SimpleCommandConfigSchema,
    reset: ResetCommandConfigSchema,
    clean: SimpleCommandConfigSchema,
    info: InfoConfigSchema,
    git: GitConfigSchema,
    model: GitConfigSchema,
    engine: GitConfigSchema,
    npm: NpmConfigSchema,
  })
  .optional();

const _ProviderModelSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  default: z.boolean().optional(),
});

// Allow null/empty keys (e.g. "providers:\n  opencode:\n  codex:") so /engine can list those engines; coerce to [].
// Accept any value per key (array, null, undefined, or junk from merge) so "key not there" = engine disabled, no validation error.
const ProviderListValueSchema = z
  .unknown()
  .transform((v) => (Array.isArray(v) ? v : []));

// Only keys present in the input are kept; invalid engine names are dropped.
// Accept null (e.g. YAML "providers:" with no sub-keys) and coerce to {} so engine/model are disabled.
const ProvidersConfigSchema = z
  .union([z.record(z.string(), ProviderListValueSchema), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null)
      return {} as Partial<
        Record<
          z.infer<typeof EngineNameSchema>,
          z.infer<typeof ProviderListValueSchema>
        >
      >;
    const out: Record<string, z.infer<typeof ProviderListValueSchema>> = {};
    for (const k of Object.keys(v)) {
      if (EngineNameSchema.safeParse(k).success) out[k] = v[k];
    }
    return out as Partial<
      Record<
        z.infer<typeof EngineNameSchema>,
        z.infer<typeof ProviderListValueSchema>
      >
    >;
  });

const AllowedUserIdSchema = z.union([z.number(), z.string()]);
const AccessSchema = z
  .object({
    allowedUserIds: z.array(AllowedUserIdSchema),
    dangerouslyAllowUnrestrictedAccess: z.boolean(),
  })
  .partial()
  .optional();

const GlobalsFileSchema = z
  .object({
    access: AccessSchema,
    engine: EngineConfigSchema,
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
    commands: CommandsConfigSchema,
  })
  .optional();

// ─── Project map key (slug-like: safe for default cwd path segment) ─────────────

const PROJECT_KEY_REGEX = /^[a-zA-Z0-9_-]+$/;

/** Project map keys must be slug-like so default cwd is a safe path segment. */
const ProjectKeySchema = z
  .string()
  .regex(
    PROJECT_KEY_REGEX,
    "project key must be slug-like (letters, numbers, dashes, underscores only)",
  );

// ─── Per-project schema ────────────────────────────────────────────────────────

const ProjectFileSchema = z.object({
  name: z.string().optional(),
  active: z.boolean().optional(),
  cwd: z.string().min(1, "project.cwd must be non-empty when set").optional(),
  telegram: z.object({
    botToken: z.string().min(1, "project.telegram.botToken is required"),
  }),
  access: AccessSchema,
  engine: EngineConfigSchema,
  providers: ProvidersConfigSchema,
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
  commands: CommandsConfigSchema,
});

// ─── Multi-project config file schema ─────────────────────────────────────────

const ProjectsMapSchema = z
  .record(ProjectKeySchema, ProjectFileSchema)
  .refine((rec) => Object.keys(rec).length >= 1, {
    message: "At least one project is required",
  });

const MultiConfigFileSchema = z.object({
  env: z.string().optional(),
  globals: GlobalsFileSchema,
  providers: ProvidersConfigSchema,
  context: z.record(z.string(), z.string()).optional(),
  projects: ProjectsMapSchema,
});

// ─── Local config partial schema ──────────────────────────────────────────────

const LocalProjectSchema = ProjectFileSchema.partial().extend({
  name: z.string().optional(),
  cwd: z.string().optional(),
});

const LocalConfigFileSchema = z
  .object({
    env: z.string().optional(),
    globals: GlobalsFileSchema,
    providers: ProvidersConfigSchema,
    context: z.record(z.string(), z.string()).optional(),
    projects: z.record(ProjectKeySchema, LocalProjectSchema).optional(),
  })
  .optional();

type ProjectFileEntry = z.infer<typeof ProjectFileSchema>;
type GlobalsFile = NonNullable<z.infer<typeof GlobalsFileSchema>>;
type MultiConfigFile = z.infer<typeof MultiConfigFileSchema>;
type LocalConfigFile = NonNullable<z.infer<typeof LocalConfigFileSchema>>;

// ─── Resolved project config (what the rest of the app uses) ──────────────────

export type EngineName = z.infer<typeof EngineNameSchema>;

export interface ProviderModel {
  name: string;
  description?: string;
  default?: boolean;
}

export interface ResolvedProjectConfig {
  slug: string;
  name: string | undefined;
  cwd: string;
  configDir: string;
  dataDir: string;
  logDir: string;
  telegram: { botToken: string };
  access: {
    allowedUserIds: number[];
    dangerouslyAllowUnrestrictedAccess: boolean;
  };
  engine: EngineName;
  engineCommand: string | undefined;
  engineModel: string | undefined;
  engineSession: SessionMode;
  engineSessionMsg: string;
  codex: {
    networkAccess: boolean;
    fullDiskAccess: boolean;
    dangerouslyEnableYolo: boolean;
  };
  antigravity: {
    approvalMode: "default" | "auto_edit" | "yolo";
    sandbox: boolean;
  };
  logging: { level: string; flow: boolean; persist: boolean };
  rateLimit: { max: number; windowMs: number };
  transcription: { model: string; showTranscription: boolean } | undefined;
  context: Record<string, string> | undefined;
  providerModels: ProviderModel[];
  providerDefaultModel: string | undefined;
  availableEngines: EngineName[];
  commands: {
    start: { enabled: boolean; sessionReset: boolean; message?: string };
    help: { enabled: boolean; message?: string };
    reset: {
      enabled: boolean;
      sessionReset: boolean;
      message: { confirm?: string; done?: string };
      timeout: number;
    };
    clean: { enabled: boolean; message?: string };
    info: {
      enabled: boolean;
      cwd: boolean;
      engineModel: boolean;
      session: boolean;
      context: boolean;
    };
    git: { enabled: boolean };
    model: { enabled: boolean };
    engine: { enabled: boolean };
    npm: {
      enabled: boolean;
      whitelist: string[] | undefined;
      blacklist: string[] | undefined;
      timeoutMs: number;
      maxOutputChars: number;
      sendAsFileWhenLarge: boolean;
    };
  };
}

// ─── Config load result & errors ───────────────────────────────────────────────

export class ConfigLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigLoadError";
  }
}

export interface LoadedConfigResult {
  config: MultiConfigFile;
  loadedFiles: string[];
}

// Telegram user ID range (Bot API): 1 to 0xFFFFFFFFF inclusive
const TELEGRAM_USER_ID_MAX = 0xfffffffff;

function parseTelegramUserId(value: string | number, path: string): number {
  const str = typeof value === "string" ? value : String(value);
  const num = Number(str);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    throw new ConfigLoadError(
      `Configuration error: invalid allowedUserIds entry at ${path}: "${str}" is not a valid integer`,
    );
  }
  if (typeof value === "string" && String(num) !== str) {
    throw new ConfigLoadError(
      `Configuration error: invalid allowedUserIds entry at ${path}: "${str}" (expected exact integer form, no spaces/decimals/leading zeros)`,
    );
  }
  if (num < 1 || num > TELEGRAM_USER_ID_MAX) {
    throw new ConfigLoadError(
      `Configuration error: invalid allowedUserIds entry at ${path}: ${num} is outside Telegram user ID range (1–${TELEGRAM_USER_ID_MAX})`,
    );
  }
  return num;
}

/** Set name/cwd from map key when omitted. Mutates entries in place. */
function normalizeProjectMap(projects: Record<string, ProjectFileEntry>): void {
  for (const [key, entry] of Object.entries(projects)) {
    (entry as { name: string | undefined }).name = entry.name ?? key;
    (entry as { cwd: string }).cwd = entry.cwd ?? key;
  }
}

function normalizeAllowedUserIdsInConfig(config: MultiConfigFile): void {
  const globalsAccess = config.globals?.access;
  if (globalsAccess?.allowedUserIds != null) {
    const raw = globalsAccess.allowedUserIds;
    const normalized: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      normalized.push(
        parseTelegramUserId(raw[i], `globals.access.allowedUserIds[${i}]`),
      );
    }
    (globalsAccess as { allowedUserIds: number[] }).allowedUserIds = normalized;
  }
  for (const [key, project] of Object.entries(config.projects)) {
    const access = project.access;
    if (access?.allowedUserIds == null) continue;
    const raw = access.allowedUserIds;
    const normalized: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      normalized.push(
        parseTelegramUserId(
          raw[i],
          `projects.${key}.access.allowedUserIds[${i}]`,
        ),
      );
    }
    (access as { allowedUserIds: number[] }).allowedUserIds = normalized;
  }
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
    return resolve(projectCwd, ".hal", "users");
  }
  if (dataDirRaw === "~") {
    return resolve(configDir, ".hal", slug, "data");
  }
  if (isAbsolute(dataDirRaw)) {
    return dataDirRaw;
  }
  return resolve(projectCwd, dataDirRaw);
}

// ─── Merge: project over globals over defaults ─────────────────────────────────

export function resolveProjectConfig(
  key: string,
  project: ProjectFileEntry,
  globals: GlobalsFile,
  configDir: string,
  rootContext?: Record<string, string>,
  providers?: z.infer<typeof ProvidersConfigSchema>,
  /** When no providers key in config, use this list (e.g. from getAvailableEnginesFromCli()). */
  enginesWhenNoProviders?: EngineName[],
): ResolvedProjectConfig {
  const slug = key;
  const name = project.name ?? key;
  const cwd = project.cwd ?? key;
  const resolvedCwd = isAbsolute(cwd) ? cwd : resolve(configDir, cwd);
  const logDir = resolve(configDir, ".hal", "logs", slug);

  const dataDir = resolveDataDir(
    project.dataDir ?? globals.dataDir,
    resolvedCwd,
    configDir,
    slug,
  );

  const hasTranscription =
    project.transcription !== undefined || globals.transcription !== undefined;

  const hasContext = rootContext !== undefined || project.context !== undefined;

  function resolveMessageTemplate(
    msg: { text?: string; from?: string },
    label: string,
  ): string {
    if (msg.from) {
      const filePath = resolve(resolvedCwd, msg.from);
      if (!existsSync(filePath)) {
        throw new ConfigLoadError(
          `Configuration error: ${label}.message.from file not found: ${filePath}`,
        );
      }
      try {
        return readFileSync(filePath, "utf-8");
      } catch (err) {
        throw new ConfigLoadError(
          `Configuration error: cannot read ${label}.message.from file: ${filePath} — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return msg.text!;
  }

  // Resolve engine and provider models early (needed for command enabled flags)
  const rawEngineName = project.engine?.name ?? globals.engine?.name;
  if (!rawEngineName) {
    throw new ConfigLoadError(
      `Configuration error: project "${key}" has no engine configured. ` +
        "Set engine.name in the project or in globals.",
    );
  }
  const engineName = rawEngineName as EngineName;

  const mergedProviders = {
    ...(providers ?? {}),
    ...(project.providers ?? {}),
  };
  // When no providers key: use discovered engines from CLI (if provided). Otherwise use providers keys.
  const availableEngines =
    Object.keys(mergedProviders).length > 0
      ? (Object.keys(mergedProviders) as EngineName[])
      : (enginesWhenNoProviders ?? []);

  const rawProviderModels =
    project.providers?.[engineName] ?? providers?.[engineName] ?? [];

  const providerModels: ProviderModel[] = rawProviderModels.map((m) => ({
    name: m.name,
    description: m.description,
    default: m.default,
  }));

  const defaultEntries = providerModels.filter((m) => m.default === true);
  const providerDefaultModel =
    defaultEntries.length === 1 ? defaultEntries[0].name : undefined;

  // Resolve command enabled flags (project > globals > default)
  const rawStart = project.commands?.start ?? globals.commands?.start;
  const rawHelp = project.commands?.help ?? globals.commands?.help;
  const rawReset = project.commands?.reset ?? globals.commands?.reset;
  const rawClean = project.commands?.clean ?? globals.commands?.clean;

  // Enable /model when we have a config list, or when the engine supports self-discovery and its CLI is available
  const effectiveEngineCommand =
    project.engine?.command ?? globals.engine?.command ?? undefined;
  const defaultCommandForEngine =
    engineName === "opencode"
      ? "opencode"
      : engineName === "cursor"
        ? "agent"
        : null;
  const modelCliCommand = effectiveEngineCommand ?? defaultCommandForEngine;
  const selfDiscoveryEnabled =
    rawProviderModels.length === 0 &&
    (engineName === "opencode" || engineName === "cursor") &&
    modelCliCommand !== null &&
    isCliAvailable(modelCliCommand);
  const modelEnabled =
    (project.commands?.model?.enabled ??
      globals.commands?.model?.enabled ??
      true) &&
    availableEngines.length > 0 &&
    (providerModels.length > 1 || selfDiscoveryEnabled);

  const engineEnabled =
    (project.commands?.engine?.enabled ??
      globals.commands?.engine?.enabled ??
      true) &&
    availableEngines.length > 1;

  const resolvedCommands: ResolvedProjectConfig["commands"] = {
    start: {
      enabled:
        project.commands?.start?.enabled ??
        globals.commands?.start?.enabled ??
        true,
      sessionReset: rawStart?.session?.reset ?? false,
      message: rawStart?.message
        ? resolveMessageTemplate(rawStart.message, "commands.start")
        : undefined,
    },
    help: {
      enabled:
        project.commands?.help?.enabled ??
        globals.commands?.help?.enabled ??
        true,
      message: rawHelp?.message
        ? resolveMessageTemplate(rawHelp.message, "commands.help")
        : undefined,
    },
    reset: {
      enabled:
        project.commands?.reset?.enabled ??
        globals.commands?.reset?.enabled ??
        true,
      sessionReset: rawReset?.session?.reset ?? false,
      message: {
        confirm: rawReset?.message?.confirm,
        done: rawReset?.message?.done,
      },
      timeout: rawReset?.timeout ?? 60,
    },
    clean: {
      enabled:
        project.commands?.clean?.enabled ??
        globals.commands?.clean?.enabled ??
        true,
      message: rawClean?.message
        ? resolveMessageTemplate(rawClean.message, "commands.clean")
        : undefined,
    },
    info: {
      enabled:
        project.commands?.info?.enabled ??
        globals.commands?.info?.enabled ??
        true,
      cwd: project.commands?.info?.cwd ?? globals.commands?.info?.cwd ?? true,
      engineModel:
        project.commands?.info?.engineModel ??
        globals.commands?.info?.engineModel ??
        true,
      session:
        project.commands?.info?.session ??
        globals.commands?.info?.session ??
        true,
      context:
        project.commands?.info?.context ??
        globals.commands?.info?.context ??
        true,
    },
    git: {
      enabled:
        project.commands?.git?.enabled ??
        globals.commands?.git?.enabled ??
        false,
    },
    model: { enabled: modelEnabled },
    engine: { enabled: engineEnabled },
    npm: {
      enabled:
        project.commands?.npm?.enabled ??
        globals.commands?.npm?.enabled ??
        false,
      whitelist:
        project.commands?.npm?.whitelist ??
        globals.commands?.npm?.whitelist ??
        undefined,
      blacklist:
        project.commands?.npm?.blacklist ??
        globals.commands?.npm?.blacklist ??
        undefined,
      timeoutMs:
        project.commands?.npm?.timeoutMs ??
        globals.commands?.npm?.timeoutMs ??
        60_000,
      maxOutputChars:
        project.commands?.npm?.maxOutputChars ??
        globals.commands?.npm?.maxOutputChars ??
        4000,
      sendAsFileWhenLarge:
        project.commands?.npm?.sendAsFileWhenLarge ??
        globals.commands?.npm?.sendAsFileWhenLarge ??
        true,
    },
  };

  return {
    slug,
    name,
    cwd: resolvedCwd,
    configDir,
    dataDir,
    logDir,
    telegram: { botToken: project.telegram.botToken },
    access: {
      allowedUserIds: ((project.access !== undefined
        ? project.access.allowedUserIds
        : globals.access?.allowedUserIds) ?? []) as number[],
      dangerouslyAllowUnrestrictedAccess:
        (project.access !== undefined
          ? project.access.dangerouslyAllowUnrestrictedAccess
          : globals.access?.dangerouslyAllowUnrestrictedAccess) ?? false,
    },
    engine: engineName,
    engineCommand: project.engine?.command ?? globals.engine?.command,
    // Only inherit globals' model when the project uses the same engine; otherwise
    // leave model undefined so the project's engine uses its own default (avoids
    // e.g. passing opencode's model to a copilot project that has no model set).
    engineModel: (() => {
      if (project.engine?.model !== undefined) return project.engine.model;
      const globalsEngineName = globals.engine?.name;
      if (
        globalsEngineName !== undefined &&
        engineName === globalsEngineName &&
        globals.engine?.model !== undefined
      ) {
        return globals.engine.model;
      }
      return undefined;
    })(),
    engineSession: (() => {
      const raw = project.engine?.session ?? globals.engine?.session ?? true;
      const mode: SessionMode = raw === undefined ? true : (raw as SessionMode);
      const sessionCaps = getEngineSessionCapabilities(engineName);
      if (mode === "user" && !sessionCaps.supportsUserIsolation) {
        throw new ConfigLoadError(
          `Configuration error: engine.session "user" is not supported by the ${engineName} adapter. ` +
            `Use true or "shared". See docs/config/session/README.md.`,
        );
      }
      return mode;
    })(),
    engineSessionMsg:
      project.engine?.sessionMsg ?? globals.engine?.sessionMsg ?? "hi!",
    codex: {
      networkAccess:
        project.engine?.codex?.networkAccess ??
        globals.engine?.codex?.networkAccess ??
        false,
      fullDiskAccess:
        project.engine?.codex?.fullDiskAccess ??
        globals.engine?.codex?.fullDiskAccess ??
        false,
      dangerouslyEnableYolo:
        project.engine?.codex?.dangerouslyEnableYolo ??
        globals.engine?.codex?.dangerouslyEnableYolo ??
        false,
    },
    antigravity: {
      approvalMode:
        project.engine?.antigravity?.approvalMode ??
        globals.engine?.antigravity?.approvalMode ??
        "yolo",
      sandbox:
        project.engine?.antigravity?.sandbox ??
        globals.engine?.antigravity?.sandbox ??
        false,
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
    providerModels,
    providerDefaultModel,
    availableEngines,
    context: hasContext ? { ...rootContext, ...project.context } : undefined,
    commands: resolvedCommands,
  };
}

// ─── Boot-time uniqueness validation ──────────────────────────────────────────

export function validateProjects(projects: ResolvedProjectConfig[]): void {
  const cwds = new Set<string>();
  const tokens = new Set<string>();
  const names = new Set<string>();

  for (const project of projects) {
    if (cwds.has(project.cwd)) {
      throw new ConfigLoadError(
        `Configuration error: duplicate project cwd "${project.cwd}". Each project must have a unique cwd.`,
      );
    }
    cwds.add(project.cwd);

    if (tokens.has(project.telegram.botToken)) {
      throw new ConfigLoadError(
        `Configuration error: duplicate botToken in project "${project.slug}". Each project must use a unique Telegram bot token.`,
      );
    }
    tokens.add(project.telegram.botToken);

    if (project.name) {
      if (names.has(project.name)) {
        throw new ConfigLoadError(
          `Configuration error: duplicate project name "${project.name}". Each named project must have a unique name.`,
        );
      }
      names.add(project.name);
    }

    // When providers defines the allowed engines, each project's engine must be in that list.
    if (
      project.availableEngines.length > 0 &&
      !project.availableEngines.includes(project.engine)
    ) {
      const list = project.availableEngines.join(", ");
      throw new ConfigLoadError(
        `Configuration error: project "${project.slug}" uses engine "${project.engine}", but \`providers\` only allows: ${list}. ` +
          "Set `engine.name` to one of these, or add the engine to `providers`.",
      );
    }
  }
}

// ─── Boot-time access policy validation ───────────────────────────────────────

export function validateAccessPolicies(
  projects: ResolvedProjectConfig[],
): void {
  const errors: string[] = [];

  for (const project of projects) {
    const { allowedUserIds, dangerouslyAllowUnrestrictedAccess } =
      project.access;
    const hasUsers = allowedUserIds.length > 0;
    const hasUnsafe = dangerouslyAllowUnrestrictedAccess === true;

    if (!hasUsers && !hasUnsafe) {
      errors.push(
        `Project "${project.slug}": no access policy configured. ` +
          "Set access.allowedUserIds or access.dangerouslyAllowUnrestrictedAccess.",
      );
    }
  }

  if (errors.length > 0) {
    throw new ConfigLoadError(
      `Configuration error: invalid access policy\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }
}

// ─── Boot-time provider default uniqueness ────────────────────────────────────

const PROVIDER_ENGINE_KEYS = [
  "claude",
  "copilot",
  "codex",
  "opencode",
  "cursor",
  "antigravity",
] as const;

function countProviderDefaults(
  list: Array<{ default?: boolean }> | undefined,
): number {
  if (!Array.isArray(list)) return 0;
  return list.filter((m) => m.default === true).length;
}

/**
 * Validates that at most one model per providers.<engine> list has default: true.
 * Call after config load and env substitution, before resolving project configs.
 */
export function validateProviderDefaultUniqueness(
  config: MultiConfigFile,
): void {
  const topProviders = config.providers;
  if (topProviders) {
    for (const engine of PROVIDER_ENGINE_KEYS) {
      const list = topProviders[engine];
      const n = countProviderDefaults(list);
      if (n > 1) {
        throw new ConfigLoadError(
          `Configuration error: at most one model in providers.${engine} may have default: true (found ${n}).`,
        );
      }
    }
  }

  for (const [key, project] of Object.entries(config.projects)) {
    const projectProviders = project.providers;
    if (!projectProviders) continue;
    const projectLabel = project.name ?? key;
    for (const engine of PROVIDER_ENGINE_KEYS) {
      const list = projectProviders[engine];
      const n = countProviderDefaults(list);
      if (n > 1) {
        throw new ConfigLoadError(
          `Configuration error: at most one model in projects["${key}"].providers.${engine} may have default: true (found ${n}). Project: ${projectLabel}.`,
        );
      }
    }
  }
}

// ─── Custom env path resolution ───────────────────────────────────────────────

/**
 * Resolves the custom env file path from config. Relative paths are resolved
 * against configDir; absolute paths are used as-is after tilde expansion.
 * Returns the main file path and its .local sibling path (same directory,
 * base filename + ".local").
 */
export function resolveCustomEnvPaths(
  configDir: string,
  envRaw: string,
): { mainPath: string; localPath: string } {
  let expanded = envRaw.trim();
  if (expanded.startsWith("~")) {
    const rest = expanded.slice(1);
    const home = homedir();
    expanded =
      rest === "" || rest.startsWith("/") ? join(home, rest) : join(home, rest);
  }
  const mainPath = isAbsolute(expanded)
    ? resolve(expanded)
    : resolve(configDir, expanded);
  const localPath = join(dirname(mainPath), `${basename(mainPath)}.local`);
  return { mainPath: resolve(mainPath), localPath: resolve(localPath) };
}

// ─── Phase 1: .env file loading ───────────────────────────────────────────────

/** Used in env-related ConfigLoadError messages. */
const ENV_DOCS_LINK =
  "https://github.com/marcopeg/hal/blob/main/docs/config/README.md#environment-variable-substitution";

interface EnvSources {
  vars: Record<string, string>;
  loadedFiles: string[];
}

function loadEnvFiles(
  configDir: string,
  options: { envPath?: string },
): EnvSources {
  const loadedFiles: string[] = [];
  const vars: Record<string, string> = {};

  const configDirEnv = join(configDir, ".env");
  const configDirEnvLocal = join(configDir, ".env.local");

  if (options.envPath !== undefined) {
    // Explicit custom env: only the configured file and its .local sibling.
    const mainPath = resolve(options.envPath);
    const localPath = join(dirname(mainPath), `${basename(mainPath)}.local`);

    // Conflict: config specifies a different file but config-dir has .env or .env.local
    if (
      mainPath !== resolve(configDirEnv) &&
      (existsSync(configDirEnv) || existsSync(configDirEnvLocal))
    ) {
      throw new ConfigLoadError(
        `Configuration error: \`env\` is set to a custom file, but the config directory also has .env or .env.local. ` +
          "Use only one source — either remove `env` and use config-dir .env, or remove/rename config-dir .env and use `env`. " +
          `See ${ENV_DOCS_LINK}`,
      );
    }

    // Main file is required and must be readable
    if (!existsSync(mainPath)) {
      throw new ConfigLoadError(
        `Configuration error: env file not found: ${mainPath}. ` +
          `When \`env\` is set, the file must exist. See ${ENV_DOCS_LINK}`,
      );
    }
    try {
      const content = readFileSync(mainPath, "utf-8");
      const parsed = parseEnv(content);
      Object.assign(vars, parsed);
      loadedFiles.push(mainPath);
    } catch (err) {
      throw new ConfigLoadError(
        `Configuration error: cannot read env file ${mainPath} — ${err instanceof Error ? err.message : String(err)}. See ${ENV_DOCS_LINK}`,
      );
    }

    if (existsSync(localPath)) {
      try {
        const content = readFileSync(localPath, "utf-8");
        const parsed = parseEnv(content);
        Object.assign(vars, parsed);
        loadedFiles.push(localPath);
      } catch {
        // .local is optional; skip read errors
      }
    }

    return { vars, loadedFiles };
  }

  // Default mode: only config-dir .env and .env.local
  const candidates = [configDirEnv, configDirEnvLocal];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    try {
      const content = readFileSync(filePath, "utf-8");
      const parsed = parseEnv(content);
      Object.assign(vars, parsed);
      loadedFiles.push(filePath);
    } catch {
      // non-fatal for default-mode files
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
        throw new ConfigLoadError(
          `Configuration error: environment variable "${varName}" is not defined\n` +
            `  (referenced in field: ${path || "<root>"})`,
        );
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
      // Skip keys whose ${} patterns are resolved at message time
      // by the context resolver, not at boot time as env vars.
      if (key === "context" || key === "commands") {
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

// ─── Multi-format config file detection ──────────────────────────────────────

export type ConfigFormat = "json" | "jsonc" | "yaml";

interface ResolvedConfigFile {
  path: string;
  format: ConfigFormat;
}

const CONFIG_EXTENSIONS: readonly { ext: string; format: ConfigFormat }[] = [
  { ext: ".json", format: "json" },
  { ext: ".jsonc", format: "jsonc" },
  { ext: ".yaml", format: "yaml" },
  { ext: ".yml", format: "yaml" },
];

/**
 * Scan configDir for a config file matching the given slot basename
 * (e.g. "hal.config" or "hal.config.local") in any supported format.
 * Returns null when no file is found.
 * Throws ConfigLoadError when multiple formats exist for the same slot.
 */
export function resolveConfigFile(
  configDir: string,
  slotBasename: string,
): ResolvedConfigFile | null {
  const found: ResolvedConfigFile[] = [];

  for (const { ext, format } of CONFIG_EXTENSIONS) {
    const filePath = join(configDir, `${slotBasename}${ext}`);
    if (existsSync(filePath)) {
      found.push({ path: filePath, format });
    }
  }

  if (found.length === 0) return null;
  if (found.length === 1) return found[0];

  const names = found.map((f) => basename(f.path)).join(", ");
  throw new ConfigLoadError(
    `Configuration error: multiple config files found for "${slotBasename}": ${names}\n` +
      "  Only one format per config file is allowed. Remove the extras.",
  );
}

/**
 * Parse raw config file content using the appropriate parser for the format.
 */
export function parseConfigContent(
  content: string,
  format: ConfigFormat,
  filePath: string,
): unknown {
  try {
    if (format === "yaml") {
      return parseYaml(content);
    }
    if (format === "jsonc") {
      return JSON.parse(stripJsonComments(content, { trailingCommas: true }));
    }
    return JSON.parse(content);
  } catch (err) {
    throw new ConfigLoadError(
      `Configuration error: failed to parse ${basename(filePath)} — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── Phase 3: Local config loading ───────────────────────────────────────────

interface LocalConfigLoadResult {
  config: LocalConfigFile;
  path: string;
}

function loadLocalConfig(configDir: string): LocalConfigLoadResult | null {
  const resolved = resolveConfigFile(configDir, "hal.config.local");
  if (!resolved) return null;

  let raw: unknown;
  try {
    const content = readFileSync(resolved.path, "utf-8");
    raw = parseConfigContent(content, resolved.format, resolved.path);
  } catch (err) {
    if (err instanceof ConfigLoadError) throw err;
    throw new ConfigLoadError(
      `Configuration error: failed to read ${basename(resolved.path)} — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const result = LocalConfigFileSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ConfigLoadError(
      `Configuration error in ${basename(resolved.path)}:\n${issues}`,
    );
  }

  return result.data ? { config: result.data, path: resolved.path } : null;
}

// ─── Phase 3: Merge local into base ──────────────────────────────────────────

function mergeLocalIntoBase(
  base: MultiConfigFile,
  local: LocalConfigFile,
  baseFileName: string,
  localFileName: string,
): MultiConfigFile {
  const mergedGlobals =
    local.globals !== undefined
      ? deepMerge(base.globals ?? {}, local.globals)
      : base.globals;

  // Merge providers: only override base keys with local; never add engine keys from local (base defines which engines are enabled).
  const mergedProviders =
    local.providers !== undefined
      ? base.providers
        ? (() => {
            const baseProv = base.providers as Record<string, unknown>;
            const out: Record<string, unknown> = { ...baseProv };
            const localProv = (local.providers ?? {}) as Record<
              string,
              unknown
            >;
            for (const k of Object.keys(localProv)) {
              if (k in out) out[k] = localProv[k];
            }
            return out as NonNullable<typeof base.providers>;
          })()
        : local.providers
      : base.providers;

  const mergedContext =
    local.context !== undefined
      ? base.context
        ? { ...base.context, ...local.context }
        : local.context
      : base.context;

  const mergedEnv = local.env ?? base.env;

  if (!local.projects || Object.keys(local.projects).length === 0) {
    return {
      ...base,
      env: mergedEnv,
      globals: mergedGlobals,
      providers: mergedProviders,
      context: mergedContext,
    };
  }

  const mergedProjects = { ...base.projects } as Record<
    string,
    ProjectFileEntry
  >;

  for (const [localKey, localProject] of Object.entries(local.projects)) {
    if (!(localKey in mergedProjects)) {
      throw new ConfigLoadError(
        `Configuration error: local project key "${localKey}" not found in ${baseFileName}.\n` +
          `  Every key in ${localFileName} projects must exist in the base config.`,
      );
    }
    mergedProjects[localKey] = deepMerge(
      mergedProjects[localKey],
      localProject as Partial<ProjectFileEntry>,
    ) as ProjectFileEntry;
  }

  normalizeProjectMap(mergedProjects);

  return {
    env: mergedEnv,
    globals: mergedGlobals,
    providers: mergedProviders,
    context: mergedContext,
    projects: mergedProjects,
  };
}

// ─── Phase 4: Config file loading (internal: throws on error) ──────────────────

function loadMultiConfigInternal(configDir: string): LoadedConfigResult {
  const loadedFiles: string[] = [];

  // 1. Detect and load base config
  const baseResolved = resolveConfigFile(configDir, "hal.config");
  const supportedExts = CONFIG_EXTENSIONS.map((e) => e.ext).join(", ");

  if (!baseResolved) {
    throw new ConfigLoadError(
      `Configuration error: no config file found in ${configDir}\n` +
        `  Looked for: hal.config{${supportedExts}}\n` +
        `  Run "npx @marcopeg/hal wiz" to set up interactively, or "npx @marcopeg/hal init" to create a config file.`,
    );
  }

  const baseFileName = basename(baseResolved.path);
  let rawBase: unknown;
  try {
    const content = readFileSync(baseResolved.path, "utf-8");
    rawBase = parseConfigContent(
      content,
      baseResolved.format,
      baseResolved.path,
    );
  } catch (err) {
    if (err instanceof ConfigLoadError) throw err;
    throw new ConfigLoadError(
      `Configuration error: failed to read ${baseFileName} — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  loadedFiles.push(baseResolved.path);

  // 2. Validate base config schema
  const baseResult = MultiConfigFileSchema.safeParse(rawBase);
  if (!baseResult.success) {
    const issues = baseResult.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ConfigLoadError(
      `Configuration error in ${baseFileName}:\n${issues}`,
    );
  }

  let merged = baseResult.data;
  normalizeProjectMap(merged.projects);

  // 3. Load and merge local config
  const localResult = loadLocalConfig(configDir);
  if (localResult !== null) {
    const localFileName = basename(localResult.path);
    loadedFiles.push(localResult.path);
    merged = mergeLocalIntoBase(
      merged,
      localResult.config,
      baseFileName,
      localFileName,
    );
  }

  // 4. Load .env files (single source: config-dir .env or explicit env path)
  const envOptions =
    merged.env !== undefined
      ? { envPath: resolveCustomEnvPaths(configDir, merged.env).mainPath }
      : {};
  const envSources = loadEnvFiles(configDir, envOptions);

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
    throw new ConfigLoadError(
      `Configuration error after environment variable substitution:\n${issues}`,
    );
  }

  normalizeProjectMap(finalResult.data.projects);

  // 7. Normalize allowedUserIds (string | number)[] → number[] with validation
  normalizeAllowedUserIdsInConfig(finalResult.data);

  return {
    config: finalResult.data,
    loadedFiles: [...loadedFiles, ...envSources.loadedFiles],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load multi-project config. On any error, logs and exits the process.
 * Use for initial startup.
 */
export function loadMultiConfig(configDir: string): LoadedConfigResult {
  try {
    return loadMultiConfigInternal(configDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }
}

/**
 * Load multi-project config without exiting. Throws on error.
 * Use for hot-reload so callers can log and retry on next file change.
 */
export function tryLoadMultiConfig(configDir: string): LoadedConfigResult {
  return loadMultiConfigInternal(configDir);
}
