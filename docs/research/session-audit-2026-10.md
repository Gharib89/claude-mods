# Session audit: which frictions recur in two weeks of sessions

Research ticket #22, part of map #21. Window: 2026-09-22 to 2026-10-06 (15 days, the last one partial).

## Answer

The owner's sessions lose about **11.5 hours a week** to friction, against about 52 hours of active session time a week. Most of it sits in the **ship loop** (pick a ticket, `/clear`, `/ship N`, wait, reply `merge`) and in **round-trips that only say yes**. Corrections and context loss are small. Ranked by minutes per week:

| Rank | Friction                                                                                                       | Class         |   Count in window | Min/week | Already covered by                               |
| ---: | -------------------------------------------------------------------------------------------------------------- | ------------- | ----------------: | -------: | ------------------------------------------------ |
|    1 | Merge gate replied by hand (`merge` typed after a ship report)                                                 | workflow seam |               149 |      104 | nothing                                          |
|    2 | Next ticket started by hand: `/clear`, then `/ship N`, `/triage N` or `/wayfinder MAP N` typed                 | workflow seam |               245 |       86 | gh-pane, in part                                 |
|    3 | Watched waits: a long turn the owner sat through, with no other session prompted                               | owner time    | 32 turns, 363 min |       85 | nothing                                          |
|    4 | Approval round-trips that only accept (`agree with all`, `yes`, `go`, `continue`, a bare option number)        | owner time    |               148 |       69 | grill-with-artifact, in part                     |
|    5 | Status checked by hand (`check now`, `rerun now`, `what is the ETA`, `what is the progress`)                   | workflow seam |                79 |       55 | nothing in use (built-in `/loop` exists, unused) |
|    6 | Compaction: the wait, plus deciding to type `/compact`                                                         | context loss  |    85 compactions |       49 | smart-compact, in part                           |
|    7 | Output relayed by hand between sessions, tabs or a cloud session (pasted answers, "check tab 2")               | workflow seam |                50 |       47 | Herdr, in part                                   |
|    8 | Corrections, challenges ("why did you..."), and the same request asked twice                                   | owner time    |                46 |       43 | nothing                                          |
|    9 | Interrupts (`[Request interrupted by user]`, with or without a tool running)                                   | owner time    |                55 |       39 | nothing                                          |
|   10 | Git and review steps driven by prompt (`commit and push`, `another round of /code-review`, request a reviewer) | workflow seam |                82 |       38 | ship, in part                                    |
|   11 | Permission friction: owner rejections, classifier denials, approval refusals, hook refusals                    | owner time    |               108 |       24 | auto mode, mostly                                |
|   12 | Plugin and skill reload loop (`/plugin`, `/reload-plugins`, `/reload-skills`, `/plugin-types`)                 | owner time    |                67 |       16 | nothing                                          |
|   13 | Session restarted within 5 minutes outside `/clear`                                                            | context loss  |                22 |       15 | nothing                                          |
|   14 | Commands run by hand with `!` (5 of them `gh pr merge`, then worktree cleanup and settings edits)              | owner time    |                21 |       10 | nothing                                          |
|   15 | Model or effort switched (`/model`, `/effort`), 14 of them right after a `/clear`                              | owner time    |                37 |        9 | nothing                                          |

Two more recur but are already covered, so they stay out of the total: re-entering a session after being away (400 built-in away recaps, about 47 min/week at 15 seconds each) and the weekly usage limit (5 limit errors in main sessions, one stopping work for 83 minutes; the statusline shows the 5-hour and 7-day limits and ratelimit-otel reports them).

Ranks 1 and 2 are one loop seen from two ends: together about **190 min/week**, the largest single target.

## What was counted

Source: the owner's local Claude Code transcripts, `~/.claude/projects/*/*.jsonl`, every record with a timestamp inside the window, all projects including worktree and scratchpad project folders. 634 main sessions (subagent transcripts excluded from owner counts). Counting scripts and raw per-session notes are kept outside git at `~/wip/notes/productivity-mods-audit/`; this file carries only counts.

| Measure                                                                                  |                   Value |
| ---------------------------------------------------------------------------------------- | ----------------------: |
| Main sessions with records in the window                                                 |                     634 |
| Owner entries (prompts plus slash commands)                                              |                   1,816 |
| Prompts typed into a session by another agent through Herdr (excluded from owner counts) |                     189 |
| Agent turns                                                                              |                   2,378 |
| Wall-clock hours with at least one turn running                                          |                   109.8 |
| Share of that time with exactly one turn running                                         |                   54.5% |
| Owner active hours (prompts less than 30 min apart, each block padded 5 min)             | 110.6 (about 52 a week) |

