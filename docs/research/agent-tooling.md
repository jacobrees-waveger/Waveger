# Claude Code tooling for Waveger — skills & MCP servers

Research date: 2026-08-06. Stack: Next.js/React web + React Native/Expo mobile (iOS-first), TypeScript throughout.
Every claim below was verified at the source that owns it (vendor docs or the GitHub repo), not at an aggregator.

## Baseline

Installed before this research:

- **Plugins:** `mattpocock-skills` v1.2.2 (only plugin)
- **MCP servers:** `context7`, `sequential-thinking`, `playwright`, `linear`, `exa`, `filesystem`
- **Orca built-ins:** `orca-cli`, `orca-emulator` (iOS sim), `orca-emulator-android`, `orca-linear`, `computer-use`, `orchestration`
- **Marketplaces added:** `claude-plugins-official`, `context7-marketplace`, `mattpocock`

`apple-docs` was moved out of global scope during this research and is **not** currently available to this project.

## TL;DR — recommended install order

Tier 1 — install now, before writing code:

```bash
/plugin install vercel@claude-plugins-official        # 31 skills: nextjs, react-best-practices, shadcn, turbopack… + bundles Vercel MCP
/plugin install expo@claude-plugins-official          # 21 skills incl. 6 EAS + bundles the Expo MCP
/plugin install typescript-lsp@claude-plugins-official
/plugin install frontend-design@claude-plugins-official
/plugin marketplace add software-mansion-labs/skills && /plugin install skills@swmansion
```

Tier 2 — once the app actually runs:

```bash
npx shadcn@latest mcp init --client claude             # only if the web app uses shadcn
npx skills add vercel/next.js --skill next-dev-loop
claude mcp add metro-mcp -- npx -y metro-mcp           # RN runtime introspection
/plugin install chrome-devtools-mcp@claude-plugins-official   # perf/CWV/Lighthouse/memory
# next-devtools-mcp via project .mcp.json (Next 16+) — see Web section
```

Tier 3 — when the matching problem appears:

```bash
claude mcp add --transport http github https://api.githubcopilot.com/mcp/
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=<ref>&read_only=true"
/plugin install figma@claude-plugins-official
/plugin install sentry@claude-plugins-official
# re-add apple-docs, project-scoped — needed once you touch @expo/ui/swift-ui or native modules
```

## Web — Next.js / React

| Item | Source | Verdict |
|---|---|---|
| `vercel` plugin | `vercel/vercel-plugin`, 242★, pushed 2026-08-06 | **Install first.** Marketplace calls it "deployment integration"; it actually ships 31 skills (`nextjs`, `react-best-practices`, `shadcn`, `next-cache-components`, `next-upgrade`, `turbopack`, `routing-middleware`, `auth`, `env-vars`, `ai-sdk`…), 3 agents, 4 commands, and bundles the Vercel MCP |
| `next-devtools-mcp` | `vercel/next-devtools-mcp`, 801★, **no license file** | **Install.** Reads errors/logs/routes/compilation issues from the *live* dev server; compiles one route without a full `next build`. Needs Next 16+. Highest practical value per token |
| `next-dev-loop` skill | `vercel/next.js/skills` on canary, MIT | **Install.** Edit→verify loop pairing the Next MCP with a browser view |
| shadcn MCP | `npx shadcn@latest mcp init --client claude` — ships in the shadcn CLI | **Install if using shadcn.** 7 tools. Reads *your* `components.json` and private registries — Context7 structurally cannot |
| `chrome-devtools-mcp` | `ChromeDevTools/chrome-devtools-mcp`, 48.6k★, Apache-2.0 | **Install.** ~60% overlaps Playwright MCP, but adds perf traces + CWV, CPU/network throttling, Lighthouse, 12 heap tools, and **source-mapped stack traces** — the last is essential for bundled Next.js |
| Vercel MCP | `https://mcp.vercel.com` | Comes with the plugin. Read-only in initial release. Grants agent your Vercel account access — enable human confirmation |
| Supabase MCP | `supabase/mcp`, 2.8k★, Apache-2.0 | Install *hardened* only: `?project_ref=<id>&read_only=true`, dev project. Supabase's own docs: "Don't connect to production" |

