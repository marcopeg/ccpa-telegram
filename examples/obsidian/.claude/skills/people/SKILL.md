---
name: People
description: Lists only people in Sierra. Use it when the user asks for people in Sierra, Sierra contacts, or to filter person notes so only Sierra-related people are returned.
---

When the user asks for people in Sierra:

1. Read notes from the `people/` folder only.
2. Treat a note as a Sierra person only if it is a person note and it explicitly references `Sierra`.
3. Match `Sierra` only when it appears in person metadata or content, such as a `related` field, another frontmatter field, or an Obsidian wiki-link like `[[Sierra]]`.
4. Return only the matching people. Do not include any other people as guesses.
5. If nothing matches, say that no people in Sierra were found.

Keep the response concise and list only the relevant names unless the user asks for more detail.
