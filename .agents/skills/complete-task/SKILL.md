---
name: complete-task
description: Marks a task a completed and moves it to the "Completed" section of BACKLOG.md.
---

Focus on the task provided by the user, identify the task file and the relative plan file, then move the task markdown from "In Progress" (root `tasks/`) to the "Completed" section in BACKLOG.md and update the task status to "completed". Ensure that all links and references are updated accordingly.

Also move the task and plan files from `tasks/` to `tasks/completed/`, maintaining the same filename. For example, if the task file is `tasks/010.opencode.md` and the plan file is `tasks/010.opencode.plan.md`, they should be moved to `tasks/completed/010.opencode.md` and `tasks/completed/010.opencode.plan.md` respectively.

BACKLOG link convention (mandatory):
- in `tasks/BACKLOG.md`, completed entries must link as `./completed/...`
- use only relative links from `tasks/BACKLOG.md`; never use `tasks/...` prefixes

State consistency rule:
- remove the task entry from "In Progress" when adding it to "Completed"
- ensure the task appears only in "Completed" after this skill finishes