---
name: refresh_models
description: Fetches the latest supported models for every HAL engine from official docs and updates example configs + engine doc pages. Run periodically or after a new engine/model is announced.
---

# Refresh Models

Fetches the current list of supported models for each HAL engine from the official documentation URLs, then updates **two** locations:

1. **Example config** — the top-level `providers` section of the example config file(s) under `examples/`.
2. **Engine doc pages** — each engine's `docs/engines/<engine>/README.md` gets an "Available models" section with the models and a "last updated" date.

---

## Invocation

```
/refresh-models [engine]
```

- With no argument: refresh **all** engines.
- With an engine name (e.g. `codex`, `claude`): refresh only that engine.

---

## Engine registry

Each engine has one or more **reference URLs** to consult. Fetch and read these pages to extract the model identifiers accepted by the CLI `--model` flag.

| Engine | CLI flag | Reference URLs | Notes |
|--------|----------|----------------|-------|
| `codex` | `codex -m <model>` | <https://developers.openai.com/codex/models/> | OpenAI Codex models; also supports any Responses API model |
| `claude` | `claude --model <model>` | <https://docs.anthropic.com/en/docs/claude-code/model-config> , <https://platform.claude.com/docs/en/about-claude/models/overview> | Supports aliases (`sonnet`, `opus`, `haiku`, `opusplan`, `sonnet[1m]`, `default`) and full model names (`claude-opus-4-6`, etc.) |
| `cursor` | `cursor agent --model <model>` | <https://cursor.com/docs/models> | Shortened names (`sonnet-4.6`, `opus-4.6`); GPT variants support reasoning effort suffixes. Also try `cursor agent --list-models` if available. |
| `copilot` | `copilot --model <model>` | <https://docs.github.com/en/copilot/reference/ai-models/supported-models> | Kebab-case slugs; some models are free (0x multiplier). |
| `antigravity` | `gemini --model <model>` | <https://geminicli.com/docs/cli/model/> , <https://antigravity.google/docs/models> | Gemini CLI models; Antigravity IDE has extra Vertex Model Garden models but HAL uses Gemini CLI. |
| `opencode` | `opencode run -m <provider/model>` | <https://opencode.ai/docs/zen> , <https://opencode.ai/docs/models> | Uses `provider/model` format (e.g. `opencode/gpt-5.2-codex`). Zen is the curated provider. |

---

## Step 1 — Identify the example config

Look in `examples/` for the primary example config. The canonical example is **YAML**:

- **YAML**: `examples/hal.config.yaml` (or `.yml`)

The skill updates this file’s top-level `providers` section. Detect format by extension. If no YAML example exists, the skill may create or skip the example config step as appropriate.

---

## Step 2 — Fetch model lists

For each engine being refreshed:

1. **Fetch** each reference URL from the registry table above.
2. **Extract** the model identifiers (the exact strings accepted by the CLI `--model` flag). Pay attention to:
   - The naming convention of each engine (e.g. Cursor uses `sonnet-4.6`, Claude uses `claude-sonnet-4-6`, Copilot uses `claude-sonnet-4.6`).
   - Whether there are model aliases (Claude) vs only full names.
   - Reasoning effort or speed variants (note them in descriptions, don't list every permutation as a separate entry).
   - Free or low-cost models (note in description).
   - Preview vs GA status.
3. **Organize** models into logical groups (by provider/family) with a short description for each.

**Important:** When a reference URL doesn't render the model list fully, search the web for supplementary sources (forum posts, changelogs, third-party tools that list CLI model identifiers). The official docs are the primary source but may lag behind actual CLI availability.

---

## Step 3 — Update example config file(s)

For each example config file found in Step 1:

### JSONC format

Replace the contents of the `providers.<engine>` array. Preserve:
- The comment header above each engine (with the reference URL and notes).
- Inline comments grouping models by provider/family.
- The `"default": true` marker on one model per engine (choose the most sensible default — typically the recommended/balanced model).

Structure per entry:
```jsonc
{ "name": "<model-id>", "description": "<short description>" }
// or with default:
{ "name": "<model-id>", "description": "<short description>", "default": true }
```

### YAML format

Replace the contents of the `providers.<engine>` list. Use the same structure:
```yaml
- name: <model-id>
  description: <short description>
  default: true  # only on one entry
```

Preserve any YAML comments above/within the section.

### Adding a new engine

If an engine exists in the registry but not yet in the config's `providers`, add it in the correct position (alphabetical or matching the engine registry order above).

---

## Step 4 — Update engine doc pages

For each engine being refreshed, update `docs/engines/<engine>/README.md`:

1. **Find or create** an "Available models" section. Look for a heading matching `## Available models` (or `## Supported models` or `## Models`). If none exists, insert it **before** the "Instruction files and precedence" section (or before `[← Back to engines index]` if that section doesn't exist).

2. **Replace** the section content with a table of the current models:

```markdown
## Available models

> **Last updated:** YYYY-MM-DD — [source](<primary-reference-url>)

| Model | Description |
|-------|-------------|
| `<model-id>` | <short description> |
| ... | ... |
```

Group the table by provider/family using subheadings or bold row separators if the list is long (10+ models). For Claude, separate aliases from pinned model names. For Cursor/Copilot, group by provider (Anthropic, OpenAI, Google, etc.).

3. **Update the date** in the "Last updated" line to today's date.

---

## Step 5 — Summary

After completing updates, output a summary:

- Which engines were refreshed
- How many models per engine (before → after, if changed)
- Any models added or removed compared to the previous list
- Any engines where the fetch failed or returned unexpected data (flag for manual review)

---

## Constraints

- **Do not invent model names.** Only use identifiers confirmed from the reference URLs or reliable secondary sources.
- **Preserve existing config structure.** Don't reformat or reorder sections outside of `providers`.
- **One default per engine.** At most one model entry per engine may have `default: true`.
- **Keep descriptions concise.** Max ~60 chars. Include cost tier (free/0x), preview status, or notable trait.
- **Keep comments.** In JSONC, preserve the `// See: <url>` header comment for each engine and inline group comments. In YAML, preserve `#` comments.
- **Date format:** Always use `YYYY-MM-DD` for the "Last updated" line in docs.
