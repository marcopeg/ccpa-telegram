import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Context as GrammyContext } from "grammy";
import type pino from "pino";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BootContext {
  shellCache: Record<string, string>;
}

export interface ResolveContextOptions {
  gramCtx: GrammyContext;
  configContext: Record<string, string> | undefined;
  bootContext: BootContext;
  configDir: string;
  projectCwd: string;
  projectName: string | undefined;
  projectSlug: string;
  logger: pino.Logger;
}

// ─── Boot-time shell evaluation (#{}) ───────────────────────────────────────

const BOOT_SHELL_RE = /#\{([^}]+)\}/g;

export function evaluateBootTimeShells(
  context: Record<string, string>,
  logger: pino.Logger,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(context)) {
    result[key] = value.replace(BOOT_SHELL_RE, (_match, cmd: string) => {
      try {
        return execSync(cmd, { encoding: "utf-8", timeout: 10_000 }).trim();
      } catch (err) {
        logger.warn(
          { key, cmd, error: err instanceof Error ? err.message : String(err) },
          "Boot-time shell command failed, substituting empty string",
        );
        return "";
      }
    });
  }

  return result;
}

// ─── Message-time shell evaluation (@{}) ────────────────────────────────────

const MSG_SHELL_RE = /@\{([^}]+)\}/g;

function evaluateMessageTimeShells(value: string, logger: pino.Logger): string {
  return value.replace(MSG_SHELL_RE, (_match, cmd: string) => {
    try {
      return execSync(cmd, { encoding: "utf-8", timeout: 5_000 }).trim();
    } catch (err) {
      logger.warn(
        { cmd, error: err instanceof Error ? err.message : String(err) },
        "Message-time shell command failed, substituting empty string",
      );
      return "";
    }
  });
}

// ─── App-level variable substitution (${}) ──────────────────────────────────

const APP_VAR_RE = /\$\{([^}]+)\}/g;

function resolveAppVars(value: string, vars: Record<string, string>): string {
  return value.replace(APP_VAR_RE, (_match, expr: string) => {
    return vars[expr] ?? process.env[expr] ?? "";
  });
}

// ─── Implicit context: bot.* from Grammy ────────────────────────────────────

function deriveMessageType(gramCtx: GrammyContext): string {
  const msg = gramCtx.message;
  if (!msg) return "unknown";
  if (msg.text) return "text";
  if (msg.photo) return "photo";
  if (msg.document) return "document";
  if (msg.voice) return "voice";
  return "unknown";
}

function buildImplicitContext(gramCtx: GrammyContext): Record<string, string> {
  const msg = gramCtx.message;
  const from = gramCtx.from;
  const ts = msg?.date ?? Math.floor(Date.now() / 1000);
  const dt = new Date(ts * 1000);

  return {
    "bot.messageId": String(msg?.message_id ?? ""),
    "bot.timestamp": String(ts),
    "bot.datetime": dt.toISOString(),
    "bot.userId": String(from?.id ?? ""),
    "bot.username": from?.username ?? "",
    "bot.firstName": from?.first_name ?? "",
    "bot.chatId": String(gramCtx.chat?.id ?? ""),
    "bot.messageType": deriveMessageType(gramCtx),
  };
}

// ─── Implicit context: sys.* from system ────────────────────────────────────

function buildSystemContext(): Record<string, string> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");

  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mi = pad(now.getMinutes());
  const ss = pad(now.getSeconds());

  const tzOffsetMin = -now.getTimezoneOffset();
  const tzSign = tzOffsetMin >= 0 ? "+" : "-";
  const tzH = pad(Math.floor(Math.abs(tzOffsetMin) / 60));
  const tzM = pad(Math.abs(tzOffsetMin) % 60);
  const tzOffset = `${tzSign}${tzH}:${tzM}`;

  const tz =
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? `UTC${tzOffset}`;

  return {
    "sys.datetime": `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} UTC${tzSign}${Math.floor(Math.abs(tzOffsetMin) / 60)}`,
    "sys.date": `${yyyy}-${mm}-${dd}`,
    "sys.time": `${hh}:${mi}:${ss}`,
    "sys.ts": String(Math.floor(now.getTime() / 1000)),
    "sys.tz": tz,
  };
}

