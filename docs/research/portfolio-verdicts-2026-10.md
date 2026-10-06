# Portfolio verdicts: frictions matched to candidates, 2026-10

Research for #25, part of map #21. An AFK proposal: every **verdict** here is a proposal the owner confirms or overturns in the next ticket (a grilling session). Vocabulary as `GLOSSARY.md` defines it; shapes as ADR 0002 orders them (a skill or a hook plugin before a mod; a built-in or a config change counts as adopt).

## Question

Joining the session audit's frictions to both research catalogues: which **candidates** exist, and for each, what verdict (install, adopt, build or skip), simplest shape and minutes-saved-per-week score does the evidence support? The cheaper verdict wins a tie (install, then adopt, then build).

## Answer in brief

- **Eight candidates carry a non-skip verdict. Together they save about 200 min/week of the audit's 11.5 h/week (690 min)**, or about 126 min/week if the owner keeps ship's merge gate as it is.
- **The largest single lever is the merge gate itself** (rank 1, 104 min/week). The owner typed `merge` 123 times, and in 101 of 105 ship runs that was the only touch. A ship option that merges on its own when CI is green and every reviewer is clean would remove most of it, but it reverses ship's one guaranteed stop, so it is an owner fork, not an AFK verdict.
- **The ship loop's other end is cheapest to adopt**: the installed `cloud-ship` skill on a built-in `/schedule` routine already selects the next ready issue and runs it unwatched, which takes the ship share of "next ticket by hand" and of "watched waits".
- **Three frictions have no fitting candidate** (relay by hand, corrections, interrupts: 129 min/week). Each needs a cause breakdown before any brief.
- **Most of the catalogues is a skip for this owner**: the crowded context-loss class overlaps smart-compact and the audit measured little redo after compaction; statuslines and usage bands duplicate the statusline and ratelimit-otel already installed.

## Inputs

