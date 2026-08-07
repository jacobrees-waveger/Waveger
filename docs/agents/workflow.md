# Workflow

Trunk-based, solo. One `main`, short-lived branches, a Vercel preview per
branch, squash-merge to land.

This file is the policy. `/draft-pr` and `/review-pr` are the procedure and
defer to it — a rule belongs here, a step belongs in the skill.

## Why a PR at all, for one developer

There is nobody to review it, so the PR is not doing what a PR usually does. It
earns its place twice over anyway:

- **Vercel builds `main` as Production on every push.** Nothing sits between a
  commit and the live site. Observed rather than assumed: pushing `41e4a40`
  produced a production deployment and registered a cron entry with it. A branch
  gets a preview deployment on its own Neon database branch (ADR 0008), so a
  change can be seen working before production sees it.
- **`/code-review` compares against a commit.** Its first step resolves the
  fixed point and refuses an empty diff, so run against work that is not
  committed yet it stops before reviewing anything. `/implement` commits last,
  which puts the review in exactly that gap. A branch and a PR give it a real
  range. (Staging first and pointing it at `git diff --cached` works, and is a
  workaround for the missing branch rather than a way of life.)

So the states mean: **draft** is "not yet reviewed", **ready** is "reviewed, and
the preview works". Nobody is being signalled — the states are for you.

## Branches

The branch name must carry the Linear identifier, in **upper case**, because
that is the form `orca linear` matches: names are accepted "only when they match
exactly" (`issue-tracker.md`). Nothing else about the name is prescribed.

```
main                          production-ready; Vercel deploys it on push
WAV-11-apify-chart-source     anything else
```

No `feature/` or `fix/` prefix — nothing in this project reads one.

**Under Orca**, create the worktree with both the name and the link:

```bash
orca worktree create --name WAV-11-apify-chart-source --linear-issue WAV-11
```

`--linear-issue` is the part that matters. Orca keeps the issue as worktree
metadata rather than reading it off the branch, which is what makes
`orca linear issue --current` work — and `--current` is the only form that needs
no `--workspace`. The identifier in the branch name is the fallback for a
worktree that was never linked, which is the state every existing Waveger
worktree is in.

## The gh account trap

Three GitHub accounts are authenticated on this machine and **only one can write
to this repo**:

| Account | Access |
|---|---|
| `jacobdrees` | `push=true`, `admin=true` |
| `jacobreesdev` | none — and it is usually the active one |
| `vepple-jr` | none |

`git push` works whatever is active, because it goes over SSH and the key
decides. `gh` does not: `gh pr create` fails with a 403 that reads like a
permissions problem with the repo rather than with the account. Switch first:

```bash
gh auth switch --user jacobdrees
```

## The loop

```bash
git checkout main && git pull --ff-only
git checkout -b WAV-11-apify-chart-source     # or an Orca worktree, above
# ...work, via /implement...
/draft-pr                                     # push, open the draft, link Linear
/mattpocock-skills:code-review main           # two-axis review against the branch point
/review-pr                                    # checks, preview, ready, squash-merge
```

Two different things answer to the name *code review* and it is worth keeping
them apart: `mattpocock-skills:code-review` is the two-axis Standards/Spec
review that takes a fixed point, and the built-in `/code-review` takes an effort
level, or `ultra <PR#>` for a cloud review of a GitHub PR. Either works on a
branch; neither works before there is one.

- **Squash-merge only.** One ticket, one branch, one commit on `main`. The repo
  still permits merge commits and rebase merges; do not use them.
- **Rebase to stay current**, never merge `main` in:
  `git rebase main && git push --force-with-lease`.
- **Commit subjects are prose, not Conventional Commits.** `Close the operator
  routes with a shared secret`, not `feat(api): add operator secret`. Nothing
  enforces it — there is no Husky here — and it is a chosen style: the subject
  says what changed about the product, the body says why. A single-commit PR
  squashes under its commit title, so the PR title should match it.
- **Urgent fixes take the same path.** There is no hotfix lane. The preview is
  worth more when you are in a hurry, not less.

## The gates

What actually has to be true before a branch lands. `/review-pr` checks these.

**`pnpm test && pnpm typecheck && pnpm lint`.** There is no CI in this repo, so
this is the only thing that runs them. Two things ride along inside `pnpm test`
that are easy to mistake for separate steps: `status.test.ts` compares the
committed `packages/api/openapi.json` against what the routes generate, so
contract drift fails the suite; and `pnpm lint` carries the ADR 0001 import
boundary.

`gh pr view --json statusCheckRollup` is not a substitute. It is not empty —
Vercel posts a deployment status to every PR — it just has no CI in it, so a
green rollup means the preview built, and nothing about the tests.

**The preview deployment works.** It runs on its own Neon database branch
(ADR 0008), so it is a real environment and not a smoke screen.

**A schema change carries its pair.** A migration in `packages/db/migrations`
and the matching edit to `packages/db/src/schema.ts` belong in the same commit.
Nothing checks this — there is no generator and no schema DSL (ADR 0004) — so it
is a human check or it is nothing.

## After the merge

**Verify what the ticket promised, in production.** Not optional, and not
something the suite can do: this repo ships behaviour that lives in project
settings and platform state — cron registration, environment variables, function
configuration — which no file in the repo can assert. ADR 0011 is the nearest
cautionary tale: a protection nobody had chosen was removed, and nothing
noticed for a day.

**Close out Linear.** Status to Done, and a comment saying what shipped and what
to expect. See `issue-tracker.md`.

A landed issue ends up carrying **no** triage role label. `triage-labels.md`
says exactly one per *triaged* issue, and that stays true while an issue is
waiting to be worked; once it has shipped there is nothing left to route, and
`ready-for-agent` on a merged ticket is simply false. Delivery state lives in
Linear's workflow state, which is the axis that has a `Done`.

**Anything found on the way** becomes its own Linear issue, not a late commit on
a branch that is about to merge.