**`create-next-app` auto-generates `AGENTS.md` + `CLAUDE.md`** and Next bundles version-matched docs at `node_modules/next/dist/docs/`. Vercel's benchmark position is that always-available bundled context beats on-demand retrieval — so **for Next.js specifically, prefer the bundled docs over Context7**. Encode that in CLAUDE.md. Don't pass `--no-agents-md`.

There is **no shadcn plugin and no Next.js plugin** in the official marketplace (all 278 grepped). Both live upstream.

## Mobile — React Native / Expo

| Item | Source | Verdict |
|---|---|---|
| `expo` plugin | `expo/skills`, 2,366★, MIT, pushed 2026-08-05 | **Install.** 21 skills incl. `expo-router`, `expo-ui`, `expo-native-ui`, `expo-project-structure`, `expo-tailwind-setup` + 6 `eas-*`. Ships its own `mcp.json`, so it wires the Expo MCP too — no separate `claude mcp add` |
| Expo MCP | `https://mcp.expo.dev/mcp`, HTTP | Comes with the plugin. **33 tools:** EAS build/workflow/submit, TestFlight crashes + feedback, App Store/Play reviews, and 6 local tools needing a running dev server. Requires an Expo account (OAuth) |
| `software-mansion-labs/skills` | 262★, pushed 2026-08-05, **no LICENSE file** (metadata claims MIT) | **Install.** Contains `react-native-best-practices` with sub-skills: animations, gestures, svg, on-device-ai, rich-text, multithreading, audio, jsi. By the maintainers of Reanimated / Gesture Handler / svg. Targets New Architecture |
| `metro-mcp` | `steve228uk/metro-mcp`, 74★, MIT | **Install (tier 2).** Connects to Metro over CDP against Hermes: symbolicated stack traces, network bodies, component tree + render profiling, heap sampling, AsyncStorage + app-sandbox reads, deep links, a11y audit |
| `callstackincubator/agent-skills` | 1,583★, MIT | Optional. A *different* `react-native-best-practices` (perf-focused: FPS, TTI, bundle size, re-renders). Complements rather than duplicates Software Mansion's |

**Skipped on the mobile side:**

- `maikotrindade/awesome-react-native-skills` — 5★, GPL-3.0, stale since 2026-05-21, documents Reanimated **v3** while SM's covers v4. Strictly dominated
- `software-mansion/argent` (1,895★) and `callstackincubator/agent-device` (3,989★) — both duplicate `orca-emulator` for device control. Argent's unique parts are visual-regression diffing and native Instruments/Perfetto profiling; take it only if you drop Orca
- `facebook/react-native` ships **no** first-party agent guidance (no AGENTS.md, no `.claude/`). Use Context7
- `Shopify/flash-list` has `.claude/skills/`, but they're contributor workflow skills for the repo itself, not FlashList *usage* skills

**Overlap:** keep `orca-emulator` for driving the device (tap, gesture, type, button, rotate, ax). Note it has **no screenshot command** and **no camera injection** in the shipped binary despite the skill prose — see Orca section. Add `metro-mcp` for the JS-runtime layer Orca can't see. Expo MCP's `automation_find_view` and `expo_router_sitemap` are React-tree-aware rather than pixel-aware, so they complement both.

**Gap:** re-add `apple-docs` project-scoped. `expo-ui` renders **real SwiftUI**, so authoritative Apple API refs are load-bearing the moment you write `@expo/ui/swift-ui` trees or a native module — and Context7 does not cover Apple platform docs. Add `swift-lsp@claude-plugins-official` only if you write Swift natively.

## Design / UI

**ui-skills.com is a registry, not a skill pack.** `ibelick/ui-skills`, 6,984★, MIT, pushed 2026-08-03. Free, no paywall.

