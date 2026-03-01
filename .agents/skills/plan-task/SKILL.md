---
name: plan-task
description: Analyses a given task and creates a detailed development plan with phases and steps
---

Focus on the task provided by the user. Read the task description and any related files (code, config, prompts, etc.) to fully understand the context and the requirements.

Analyze the task and break it down into clear development phases, each with specific steps. The goal is to create a comprehensive and actionable plan that can guide the implementation of the task.

For each phase, define the specific steps that need to be taken, ensuring that they are logically ordered and cover all necessary aspects of the development process.

After outlining the phases and steps, create a `{task}.plan.md` file alongside the task file (typically in `tasks/drafts/`). This file will serve as a reference and progress tracker throughout the implementation of the task.

After creating/updating the plan, ask the user if the plan is accepted.

If the user provides feedback:
- iterate on the plan based on that feedback
- update `{task}.plan.md`
- ask again whether the plan is accepted
- repeat until the user explicitly accepts

Move the task from `tasks/drafts/` to `tasks/ready/` (draft → ready) only after explicit user acceptance. If a plan file exists in drafts, move it to `tasks/ready/` as well.

Then update BACKLOG.md:
- remove/update the entry from the "Drafts" section
- add/update the entry in the "Ready Tasks" section
- ensure task/plan links point to `./ready/...` (relative to `tasks/BACKLOG.md`)
- ensure the task does not remain listed in any other section

If the plan is not yet accepted, keep the task in Drafts (folder + BACKLOG section) and do not move it to Ready.

BACKLOG link convention (mandatory):
- use only relative links from `tasks/BACKLOG.md`
- never use `tasks/...` prefixes inside BACKLOG entries
