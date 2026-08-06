# The repository is public

`jacobrees-waveger/Waveger` is public. This was not a decision about openness —
it is what Vercel's pricing forced, given a constraint we had already accepted
for a different reason.

## Why

Vercel's Hobby plan will not deploy a private repository owned by a **GitHub
organisation**. It deploys private *personal* repositories fine; the restriction
is specifically organisation-owned ones.

The repo has to live in its own organisation. A GitHub App installs once per
owner and one owner can bind to only one Linear workspace, so Waveger and Sift
need separate organisations for their Linear issue sync to work at all (see
`docs/agents/issue-tracker.md`). That constraint is load-bearing and predates
this decision.

That left three options:

- **Pay for Vercel Pro** (~$20/month). Correct eventually — Waveger is a
  commercial product and Hobby's terms exclude commercial use — but not worth
  paying before there is an app to deploy.
- **Move the repo to a personal account.** Restores free deploys and breaks the
  Linear binding. Trading a working integration for a billing technicality.
- **Make the repo public.** Free, keeps the organisation, keeps Linear.

## Consequences

The domain model, every ADR, and the agent documentation are world-readable —
including the chart-source strategy, the scoring design, and the Linear team and
workspace identifiers. Those identifiers are not credentials; they are useless
without an API key.

No secrets are exposed. `.env` was never committed, and the history was scanned
for connection strings, tokens and private keys before flipping visibility.
Anything sensitive must continue to reach the code through the environment.

**Publishing exposed the whole history, not just the current tree.** That part
is done and cannot be undone by making the repo private again — the commits
existed publicly. Treat anything committed from here as public at the moment of
commit, not at the moment of push.

This should be revisited when Waveger moves to Vercel Pro. Pro removes the
constraint entirely, and going private then is a one-line change — though the
history published in the meantime stays public.
