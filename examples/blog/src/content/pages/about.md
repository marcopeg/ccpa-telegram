---
slug: about
title: About HAL
description: HAL is a Telegram bot that connects you to AI coding agents — Claude Code, GitHub Copilot, Codex, and more — right from your phone.
pubDate: 2026-01-01
heroImage: /blog-placeholder-about.jpg
---

**HAL** is a Telegram bot that gives you access to AI coding agents as a personal assistant.

Send a message, get a working agent. No IDE, no terminal — just Telegram.

---

## What HAL does

HAL runs one AI coding agent subprocess per project, each in its configured working directory. You pick your engine — Claude Code, GitHub Copilot, Codex, OpenCode, Cursor — globally or per project.

The agent has full access to your project: it reads and writes files, runs shell commands, uses MCP tools, and executes custom slash commands you define.

---

## Engines

HAL supports multiple AI backends:

- **Claude Code** (Anthropic)
- **GitHub Copilot**
- **Codex** (OpenAI)
- **OpenCode**
- **Cursor**
- **Antigravity**

Switch engines per session with `/engine`, or set a default in `hal.config.yaml`.

---

## Why Telegram?

Because it's already on your phone. It works anywhere, has great notifications, and you never have to think about "opening an app." You just send a message — the same way you'd text a friend.

HAL lives where the conversation already is.

---

## Get started

See the [quickstart guide](/hal-quickstart) to be up and running in 5 minutes.
