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

4. **Tick the body's checklist** to match what is now true, so the PR records the
   state it merged in rather than the state it opened in.

5. **Mark ready.** `gh pr ready`. Reversible with `gh pr ready --undo`.

6. **Ask before merging.** This is the one step here that puts the change into
   production and the one that is not a click away from being undone. On a yes:

   ```bash
   gh pr merge --squash --delete-branch
   ```

   Squash only. The repo permits merge and rebase merges; do not use them.

   If the merge is blocked by conflicts, rebase onto `main` and force-push with
   `--force-with-lease`. Never merge `main` into the branch.

7. **Close out Linear.** `WS=fb959783-b1df-489f-a228-87c38bed4271`, and resolve
   the issue the way `/draft-pr` does — `orca linear issue --current` first, the
   branch name upper-cased as the fallback:

   ```bash
   orca linear status set --id WAV-<n> --to Done --workspace "$WS" --json
   orca linear label remove --id WAV-<n> --label ready-for-agent --workspace "$WS" --json
   orca linear comment add --id WAV-<n> --workspace "$WS" --body-file <path>
   ```

   `--label` is singular and repeated; never `label set`, which would drop the
   category label. A landed issue is left with no triage role at all, on purpose
   — `docs/agents/workflow.md` says why.

   The comment says what shipped and what to expect next, not a summary of the
   diff. The PR is the diff.

8. **Verify what the ticket promised, in production.** The step that gets
   skipped, and the one this repo most needs — it ships behaviour living in
   project settings and platform state, which no test can see. Check whatever
   the ticket actually claimed:

   - a cron entry — that it registered, in the project's `crons.definitions`
   - an environment variable — that it is set for Production
   - a route — that it answers, and that operator routes still 401 without the
     secret

   A green suite says the code is right. It says nothing about whether the
   platform is doing what the ticket said it would.

9. **Report** the merged PR, the Linear state, and what you verified in
   production.
