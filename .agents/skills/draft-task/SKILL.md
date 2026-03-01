---
name: draft-task
description: Creates a new task markdown file in the "Drafts" section of BACKLOG.md, based on a user-provided task description and an optional development plan.
---

Identify the last available task number in BACKLOG.md and create a new markdown file in the `tasks/drafts` directory with the next sequential number (e.g., if the last task is 010, create 011). The file should be named in the format `tasks/drafts/XXX.task-name.md`, where `XXX` is the zero-padded task number and `task-name` is a kebab-case version of the task description.

Link this new draft task in the "Drafts" section of BACKLOG.md, ensuring that it is properly formatted and includes a link to the newly created markdown file. If a development plan is provided, create a corresponding plan file named `tasks/drafts/XXX.task-name.plan.md` and link it in the task markdown file. The task status should be set to "draft".