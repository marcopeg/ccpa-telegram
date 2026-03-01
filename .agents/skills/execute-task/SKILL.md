---
name: execute-task
description: Executes a given task based on a detailed development plan
---

Focus on the task provided by the user. Read the task description, the plan and any related files (code, config, prompts, etc.) to fully understand the context and the requirements.

Before executing the task:
- move the task file into the root `tasks/` directory (for execution state)
- if the task is in `tasks/drafts/` or `tasks/ready/`, move it to `tasks/`
- move the plan file to `tasks/` as well when present
- update BACKLOG.md so the task appears in "In Progress" with links pointing to `./...` (relative to `tasks/BACKLOG.md`)
- remove the task entry from "Drafts" and "Ready Tasks" if present, so it appears in exactly one section

Important lifecycle rule:
- never move the task or plan file to `tasks/completed/` in this skill
- never place/update the task in the "Completed" section of BACKLOG.md in this skill
- completion transitions are handled only by the `complete-task` skill

BACKLOG link convention (mandatory):
- use only relative links from `tasks/BACKLOG.md`
- for in-progress root tasks use `./XXX.task-name.md` and `./XXX.task-name.plan.md`
- never use `tasks/...` prefixes inside BACKLOG entries

Then, execute the task as specified in the task's plan file. This may involve writing code, configuring systems, or performing other actions as needed to complete the task successfully.

Make sure to follow the instructions in the plan carefully, and refer back to the task description and related files as needed to ensure that you are meeting all requirements and delivering the expected results.

When a plan step or phase is completed, flag it as done in the plan document and move on to the next step or phase until execution is finished. Leave the task in the execution state (`tasks/` + "In Progress") and hand off final completion to `complete-task`. If you encounter any issues or need clarification, refer back to the task description and related files, and if necessary, ask for additional information from the user.

Annotate your actions and decisions in the plan file as you execute the task, providing explanations for why you are taking certain steps or making specific choices. This will help ensure that your execution is transparent and that the user can understand the rationale behind your actions.