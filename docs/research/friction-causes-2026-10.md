# Friction causes: relay, corrections and interrupts

Research ticket #30, part of map #21. Window: 2026-09-22 to 2026-10-06 (15 days), the same transcripts and cut-off as the session audit (#22).

## Question

What causes the three frictions the portfolio found no candidate for (output relayed by hand between sessions, corrections and re-asks, interrupts: 129 min/week in the audit), and does any cause have a fix that would become a new **candidate**?

## Answer

- **The three frictions are about 81 min/week, not 129.** The audit's 151 class hits fall on 135 distinct owner entries (16 entries matched two classes), and 35 of those are not the friction at all: a question that mentions a cloud session or a tab, a spec or a query pasted as the prompt, a "why" that asks for status, an interrupt another agent sent through Herdr. 100 true events remain.
- **A quarter of what is left is already fixed or covered (21 min/week).** The largest single cause, a reviewer bot out of quota while ship polled for it (13 events), stopped on 2026-09-25 after ship's quota fixes; the six pasted cloud-session replies all predate the cloud-proofs rule; the three convention slips each became a memory within minutes; the two wrong-model starts are portfolio row 7.
- **Most of the rest is the owner steering, which no extension removes (33 min/week).** The owner fixing their own prompt (a typo, a message sent early, a command re-sent with arguments), adding information mid-task, or redirecting a one-off wrong step. Only 7 of the 30 correction-class entries correct the agent's work; 10 interrupts redirect a wrong step.
- **Two small new candidates, both rules, about 3 to 4 min/week each:** waits that end on failure as well as success, and hand-offs made only for human-only steps and typed as `! <command>`. **Neither is a hook plugin or a mod**, so the map's marketplace wording does not change.
- **One cause is fog: the same prompt sent twice (9 min/week).** The owner re-sent a prompt that had drawn no new output for 19 s to 2.9 min; in three sessions the first output came 3 to 4.6 min after the first send. What the session was doing in that silence is unprobed.

## Causes, ranked

Minutes per week use the audit's costs: 2 min per relay, 2 min per correction or re-ask, 1.5 min per interrupt, times 7/15 for the 15-day window. An event that matched two classes is counted once, under its relay class if it had one.

