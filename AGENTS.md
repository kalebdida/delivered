# DELIVERED · rules for every AI agent working in this repo

## 1. AUTHORSHIP (non-negotiable)
This is Kaleb Dida's project (Kal, @kalebdida). He is the sole author and the only contributor.

- NEVER add AI attribution anywhere. That means no `Co-Authored-By: Claude`, no `Generated with Claude Code`, no robot emoji lines, no "written by AI" notes, and no AI attribution of any kind in commit messages, PR titles or descriptions, code comments, README, docs, package.json, LICENSE, or the website itself.
- NEVER change `git config user.name` or `git config user.email`. Commit with the identity already configured on this machine.
- Before your first commit, run `git config user.name` and `git config user.email`. If either is empty, or shows an AI or bot identity (for example "Claude" or an anthropic.com / openai.com address), STOP and tell Kal. This is the only situation where you should stop and ask.
- Every package.json: `"author": "Kaleb Dida (@kalebdida)"`.
- LICENSE: MIT, `Copyright (c) 2026 Kaleb Dida` for the code. Scripture texts stay under their own terms (see CONVENTIONS.md).
- The site footer credits: "Made by Kaleb Dida". No AI credits.

## 2. HOW TO WORK
- Work directly and efficiently. Do not spawn subagents (they burn Kal's usage limit).
- Do not hand Kal manual steps. If something can be done with a command, do it yourself.
- Read before building: `CONVENTIONS.md`, `DESIGN.md`, `packages/core/README.md` (these exist after Phase 1).
- Only touch the folder your prompt assigns you.
