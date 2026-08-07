---
name: draft-pr
description: Push the current branch and open a draft pull request linked to its Linear issue.
disable-model-invocation: true
---

Open a **draft** pull request for the current branch. `docs/agents/workflow.md`
has the policy and the reasoning; this is the procedure. `/review-pr` lands it
afterwards.

## Steps

1. **Refuse to run on `main`.** `git branch --show-current`. If it is `main`,
   stop and say to branch first — Vercel builds `main` as Production on push, so
   there would be nothing left to open a PR against.

2. **`gh auth switch --user jacobdrees`.** Only that account can write to this
   repo; the usually-active one cannot, and `gh pr create` fails with a 403 that
   reads like a repo problem. `docs/agents/workflow.md` has the table.

3. **Find the Linear issue.** Orca holds the link as worktree metadata, so the
   branch name is the fallback and not the source:

   - `orca linear issue --current --full --json` — works when the worktree was
     created with `--linear-issue`.
   - Otherwise take the identifier from the branch and **upper-case it**, then
     read it explicitly:

     ```bash
     ID=$(git branch --show-current | grep -oiE 'wav-[0-9]+' | head -1 | tr 'a-z' 'A-Z')
     orca linear issue "$ID" --full \
       --workspace fb959783-b1df-489f-a228-87c38bed4271 --json
     ```

     `--workspace` is mandatory on every non-`--current` call: Orca is connected
     to three workspaces and picks between them unpredictably
     (`docs/agents/issue-tracker.md`). Names match only when they match exactly,
     hence the upper-casing.
   - If neither works, carry on without an issue and say so. Do not guess one.

4. **Resolve the base branch.** Default to `main` and say nothing — a lone
   branch is the common case and a prompt every time is noise.

   Ask only when the issue has a `parent` (`/to-tickets` slices are sub-issues of
   a `/to-spec` parent) **and** that parent has a branch on the remote:

   ```bash
   git ls-remote --heads origin | grep -iE "wav-<parent>(-|$)"
   ```

   Then use `AskUserQuestion`, parent branch first and marked recommended. Give
   the reader the actual decision: target the **parent** when this slice should
   stack into the parent's eventual squash-merge, and `main` when it stands on
   its own regardless of its siblings. Do not auto-pick — parent and `main` can
   sit on the same SHA, which makes the parent look merged when the user still
   wants to stack.

   Say which base you chose, in one sentence.

5. **Read the range**, now that the base is known — doing this earlier describes
   commits the PR will not contain:

   ```bash
   git log <base>..HEAD --oneline
   git diff <base>...HEAD
   ```

   Also `git status`, to catch anything uncommitted that belongs in the PR.

6. **Push.** `git push -u origin HEAD`.

7. **Write the body** to a file. There is no PR template in this repo:

   ```markdown
   ## Summary

   <one or two paragraphs: what changed about the product, and why>

   ## Checks

   - [ ] `pnpm test && pnpm typecheck && pnpm lint`
   - [ ] Looked at on the preview URL
   - [ ] Migration and `packages/db/src/schema.ts` in the same commit
   - [ ] ADR written, for a decision made rather than followed

   Fixes WAV-<n>
   ```

   Leave the boxes unticked — `/review-pr` ticks them once they are true. Drop
   any line this diff cannot apply to rather than leaving it as noise.

8. **Create it.**

   ```bash
   gh pr create --draft --base <base> --title "<subject>" --body-file <path>
   ```

   The title is **prose, matching the commit subject** — `Close the operator
   routes with a shared secret`, not `feat(api): …`. A single-commit PR squashes
   under its commit title, so the two should agree. Use `--body-file`; markdown
   as an inline argument is fragile.

9. **Attach the PR to the issue**, if one was found:

   ```bash
   orca linear attach --current --url <pr-url> --title "PR link" --json
   ```

   Use `orca linear attach --id WAV-<n> --url … --workspace <id>` when the
   worktree is not linked. This is deliberate belt and braces: `Fixes WAV-<n>`
   in the body relies on Linear's scanner noticing, and an attachment does not.

   On `linear_write_unconfirmed`, retry **once** with the pinned `--write-id`
   from the error's own `nextSteps` (`docs/agents/issue-tracker.md`).

10. **Report the PR URL** and say that a code review comes next.

## Notes

- Do not set reviewers or labels. Nobody is reviewing it, and triage labels live
  on the Linear issue rather than on the PR.
- Branch history does not need tidying — the merge squashes it.
