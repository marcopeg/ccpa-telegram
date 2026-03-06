import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { confirm, text } from "@clack/prompts";
import { parse as parseEnv } from "dotenv";
import { guardCancel } from "../runner.js";
import type { WizardContext, WizardStep } from "../types.js";

const PLACEHOLDER_RE = /^\$\{[^}]+\}$/;
const BOT_TOKEN_RE = /^\d+:[A-Za-z0-9_-]{35,}$/;
const HELP_URL =
  "https://github.com/marcopeg/hal/blob/main/docs/telegram/README.md#creating-a-telegram-bot";

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

function openUrl(url: string): void {
  try {
    const cmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    // silently ignore — not critical
  }
}

function findEditor(): string | null {
  for (const cmd of ["code", "cursor"]) {
    try {
      execSync(`which ${cmd}`, { stdio: "pipe" });
      return cmd;
    } catch {}
  }
  return null;
}
// suppress unused variable lint — editor may be used in future
void findEditor;

export const botTokenStep: WizardStep = {
  id: "bot-token",
  label: "Telegram bot token",

  isConfigured(ctx: WizardContext): boolean {
    const env = loadEnvFromConfigDir(ctx.cwd);
    const projects = ctx.existingConfig?.projects ?? {};
    return Object.values(projects).some((p) => {
      const token = p.telegram?.botToken;
      if (!token) return false;
      if (!isPlaceholder(token)) return true;
      const varName = placeholderVar(token);
      if (!varName) return false;
      return ((process.env[varName] ?? env[varName]) || "") !== "";
    });
  },

  shouldSkip(ctx: WizardContext): boolean {
    const key = ctx.prefill.apiKey ?? ctx.prefill.botKey;
    if (!key) return false;
    return BOT_TOKEN_RE.test(key);
  },

  run: async (ctx: WizardContext) => {
    // Pre-fill: apply silently
    const key = ctx.prefill.apiKey ?? ctx.prefill.botKey;
    if (key && BOT_TOKEN_RE.test(key)) {
      ctx.results.botToken = key;
      return;
    }

    const needHelp = await confirm({
      message:
        "Do you need help creating a Telegram bot? (opens docs in browser)",
      initialValue: false,
    });
    guardCancel(needHelp);
    if (needHelp) {
      openUrl(HELP_URL);
      console.log(`\n  Docs: ${HELP_URL}\n`);
    }

    const answer = await text({
      message: "Paste your Telegram bot token:",
      placeholder: "123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      validate(value) {
        if (!value || value.trim() === "") return "Bot token is required.";
        if (!BOT_TOKEN_RE.test(value.trim()))
          return "Invalid format. Expected: <digits>:<alphanumeric 35+ chars>";
        return undefined;
      },
    });
    guardCancel(answer);

    ctx.results.botToken = (answer as string).trim();
  },
};
