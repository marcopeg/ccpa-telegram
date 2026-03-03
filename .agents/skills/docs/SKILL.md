---
name: docs
description: Use for human-facing docs (README, docs/, links from AGENTS.md to docs). Auto-apply when creating/editing user or contributor docs, splitting README into docs/, or cross-linking. Not for AGENTS.md content (handled separately).
---

# Docs

Guidance for managing this project’s **human-facing** documentation (README, `docs/`). Apply this skill when the task touches the root `README.md`, files under `docs/`, or when adding/updating links from agent instructions to the docs. Agent-only instructions (AGENTS.md) are a separate concern.

---

## When this skill applies

- Editing or restructuring the root `README.md`
- Creating, updating, or reorganizing files under `docs/`
- Decomposing README content into `docs/` (moving long content out of README)
- Writing or updating user-facing or contributor-facing documentation
- Adding or proposing links from AGENTS.md (or other agent instructions) to the human docs so agents can read them — or noting that “documentation exists in `docs/`” for the agent until more specific skills exist

---

## How to manage the documentation

**Goal: move content from README into docs**

The root README is currently too long. When decomposing, **move** content into `docs/` and **replace or remove** it in the root README — no duplication. The root README should end up lighter; the canonical, exhaustive content lives in `docs/`.

**Root README vs `docs/`**

- **Repository root `README.md`** — Marketing-oriented: what the product is, why use it, where to go next. Can include direct links into the documentation and a short pointer that the full docs live in `docs/`. Aim for a lighter, GitHub/NPM-friendly first impression.
- **`docs/README.md`** — The real main index: exhaustive index of all docs. Canonical entry point for anyone browsing the docs folder. Root README links here for “full documentation.”

**Structure: one page = one folder (kebab-case) with README inside**

- Prefer **one topic = one folder** (name in kebab-case) with a **`README.md`** inside, e.g. `docs/engines/README.md`, `docs/custom-commands/README.md`. That way each “page” is a folder and can grow (more files in that folder later) without renaming — open-clause principle.
- Use **`README.md`** (uppercase) for index files at every level. Any other file (if not using folder+README) uses **kebab-case** (e.g. `some-topic.md`). Subfolders: kebab-case.
- **Per-folder README:** As a default, every folder under `docs/` has a `README.md` — GitHub renders it automatically and it gives each level a clear entry point. It can be a short index of subfolders with brief descriptions. Exceptions allowed if the user specifies; if in doubt, add the README or ask.

**AGENTS.md vs human docs**

This skill covers **human** documentation only. AGENTS.md (and other agent instruction files) are for agents/IDE — managed separately. From AGENTS.md we may link to `docs/` so the agent can read human docs, or state that “documentation exists in `docs/`”; until there are more specific skills, that’s enough for the agent to use the docs.

**Cross-linking (navigable on GitHub)**

Use **relative links** so the documentation is navigable when browsed on GitHub. GitHub supports standard Markdown relative links; paths are relative to the current file. Examples: `[Engines](engines/README.md)` (sibling folder), `[Configuration](../configuration/README.md)` (parent-level folder), `[Back to index](../README.md)`. Follow this convention so users can click through the docs on the GitHub UI.

---

## External links within the documentation

When documenting a part of the system (e.g. an agenting platform: config, characteristics, how to implement a model list), do research when needed. When you find relevant external resources (official docs, model lists, etc.), **propose adding those links in the relevant place in the documentation** — inline or in the section that topic belongs to — so users can follow them for up-to-date details (e.g. “see the official list of available models”). Links are part of the doc content, not a separate appendix.