**Owner prompt** means a `user` record with origin `human` (or no origin) that is not meta, not a compact summary, not a tool result, not a skill body, task notification or local command output, and not typed by another agent. An agent-typed prompt is one arriving within 60 seconds after a `herdr agent prompt|send|start`, `herdr pane send|run` or `tmux send-keys` call from a different session.

**Classes** of prompt, by pattern on the prompt text (precision checked by reading a random sample of each class locally):

- correction: starts with `no`, `wrong`, `I said`, `stop`, `don't`, `you didn't`, `still`, `again`, `actually`, `instead` and the like; challenge: starts with `why`.
- status: asks for progress, ETA, status, `check now`, `rerun now`, in 25 words or fewer.
- approve: a short reply that only accepts (`merge`, `agree with all`, `yes`, `go ahead`, `continue`, a bare option number).
- relay: a `<pasted_content>` block, a pasted cloud-session answer, or a reference to another tab, pane or session.

**Tool waits** pair each `tool_use` with its `tool_result` timestamp. **Watched waits** are turns of 3 minutes or more where the owner prompted no other session during the turn, no away recap fired, and the owner's next prompt in that session came within 1 minute of the turn ending.

## Minutes per week: method

Minutes per week = count in window x cost per event x 7 / 15. The cost per event is an assumption, stated so a reader can change it:

| Friction                                        | Cost per event                                                                           | Basis                                                                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merge gate                                      | 1.5 min                                                                                  | notice the ship report, switch tab, read it, reply; the PR waited a median 4.1 min (p75 16.6 min) between "Ready to merge" and the reply, over 100 measured gates |
| Next ticket                                     | 0.75 min                                                                                 | choose the ticket, type `/clear` and the command                                                                                                                  |
| Watched waits                                   | 50% of measured turn time                                                                | 363 min is an upper bound: the owner may have been at the screen but busy elsewhere                                                                               |
| Approval round-trip                             | 1 min                                                                                    | read the round, type the reply                                                                                                                                    |
| Status check                                    | 1.5 min                                                                                  | switch, ask, read the answer                                                                                                                                      |
| Compaction                                      | measured duration for manual, half of it for automatic, plus 1 min per manual compaction | 38.7 min manual and 41.6 min automatic compaction time in the window                                                                                              |
| Relay                                           | 2 min                                                                                    | find the output, copy, paste, explain                                                                                                                             |
| Correction, challenge, re-ask                   | 2 min                                                                                    | read the wrong result, write the correction, part of the rework                                                                                                   |
| Interrupt                                       | 1.5 min                                                                                  | notice, stop, redirect                                                                                                                                            |
| Git or review step by prompt                    | 1 min                                                                                    | type the step, read the result                                                                                                                                    |
| Permission                                      | 1 min per owner rejection, 0.25 min per denial                                           | auto mode answers most prompts; prompts the owner approved leave no record, so this undercounts                                                                   |
| Reload loop, `!` command, model switch, restart | 0.5, 1, 0.5, 1.5 min                                                                     | one command each; a restart also re-opens the task                                                                                                                |

## Findings by class

### The owner's time

- **Corrections are rare.** 18 correction prompts, 17 challenges and 11 same-session re-asks among 1,816 owner entries, under 3%. Repeated identical prompts across sessions are almost all one-word approvals: `merge` appears 123 times in 115 sessions.
- **Waits are mostly not watched.** Counting only tool calls of 2 minutes or more, the agent spent 17.7 hours in foreground CI and review polls (207 calls, mostly a ship script awaiting a review), 6.4 hours in tests and gates, 5.2 hours in Herdr waits and 4.2 hours in sleep loops. Only 363 minutes of turns look watched; within those, CI and review polls are 71 minutes and tests 42, and the rest is model time and short tools.
- **Questions sit unanswered.** 129 `AskUserQuestion` calls stayed open 709 minutes in total; 38 of them waited 2 minutes or more. That is the agent waiting on the owner, not owner time, but it is throughput lost to the same attention switch as the merge gate.
- **Permissions cost little.** `defaultMode` is `auto`: 34 owner rejections, 59 auto-mode classifier denials, 10 "requires approval" or safety-check refusals, 5 PreToolUse hook refusals in two weeks.

### Context loss

- **`/clear` is a habit, not a recovery.** 245 owner `/clear`s; the next entry is a slash command in 177 cases (`/ship` 78, `/wayfinder` 33, `/triage` 24, `/model` 14) and free text in only 24 (14 long). The tracker carries the context, so a `/clear` costs a command, not a re-brief.
- **Compaction is cheap and rarely causes redo.** 85 compactions (46 manual, 39 automatic), 80 minutes of compaction time in all. Only 5 files read before a compaction were read again after it. smart-compact started 21 turns and a self-compact prototype 5, almost all straight after a compaction, to resume the work.
- **Restarts are rare.** 22 sessions began within 5 minutes of another one in the same project going quiet without a `/clear`; most start the next skill run.

