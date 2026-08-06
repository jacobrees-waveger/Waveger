# Waveger

A TypeScript web + mobile product. Stack decisions are still open — see
`docs/research/agent-tooling.md` and `docs/research/next-steps.md`.

## Engineering principles

- Do not preserve backward compatibility. Remove obsolete paths instead of
  adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current
  requirements. Avoid speculative abstractions, configuration, and
  indirection.
- Grow the system in layers. Start from the smallest version that works end
  to end, and add each new capability on top of a product that already
  works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall
  complexity or improve reliability. Do not reimplement common
  functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own
  implementation or adding packages. Do not assume a library lacks a
  capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap
  that only works for now and is meant to be replaced later.

## Agent skills

### Issue tracker

Issues live in **Linear**, team `Waveger` (`WAV-*`), reached through Orca's CLI:
`orca linear ... --workspace fb959783-b1df-489f-a228-87c38bed4271`. Orca is
connected to three Linear workspaces and does not infer one from the directory,
so **that flag is mandatory** — omitting it silently targets Sift. There is
deliberately no Linear MCP server; don't add one. See
`docs/agents/issue-tracker.md`.

### Triage labels

The five canonical role names verbatim — `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix` — as workspace-level Linear
labels, with `bug`/`enhancement` mapping to `Bug`/`Feature`. Change them with
`orca linear label add` / `label remove`, never `label set`. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and one `docs/adr/` at the repo root, both
created lazily. See `docs/agents/domain.md`.
