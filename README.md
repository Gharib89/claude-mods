# claude-mods

Claude Code mods (function-hook plugins), installed through one marketplace.

## Mods

- `smart-compact`: lets Claude compact its own context at a step boundary it picks, with its own instructions, then resume the work on its own. Reminders arrive at 60% and 80% of the auto-compact point. Interactive sessions only: a `-p` or SDK session cannot compact on request yet, so there the mod only adds its keep-list to automatic compactions.
- `gh-pane`: `/gh-pane` docks a pane of the session repo's open issues and PRs in run order: spec trees from sub-issues, blocked-by edges, claims and their ship runs, and the needs-triage and needs-info lists. Its buttons fill the prompt with `/ship N`, `/triage N` or a request to release a stale claim, and never send it. It reads the repo through `git` and `gh api` (REST only), so `gh` must be installed and signed in. The label names, PR cap, ship worktree layout and the text each button fills are options in `/config`.

## Install

```sh
claude plugin marketplace add Gharib89/claude-mods
claude plugin install smart-compact@claude-mods
claude plugin install gh-pane@claude-mods
```