### Workflow seams

- **The ship loop.** 105 `/ship` runs: median 1 owner touch per run, and that touch is the `merge` reply in 101 runs. `/triage` runs (61) take a median 1 touch; `/wayfinder` runs (37) a median 3, mostly accept-all replies to grilling rounds.
- **Skill chains repeat in fixed order**, but inside skills: `/clear > /ship > tdd > code-review` (25 sessions), `/clear > /ship > code-review` (21), `/clear > /wayfinder > grilling > domain-modeling` (17), `/clear > /triage` (12). The chain the owner types by hand is only the outer one: `/clear`, then the command.
- **Herdr hand-offs are agent-driven.** 814 Herdr calls in the window (313 `agent read`, 158 `agent prompt`, 146 `agent send`, 80 `tab create`); agents typed 189 prompts into other sessions. The owner still relays by hand 50 times: pasted cloud-session answers and outputs from other tabs.
- **Status checks by hand** are concentrated: 36 of the 79 are in cc-otel, re-running the same monitoring query on request (`rerun now`, `check now`), 29 of them in two long sessions. The built-in `/loop` was not used once.
- **The review loop** draws 28 owner prompts: another `/code-review` round, a reviewer swap when a review bot is out of quota, a re-request.
- **Rate limits** stopped main sessions 5 times (the weekly limit), and a review bot's quota ran out at least 3 times, each time answered by a prompt that swapped or skipped the reviewer.

## Deep read: cc-otel and skills

|                      |            skills |          cc-otel | All other projects |
| -------------------- | ----------------: | ---------------: | -----------------: |
| Main sessions        | 176 (+42 scratch) | 57 (+12 scratch) |                347 |
| Owner entries        |               675 |              283 |                858 |
| `/clear`             |               126 |               24 |                 95 |
| `merge` replies      |                65 |               14 |                 70 |
| Accept-all replies   |                57 |               10 |                 20 |
| Status checks        |                10 |               36 |                 33 |
| Interrupts           |                20 |                5 |                 30 |
| Compactions          |   38 (+1 scratch) |                8 |                 38 |
| Herdr calls          |               505 |               20 |                289 |
| Watched-wait minutes |               193 |               60 |                110 |

- **skills** carries half the watched-wait minutes and most of the ship loop: it is where ship, setup and update runs execute and where Herdr drives other repos' sessions.
- **cc-otel** is a monitoring project: its friction is status checked by hand and results relayed (10 pastes), not the ship loop.

## Installed extensions

From `~/.claude/settings.json` and `claude plugin list` on 2026-10-06:

- Plugins enabled: gh-pane 0.3.0 and smart-compact 0.1.2 (this marketplace), ratelimit-otel 0.5.1 (managed), playwright, pyright-lsp, frontend-design, html-plan, last30days, eli5, cc-plugin-you-should-know (built in). claude-code-setup and code-modernization are installed but disabled.
- Hooks: a PreToolUse Bash hook (`rtk`) that rewrites shell commands, a SessionStart hook that reports agent state to Herdr.
- Statusline: model and effort, 5-hour and 7-day limits, git and PR, context bar, sibling worktrees with their PRs.
- Settings: `defaultMode: auto`.
- User skills include ship, triage, wayfinder, handoff, retro, herdr and grill-with-artifact (installed 2026-10-06, so after almost all of the window).

What they cover, against the table above:

- gh-pane fills `/ship N`, `/triage N` and `/wayfinder MAP N` and keeps its pane across `/clear`: it covers choosing and typing the next ticket (rank 2) in part. It was opened 86 times. It offers no merge action (rank 1).
- smart-compact covers when to compact (rank 6) in part.
- auto mode covers most permission prompts (rank 11).
- The statusline and ratelimit-otel cover rate-limit visibility.
- Herdr, driven by the agent, covers most cross-session hand-offs; what is left is the owner's own pasting (rank 7).
- grill-with-artifact targets the grilling round-trips inside rank 4, but arrived on the window's last day, so its effect is not measured here.

## Limits of this audit

- Prompts the owner approved through a permission dialog leave no transcript record, so permission friction is a floor.
- Work done outside Claude Code (a browser, a terminal, a review page) is invisible; the relay and status counts are floors.
- Class patterns are English regular expressions; a correction phrased as a fresh instruction counts as an ordinary prompt.
- The 60-second Herdr attribution can mislabel an owner prompt typed at the same moment an agent sent one elsewhere.
- Per-event costs are assumptions; the counts are measurements. Change a cost and the minutes scale linearly.