| Rank | Cause                                                                                                                                              | Events (relay, correction, interrupt) | Min/week | Fix shape and status                                                       |
| ---: | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------: | -------: | -------------------------------------------------------------------------- |
|    1 | Reviewer bot out of quota while ship polled for its round; the owner stopped the poll and named another                                            |                         13 (0, 3, 10) |      9.8 | Fixed in ship (see below); none since 2026-09-25                           |
|    2 | Agent step or advice wrong, one-off (a wrong assumption, a misread count, an unneeded step, a risky workaround, a reversed decision)               |                          12 (0, 4, 8) |      9.3 | None: no two share a pattern a rule could name                             |
|    3 | Same prompt sent twice: the first drew no visible response yet                                                                                     |                          10 (2, 7, 1) |      9.1 | Fog: cause unprobed                                                        |
|    4 | Owner fixes their own prompt: a typo, a message sent early, a skill re-sent with arguments, a ticket number                                        |                         10 (0, 0, 10) |      7.0 | None: owner input                                                          |
|    5 | Owner adds information or a new request mid-task                                                                                                   |                           9 (0, 1, 8) |      6.5 | None: steering is the point                                                |
|    6 | Owner ran a one-shot command handed over by the agent (sudo, a cloud sign-in, an apply, an install line) in another terminal and pasted its output |                           7 (7, 0, 0) |      6.5 | **New candidate: Use `!`** (bash mode, built in)                           |
|    7 | Foreground wait cut short: the event had already happened, the run had failed, or the wait was not needed                                          |                           9 (0, 0, 9) |      6.3 | **New candidate: rule** (7 of 9)                                           |
|    8 | Cloud session reply pasted                                                                                                                         |                           6 (6, 0, 0) |      5.6 | Covered: cloud-proofs rule, 2026-10-04; all six on one day before it       |
|    9 | Pointer to another session ("check tab 2", a teammate session already did it); the agent then read it                                              |                           5 (5, 0, 0) |      4.7 | None new; 2 of 5 followed an agent hand-off the Herdr rule already forbids |
|   10 | Agent broke an owner convention that became a memory right after                                                                                   |                           5 (0, 3, 2) |      4.2 | Covered: the feedback-memory process; 3 incidents, no recurrence           |
|   11 | Owner's own observation from a terminal or a built-in UI, pasted as the task                                                                       |                           3 (3, 0, 0) |      2.8 | None: this is the task's input                                             |
|   12 | Agent asked the owner to do a step it could do itself (edit a config file, run on a host it already reached)                                       |                           3 (3, 0, 0) |      2.8 | **New candidate: rule** (same as rank 6)                                   |
|   13 | Decision page answers pasted (a plan page's Respond text)                                                                                          |                           2 (2, 0, 0) |      1.9 | Skip: see below                                                            |
|   14 | Run started on the wrong model, stopped and restarted                                                                                              |                           2 (0, 0, 2) |      1.4 | Covered: portfolio row 7 (pin model and effort per skill)                  |
|   15 | Question dialog dismissed to ask something back                                                                                                    |                           2 (0, 0, 2) |      1.4 | None                                                                       |
|   16 | Output from another person's machine                                                                                                               |                           1 (1, 0, 0) |      0.9 | None: outside the owner's sessions                                         |
|   17 | Accidental interrupt, resumed with `continue`                                                                                                      |                           1 (0, 0, 1) |      0.7 | None                                                                       |
|      | **True friction**                                                                                                                                  |                  **100 (29, 18, 53)** | **81.0** |                                                                            |
|      | Regex false positives (not the friction)                                                                                                           |                        35 (21, 12, 2) |     32.2 | Dropped                                                                    |

The recount per friction, against the audit. The two correction-class entries that also matched a relay class count under relay.

| Friction (audit rank)               | Audit events | Audit min/week | Distinct true events | Min/week now | Already covered |
| ----------------------------------- | -----------: | -------------: | -------------------: | -----------: | --------------: |
| 7. Output relayed by hand           |           50 |             47 |                   29 |         27.1 |             5.6 |
| 8. Corrections, challenges, re-asks |    46 (hits) |             43 |                   18 |         16.8 |             5.6 |
| 9. Interrupts                       |           55 |             39 |                   53 |         37.1 |             9.8 |
| **Total**                           |      **151** |        **129** |              **100** |     **81.0** |        **21.0** |

The 35 false positives: 14 relay hits only mention a cloud session, a new session or a tab, or are the owner's own text; 7 are a spec, code or a query pasted as the prompt; 10 "corrections" are a new request, a design question or a deliberate repeat (a second review round asked for twice); 2 are status questions phrased as "why" (they belong to the audit's status friction); 2 interrupts came from another agent through Herdr.

## New candidates

### Waits end on any terminal state (rule): about 3 min/week

Nine interrupts stopped a foreground wait. In seven, the wait was a loop the agent wrote itself (a CI run poll, an `until` on a background task's output file, a Herdr `wait-output` regex, a Herdr agent-state poll) that waited for success alone: the run had failed, the review round had already posted, the other session had already woken, and the owner saw it first. The other two: one CI wait the owner judged unneeded, and one wait on a cloud session's push that never came, which the cloud-proofs rule now replaces with reading the reply page.

- **Shape:** a rule line, cheapest per ADR 0002: a wait the agent writes checks whether the event is already there before it starts, ends on the first terminal state (success, failure, timeout), and runs in the background or through the built-in Monitor tool so the owner can talk to the session meanwhile.
- **Existing extension:** none in the catalogue or the community scan; the Monitor tool is built in (confirmed in the verdicts research) and is the Use part.
- **Score:** 7 events x 1.5 min x 7/15 = 4.9 min/week addressable; a rule removes perhaps 60%: **about 3 min/week**.
- **Proposed verdict:** build, as a rule in the owner's rules (dotfiles), not in this marketplace.
- **Unprobed:** whether one rule line changes how the agent writes its waits.

### Hand over only human-only steps, as `! <command>` (rule plus Use): about 4 min/week

Thirteen relays were output of a command the owner ran in a terminal. Three were the owner's own observation (the task itself). Three were steps the agent could have done itself: an editor-driven config edit it could make directly, and a command on a host the same session already reached over SSH. Seven were one-shot commands the agent handed over (a sudo line, a cloud CLI's browser sign-in, an infrastructure apply, an install line it had offered to run), and the owner ran each in another terminal and pasted the output back, although in three of those the agent had already written the command as `! <command>`.