The CLI's entire surface is `start`, `categories`, `list`, `get` — and `get` writes markdown to **stdout**. Nothing is ever written to `.claude/skills`; there is no `add` and no `install`. "Installing ui-skills" would mean putting `npx ui-skills start` in CLAUDE.md so the agent fetches routing guidance over the network each session. The site's claim that skills "become available across every session" describes a *different* tool — `vercel-labs/skills` (28k★), which is what its individual skill pages actually invoke.

It vendors 7 skills of its own; the other ~194 entries are pointers to third-party repos. It has at least one broken pointer: it links `addyosmani/skills`, which 404s — the real repo is `addyosmani/agent-skills`.

**It is effectively web-only.** Grepping the full registry: zero Expo, zero NativeWind, zero Reanimated. Everything design-focused assumes CSS/Tailwind/DOM.

→ **Use it as a browsing index. Install skills from their own repos. Do not make it a runtime dependency.**

Worth installing for design:

- **`frontend-design@claude-plugins-official`** — Anthropic first-party, already on disk, zero supply-chain risk. Genuine art direction (typography pairing, anti-template bias), not a checklist
- **shadcn skill** — inside `shadcn-ui/ui` itself (120k★), maintained alongside the library
- **`emilkowalski/skills`** (26k★) — `improve-animations`, `apple-design`. By the author of Sonner and Vaul; expert motion guidance

**Skip `ui-ux-pro-max`.** Claims 114,000★ in 8 months for a prompt-and-CSV repo — not a credible quality signal. Substantively it's a Python `search.py` over CSVs of "84 styles, 192 palettes": a lookup table, not judgement. Adds a Python dependency for taste that `frontend-design` conveys in a page.

**Open gap: no verifiable design skill targets Expo or NativeWind.** The mobile half of styling is uncovered by the current ecosystem.

## Cross-cutting / process

| Item | Source | Verdict |
|---|---|---|
| `typescript-lsp` | Anthropic, official marketplace | **Install.** Real tsserver — type errors, go-to-def, rename across web *and* mobile TS instead of grepping. Best value of anything here |
| `github` MCP | `github/github-mcp-server`, 32k★, MIT, hosted | Install when you start doing PRs |
| `obra/superpowers` | 267k★, MIT | **SKIP** — see Orca section. Its worktree skill actively conflicts with Orca; its orchestration is redundant |
| `addyosmani/agent-skills` | 82k★, MIT, 24 skills | **Selective only.** Additive here: `ci-cd-and-automation`, `observability-and-instrumentation`, `performance-optimization`, `documentation-and-adrs`, `api-and-interface-design`. The rest duplicate what you'd already have |
| `trailofbits/skills` | 6.5k★, CC-BY-SA-4.0, 40 per-plugin installs | Selective. Applicable: `differential-review`, `supply-chain-risk-auditor`, `agentic-actions-auditor`, `property-based-testing`, `mutation-testing` |
| `NVIDIA/SkillSpector` | 14.3k★, Apache-2.0 | Worth it *because* of this report — static scanner for prompt injection / exfil / supply-chain risk in skills and MCP servers **before** you install them |
| `anthropics/skills` | 166k★ | Selective: `webapp-testing`, `mcp-builder`, `skill-creator` |
| `oraios/serena` | 27.7k★, MIT | Overlaps `typescript-lsp`. Pick one — `typescript-lsp` is first-party and lighter |
| `gastownhall/beads` | 26.1k★ | Skip — competes with your Linear MCP |

### Resolved: superpowers vs mattpocock-skills → stay on mattpocock, skip superpowers

`obra/superpowers` duplicates four mattpocock skills (`tdd`, `diagnosing-bugs`, `code-review`, `writing-for-agents`). Its claimed unique value was planning + parallel-subagents + git-worktrees — but two of those three are redundant with Orca and **one is actively harmful**:

