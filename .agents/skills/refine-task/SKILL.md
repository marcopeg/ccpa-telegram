---
name: refine-task
description: Initiates a task refinement session on a given task
---

Focus on the task provided by the user. Read the task description and any related files (code, config, prompts, etc.) to fully understand the context and the requirements.

Analyze the project's context and codebase to identify any ambiguities or unclear requirements in the task description. The goal is to ensure a clear and actionable task definition for development.

Refinement scope rule (mandatory):
- refinement is only for ambiguity reduction and context definition
- do not create an execution/development plan in this skill
- do not create or edit `{task}.plan.md` in this skill
- do not move the task across lifecycle sections/folders in this skill

Start a refinement session by asking the user up to 3 clarifying questions about the task. The goal is to reduce ambiguity and ensure a clear understanding of the task requirements.

After receiving the user's answers, integrate the new information into the task's file (e.g., `tasks/drafts/002.local-config.md`) to update and clarify:
- context and constraints
- explicit expectations
- clear acceptance criteria

Continue asking questions and refining the task until you are fully satisfied with the clarity and completeness of the task description. The final refined task should be clear, unambiguous, and actionable for development.