- **Shape:** a rule line (do a step yourself unless it needs a password, a browser sign-in or a device you cannot reach; hand those over as `! <command>`), plus the owner's habit of typing the `!` line the agent gives, so the output lands in the session without a copy and paste. Bash mode is built in: Use.
- **Score:** the habit saves about half of each paste for the 7 (7 x 1 min x 7/15 = 3.3 min/week); the rule removes most of the 3 avoidable hand-offs (2.8 min/week x 70% = 2.0): **about 4 min/week**, less if `!` cannot carry a sudo password prompt or a sign-in that waits on a browser.
- **Proposed verdict:** Use (the `!` habit) plus build (one rule line).
- **Unprobed:** whether bash mode takes a sudo password and waits through a browser sign-in. Probe both before counting the 3.3.

### Skipped

- **Decision page answers pasted** (2 events, 1.9 min/week). A third-party plan skill ends with Respond text the owner copies into the session. A page whose Submit reaches the session, as grill-with-artifact already does for grilling rounds, would remove it, but the score is under 2 min/week and the skill is not the owner's: **skip**.
- **Same prompt sent twice** (10 events, 9.1 min/week) gets no candidate until its cause is measured; see fog below.

No cause has a hook plugin or a mod as its cheapest shape.

## Already fixed or covered

- **Reviewer bot out of quota (13 events, 9.8 min/week).** Ship polled for a reviewer bot's free round while the bot's quota was spent, and the owner stopped the poll to skip it or name a fallback. Ship's own fixes in `Gharib89/skills` landed across the same days: a quota refusal closes the poll at `degraded: blocked` (#251 and #258, 2026-09-23; #273, 2026-09-24), then a best-effort reviewer loop (#309, 2026-09-26). The 13 events run from 2026-09-22 to 2026-09-25 and none follow in the eleven days after. Portfolio row 6 (a `Fallback-for:` reviewer) stays as scored; these minutes are not extra to it.
- **Cloud session replies (6 events, 5.6 min/week).** All six in one probe session on 2026-09-26. The cloud-proofs rule, written 2026-10-04, has the agent read the reply page through Chrome itself. No cloud reply was pasted after 2026-09-26 either before or after the rule, so its effect is not measured here.
- **Owner conventions (3 incidents, 5 events, 4.2 min/week).** Using tmux where the owner wants Herdr, writing a decision's rationale into a skill's prose, and starting a new skill at 1.0.0. Each is now a project memory: two were written within a minute of the correction, and the third file was last changed four days after it. None of the three recurred later in the window. This matches the verdicts research's skip of hookify: the memory process already turns a correction into a standing rule.
- **Wrong model (2 events, 1.4 min/week).** A ship run and a wayfinder run started on Sonnet, were stopped within seconds and restarted on Opus: portfolio row 7.
- **Pointer to another session (5 events, 4.7 min/week).** Three are ordinary routing (a pointer to where something lives, a message for a teammate session, news that another session already merged). Two followed the agent telling the owner to run two setup skills from fresh sessions himself, while the Herdr rule, last changed the night before, says to drive such runs through a Herdr tab. The rule exists; this is a compliance gap, not a missing rule.

## Fog

