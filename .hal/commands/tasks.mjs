import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { InputFile, InlineKeyboard } from "grammy";

export const description = "Show project task board; /tasks <id> to read a task file";

// ─── Backlog parsing ──────────────────────────────────────────────────────────

// Matches: - [022 — Title](...) and indented sub-tasks like - [032a — Title](...)
const TASK_RE = /^\s*-\s+\[(\d+[a-z]*)\s*[—–-]\s*([^\]]+)\]/i;

const SECTION_HEADERS = {
  "## in progress": "inProgress",
  "## ready tasks": "ready",
  "## drafts": "drafts",
  "## completed": "completed",
};

function parseItems(lines) {
  return lines.flatMap((line) => {
    const m = line.match(TASK_RE);
    return m ? [{ id: m[1].trim(), name: m[2].trim() }] : [];
  });
}

async function parseBacklog(cwd) {
  let content;
  try {
    content = await readFile(join(cwd, "tasks", "BACKLOG.md"), "utf-8");
  } catch {
    return { inProgress: [], ready: [], drafts: [], completed: [] };
  }

  const buckets = { inProgress: [], ready: [], drafts: [], completed: [] };
  let current = null;

  for (const line of content.split("\n")) {
    const lower = line.toLowerCase().trim();
    if (SECTION_HEADERS[lower] !== undefined) {
      current = SECTION_HEADERS[lower];
      continue;
    }
    if (line.startsWith("## ")) { current = null; continue; }
    if (current !== null) buckets[current].push(line);
  }

  return {
    inProgress: parseItems(buckets.inProgress),
    ready: parseItems(buckets.ready),
    drafts: parseItems(buckets.drafts),
    completed: parseItems(buckets.completed),
  };
}

// ─── Task file lookup ─────────────────────────────────────────────────────────

const TASK_DIRS = ["tasks", "tasks/ready", "tasks/drafts", "tasks/completed"];

async function findTaskFile(cwd, rawId) {
  // Accept "22", "022", "22a", "022a" — normalise to zero-padded 3-digit prefix
  const trimmed = String(rawId).trim();
  // Extract leading digits and optional letter suffix (e.g. "032a" → prefix "032")
  const m = trimmed.match(/^(\d+)([a-z]*)$/i);
  if (!m) return null;
  const prefix = m[1].padStart(3, "0") + m[2].toLowerCase();

  for (const dir of TASK_DIRS) {
    let files;
    try {
      files = await readdir(join(cwd, dir));
    } catch {
      continue;
    }
    const match = files.find(
      (f) =>
        f.startsWith(`${prefix}.`) &&
        f.endsWith(".md") &&
        !f.endsWith(".plan.md"),
    );
    if (match) return join(cwd, dir, match);
  }
  return null;
}

// ─── Formatting (HTML) ────────────────────────────────────────────────────────

function esc(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatList(tasks) {
  return tasks.map((t) => `• <b>${esc(t.id)}</b> — ${esc(t.name)}`).join("\n");
}

// ─── Command handler ──────────────────────────────────────────────────────────

export default async function handler({ args, ctx, gram }) {
  const cwd = ctx["project.cwd"];

  // /tasks <id> → send the task file
  if (args.length > 0) {
    const raw = args[0];
    const filePath = await findTaskFile(cwd, raw);
    if (!filePath) {
      const padded = String(Number.parseInt(raw, 10) || raw).padStart(3, "0");
      return `Task ${padded} not found.`;
    }

    // Read into a Buffer — InputFile(string) is treated as a Telegram file_id, not a path
    const data = await readFile(filePath);
    await gram.replyWithDocument(new InputFile(data, basename(filePath)));
    return null;
  }

  // /tasks → show the board
  const bl = await parseBacklog(cwd);

  const inProgressText =
    bl.inProgress.length > 0 ? formatList(bl.inProgress) : "<i>None</i>";

  const readySlice = bl.ready.slice(0, 3);
  const readySuffix =
    bl.ready.length > 3 ? `\n<i>…and ${bl.ready.length - 3} more</i>` : "";
  const readyText =
    readySlice.length > 0 ? formatList(readySlice) + readySuffix : "<i>None</i>";

  const text = [
    `<b>In Progress</b> (${bl.inProgress.length})`,
    inProgressText,
    "",
    `<b>Ready</b> (${bl.ready.length}${bl.ready.length > 3 ? ", first 3" : ""})`,
    readyText,
  ].join("\n");

  const keyboard = new InlineKeyboard()
    .text(`📝 Drafts (${bl.drafts.length})`, "tasks:drafts")
    .text(`✅ Ready (${bl.ready.length})`, "tasks:ready")
    .row()
    .text(`🔄 In Progress (${bl.inProgress.length})`, "tasks:inprogress")
    .text(`🏁 Completed (${bl.completed.length})`, "tasks:completed");

  await gram.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  return null;
}

// ─── Callback handler (called by the generic MJS callback dispatcher) ─────────

const SECTIONS = {
  drafts:    { label: "📝 Drafts",      key: "drafts" },
  ready:     { label: "✅ Ready",       key: "ready" },
  inprogress:{ label: "🔄 In Progress", key: "inProgress" },
  completed: { label: "🏁 Completed",   key: "completed" },
};

export async function callbackHandler({ data, gram, projectCtx }) {
  const chatId = gram.callbackQuery?.message?.chat?.id;

  // Dismiss the button spinner first (required so Telegram stops showing "loading" on the button)
  try {
    await gram.answerCallbackQuery();
  } catch {
    /* ignore */
  }

  if (!chatId) return;

  try {
    const slug = data.slice("tasks:".length);
    const meta = SECTIONS[slug];
    if (!meta) {
      await gram.api.sendMessage(chatId, "Unknown section.");
      return;
    }

    const bl = await parseBacklog(projectCtx.config.cwd);
    const tasks = bl[meta.key];
    const body =
      tasks.length > 0
        ? formatList(tasks)
        : "<i>No tasks in this section.</i>";

    await gram.api.sendMessage(
      chatId,
      `<b>${esc(meta.label)}</b> (${tasks.length})\n\n${body}`,
      { parse_mode: "HTML" },
    );
  } catch (err) {
    try {
      await gram.api.sendMessage(
        chatId,
        `Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } catch { /* ignore */ }
  }
}
