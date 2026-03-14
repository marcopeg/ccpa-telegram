# AGENTS — Obsidian-compatible CRM schema

This file defines the CRM schema and conventions for notes used by automation agents. Each entity is tracked in the note's YAML frontmatter using Obsidian [[wikilinks]] for relationships. Place notes in the folders listed under each entity.

General conventions
- Filenames: kebab-case (e.g., `john-doe.md`, `acme-inc.md`).
- Frontmatter keys: snake_case.
- Dates: ISO (YYYY-MM-DD). Birthdays may be future dates.
- Use Obsidian [[links]] inside frontmatter arrays and single values when referencing other notes.
- Primary discriminator: `type` frontmatter key.

Entity: person
- type: person
- folder: crm/people
- frontmatter keys:
  - type: person
  - name: "Full Name"  # optional if filename/title is used
  - birthday: YYYY-MM-DD  # optional; include only when known
  - company: [[Company]]  # optional single company reference
  - teams: [ [[Team 1]], [[Team 2]] ]  # optional array of references
  - notes: "short freeform text"

Example: crm/people/marco-rossi.md
---
type: person
name: Marco Rossi
birthday: 1986-06-14
company: [[Acme Inc]]
teams: [ [[Engineering]], [[Product]] ]
notes: "Met at conference; follow-up in Q2."
---

Entity: company
- type: company
- folder: crm/company
- frontmatter keys:
  - type: company
  - name: "Company Name"
  - domain: "example.com"  # optional
  - notes: "short freeform text"

Example: crm/company/acme-inc.md
---
type: company
name: Acme Inc
domain: acme.example.com
notes: "Primary partner for X."
---

Entity: project
- type: project
- folder: crm/projects
- frontmatter keys:
  - type: project
  - name: "Project Name"
  - company: [ [[Acme Inc]], [[OtherCo]] ]  # optional array
  - participants: [ [[Marco Rossi]], [[Jane Doe]] ]  # optional array of people
  - status: active|planned|archived  # optional
  - notes: "short freeform text"

Example: crm/projects/project-alpha.md
---
type: project
name: Project Alpha
company: [ [[Acme Inc]] ]
participants: [ [[Marco Rossi]], [[Jane Doe]] ]
status: active
notes: "Phase 1: discovery"
---

Entity: meeting
- type: meeting
- folder: crm/meeting
- frontmatter keys:
  - type: meeting
  - title: "Short title"
  - date: YYYY-MM-DD
  - participants: [ [[Marco Rossi]], [[Jane Doe]] ]  # optional
  - project: [[Project Alpha]]  # optional
  - location: "remote / room"
  - notes: "agenda / minutes"

Example: crm/meeting/kickoff-project-alpha-2026-03-14.md
---
type: meeting
title: Kickoff — Project Alpha
date: 2026-03-14
participants: [ [[Marco Rossi]], [[Jane Doe]] ]
project: [[Project Alpha]]
location: "Zoom"
notes: "Discussed scope and deliverables."
---

YAML linking rules
- Single-value link: company: [[Acme Inc]]
- Array of links: participants: [ [[A]], [[B]] ]
- Keep links exactly as Obsidian wikilinks so backlinking works.

Dataview examples
- People with birthdays:
```dataview
TABLE name, birthday, company
FROM "crm/people"
WHERE type = "person" AND birthday
SORT birthday asc
```

- Meetings for a project:
```dataview
TABLE date, title, participants
FROM "crm/meeting"
WHERE project = [[Project Alpha]]
```

Templates (suggested)
- Templater snippet: person
---
type: person
name: <% tp.file.title %>
birthday:
company:
teams: []
notes:
---

Validation notes for agents
- Agents should parse YAML frontmatter and use `type` to route handling.
- Treat unknown or missing optional fields as empty/omitted.
- Preserve wikilinks verbatim when writing or syncing.
- For arrays, ensure values are proper YAML arrays (do not use comma-separated strings without YAML array syntax).

Workflows
- Create person notes when first meeting someone, fill company/teams only if relevant.
- Create company notes for organizations you interact with.
- Use project notes to aggregate participants and link related meetings.
- Use meeting notes to capture participants, date, and minutes; include a link to the associated project if relevant.

Extending the schema
- To add a new entity type, add a new section with `type`, `folder`, required/optional keys, and examples.
- Keep AGENTS.md updated when agents or automation rely on new fields.

Contact
- If agents or import/export scripts need special behavior (validation, enrichment, lookup), document the desired logic here so automation can be implemented consistently.
