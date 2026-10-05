# claude-mods

Claude Code mods (function-hook plugins), installed through one marketplace.

## Mods

- `smart-compact`: lets Claude compact its own context at a step boundary it picks, with its own instructions, then resume the work on its own. Reminders arrive at 60% and 80% of the auto-compact point. Interactive sessions only: a `-p` or SDK session cannot compact on request yet, so there the mod only adds its keep-list to automatic compactions.
- `gh-pane`: `/gh-pane`, or the GitHub logo button above the prompt (dim while the pane is hidden; a Nerd Font glyph, so set its label to text in `/plugin configure` where the terminal font has none), docks a pane of the session repo's open issues and PRs in run order: spec trees from sub-issues, blocked-by edges, claims and their ship runs, planning maps whose tickets close without a PR, and the needs-triage and needs-info lists. Its buttons fill the prompt with `/ship N`, `/triage N`, a map's next ticket (`/wayfinder MAP N`) or a request to release a stale claim, and never send it. A `/clear` keeps the open pane's last read of the same folder on screen until the next one lands. It reads the repo through `git` and `gh api` (REST only), so `gh` must be installed and signed in. The label names (the map label included), PR cap, ship worktree layout, the band button's label and the text each button fills are options in `/plugin configure gh-pane@claude-mods`.

## Install

```sh
claude plugin marketplace add Gharib89/claude-mods
claude plugin install smart-compact@claude-mods
claude plugin install gh-pane@claude-mods
```