// ─── Hot-reloaded context hook ──────────────────────────────────────────────

async function loadAndRunHook(
  hookPath: string,
  context: Record<string, string>,
  logger: pino.Logger,
): Promise<Record<string, string>> {
  if (!existsSync(hookPath)) return context;
  try {
    const { default: hook } = await import(`${hookPath}?t=${Date.now()}`);
    return await hook(context);
  } catch (err) {
    logger.error(
      { hookPath, error: err instanceof Error ? err.message : String(err) },
      "Context hook failed, using pre-hook context",
    );
    return context;
  }
}

// ─── Claude Code-compatible slug ────────────────────────────────────────────

/**
 * Derives a slug from the absolute project cwd matching Claude Code's convention
 * for ~/.claude/projects/ folder names: full path with `/` → `-`, keeping leading `-`.
 */
function claudeSlug(absoluteCwd: string): string {
  return absoluteCwd
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-");
}

// ─── Main orchestrator ──────────────────────────────────────────────────────

export async function resolveContext(
  options: ResolveContextOptions,
): Promise<Record<string, string>> {
  const {
    gramCtx,
    configContext,
    bootContext,
    configDir,
    projectCwd,
    projectName,
    projectSlug,
    logger,
  } = options;

  // 1. Implicit context (bot.* + sys.* + project.*)
  const slug = claudeSlug(projectCwd);
  const implicit = {
    ...buildImplicitContext(gramCtx),
    ...buildSystemContext(),
    "project.name": projectName ?? projectSlug,
    "project.cwd": projectCwd,
    "project.slug": slug,
  };

  // 2. Merge config context on top (config wins for explicit overrides)
  //    Boot-time #{} commands are already resolved in bootContext.shellCache
  let merged: Record<string, string>;
  if (configContext) {
    // Start with implicit, overlay the config context (which may have #{} already resolved)
    merged = { ...implicit };
    for (const [key, value] of Object.entries(configContext)) {
      // Use the boot-cached version if #{} was present, otherwise the raw config value
      merged[key] = bootContext.shellCache[key] ?? value;
    }
  } else {
    merged = { ...implicit };
  }

  // 3. Resolve ${} app vars (using implicit + env as lookup)
  for (const [key, value] of Object.entries(merged)) {
    if (APP_VAR_RE.test(value)) {
      APP_VAR_RE.lastIndex = 0;
      merged[key] = resolveAppVars(value, merged);
    }
  }

  // 4. Resolve @{} message-time shell commands
  for (const [key, value] of Object.entries(merged)) {
    if (MSG_SHELL_RE.test(value)) {
      MSG_SHELL_RE.lastIndex = 0;
      merged[key] = evaluateMessageTimeShells(value, logger);
    }
  }

  // 5. Run global hook (configDir/.ccpa/hooks/context.mjs)
  merged = await loadAndRunHook(
    join(configDir, ".ccpa", "hooks", "context.mjs"),
    merged,
    logger,
  );

  // 6. Run project hook (projectCwd/.ccpa/hooks/context.mjs)
  merged = await loadAndRunHook(
    join(projectCwd, ".ccpa", "hooks", "context.mjs"),
    merged,
    logger,
  );

  return merged;
}

// ─── Prompt formatting ──────────────────────────────────────────────────────

export function formatContextPrompt(
  context: Record<string, string>,
  userMessage: string,
): string {
  const lines = Object.entries(context).map(([k, v]) => `- ${k}: ${v}`);
  return `# Context\n${lines.join("\n")}\n\n# User Message\n${userMessage}`;
}
