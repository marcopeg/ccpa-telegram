---
name: promo
description: Drafts a LinkedIn release promo from changelog + prior post (or user context), then refines and saves accepted posts to /promo/linkedin with frontmatter.
telegram: true
---

# promo

Create a short, high-performing LinkedIn update post to promote the latest HAL changes.

## Invocation

`/promo [optional context]`

Examples:

- `/promo`
- `/promo about the wizard`
- `/promo focus on cron logging and reliability`

## Core behavior

1. If the user provides arguments after `/promo`, treat that text as the primary brief.
2. If no arguments are provided, infer the brief from repository context:
- Read `CHANGELOG.md` and extract the most recent release changes.
- Read the most recent previously accepted LinkedIn post under `/promo/linkedin/` (if present) to avoid repeating the same angle/hook.
3. Produce one concise LinkedIn-ready post draft in chat.
4. Ask the user for refinement or acceptance.
5. When the user accepts, save the approved post to `/promo/linkedin/{YYMMDDhhmm}.{post-slug}.md`.

## Input precedence

Use this strict precedence:

1. User-provided `/promo ...` context (highest priority)
2. Latest `CHANGELOG.md` release notes
3. Last saved post from `/promo/linkedin/` (style and de-duplication hints only)

If user context conflicts with changelog emphasis, follow the user context.

## Embedded best-practices knowledge base (cached)

This skill stores LinkedIn writing best practices in-source so it does not need to re-fetch web pages on every run.

Use this embedded guidance as the default source of truth:

- `LinkedIn Business - How to market on LinkedIn`: avoid overly salesy copy; thought-leadership/value-first posts tend to perform better; rich media improves engagement.
- `LinkedIn Marketing Blog`: practical content framing around insights, clarity, and relevance.
- `Buffer LinkedIn Marketing Guide (2026)`: concise value-first posts, conversation-oriented CTA, and consistency.
- `Later LinkedIn Marketing Guide (2025)`: strong opening lines and focused post structure.
- `Socialinsider LinkedIn Algorithm Guide (2025/2026)`: prioritize meaningful comments and early engagement; avoid engagement bait.
- `Shield opening-lines guide (2025)`: hook quality drives "see more" expansion behavior.
- `Shield hashtags guide (2025)`: use relevant, focused hashtags and optimize over time.

Refresh policy:

- Do not fetch sources by default.
- Re-run web research only when one of these is true:
  - user explicitly asks for a fresh research pass,
  - best-practice assumptions appear stale or contradictory,
  - at least 30 days passed since the last refresh.

When doing a refresh pass, update this section in-place with the newly validated points.

Best-practice checklist to apply:

- Make HAL's high-level goal explicit in every post: `agentic management of local folders via Telegram`.
- Start with a strong first line (hook) that communicates value fast.
- Keep body concise and skimmable.
- Focus on outcomes and user impact, not only implementation detail.
- Use plain language and one clear CTA.
- Prefer 3 to 5 targeted hashtags; avoid hashtag stuffing.
- Avoid overly salesy tone; sound human and specific.
- Optionally use 1 to 3 emojis only if they improve readability.

## HAL core narrative rule (mandatory)

Every generated promo must be understandable as a standalone post.

Always include a short phrase that makes HAL's purpose visible, such as:

- `HAL applies agentic management to local folders via Telegram.`
- `HAL lets you manage local project folders with coding agents directly from Telegram.`

This line can be placed in the hook or first body paragraph, but it must appear in every draft.

## Draft format (chat output)

Return exactly these sections:

### Draft

<full LinkedIn post text, including hashtags at the end>

### Promoted features

- <feature 1>
- <feature 2>
- <feature 3>

### Why this works

- <bullet points tied to the embedded best-practice knowledge base; include source names>

### Next step

Ask: `Reply with one of: refine: <changes>, regenerate, or accept.`

## Link inclusion rule (mandatory)

Every promo post must include at least one link, and it must be one of these:

1. A link to a specific HAL documentation page under `/docs` (preferred)
2. The generic HAL LinkedIn homepage link (fallback)

Do not output a draft without one of the links above.

### Docs link conversion

When linking docs, convert a repo path like `docs/crons/README.md` to a GitHub URL using:

`https://github.com/marcopeg/hal/blob/main/<docs-path>`

Examples:

- `docs/crons/README.md` -> `https://github.com/marcopeg/hal/blob/main/docs/crons/README.md`
- `docs/setup-wizard/README.md` -> `https://github.com/marcopeg/hal/blob/main/docs/setup-wizard/README.md`

### LinkedIn homepage fallback

Use `HAL_LINKEDIN_HOMEPAGE_URL` as the fallback value. If the URL is not known in context, prefer a docs link instead of omitting a link.

## Refinement loop

- If user replies with `refine: ...`, revise the draft according to instructions.
- If user replies `regenerate`, generate a new angle (different hook and CTA).
- Continue until user replies `accept` (or clear equivalent such as `looks good`, `approved`, `ship it`).

## Save-on-accept behavior

When accepted:

1. Ensure directory exists: `/promo/linkedin/`
2. Build filename:
- Timestamp format: `YYMMDDhhmm`
- Slug from post title/first meaningful phrase, kebab-case
- Final path: `/promo/linkedin/{YYMMDDhhmm}.{post-slug}.md`
3. Save a Markdown file with this structure:

```markdown
---
target: linkedin
date: YYYY-MM-DD HH:mm
title: <post title>
tags:
  - hashtag1
  - hashtag2
  - hashtag3
features:
  - <feature 1>
  - <feature 2>
---

<full final LinkedIn post text, including hashtags>
```

Rules:

- `target` is always `linkedin`.
- `date` is full local date-time.
- `tags` must be plain hashtag labels without `#` in frontmatter (example: `ai`, `telegram`, `devtools`).
- In post body, include hashtags with `#`.
- `features` should list concrete shipped capabilities being promoted.

## Source scanning details

When changelog-driven:

- Prioritize the newest released version section in `CHANGELOG.md`.
- Extract 2 to 4 strongest user-facing improvements.
- Prefer items with clear user benefit (speed, reliability, UX, setup simplicity, compatibility).

When reviewing previous post:

- Read the newest file in `/promo/linkedin/` by filename timestamp.
- Avoid repeating identical opening hook and hashtag set.
- Keep brand/style continuity while varying phrasing.

## Quality bar

The final post must be:

- Short (typically 60 to 140 words unless user asks otherwise)
- Specific about what changed
- Readable in one screen on mobile
- Hashtag-optimized but not spammy
- Ready to copy-paste to LinkedIn without further edits