- `using-git-worktrees` conflicts head-on with Orca. `orca skills get orca-cli` says: *"Prefer this over raw `git worktree` … when the task touches Orca-managed state."* Raw `git worktree add` produces checkouts Orca doesn't track — no worktree id, no lineage, no setup/archive hooks, invisible to `orca worktree ps`
- `dispatching-parallel-agents` overlaps `orchestration`, which is strictly richer (runs/tasks/dispatches, `worker_done` authority, decision gates, group addresses). The orchestration guide explicitly forbids substituting generic agent-spawn tools

Residual unique value collapses to planning/brainstorming, which `grilling` / `domain-modeling` / `codebase-design` already partly cover. **Skip superpowers.**

## Corrections to widely-repeated claims

Search results for this topic are dominated by SEO listing sites (mcpmarket.com, claudeskills.info, claudemarketplaces.com, conare.ai, a2a-mcp.org, heyclau.de). Two of their claims are **fabrications**:

1. **`software-mansion/react-native-best-practices` does not exist** (404). The real thing is a skill *inside* `software-mansion-labs/skills`
2. **There is no Expo skill called "Building Native UI."** Zero code-search hits. The real skills are `expo-ui` (renders real SwiftUI, needs SDK 56+) and `expo-native-ui` (Apple HIG, semantic colors, SF Symbols)

Also: `accesslint/*` entries in the ui-skills registry self-describe as "compatibility listings" — placeholder stubs padding the catalogue, not real skills.

## Caveats

- **Star counts in this index are inflated.** Week-old skill repos show 100k+. Rank on relative traction, license, last-push date and actual inspected contents — not absolute stars
- **Missing LICENSE files** on repos whose metadata claims a license: `software-mansion-labs/skills` (claims MIT), `vercel/next-devtools-mcp`, `vercel/mcp-adapter`, `vercel-labs/next-skills`, `supabase-community/supabase-plugin`. Flag if license hygiene matters
- **Prefer the official marketplace `supabase` plugin's upstream, not the plugin** — it points at a 9★ unlicensed community fork
- **Skip the marketplace `playwright` plugin** — genuinely redundant with the Playwright MCP you have
- `software-mansion-labs/skills` bundles product-marketing skills (Fishjam, Detour, RNRepo, MoQ) alongside the technical one; the README embeds ad images
- **metro-mcp:** Hermes allows only one CDP connection. Pressing `j` in the Metro terminal or "Open Debugger" in the dev menu steals it and disconnects the MCP. Use its `open_devtools` tool instead
- **shadcn MCP tool names were read from source** (`packages/shadcn/src/mcp/index.ts`), not docs — they could change without a docs update

## Where skills genuinely don't exist

Searched explicitly, nothing at real traction: **testing** (no Vitest/Jest/Detox/Maestro skill above ~150★), **linting** (no ESLint or Biome skill above 1★), **monorepo tooling** (no Turborepo or Nx MCP exists), **state/data layer** (no TanStack, Zustand, Drizzle or Prisma skill above 15★ — and `TanStack/query` has no `skills/` dir at all).

Practical read: **Context7 is already doing the job that skills don't exist for.** The gap worth filling with skills is *process* — planning, review, CI, security, observability — not *library facts*.

## Browse-only pointers

- `punkpeye/awesome-mcp-servers` (92k★) — canonical MCP index
- `hesreallyhim/awesome-claude-code` (52k★) — best-curated list, least SEO spam

---

# Orca reconciliation

A fifth pass read the actual Orca skill guides (`orca skills get <name>` — the files in `~/.claude/skills/` are only ~75-line discovery stubs), the full 223-command schema (`orca agent-context --json`), and the app bundle. It corrects several verdicts above.

## Corrections