| Input                                                                                                                   | Used for                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Session audit, `docs/research/session-audit-2026-10.md` on branch `research/session-audit` (#22)                        | The 15 ranked frictions, counts, per-event costs, coverage      |
| Primary-source catalogue, `docs/research/extension-catalogue-2026-10.md` on branch `research/extension-catalogue` (#24) | Candidates, shapes, licences, reach (R0 to R4), install routes  |
| Community scan, `docs/research/community-scan-2026-10.md` on branch `research/community-scan` (#23)                     | Candidates and the pains users voice                            |
| Local audit notes (outside git)                                                                                         | Breakdown of approval replies and of the command after `/clear` |
| `~/.claude/settings.json`, `claude plugin list`, `~/.claude/skills/`, Claude Code 2.1.291                               | What is installed or built in, so nothing installed is proposed |
| `.claude/skills/ship/SKILL.md`, `.claude/skills/cloud-ship/SKILL.md`, `docs/agents/ship.md`, `plugins/gh-pane/`         | What ship, cloud-ship and gh-pane already do                    |

Two numbers come from the local notes and are not in the audit file: the split of the 148 accept-only replies (agree-family 63: `agree with all` 32, `agree` 18, `confirmed` 7, `agree with all recommendations` 6; `yes`, `go`, `go ahead`, `ok` about 41; `continue` 13; a bare number 8; `fix it`, `file it`, `add it`, `delete it` about 13), and `merge on green` typed 3 times.

## Already in place (no verdict needed)

Probed on 2026-10-06: enabled plugins gh-pane 0.3.0, smart-compact 0.1.2, ratelimit-otel, You Should Know (built in), playwright, pyright-lsp, frontend-design, html-plan, last30days, eli5; `defaultMode: auto`; `preferredNotifChannel: terminal_bell`; a SessionStart hook that reports agent state to Herdr (Herdr marks unseen finished work `done` and has `herdr notification show`); user skills ship, cloud-ship, triage, wayfinder, handoff, grill-with-artifact, git-guardrails-claude-code. Built-ins confirmed in this build: `/loop`, `/schedule`, `/fewer-permission-prompts`, the Monitor tool, away recaps, `effortLevel` in settings, and `model` and `effort` keys in skill and command metadata.

So: a desktop notifier, a usage statusline and a permission classifier would each duplicate something installed.

## Friction by friction

Minutes are the audit's (count x cost per event x 7 / 15). "Saves" is the share of the friction a candidate removes, with the reason. Where two candidates touch one friction, the cheaper one is counted first and the other counts only what is left.

### 1. Merge gate replied by hand: 104 min/week

149 replies at 1.5 min (notice, switch, read, reply). The reading is the part that matters; the rest is overhead.

| Candidate                                                                                       | Verdict            | Shape                                                     | Source                                                                                                | Saves                                                                                                                                         | Why                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ship merges on a clean gate                                                                     | build (owner fork) | skill (brief to `Gharib89/skills`, a ship profile option) | new                                                                                                   | about 85%, **88 min/week**: every gate with green CI, clean reviewers, no Ship defect and no deviation; the 15% with any of those still stops | `merge` was the only touch in 101 of 105 runs and was typed 123 times; the owner also typed `merge on green` 3 times. Reverses ship's rule "never on its own or through an auto-merge flag", so the owner decides, not this file |
| gh-pane ship-loop buttons: a `merge` button at the gate                                         | build              | mod (a feature of gh-pane, this marketplace)              | new; idea credited to [pr-relay](https://github.com/HolyGrail/claude-mods/tree/main/plugins/pr-relay) | about 15%, **16 min/week** (2 if the option above lands): the reply and finding the waiting session; the read stays                           | gh-pane already fills commands and never sends them; a gate button is the same pattern. Counted with friction 2 below as one candidate                                                                                           |
| [merge-gate (hamzafer)](https://github.com/hamzafer/claude-code-mods/tree/main/mods/merge-gate) | skip               | mod                                                       | catalogue                                                                                             | 0                                                                                                                                             | Holds `gh pr merge` until CI and a Codex review pass: a guard ship already is, reaching a third-party model (R4)                                                                                                                 |
| [pr-relay](https://github.com/HolyGrail/claude-mods/tree/main/plugins/pr-relay)                 | skip               | mod                                                       | catalogue                                                                                             | 0                                                                                                                                             | Wakes a session on merge; no licence (cannot adopt its code), owner-shaped (one reviewer bot, JST), marketplace name collides with `claude-mods`. Its idea feeds the gh-pane build                                               |

### 2. Next ticket started by hand: 86 min/week

245 events at 0.75 min. After `/clear` the next entry was `/ship` 78 times, `/wayfinder` 33, `/triage` 24, free text 21, `/model` 14. gh-pane covers choosing and filling the command in part (opened 86 times); `/clear` is still typed every time.

| Candidate                                                                                          | Verdict | Shape                                                  | Source                                                                                                                   | Saves                                                                                            | Why                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cloud-ship on a `/schedule` routine                                                                | adopt   | built-in + config (installed skill, built-in routines) | `cloud-ship` (installed), `/schedule` (built in)                                                                         | the ship share (78 of 177 command starts, 44%, 38 min), about 75% of it: **28 min/week**         | Ship's unattended lane already prepares, applies the PR cap, selects the next ready issue and posts the merge summary on the PR. This repo's profile already has a `## Cloud lane` bootstrap |
| gh-pane ship-loop buttons: a `next` button after a merge                                           | build   | mod (gh-pane feature)                                  | new; idea credited to [slash-chain](https://github.com/KilimcininKorOglu/claude-code-mods/tree/main/plugins/slash-chain) | about a third of the 58 min left after cloud-ship (the `/clear` and the typing): **19 min/week** | Same mod as the merge button; needs a probe that `$.prompt.submit` can run `/clear` and then a command, since gh-pane today fills one command and never sends                                |
| [slash-chain](https://github.com/KilimcininKorOglu/claude-code-mods/tree/main/plugins/slash-chain) | skip    | mod                                                    | catalogue                                                                                                                | 0                                                                                                | Runs `&&`-joined slash commands; installing it only to type `/clear && /ship N` by hand saves little; its idea goes into gh-pane                                                             |
| [next-steps](https://github.com/hamzafer/claude-code-mods/tree/main/mods/next-steps)               | skip    | mod                                                    | catalogue                                                                                                                | 0                                                                                                | Guesses the next prompt with a model call; gh-pane already knows the next ticket from the tracker                                                                                            |

### 3. Watched waits: 85 min/week

363 watched minutes, half counted. Within them, CI and review polls are 71 min and tests 42 (31%); the rest is model time.

| Candidate                                                                                                                                                                                                              | Verdict | Shape             | Source    | Saves                                                                                    | Why                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------- | --------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cloud-ship on a `/schedule` routine (same as above)                                                                                                                                                                    | adopt   | built-in + config | installed | the CI, review and test share (26 min), about 75% of which is ship runs: **20 min/week** | A run nobody started at the keyboard is not watched. Counted once in the portfolio (48 min/week with friction 2)                                                       |
| [desk-notify](https://github.com/KilimcininKorOglu/claude-code-mods/tree/main/plugins/desk-notify), [peon-ping](https://github.com/PeonPing/peon-ping)                                                                 | skip    | mod, hook script  | catalogue | 0 new                                                                                    | The cue already exists: Herdr marks finished unseen work `done`, and `preferredNotifChannel` is `terminal_bell`. A watched wait is a choice to watch, not a missed cue |
| [agent-radar](https://github.com/hamzafer/claude-code-mods/tree/main/mods/agent-radar), [agentpane](https://github.com/xuanji86/claude-agentpane), [agent-shell-watch](https://github.com/apolenkov/agent-shell-watch) | skip    | mod               | catalogue | 0                                                                                        | Make the wait easier to watch, not shorter                                                                                                                             |

### 4. Approval round-trips that only accept: 69 min/week

148 replies at 1 min. The agree-family (63, 43%) are grilling rounds, which grill-with-artifact (installed on the window's last day) targets. The rest: `yes`, `go`, `ok` (about 41), `continue` (13), a bare number (8), `fix it` and the like (13).

| Candidate                                                                                        | Verdict           | Shape       | Source    | Saves                                                              | Why                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | ----------------- | ----------- | --------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| grill-with-artifact                                                                              | already installed | skill       | installed | not counted: arrived after the window, so its effect is unmeasured | Batches a grilling round into one page Submit                                                                                |
| [task-poke](https://github.com/KilimcininKorOglu/claude-code-mods/tree/main/plugins/task-poke)   | skip              | mod         | catalogue | at most 6 min/week (the 13 `continue`)                             | Auto-continues while tasks remain; a `continue` here often follows a deliberate stop, so it trades a minute for runaway risk |
| [ralph-loop](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/ralph-loop) | skip              | hook plugin | catalogue | 0                                                                  | Re-feeds one task until a completion promise; not the shape of a yes to a proposed step                                      |

The 41 `yes`/`go` replies answer a skill that asked when its own rule says to state an assumption and proceed. No catalogue candidate fits; which skills ask is fog (see the end).

### 5. Status checked by hand: 55 min/week

79 checks at 1.5 min. 36 are in cc-otel, re-running one monitoring query on request (25 min/week); the other 43 ask for progress or an ETA (30 min/week). The built-in `/loop` was never used.

| Candidate                                                                                                          | Verdict | Shape              | Source                                              | Saves                                               | Why                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ------- | ------------------ | --------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/loop` (and the Monitor tool for a wait on a condition)                                                           | adopt   | built-in (a habit) | built in                                            | about 80% of the cc-otel re-runs: **20 min/week**   | `rerun now` and `check now` on one query is what `/loop 5m <query>` does                                                                                                                                                             |
| [where-am-i](https://github.com/hamzafer/claude-code-mods/tree/main/mods/where-am-i)                               | install | mod                | catalogue (marketplace `claude-code-mods`, MIT, R1) | about a third of the progress asks: **10 min/week** | A live recap above the prompt (goal, doing now, waiting on you, next) answers "what is the progress" without a turn. It calls Haiku through `$.model.complete` and also `$.mcp.call` and `$.tool.call`, so read it before installing |
| [cc-pr-tracker](https://github.com/sezaakgun/cc-pr-tracker), [pr-pulse](https://github.com/gerricchaplin/pr-pulse) | skip    | mod                | catalogue                                           | 0                                                   | PR state in a pane: gh-pane already lists the repo's PRs in run order                                                                                                                                                                |

### 6. Compaction: 49 min/week

85 compactions; about 28 min/week is the wait and 21 the decision to type `/compact` (46 manual). Only 5 files were re-read after a compaction, so quality loss is small. smart-compact covers the decision in part.

| Candidate                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Verdict           | Shape         | Source          | Saves | Why                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------- | --------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| smart-compact                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | already installed | mod           | this repo       | n/a   | Covers when to compact. Why the owner still typed `/compact` 46 times is fog                                                                    |
| [micro-compaction](https://github.com/ruihe774/cc-micro-compaction)                                                                                                                                                                                                                                                                                                                                                                                                             | skip              | mod           | catalogue       | 0 now | Would cut the wait (no model call), but installs only by `--plugin-dir` and drops Read results wholesale; worth a grill question, not a verdict |
| [prep-compact](https://github.com/koenvdheide/prep-compact), [agent-compact-advisor](https://github.com/apolenkov/agent-compact-advisor), [claude-auto-handoff](https://github.com/alexknowshtml/claude-auto-handoff), [ctx-handoff-mod](https://github.com/cablate/ctx-handoff-mod), [handoff-compact](https://github.com/trytofly94/handoff-compact), [lcm](https://github.com/lossless-claude/lcm), [fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction) | skip              | mod or plugin | catalogue, scan | 0     | All improve what survives a compaction; the audit found little redo, and each overlaps smart-compact at the same boundary                       |

### 7. Output relayed by hand between sessions: 47 min/week

50 relays: pasted cloud-session answers and outputs of other tabs (10 pastes in cc-otel). Herdr, driven by the agent, already carries 189 prompts between sessions.

| Candidate                                                                               | Verdict | Shape       | Source    | Saves | Why                                                                                       |
| --------------------------------------------------------------------------------------- | ------- | ----------- | --------- | ----- | ----------------------------------------------------------------------------------------- |
| [notice-board](https://github.com/HolyGrail/claude-mods/tree/main/plugins/notice-board) | skip    | mod         | catalogue | 0     | No licence, marketplace name collides, and Herdr already passes messages between sessions |
| [HCOM](https://github.com/aannoo/hcom)                                                  | skip    | CLI + hooks | catalogue | 0     | Agents messaging across terminals: what Herdr does here                                   |

No candidate; the remainder needs a breakdown by source (cloud answer, other tab, monitoring output) before a brief. The owner's cloud-proof rule, dated within the window, already moves cloud answers to the agent reading them through Chrome.

### 8. Corrections, challenges, re-asks: 43 min/week

46 events, under 3% of owner entries, and few repeat.

| Candidate                                                                                                            | Verdict | Shape       | Source    | Saves | Why                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | ------- | ----------- | --------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [hookify](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/hookify)                           | skip    | hook plugin | catalogue | 0 new | Turns a correction into a hook rule: the owner's feedback-memory and rule-promotion process already does this, by hand but reviewed |
| [claude-md-management](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/claude-md-management) | skip    | skill       | catalogue | 0 new | Same overlap with the memory process                                                                                                |
| [Ponytail](https://github.com/DietrichGebert/ponytail), Occam                                                        | skip    | hook plugin | scan      | 0     | Keep-it-simple rule sets; the owner's CLAUDE.md already carries that rule                                                           |

### 9. Interrupts: 39 min/week

55 interrupts. No catalogue candidate targets why the owner stopped a turn. [blast-radius](https://github.com/hamzafer/claude-code-mods/tree/main/mods/blast-radius) and [safety-net](https://github.com/kenryu42/claude-code-safety-net) hold destructive commands, but no interrupt was attributed to one: **skip**. Fog: classify interrupts by cause first.

### 10. Git and review steps driven by prompt: 38 min/week

82 events; 28 are the review loop (another `/code-review` round, a reviewer swap when a bot's quota ran out at least 3 times, a re-request).

| Candidate                                                                                                | Verdict | Shape  | Source                | Saves                                            | Why                                                                                                      |
| -------------------------------------------------------------------------------------------------------- | ------- | ------ | --------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Ship profile reviewer tuning: a `Fallback-for:` reviewer in each repo's profile, and its `Cap:`          | adopt   | config | ship profile schema 3 | about a third of the review loop: **4 min/week** | The profile already has the fields; a fallback reviewer replaces the hand swap when a bot's quota is out |
| [commit-cadence](https://github.com/KilimcininKorOglu/claude-code-mods/tree/main/plugins/commit-cadence) | skip    | mod    | catalogue             | 0                                                | Ship commits and pushes inside its run; outside it, commits are deliberate                               |

### 11. Permission friction: 24 min/week

34 owner rejections (owner decisions, which no allowlist should remove), 59 classifier denials (7 min/week), 15 refusals. Auto mode covers most.

| Candidate                                                                                                                                                                                                                                                                                                                 | Verdict | Shape                             | Source    | Saves                                  | Why                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------- | --------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/fewer-permission-prompts`                                                                                                                                                                                                                                                                                               | adopt   | built-in skill, run once per repo | built in  | about half the denials: **3 min/week** | Scans transcripts for read-only calls and proposes an allowlist                                     |
| [safety-net](https://github.com/kenryu42/claude-code-safety-net), [tdd-guard](https://github.com/nizos/tdd-guard), [security-guidance](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/security-guidance), [secrets-veil](https://github.com/yonatangross/orchestkit/tree/main/mods/secrets-veil) | skip    | hook plugin, mod                  | catalogue | 0                                      | Guardrails add refusals rather than remove them; git-guardrails-claude-code is already a user skill |

### 12. Plugin and skill reload loop: 16 min/week

67 reload commands, mostly this repo's own mod and skill work. No candidate: mods already hot-reload in the session; the rest follows `/update-skills`. **Skip**: the friction falls as mod work does.

### 13. Session restarted within 5 minutes: 15 min/week

22 restarts, most starting the next skill run. [session-saver](https://github.com/hamzafer/claude-code-mods/tree/main/mods/session-saver) (park and resume) answers a lost session, which these are not: **skip**.

### 14. Commands run by hand with `!`: 10 min/week

21 commands, 5 of them `gh pr merge`. Those 5 (2 min/week) fold into friction 1's candidates; worktree cleanup is ship's `cleanup`. No separate candidate.

### 15. Model or effort switched: 9 min/week

37 switches, 14 straight after `/clear`.

| Candidate                                                                                                               | Verdict | Shape  | Source   | Saves                                               | Why                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------- | ------- | ------ | -------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Pin model and effort per project (`model`, `effortLevel` in project settings) or per skill (`model`, `effort` metadata) | adopt   | config | built in | the 14 after `/clear` and some more: **4 min/week** | Both keys exist in 2.1.291. A per-skill pin belongs at the skill's source in `Gharib89/skills`, since the copies here are derived |

### Covered outside the total

Away recaps (built-in recap, about 47 min/week) and the weekly usage limit (statusline plus ratelimit-otel) are covered. Every statusline and usage band in the catalogues is a **skip** for that reason: [claude-hud](https://github.com/jarrodwatts/claude-hud), [claude-lens](https://github.com/Astro-Han/claude-lens), [ccstatusline](https://github.com/sirmalloc/ccstatusline), [cctop](https://github.com/tomstagl/cctop), [token-weather](https://github.com/hamzafer/claude-code-mods/tree/main/mods/token-weather), [rate-limit-guard](https://github.com/melodic-software/claude-code-plugins/tree/main/plugins/rate-limit-guard), rich-statusline, [claude-code-usage-bar](https://github.com/leeguooooo/claude-code-usage-bar), the usage-limits plugin, [ccusage](https://github.com/ccusage/ccusage).

## Candidates that match no audited friction

All **skip**, each with its reason, so they are not weighed again:

- **Context and memory**: [context-mode](https://github.com/mksglu/context-mode) (ELv2, R3), [token-saver](https://github.com/ppgranger/token-saver), [bash-diet](https://github.com/KilimcininKorOglu/claude-code-mods/tree/main/plugins/bash-diet), [output-flood](https://github.com/KilimcininKorOglu/claude-code-mods/tree/main/plugins/output-flood), [headroom](https://github.com/headroomlabs-ai/headroom): output trimming the `rtk` hook already does, against a context-loss class the audit measured small. [pin-note](https://github.com/KilimcininKorOglu/claude-code-mods/tree/main/plugins/pin-note), [pinboard](https://github.com/sirkitree/pinboard), [memory-save](https://github.com/KilimcininKorOglu/claude-code-mods/tree/main/plugins/memory-save), [remember](https://github.com/Digital-Process-Tools/claude-remember), [recall](https://github.com/bledden/claude-recall-plugin), [claude-mem](https://github.com/thedotmack/claude-mem) (R4), [Jevmem](https://github.com/Avinash-jetwani/jevmem), [ctx](https://github.com/ctxrs/ctx), [claude-code-tools](https://github.com/pchalasani/claude-code-tools), [dx plugin](https://github.com/ykdojo/claude-code-tips): the tracker carries context across `/clear` (177 of 245 `/clear`s are followed by a slash command, not a re-brief), and the owner's memory files carry the rest.
- **Cache and cost**: [cache-tax](https://github.com/karanb192/cache-tax), [claude-thermos](https://github.com/izeigerman/claude-thermos), [ClaudeNightsWatch](https://github.com/aniketkarne/ClaudeNightsWatch), DensePack: they save tokens or money, not the owner's minutes.
- **Seams the audit did not see**: [collision-guard](https://github.com/nateherkai/claude-code-mods/tree/main/collision-guard) (no edit collision was counted; the owner's worktree rule prevents them), [aside](https://github.com/JayDoubleu/aside), [context-report](https://github.com/darkroomengineering/cc-settings/tree/main/plugins/context-report), [mcp-doctor](https://github.com/KilimcininKorOglu/claude-code-mods/tree/main/plugins/mcp-doctor), [error-poke](https://github.com/KilimcininKorOglu/claude-code-mods/tree/main/plugins/error-poke) (API-error deaths were not counted), [session-report](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/session-report) (the audit is done).
- **Plan and diff review**: [Plannotator](https://github.com/backnotprop/plannotator), [crit](https://github.com/tomasz-tomczyk/crit): grill-with-artifact covers review on a page; `/diff` is built in and free to use.
- **Prompt shaping**: [claude-code-prompt-improver](https://github.com/severity1/claude-code-prompt-improver) adds clarifying round-trips, the opposite of friction 4.
- **Bundles and collections**: [claude-code-hooks](https://github.com/karanb192/claude-code-hooks), ECC (everything-claude-code): a whole setup to replace one already tuned; pick single pieces instead, and none matched.
- **Dashboards and other platforms**: claude-code-trace, claude-code-karma, the tmux TUIs (c9s, lazyclaude, ccmonitor), AgentPulse: Herdr already shows every agent's state. coucou is macOS and iOS; this owner runs Linux.
- **Off-topic for minutes**: Waiting Room, Claude Fables, prismantis, Replay Theater, the multi-account proxy, ThinkWatch-Lite, Google Meet participant.
- **Voiced need with no friction here**: message timestamps (the scan's loudest unmet need) did not appear in the audit.

## Portfolio

Ranked by minutes saved per week. Where two candidates touch one friction, the cheaper verdict is counted first and the other counts what is left. Row 1 is the owner fork; rows 2 to 8 hold either way.

| #   | Candidate                                                        | Verdict            | Shape                       | Ships where                       | Frictions | Min/week                          |
| --- | ---------------------------------------------------------------- | ------------------ | --------------------------- | --------------------------------- | --------- | --------------------------------- |
| 1   | Ship merges on a clean gate                                      | build (owner fork) | skill (ship profile option) | brief to `Gharib89/skills`        | 1, 14     | 88                                |
| 2   | cloud-ship on a `/schedule` routine                              | adopt              | built-in + config           | config per repo                   | 2, 3      | 48                                |
| 3   | gh-pane ship-loop buttons (`merge` at the gate, `next` after it) | build              | mod (gh-pane feature)       | this marketplace                  | 1, 2, 14  | 37 (23 with row 1)                |
| 4   | `/loop` for repeated status queries                              | adopt              | built-in (habit)            | none                              | 5         | 20                                |
| 5   | where-am-i                                                       | install            | mod                         | `hamzafer/claude-code-mods`       | 5         | 10                                |
| 6   | Ship profile reviewer tuning (`Fallback-for:`, `Cap:`)           | adopt              | config                      | each repo's `docs/agents/ship.md` | 10        | 4                                 |
| 7   | Pin model and effort per project or skill                        | adopt              | config                      | project settings, or skill source | 15        | 4                                 |
| 8   | `/fewer-permission-prompts`                                      | adopt              | built-in skill              | per repo                          | 11        | 3                                 |
|     | **Total**                                                        |                    |                             |                                   |           | **about 200 (126 without row 1)** |

No ties needed breaking: rows 6 and 7 tie at 4 and are both adopt.

## Open for the confirmation grilling

1. **The merge gate (row 1).** Evidence says the gate almost never changes the outcome (101 of 105 runs, `merge on green` asked 3 times). Relaxing it reverses ship's single guaranteed stop. Keep, relax for clean gates only, or relax per repo (for example, not in client repos)?
2. **The cloud lane (row 2).** Which repos may run in the cloud (client repos may not), whether each has a default environment (`/remote-env`) and a `## Cloud lane` bootstrap, whether more parallel runs push the weekly usage limit (hit 5 times in the window), and who runs ship's tracker drafts (`update-issue-body`) when the merge happens on the PR page instead of through ship's attended `merge`.
3. **gh-pane ship-loop buttons (row 3).** Two unknowns make this a prototype first: whether `$.prompt.submit` can run `/clear` and then a command on 2.1.291, and how the pane learns a session sits at a merge gate while reading only its own folder, git and `gh api` (ADR 0001).
4. **Third-party mod trust (row 5).** where-am-i runs unsandboxed, makes a Haiku call each turn and calls MCP tools; read its source before install. Its marketplace is named `claude-code-mods`, which does not collide with `claude-mods`.
5. **smart-compact overlap.** The owner still typed `/compact` 46 times with smart-compact installed. Was it enabled for the whole window? Answer this before weighing any compaction candidate (micro-compaction is the one that would cut the wait).
6. **Unmeasured coverage.** grill-with-artifact arrived on the window's last day; its effect on friction 4 needs a second measurement, not a verdict now.
7. **The 129 min/week with no candidate** (relay, corrections, interrupts): accept them as the cost of attended work, or open a research ticket that classifies their causes?

## Method

1. Read the three inputs in full and listed every candidate they name.
2. Probed what is installed and built in on 2026-10-06: `claude plugin list`, `~/.claude/settings.json`, `~/.claude/skills/`, `claude --version` (2.1.291), and the build's own strings for `preferredNotifChannel`, `effortLevel` and the `model`/`effort` metadata keys.
3. Read ship's merge gate and unattended lane (`.claude/skills/ship/SKILL.md`), cloud-ship, this repo's ship profile and gh-pane's source to know what each already does.
4. Re-counted two splits from the local audit notes: approval replies by text and the command after `/clear`.
5. Probed where-am-i's tree and marketplace (`gh api repos/hamzafer/claude-code-mods/...`) for its calls, since it is the only install proposed.
6. Savings are the audit's minutes times a stated share; change the share and the minutes scale linearly.

## Caveats

- Every "saves" share is a judgement, stated with its reason; the counts under it are measured.
- The cloud-ship saving assumes the owner labels issues ready for an agent as today; a routine with nothing ready saves nothing.
- Third-party candidates were read from the catalogues and, for where-am-i, its source; none was installed or run.
