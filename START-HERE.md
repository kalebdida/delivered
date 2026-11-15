# DELIVERED · start here

Three Three.js experiences, one website, one shared engine. Made by Kaleb Dida.

| Room | Verse | Theme |
| --- | --- | --- |
| WRETCHED | Romans 7:15 to 8:2 | delivered from yourself |
| UNDERNEATH | Deuteronomy 33:26-27 | caught when everything falls |
| GAIN | Philippians 1:12-25 | even death becomes gain |

## What's in this folder
- `CLAUDE.md` / `AGENTS.md`: rules every agent reads automatically (Claude Code reads CLAUDE.md, Codex reads AGENTS.md). Authorship rule: you are the only author, no AI credits anywhere.
- `.claude/settings.json`: turns off Claude Code's automatic "Co-Authored-By" commit lines.
- `PROMPT-00-CORE.md`: Phase 1 (engine + design system + hub + GitHub setup).
- `apps/<room>/PROMPT.md`: Phase 2, one per room.

## Before Phase 1 (one time, 1 minute)
In a terminal on your laptop, check your git identity is YOU:
```
git config --global user.name    # should print your name
git config --global user.email   # should print your GitHub email
```
If `gh` (GitHub CLI) is installed and logged in (`gh auth status`), the Phase 1 agent creates a private GitHub repo called `delivered` and pushes everything automatically.

## Phase 1 · the core (one agent, alone)
Open Claude Code (or Codex) inside this `delivered/` folder and say:
`Read PROMPT-00-CORE.md and build it.`
At the end it creates three sibling folders for Phase 2: `../delivered-wretched`, `../delivered-underneath`, `../delivered-gain`.

## Phase 2 · the three rooms (three agents, in parallel)
| Open a session in | Say |
| --- | --- |
| `../delivered-wretched` | `Read apps/wretched/PROMPT.md and build it.` |
| `../delivered-underneath` | `Read apps/underneath/PROMPT.md and build it.` |
| `../delivered-gain` | `Read apps/gain/PROMPT.md and build it.` |

Each one is its own branch and only touches its own room, so merging is clean.

## Phase 3 · merge and ship
In the main `delivered/` folder say: `Merge app/wretched, app/underneath and app/gain into main, run pnpm build, fix anything broken, push, and deploy dist/ to Netlify.`

## Recommended focus
Lead with WRETCHED (smallest scope, strongest mechanic). Give UNDERNEATH the most visual review time, since it is the most beautiful room.