**`orca-emulator` has no screenshot command — an agent driving it is blind.** The skill prose claims camera injection (`orca emulator camera …`); the shipped binary rejects it, as it does `orca emulator screenshot`. The real `emulator` surface is 16 commands: `attach, ax, button, devices, exec, gesture, install, kill, launch, list, logcat, permissions, rotate, shutdown, tap, type` — and `install`, `launch`, `logcat` **and `permissions`** are Android-only. Real iOS set: `attach / list / devices / tap / gesture / type / button / rotate / ax / exec / kill / shutdown`. `orca screenshot` is a *browser-tab* command, not an emulator one.

→ **Expo MCP's `automation_take_screenshot` is promoted from "nice" to required** — it's the only way the agent sees the simulator screen. `orca emulator ax` returns text only (500-node cap, frames normalized 0..1). The 60fps live pane is for the human.

**iOS emulator control runs on private SimulatorKit APIs** via serve-sim, so Xcode updates can break it. Expo MCP's automation tools are the fallback.

**Drop the `playwright` MCP from user scope.** Orca's embedded browser covers essentially the same surface (`goto/snapshot/screenshot/click/fill/type/select/scroll/hover/keypress/upload/wait/eval/console/network/cookie/storage/intercept/viewport/tab *`), with the same snapshot→ref→re-snapshot loop, **plus worktree-scoped tabs** (parallel worktrees don't fight over one browser) and the human watches the tab the agent drives. Orca's browser can't do cross-browser or headless CI — re-add Playwright project-scoped if you need Firefox/WebKit. `chrome-devtools-mcp` still earns its place: `orca console`/`orca network` are log tails, not traces.

**`computer-use` keeps its place** — zero overlap. Orca browser commands drive Orca's embedded tabs; `orca computer …` drives external Chrome/Safari, webviews, and Xcode/Simulator.app.

## Adjudications

**Simulator control:** keep `orca-emulator` (actuation) + Expo MCP (pixels, React identity, router sitemap) + `metro-mcp` (Hermes CDP layer only). **Disable metro-mcp's simulator/ui-interact/permissions plugins** — two controllers on one device is a contention bug generator. Argent/agent-device stay skipped, but the doc's reasoning was wrong: you don't have to drop Orca to take Argent (its visual-regression and Instruments/Perfetto profiling occupy a layer Orca has nothing in) — revisit only when you need visual-regression baselines.

**`orca-linear` + `linear` MCP — keep both, with a rule.** They aren't duplicates: `orca-linear` owns the worktree↔ticket binding the MCP structurally cannot have. `orca worktree create --linear-issue <ID|url>` binds at creation; every `orca linear … --current` resolves the ticket from the enclosing worktree; `orca linear issue --full --json` returns signed URLs for private ticket screenshots. The MCP is broader where Orca is thin — diffs and diff review, documents, milestones, releases, cycles (Orca's `linear` namespace is 30 commands, all issue/triage/search).

→ CLAUDE.md rule: *"For the current worktree's ticket use `orca linear … --current`. Use the `linear` MCP for diffs, documents, milestones, releases, and cross-project queries."*

**Sandcastle — skip.** Confirmed, and the disqualifier is specific: Waveger is iOS-first, the verification loop needs `xcrun simctl` and the iOS Simulator, and that cannot run in a Linux container — Docker, Podman and Firecracker all fail. It could sandbox only the Next.js half, splitting the toolchain for no gain. Its one genuine non-redundant claim is a **TypeScript SDK for CI-driven fan-out**: Orca is scriptable (all 223 commands take `--json`, `orca serve` runs headless) but you shell out and parse JSON — there's no npm SDK. And **Orca has no container isolation** on the worktree path; worktrees are plain git worktrees on the host sharing filesystem, network and simulator. Revisit only for CI-triggered fan-out on the web half, or untrusted code execution.

**`orchestration` requires a GUI toggle** — Settings → Experimental. No CLI equivalent exists in the 223-command schema. Verify before relying on it.

## Setup for this project

**MCP scope: use `--scope user` for OAuth-backed servers** (Expo, Vercel, Supabase, GitHub). Every Orca worktree is a new absolute path under `~/orca/workspaces/<name>`, and Claude Code's *local* scope is keyed by absolute path while *project* scope (`.mcp.json`) re-fires the trust prompt per worktree. User scope is keyed by neither.

