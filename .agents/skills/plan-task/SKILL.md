---
name: plan-task
description: Analyses a given task and creates a detailed development plan with phases and steps
---

Focus on the task provided by the user. Read the task description and any related files (code, config, prompts, etc.) to fully understand the context and the requirements.

Analyze the task and break it down into clear development phases, each with specific steps. The goal is to create a comprehensive and actionable plan that can guide the implementation of the task.

For each phase, define the specific steps that need to be taken, ensuring that they are logically ordered and cover all necessary aspects of the development process.

After outlining the phases and steps, create a `{task}.plan.md` file that documents the entire development plan. This file will serve as a reference and progress tracker throughout the implementation of the task.

Once the plan is complete, move the task from `tasks/drafts/` to `tasks/ready/` (draft → ready). If a plan file exists in drafts, move it to `tasks/ready/` as well.

Then update BACKLOG.md:
- remove/update the entry from the "Drafts" section
- add/update the entry in the "Ready Tasks" section
- ensure all task/plan links point to `tasks/ready/...`
