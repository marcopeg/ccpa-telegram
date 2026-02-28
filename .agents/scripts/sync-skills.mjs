#!/usr/bin/env node

/**
 * Syncs skills from .agents/skills/ (canonical source) to:
 * - .cursor/commands/{name}.md     (slash commands in Cursor IDE)
 * - .claude/skills/{name}/SKILL.md (slash commands in Claude Code)
 *
 * Generated files are thin pointers back to .agents/skills/ so the
 * canonical source remains the single source of truth. Re-run only
 * when adding or removing skills.
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE = join(ROOT, ".agents", "skills");
const CURSOR_COMMANDS = join(ROOT, ".cursor", "commands");
const CLAUDE_OUT = join(ROOT, ".claude", "skills");

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content.trim() };

  const meta = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key && rest.length) meta[key.trim()] = rest.join(":").trim();
  }
  return { meta, body: match[2].trim() };
}

function toCursorCommand(name) {
  return `Read the file \`.agents/skills/${name}/SKILL.md\` and follow its instructions.\n`;
}

function toClaudeSkill(name, meta) {
  return `---
name: ${meta.name || name}
description: ${meta.description || ""}
---

Read the file \`.agents/skills/${name}/SKILL.md\` and follow its instructions.
`;
}

async function sync() {
  const skills = await readdir(SOURCE, { withFileTypes: true });
  const dirs = skills.filter((d) => d.isDirectory());

  let count = 0;
  for (const dir of dirs) {
    const skillFile = join(SOURCE, dir.name, "SKILL.md");
    let content;
    try {
      content = await readFile(skillFile, "utf-8");
    } catch {
      continue;
    }

    const { meta } = parseFrontmatter(content);

    const commandPath = join(CURSOR_COMMANDS, `${dir.name}.md`);
    await mkdir(dirname(commandPath), { recursive: true });
    await writeFile(commandPath, toCursorCommand(dir.name));

    const claudePath = join(CLAUDE_OUT, dir.name, "SKILL.md");
    await mkdir(dirname(claudePath), { recursive: true });
    await writeFile(claudePath, toClaudeSkill(dir.name, meta));

    count++;
    console.log(`  ✓ ${dir.name}`);
  }

  console.log(
    `\nSynced ${count} skill(s) → .cursor/commands/ + .claude/skills/`,
  );
}

sync().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
