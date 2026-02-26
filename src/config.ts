import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
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
});

// ─── Multi-project config file schema ─────────────────────────────────────────

const MultiConfigFileSchema = z.object({
  globals: GlobalsFileSchema,
  projects: z
    .array(ProjectFileSchema)
    .min(1, "At least one project is required"),
});

type ProjectFileEntry = z.infer<typeof ProjectFileSchema>;
type GlobalsFile = NonNullable<z.infer<typeof GlobalsFileSchema>>;
type MultiConfigFile = z.infer<typeof MultiConfigFileSchema>;

// ─── Resolved project config (what the rest of the app uses) ──────────────────

export interface ResolvedProjectConfig {
  slug: string;
  name: string | undefined;
  cwd: string;
  dataDir: string;
  logDir: string;
  telegram: { botToken: string };
  access: { allowedUserIds: number[] };
  claude: { command: string };
  logging: { level: string; flow: boolean; persist: boolean };
  rateLimit: { max: number; windowMs: number };
  transcription: { model: string; showTranscription: boolean } | undefined;
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
    return resolve(projectCwd, ".ccpa", "users");
  }
  if (dataDirRaw === "~") {
    return resolve(configDir, ".ccpa", slug, "data");
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
): ResolvedProjectConfig {
  const resolvedCwd = isAbsolute(project.cwd)
    ? project.cwd
    : resolve(configDir, project.cwd);

  const slug = deriveSlug(project.name, project.cwd);
  const logDir = resolve(configDir, ".ccpa", slug, "logs");

  const dataDir = resolveDataDir(
    project.dataDir ?? globals.dataDir,
    resolvedCwd,
    configDir,
    slug,
  );

  const hasTranscription =
    project.transcription !== undefined || globals.transcription !== undefined;

  return {
    slug,
    name: project.name,
    cwd: resolvedCwd,
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

// ─── Config file loading ───────────────────────────────────────────────────────

export function loadMultiConfig(configDir: string): MultiConfigFile {
  const configPath = join(configDir, "ccpa.config.json");

  if (!existsSync(configPath)) {
    console.error(
      `Configuration error: ccpa.config.json not found in ${configDir}\n` +
        `Run "npx ccpa-telegram init" to create one.`,
    );
    process.exit(1);
  }

  let raw: unknown;
  try {
    const content = readFileSync(configPath, "utf-8");
    raw = JSON.parse(content);
  } catch (err) {
    console.error(
      `Configuration error: failed to read ccpa.config.json — ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  const result = MultiConfigFileSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`Configuration error in ccpa.config.json:\n${issues}`);
    process.exit(1);
  }

  return result.data;
}