> **Not documented:** whether OAuth tokens are keyed by server name alone or by server+path. Anthropic's docs say only "stored securely in your system keychain." User scope removes the two mechanisms that provably *are* path-keyed, but validate empirically — create a worktree, run `/mcp`, check whether Expo shows authenticated.

Reserve `--scope project` for path-bound servers (`next-devtools-mcp`, `metro-mcp`, shadcn) — worthless outside the checkout anyway. Pre-approving them user-level in `~/.claude/settings.json` via `enabledMcpjsonServers` would stop the prompt re-firing per worktree.

**`orca.yaml` cannot declare skills or MCP servers.** Supported keys are `scripts` (`setup`, `archive`), `issueCommand`, and `environmentRecipes` — `mcp` appears nowhere in the schema. The bridge is the `setup` script.

**Highest-value Orca-native action: commit an `orca.yaml`.** Waveger has none, and `setupRunPolicy` is already `run-by-default`, so a committed `setup` runs on every `orca worktree create`.

```yaml
scripts:
  setup: |
    set -euo pipefail
    cd "$ORCA_WORKTREE_PATH"
    # secrets never live in git — carry them from the primary checkout
    for f in .env .env.local .claude/settings.local.json; do
      [ -f "$ORCA_ROOT_PATH/$f" ] && mkdir -p "$(dirname "$f")" && cp "$ORCA_ROOT_PATH/$f" "$f"
    done
    pnpm install --frozen-lockfile
    # deterministic per-worktree ports — Metro hard-defaults to 8081
    PORT_BASE=$(( 3000 + ( $(echo -n "$ORCA_WORKSPACE_NAME" | cksum | cut -d' ' -f1) % 40 ) * 10 ))
    { echo "PORT=$PORT_BASE"; echo "RCT_METRO_PORT=$((PORT_BASE+1))"; } >> .env.local
```

Copying `.claude/settings.local.json` is what carries per-project MCP approvals into a new worktree — it's gitignored, so a fresh worktree otherwise starts with none. Expect a trust dialog the first time you commit `orca.yaml`, and again whenever it changes.

Hook env vars (recovered from the app bundle; only the first two appear in Orca's own template, treat the rest as unverified): `ORCA_ROOT_PATH`, `ORCA_WORKTREE_PATH`, `ORCA_WORKSPACE_NAME`, `ORCA_WORKSPACE_ID`, `ORCA_WORKSPACE_ROOT`, `ORCA_WORKTREE_ID`, `ORCA_REPO_PATH`, `ORCA_REPO_BRANCH`, `ORCA_REPO_REF`, `ORCA_REPO_URL`, `ORCA_PROJECT_ID`.

## Expo/Metro across worktrees — three gotchas

1. **Port collisions: Orca does nothing.** No port allocation exists anywhere in the 223-command schema. Metro hard-defaults to 8081, so a second worktree's `expo start` either fails or *silently attaches to the first worktree's bundler* — worse, because you're then testing the wrong code. Fix in the `setup` hook above; run `expo start --port $RCT_METRO_PORT`.
2. **Simulator contention: partly handled.** Orca scopes the *stream* (one active emulator per worktree), not the device — nothing stops two worktrees attaching the same UDID, and both install the same bundle id so the second overwrites the first. **For iOS-first solo work, serialize:** keep the mobile loop in one worktree.
3. **Hermes allows one CDP connection**, so two `metro-mcp` instances fight over one device. Another reason to serialize the mobile loop.

Add `orca emulator kill` to the `archive` hook — the guide says agents should kill helpers when done.

## Two easy wins

- **`orca worktree create --linear-issue <ID|url>`** — bind the ticket at creation; this is what makes `orca linear … --current` work at all
- **`orca worktree set --workspace-status in-review --comment "<status>"`** — free progress visibility on the card. Worth a CLAUDE.md rule to update at checkpoints
