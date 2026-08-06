# Triage Labels

The skills speak in terms of canonical triage roles. This file maps those roles
to the actual label strings used in this repo's issue tracker (Linear, team
`WAV`).

## Category roles

Exactly one per triaged issue. These map onto labels Linear created by default.

| Label in mattpocock/skills | Label in our tracker | Meaning                    |
| -------------------------- | -------------------- | -------------------------- |
| `bug`                      | `Bug`                | Something is broken        |
| `enhancement`              | `Feature`            | New feature or improvement |

## State roles

Exactly one per triaged issue. These were created in Linear specifically for the
triage skill, so the mapping is 1:1 with the canonical names. They are
workspace-level labels, so every team in the Waveger workspace has them.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

## Notes

- Linear's `Improvement` label is **unmapped** — it has no canonical role, so
  `/triage` will not apply or interpret it. Use it manually if you want.
- Triage state lives in **labels**, not Linear workflow states. `needs-info` and
  `ready-for-agent` have no workflow-state equivalent, and workflow states are
  already carrying delivery progress.
- Change labels with `orca linear label add` / `label remove`. `label set`
  replaces the **entire** set and would drop the category label — use it only
  for deliberate cleanup. A state transition is two calls: add the new state
  role, remove the old one. See `issue-tracker.md`.

Edit the right-hand column to match whatever vocabulary you actually use.
