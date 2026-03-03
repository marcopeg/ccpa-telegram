---
name: vibe_code
description: Starts a structured vibe coding session. Use when /vibe-code is invoked or a vibe session is requested. Loads project context, scans the codebase, creates a session log, and prepares the agent for exploratory or improvement-focused coding.
---

# Vibe Code

Starts a vibe coding session: loads project context, scans the codebase, creates a timestamped session log, and keeps it updated throughout the session.

## Invocation

```
/vibe-code <rough description of the goal>
```

The goal description can be vague — it is used as a slug for the log filename and as the opening context annotation.

---

## Step 1 — Create the session log

1. Determine the current date-time in `YYMMDDHHmm` format (e.g. `2603021430` for 2026-03-02 14:30).
2. Convert the goal description to a kebab-case slug (e.g. `simplify-readme-and-config`).
3. Create the directory `vibed/` at the project root if it does not exist.
4. Create the log file: `vibed/YYMMDDHHmm.<goal-slug>.md` (e.g. `vibed/2603021430.simplify-readme-and-config.md`)

Log file initial structure:

```markdown
# Vibe Session — <goal description>

**Started:** <YYYY-MM-DD HH:MM>

## Goal

<goal description as provided by the user>

---

## Context

> Populated in the next steps after codebase scan.

---

## Log

<!-- Annotations are appended here during the session -->
```

---

## Step 2 — Load project context

Read the following in parallel:

- `tasks/BACKLOG.md` — understand what is in progress, ready, drafted, and recently completed
- `README.md` — get the high-level project overview, features, and architecture
- `AGENTS.md` (if present at root) — project-specific agent instructions and tech stack summary
- `docs/` directory (if it exists) — scan for any sub-documentation already extracted

From the backlog, note:
- The most recently completed tasks (bottom of Completed section)
- Any In Progress tasks
- Ready tasks (planned but not started)
- Relevant drafts related to the session goal

---

## Step 3 — Scan the codebase

Get a structural overview:

- List top-level directories and key files
- List `src/` contents (or equivalent source root)
- Identify the main entry points, config files, and any examples/

Focus on areas relevant to the session goal. If the goal touches config: read `src/config.ts`. If it touches docs: check if a `docs/` folder already exists. If it touches engines: read `src/engine/`.

---

## Step 4 — Write context digest to the log

Append a populated **Context** section to the log file covering:

- **Project summary**: one-sentence description of what the project does
- **Tech stack**: key languages, frameworks, tools
- **Recent work**: last 3–5 completed tasks and what they covered
- **Relevant backlog**: any tasks directly related to the session goal
- **Areas of interest**: files/modules most relevant to the goal
- **Known issues or constraints**: anything from the backlog or README that affects the session goal

---

## Step 5 — Present the digest to the user

Output a concise summary to the user:

- Confirm the session log file path
- Summarize the context digest (3–6 bullets)
- Identify the first concrete question or action to kick off the session
- Ask the user how they want to proceed, or propose a starting point

---

## Annotation protocol (ongoing throughout the session)

The log file is the living record of the session. Keep it updated:

### When to annotate

**On request** — when the user says any of:
- `annotate`, `annotate now`, `log`, `log this`, `write it down`

**Proactively** — propose annotation (say "want me to annotate this?") after:
- Completing a significant decision or design choice
- Finishing a phase of work (e.g. "docs decomposition done")
- Discovering something unexpected (e.g. a hidden default or undocumented pattern)
- Reaching a natural pause or milestone

### Annotation format

Append to the `## Log` section:

```markdown
### <YYYY-MM-DD HH:MM> — <short title>

<1–4 sentences describing what was done, decided, or discovered. Include rationale for decisions. Mention affected files if relevant.>
```

Each annotation is a timestamped entry. Never overwrite previous entries — only append.

---

## Constraints

- Always create the log file **before** starting any codebase work
- Never skip the context load — it ensures continuity across long sessions
- Keep annotations factual and brief; they are a log, not documentation
- The log file is the source of truth for the session; if work is interrupted, a new session can resume by reading it
