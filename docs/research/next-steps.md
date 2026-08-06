# Waveger — state of play & next actions

Written 2026-08-06. Companion to [agent-tooling.md](./agent-tooling.md), which holds the full research and verdicts.

## Done

Five plugins installed:

| Plugin | Scope | Always-on cost |
|---|---|---|
| `vercel` | user | ~2,950 tok — 30 skills (nextjs, react-best-practices, shadcn, turbopack…) |
| `expo` | **project** | ~3,307 tok — 21 skills incl. 6 EAS |
| `skills@swmansion` | **project** | ~2,463 tok — 7 skills, only `react-native-best-practices` is vendor-neutral |
| `typescript-lsp` | user | negligible |
| `frontend-design` | user | negligible |

Project-scoped ones are declared in `.claude/settings.json`, so they follow into every Orca worktree.

**Restart Claude Code before relying on any of them** — plugins load at startup.

## Blocked until the app exists

These are not deferred by preference; they have nothing to connect to yet.

| Install | Unblocked by |
|---|---|
| `next-devtools-mcp` (project `.mcp.json`) | a running Next 16+ dev server |
| `npx skills add vercel/next.js --skill next-dev-loop` | same |
| `npx shadcn@latest mcp init --client claude` | deciding to use shadcn + a `components.json` |
| `claude mcp add metro-mcp -- npx -y metro-mcp` | a running Metro server |
| `chrome-devtools-mcp` | a page worth profiling (add for a perf pass, remove after) |
| `github` MCP | **a git remote — Waveger has none** |
| `supabase` MCP | choosing Supabase + a dev project ref |
| `apple-docs` (re-add, project-scoped) | first `@expo/ui/swift-ui` or native module |
| `swift-lsp` | writing actual Swift |

## Open decisions

1. **Git remote.** None configured. Blocks the GitHub issue-tracker option and the GitHub MCP.
2. **Issue tracker** — see the trap below.
3. **Monorepo shape.** Drives whether domain docs are single- or multi-context. Should come out of the grill, not out of a scaffolding default.
4. **`orca.yaml`** not yet written — see agent-tooling.md for the recommended `setup` hook (copies `.env` + `.claude/settings.local.json` into new worktrees, derives per-worktree Metro ports).
5. **`.playwright-mcp/`** is untracked in the repo root and should be gitignored.

## The mattpocock flow

```
/setup-matt-pocock-skills     ← once per repo, before anything else
        ↓
/grill-with-docs              ← = /grilling + /domain-modeling
        ↓
   small? ─────────────→ /implement
        ↓ large
/to-spec → /to-tickets → /implement
```

All of these carry `disable-model-invocation: true` — **only the human can invoke them.** 34 skills exist on disk; only 11 are exposed to the model.

### Before

- Restart so `expo`/`vercel` skills are loaded — they carry SDK constraints the grill would otherwise dispatch sub-agents to find
- Run `/setup-matt-pocock-skills` first; `to-spec`, `to-tickets` and `wayfinder` all hard-require its output
- Point the grill at `docs/research/agent-tooling.md` as a fact source — grilling's rule is "finding facts is your job, never the user's"
- Treat the domain-layout answer as **provisional**: the repo is empty, so setup sees no monorepo signals and will default to single-context. Edit `docs/agents/domain.md` later rather than letting it pre-decide the monorepo question
- Expect a triage-labels question — the `triage` skill folder is present, so Section B will run

### Issue tracker trap

- **GitHub** — unavailable as-is; no git remote exists
- **Local markdown (`.scratch/`)** — natural for solo work, but **breaks with Orca worktrees**: `.scratch/` in one worktree is invisible from another
- **Linear** — best supported by *Orca* (`orca worktree create --linear-issue`, `orca linear … --current`), but mattpocock's setup treats it as "Other" and records it as freeform prose

### During

- **Expect rounds, not one question at a time.** Blog write-ups describe one-at-a-time; installed v1.2.2 asks the whole frontier per round, numbered, each with a ➡️ recommended answer. The skill file governs
- The value is in the **disagreements** — accepting every recommendation yields Claude's understanding with your signature on it
- Keep `CONTEXT.md` a pure glossary: "totally devoid of implementation details"
- ADRs only when all three hold: hard to reverse, surprising without context, a real trade-off. Genuine day-one candidates: monorepo shape, Expo vs bare RN, web/mobile shared-code strategy

### After

Waveger is unambiguously **large work**, so not straight to `/implement`.

Consider **`/wayfinder`** before `/to-spec` — the blog flow omits it. The distinction: `to-spec`/`to-tickets` slice *known work* into vertical tracer bullets; `wayfinder` resolves *unknown decisions* one at a time with fog-of-war for what isn't sharp enough to ticket. Waveger currently has unresolved decisions, not merely unsliced work. Wayfinder produces the clarity `to-spec` consumes — sequential, not alternatives.

Then one ticket per Orca worktree (`to-tickets` sizes each to one context window; `/implement` commits to the current branch).

**Run the grill and the scaffolding in separate sessions.** Matt's stated ceiling is ~140K tokens to stay in the "smart zone"; the five plugins spend ~8.7k always-on before you type anything.

## Suggested order from here

1. Restart Claude Code
2. Decide the git remote question (unblocks tracker + GitHub MCP)
3. `/setup-matt-pocock-skills`
4. `/grill-with-docs` — decide monorepo shape, Expo vs bare RN, backend, shared-code strategy
5. `/wayfinder` or `/to-spec` → `/to-tickets` depending on how much fog is left
6. Scaffold (`create-next-app`, `create-expo-app`) in a fresh session
7. Write `orca.yaml`, gitignore `.playwright-mcp/`
8. Install the blocked Tier 2 MCPs now that they have something to connect to
