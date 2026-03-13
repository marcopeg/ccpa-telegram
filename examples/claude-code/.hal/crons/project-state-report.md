---
enabled: true
schedule: "0 6 * * *"
runAs: 7974709349
---

Scan the project at `@{./}` and produce a brief "state of the art" report covering:

1. **Recent changes** — any modified or new files since the last git commit (run `git status` and `git log --oneline -5`)
2. **Active crons** — list what's in `.hal/crons/` and whether each is enabled
3. **Key structure** — note anything notable about the project layout (new skills, commands, configs)

Keep it short (5–10 lines). Use plain text with minimal formatting. No fluff — just the facts.
