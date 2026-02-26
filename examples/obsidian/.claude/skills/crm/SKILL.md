---
name: crm
description: Explains how to navigate the project file system to find and relate documents. Use it every time the user wants to read or write about people, projects, meetings, notes, todos, tasks and any other crm-related topic.
---

# CRM Skill

This is an Obsidian vault.
Markdown documents have a frontmatter section with metadata, and a content section with the main text.

The attribute "type" is used to classify documents into categories such as "person", "project", "meeting", "note", "todo", "task", etc. The attribute "name" is used to give a human-readable name to the document. The attribute "related" is used to link documents together by referencing their names.

Documents can be organized in folders, but the folder structure is not strictly defined and can be used flexibly. The main way to find and relate documents is through their metadata attributes, especially "type", "name", and "related". When the user asks about any of these entities or how to find or relate them, you should use this information to provide accurate and helpful responses.

Whenever the users refers to CRM entities, make sure you read from the proper files or write to update or create entities that are relevant to the user's request. Person files are stored in the `people/` folder, meeting files in the `meetings/` folder. Always use the "related" attribute to link documents together when they are related, and use the "name" attribute to identify documents in a human-readable way.

When you relate documents, always use cross links in Obsidian style making sure the link points to the real file location.

## Meetings

**File naming and location are mandatory.** Whenever creating new meeting notes, **always** create files in the `meetings/` folder using the filename template:
```
meetings/meeting-with-{{related}}-on-{{date}}.md
```

Where:
- `{{related}}` = name of the person or entity involved (capitalize first letter)
- `{{date}}` = date in YYYY-MM-DD format (from the message or telegram metadata)

**Examples:**
- `meetings/meeting-with-Claudio-on-2026-02-26.md`
- `meetings/meeting-with-Antonio-on-2026-02-25.md`

**Frontmatter requirement:** All meeting notes **must** include a `date` property in the frontmatter with a complete ISO 8601 datetime (YYYY-MM-DDTHH:MM:SS format, including minutes). 

- If the user provides a specific date/time, use that value.
- If the user does not provide a date/time, use the message timestamp from the Telegram context (e.g., `bot.datetime` or `sys.datetime`).

Example frontmatter:
```yaml
---
date: 2026-02-26T21:56:44
type: meeting
participants:
  - [[../people/Claudio]]
  - [[../people/Marco]]
---
```

**Wiki-links in meetings:** When linking to people from meeting notes, use relative paths: `[[../people/PersonName]]` to reference files in the people folder.