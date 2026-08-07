---
name: review-pr
description: Land a reviewed draft PR — run the gates, mark it ready, squash-merge, and close out Linear.
disable-model-invocation: true
argument-hint: 'PR number or URL (optional; defaults to the PR for the current branch)'
---

Take a reviewed draft PR to production. `docs/agents/workflow.md` has the gates
and why they are the gates; this is the procedure.

Solo, "mark ready" signals nobody and GitHub simply refuses to merge a draft, so
it is a step on the way rather than the destination. This skill is the landing.

**A code review should already have run against this branch.** If it has not,
say so and stop.

## Steps

1. **Resolve the PR.** The argument if given, otherwise the current branch's.
   `gh auth switch --user jacobdrees` first — only that account can write here.

   ```bash
   gh pr view --json number,url,isDraft,mergeable,baseRefName
   ```

   If it is already not a draft, report that and stop: this skill has likely run
   before, and re-running it would merge without re-checking anything.

2. **Run the gates.** No CI exists, so this is the only thing that runs them:

   ```bash
   pnpm test && pnpm typecheck && pnpm lint
   ```

   Anything red stops the landing — report what failed and do not mark ready.
   `statusCheckRollup` is not a substitute: it carries Vercel's deployment
   status and no tests at all.

3. **Confirm the preview.** Read the Vercel preview URL from the PR's checks or
   comments. It runs on its own Neon database branch (ADR 0008), so it is a real
   environment.

   **Ask the user to confirm they have looked at it**, unless they have already
   said so. This is what a solo repo has instead of a reviewer, and an agent
   asserting that a page looks right is not the same as a person seeing it.

   Two cases where there is nothing to confirm, and saying so is better than
   asking: a documentation-only PR has no runtime change, and a **migration-only
   PR** (ADR 0015) proves nothing on a preview either — nothing in the build
   migrates, so that Neon branch does not have the new migration and the preview
   is running the old schema by design.

4. **Tick the body's checklist** to match what is now true, so the PR records the
   state it merged in rather than the state it opened in.

5. **Mark ready.** `gh pr ready`. Reversible with `gh pr ready --undo`.

6. **Ask before merging.** This is the one step here that puts the change into
   production and the one that is not a click away from being undone.

   **If the PR touches `packages/db/migrations`, check it against ADR 0015
   before asking.**

   ```bash
   gh pr diff --name-only
   ```

   Two questions, and the first is mechanical. **Does the PR carry a migration
   *and* anything else but `packages/db/src/schema.ts`?** Everything else —
   `packages/api`, `packages/domain`, `packages/db/src/*`, either app — is code
   that could depend on it. If so, **stop and say so**: deploy-then-migrate means
   that PR is guaranteed to run its code against the old schema, and an `insert`
   naming a column that does not exist yet raises rather than degrades. It splits
   into a migration PR and a code PR.

   The second needs you to read the SQL, and cannot be shortcut by asking whether
   it is additive — a `not null` column with no default, or a new unique index,
   adds and still breaks the serving code on apply. **Would the version currently
   in production survive this migration?** If not it needs a compatible
   intermediate, and if this PR *is* that intermediate, **the contract ticket must
   already exist** — ADR 0015 makes that the mitigation rather than discipline, so
   ask for the number and do not accept an intention.

   Landing any of this anyway is the user's call to make explicitly, not a
   default to fall into. If they choose it, tell them what reaches those tables
   before the migration runs, so the choice is informed rather than optimistic.

   On a yes:

   ```bash
   gh pr merge --squash --delete-branch
   ```

   Squash only. The repo permits merge and rebase merges; do not use them.

   If the merge is blocked by conflicts, rebase onto `main` and force-push with
   `--force-with-lease`. Never merge `main` into the branch.

7. **Apply the migration, if the PR had one** — the `gh pr diff --name-only`
   from step 6, which is read off the PR rather than off local `main`: straight
   after a squash-merge with `--delete-branch`, local `main` does not yet contain
   the commit, so `git diff main~1` there would inspect the wrong range.

   Nothing in the Vercel build runs `pnpm db:migrate` (WAV-25), so production is
   now one step short of what this PR promised. Do it **before** the close-out.

   ```bash
   pnpm db:migrate      # from the branch; the merge did not change the SQL
   ```

   Run it from where you are. `git checkout main` fails in an Orca worktree
   ("already used by worktree at …"), which is this repo's usual context, and it
   buys nothing: a squash-merge does not rewrite the migration files, so the SQL
   on the branch is the SQL that landed.

   The root `.env.local` is the Development environment, which currently
   resolves to the same Neon database as Production (WAV-24), so this is the
   production migration. If that ever stops being true, `vercel env pull
   --environment=production <file>` and run it against that instead.

   Then prove it: `GET /api/v1/status` on the production deployment lists the
   applied migrations, and the new one is in that array or it did not run.

   Under ADR 0015 no code in the deployment above depends on this migration —
   what is waiting on it is the *next* PR. That is the whole benefit of the
   split, and it is why this step is urgent rather than an emergency.

8. **Close out Linear.** `WS=fb959783-b1df-489f-a228-87c38bed4271`, and resolve
   the issue the way `/draft-pr` does — `orca linear issue --current` first, the
   branch name upper-cased as the fallback:

   ```bash
   orca linear status set --id WAV-<n> --to Done --workspace "$WS" --json
   orca linear comment add --id WAV-<n> --workspace "$WS" --body-file <path>
   ```

   Then drop the state role. **Read the issue's labels first and remove the one
   it actually has** — it is `ready-for-agent` most of the time and
   `ready-for-human` or `needs-info` often enough to matter, and removing a
   label the issue does not carry leaves the real one behind:

   ```bash
   orca linear issue --id WAV-<n> --workspace "$WS" --json   # read .labels
   orca linear label remove --id WAV-<n> --label <the one it has> --workspace "$WS" --json
   ```

   `--label` is singular and repeated; never `label set`, which would drop the
   category label too. A landed issue is left with no triage role at all, on
   purpose — `docs/agents/triage-labels.md` says why.

   The comment says what shipped and what to expect next, not a summary of the
   diff. The PR is the diff.

9. **Verify what the ticket promised, in production.** The step that gets
   skipped, and the one this repo most needs — it ships behaviour living in
   project settings and platform state, which no test can see. Check whatever
   the ticket actually claimed:

   - a cron entry — that it registered, in the project's `crons.definitions`,
     and against the **new** deployment's host rather than the one it replaced
   - an environment variable — that it is set for Production
   - a route — that it answers, and that operator routes still 401 without the
     secret
   - a schema change — that `/api/v1/status` on the production deployment lists
     the migration by name. To check the shape rather than the ledger, query
     `pg_constraint` / `information_schema` over `DATABASE_URL_UNPOOLED` from
     `.env.local` (WAV-24: that is production's)

   A green suite says the code is right. It says nothing about whether the
   platform is doing what the ticket said it would.

10. **Report** the merged PR, the Linear state, and what you verified in
    production.
