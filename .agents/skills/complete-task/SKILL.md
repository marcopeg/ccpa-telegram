---
name: complete-task
description: Marks a task a completed and moves it to the "Completed" section of BACKLOG.md.
---

Focus on the task provided by the user, identify the task file and the relative plan file, then move the task markdown from BACKLOG.md to the corresponding section in completed/ and update the task status to "completed". Ensure that all links and references are updated accordingly.

Also move the task and plan files to the completed/ directory, maintaining the same structure. For example, if the task file is tasks/010.opencode.md and the plan file is tasks/010.opencode.plan.md, they should be moved to completed/010.opencode.md and completed/010.opencode.plan.md respectively.