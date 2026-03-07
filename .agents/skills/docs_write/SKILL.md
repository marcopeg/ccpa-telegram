---
name: docs_write
description: Write or extend human-facing docs from user-provided content. Asks targeted questions about placement, scope, and tone, then produces or updates a doc page following project conventions. Use when drafting or adding to docs.
telegram: true
---

# docs_write

Turn user-provided content — raw notes, a feature description, rough bullets — into polished, well-placed documentation.

---

## How this skill works

1. **Receive content** — the user provides raw content or a description of what needs to be documented.
2. **Clarify before writing** — ask up to 3 targeted questions to resolve placement, scope, and tone gaps.
3. **Write** — produce or update the relevant doc page(s), following the project's docs conventions (see `docs` skill).
4. **Review together** — summarize what was written and offer another round.

---

## Clarification phase

Before writing, identify and ask about unknowns. Ask **at most 3 questions**; combine related ones. Prioritize:

1. **Placement** — which existing page does this belong to, or should a new page be created? If new, where under `docs/`?
2. **Audience** — end-users, contributors, or both?
3. **Scope** — what is the one goal a reader should achieve after reading this?

Only ask about **tone** if the content carries strong voice signals that conflict with the project default (see below). Otherwise apply the default silently.

---

## Tone of voice

Default tone for all documentation in this project:

- **Concise but friendly** — say what needs to be said without padding, but keep it warm.
- **Direct** — use imperative mood for instructions ("Run `pnpm run dev`", not "You can run…").
- **Precise** — no vague claims; if something is optional or uncertain, say so explicitly.
- **No marketing fluff inside `docs/`** — that belongs in the root `README.md` only.

Tone exceptions: if the user explicitly asks for a different register (more casual, more formal), honor it and note it in the draft summary so it can be discussed.

### Tone questions to ask during refinement

When refining this skill (or when tone is genuinely ambiguous in a writing session), consider:

- Should examples use "you" or imperative voice? (Default: imperative)
- Should warnings use bold callouts or inline notes? (Default: inline note unless critical)
- How much context/motivation should precede a procedure? (Default: one sentence max)
- Can humor or light phrasing appear? (Default: occasional, never forced)

---

## Writing rules

Follow the `docs` skill conventions:

- **One topic = one folder** (kebab-case) with a `README.md` inside.
- **Index at every level** — `README.md` (uppercase) as the entry point; other files in kebab-case.
- **Relative links only** — navigable on GitHub.
- **No duplication** — root `README.md` stays light; exhaustive content lives in `docs/`.
- **Config touches** — if the content involves config keys or examples, also update `docs/config/reference.yaml` and `examples/hal.config.yaml`.
- **External links** — propose relevant external links (official docs, model lists, etc.) inline where useful.

---

## Workflow

### 1. Read the content

Read what the user provided. Identify:

- What it's about.
- Where in the existing docs it fits (read relevant existing pages if needed to decide).
- What's missing to write it properly.

### 2. Ask clarifying questions (≤ 3)

Group into one message. Format:

> **Before I write, a couple of quick questions:**
>
> 1. [Placement question]
> 2. [Audience / scope question]
> *(3. Tone question — only if needed)*

### 3. Write the doc

After the user answers, produce the content:

- **Adding to an existing page** — make the smallest edit that adds the content cleanly with the right heading level.
- **Creating a new page** — create the folder + `README.md`; add a link from the parent index page.
- Maintain the existing heading hierarchy; do not introduce heading levels that skip ranks.

### 4. Close the loop

Summarize what was written (1–3 bullets) and ask if the user wants another round of `docs_write`.

---

## Telegram constraints

- This skill is exposed as a Telegram command only when `telegram: true` is set.
- Keep frontmatter `description` ≤ 256 characters.
- Command name is derived from the skill folder name (`docs_write` → `/docs_write`).
