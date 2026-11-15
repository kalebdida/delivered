# DELIVERED · start here

Three Three.js experiences, one website, one shared engine. Made by Kaleb Dida.

| Room | Verse | Theme |
| --- | --- | --- |
| WRETCHED | Romans 7:15 to 8:2 | delivered from yourself |
| UNDERNEATH | Deuteronomy 33:26-27 | caught when everything falls |
| GAIN | Philippians 1:12-25 | even death becomes gain |

## Where things stand
**Phase 1 is done** and pushed to `main` on `github.com/kalebdida/delivered`: the shared core
(`packages/core`), the design system (`DESIGN.md`), the conventions (`CONVENTIONS.md`), the hub
(`apps/hub`), a playground (`packages/core/demo`) and three placeholder rooms. `pnpm build` produces
the whole site in `dist/`.

Three branches are ready for Phase 2, each created from `main` and pushed:
`app/wretched`, `app/underneath`, `app/gain`.

## What's in this folder
- `CLAUDE.md` / `AGENTS.md`: rules every agent reads automatically. Authorship rule: you are the
  only author, no AI credits anywhere.
- `.claude/settings.json`: turns off Claude Code's automatic "Co-Authored-By" commit lines.
- `PROMPT-00-CORE.md`: Phase 1 (done).
- `apps/<room>/PROMPT.md`: Phase 2, one per room.
- `DESIGN.md`, `CONVENTIONS.md`, `packages/core/README.md`: what the room agents read first.
- `DECISIONS.md`, `BEAUTY.md`: why things are the way they are, and the review scores.

## Git identity (one check, every machine or cloud session)
```
git config user.name
```
```
git config user.email
```
Both must be yours. A fresh cloud session defaults to an AI identity: the agent will stop and ask
before its first commit, which is what it should do.

## Phase 2 · the three rooms (three agents, in parallel)

**In the cloud (Claude Code on the web):** start three sessions on this repo, one per branch, and
say what the table says. Each agent only touches its own `apps/<room>/` folder and pushes to its
own branch.

| Session on branch | Say |
| --- | --- |
| `app/wretched` | `Read apps/wretched/PROMPT.md and build it. We're in the cloud: you are already on branch app/wretched, so skip the worktree step. Commit and push to app/wretched.` |
| `app/underneath` | `Read apps/underneath/PROMPT.md and build it. We're in the cloud: you are already on branch app/underneath, so skip the worktree step. Commit and push to app/underneath.` |
| `app/gain` | `Read apps/gain/PROMPT.md and build it. We're in the cloud: you are already on branch app/gain, so skip the worktree step. Commit and push to app/gain.` |

**On your laptop:** clone the repo, then make one folder per room from the pushed branches. From
inside the `delivered/` folder:
```
git fetch origin
```
```
git worktree add ../delivered-wretched app/wretched
```
```
git worktree add ../delivered-underneath app/underneath
```
```
git worktree add ../delivered-gain app/gain
```
Then run `pnpm install` in each folder and open one agent session per folder:

| Open a session in | Say |
| --- | --- |
| `../delivered-wretched` | `Read apps/wretched/PROMPT.md and build it.` |
| `../delivered-underneath` | `Read apps/underneath/PROMPT.md and build it.` |
| `../delivered-gain` | `Read apps/gain/PROMPT.md and build it.` |

Each room is its own branch and only touches its own folder, so merging is clean.

## Phase 3 · merge and ship
In the main `delivered/` folder (branch `main`) say:
`Merge app/wretched, app/underneath and app/gain into main, run pnpm build, fix anything broken, push, and deploy dist/ to Netlify.`

`netlify.toml` is ready: build command `pnpm build`, publish folder `dist`.

## Before launch (left open by Phase 1, see DECISIONS.md)
- Check four Amharic verses against a printed 1962 Bible (Deuteronomy 32:15, 33:26, 33:27 and
  Philippians 1:25): they are attested by one source only.
- Run Lighthouse on the hub and test on a real iPhone and Android phone; neither could be done in
  the cloud session.
- Look at the high quality tier (raymarched clouds) on a real GPU.

## Recommended focus
Lead with WRETCHED (smallest scope, strongest mechanic). Give UNDERNEATH the most visual review
time, since it is the most beautiful room.

## See it now
```
pnpm install
```
```
pnpm dev:hub
```
`pnpm dev:demo` opens the core playground; add `?debug` to any page for the debug tools.
