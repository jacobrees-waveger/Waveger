# Domain Docs

How the engineering skills should consume this repo's domain documentation when
exploring the codebase.

This repo is **single-context**: one `CONTEXT.md` and one `docs/adr/` at the
root.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one
  `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In
  multi-context repos, also check `src/<context>/docs/adr/` for context-scoped
  decisions.

If any of these files don't exist, **proceed silently**. Don't flag their
absence; don't suggest creating them upfront. The `/domain-modeling` skill
(reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates
them lazily when terms or decisions actually get resolved.

Both now exist: `CONTEXT.md` at the root, and ADRs 0001–0007 in `docs/adr/`,
written during the grilling session of 2026-08-06. Read them before proposing
architecture — several record decisions that deliberately reject the obvious
option.

## File structure

Single-context repo (this repo, and most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

Waveger spans a Next.js web app and a React Native/Expo mobile app. That is a
platform split, not a domain split — keep one shared `CONTEXT.md` unless the two
genuinely diverge in their domain language, at which point revisit this choice.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal,
a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift
to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either
you're inventing language the project doesn't use (reconsider) or there's a real
gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than
silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

## Related

`docs/research/` holds investigation output from `/research`. It is **not**
domain documentation — don't treat its contents as decisions. Decisions belong
in `docs/adr/`.