**Same prompt sent twice (10 events, 9.1 min/week).** Measured: before each repeat the first send had drawn no new assistant record for 19 s to 2.9 min, and in three sessions the first output came 3 to 4.6 min after the first send. No API error record sits in any gap, and each repeat is recorded as typed, not as queued, which is how a busy session records a message. Six of the ten fall on one day (2026-09-28). One more is mechanical: a message typed during a tool call was delivered as an interrupt, and the owner typed it again three seconds later. Unprobed: whether the silent minutes were a slow first token, a silently dropped request, or an Escape that left no record. The cheapest probe is to open the debug log the next time a prompt draws nothing for a minute. Until then no candidate, since the time lost is the silence, not the re-send.

## Spread by project

| Cause                                      | skills | cc-otel | claude-mods | crm | Other (10 projects) |
| ------------------------------------------ | -----: | ------: | ----------: | --: | ------------------: |
| Reviewer bot out of quota                  |      3 |       3 |           0 |   0 |                   7 |
| Agent step or advice wrong, one-off        |      4 |       0 |           1 |   3 |                   4 |
| Same prompt sent twice                     |      2 |       1 |           0 |   0 |                   7 |
| Owner fixes own prompt                     |      5 |       0 |           2 |   1 |                   2 |
| Owner adds information mid-task            |      3 |       1 |           0 |   0 |                   5 |
| Foreground wait cut short                  |      5 |       1 |           1 |   1 |                   1 |
| Owner-run command output (ranks 6, 11, 12) |      2 |       0 |           0 |   1 |                  10 |
| Cloud session reply pasted                 |      6 |       0 |           0 |   0 |                   0 |
| Pointer to another session                 |      2 |       0 |           3 |   0 |                   0 |
| Owner convention, then memory              |      3 |       0 |           2 |   0 |                   0 |

- **skills** carries the cloud relays and most waits, as the home of ship, setup and Herdr-driven runs.
- **Owner-run output sits outside the public repos**: 10 of 13 in other projects, mostly machine setup and cloud infrastructure work, where sudo and sign-ins are part of the task.
- **The quota interrupts cluster in one other project** (7 of 13), which runs a derived copy of ship.

## Method

- **Re-finding the events.** The audit's own regexes and filters (`~/wip/notes/productivity-mods-audit/scripts/`), re-run over main-session transcripts only (no subagent sidechains), with records cut at the audit's run time (2026-10-06 09:20 UTC). The counts reproduce the audit exactly: 40 pastes and 10 tab references (relay), 18 corrections, 17 "why" challenges and 11 same-session re-asks, 27 plain and 28 tool-use interrupts.
- **Reading.** Each event was read with the agent's last text before it, the tool calls in flight, the owner's next entry and the agent's next reply, and given one cause; the taxonomy was built from what the events showed. For interrupts, the time since the last tool call and since the owner's last entry was measured, and the audit's Herdr attribution (a `herdr` send from another session within 60 s) was applied to interrupts too, which the audit applied to prompts only. For repeats, the records between the two sends were listed.
- **Dates.** Rule dates from the owner's dotfiles git log and file times; memory dates from file times; ship fixes from the `Gharib89/skills` git log.
- **Catalogues.** Each cause was checked against the extension catalogue (#24) and the community scan (#23) before any build was proposed. Nothing in either targets waits, hand-offs, repeats or steering.
- **Privacy.** Per-event notes with excerpts are kept outside git at `~/wip/notes/productivity-mods-audit/causes/`; this file carries counts and patterns only.

## Limits

- **One reader.** Every cause is one person's reading of the context, with no second coder. The edges are soft between "one-off wrong step" and "owner adds information", and between "owner fixes own prompt" and "wrong model".
- **Precision, not recall.** This pass dropped false positives; it did not look for events the regexes miss, such as a correction phrased as a fresh instruction. The true counts are floors.
- **The window straddles the fixes.** The quota fixes landed mid-window and the cloud-proofs rule near its end, so the forward rate is lower than the window rate.
- **Costs are the audit's assumptions.** A stalled first response costs its silence, not 2 min; a wait cut short may have saved the owner time rather than cost it.
- **Interrupt records include message delivery.** Some interrupt records sit within a few seconds of an owner message typed during a tool call, which suggests Claude Code records an interrupt when it delivers such a message. Unprobed; those were classified by the message's content.
