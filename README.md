# claude-mods

Claude Code mods (function-hook plugins), installed through one marketplace.

## Mods

- `smart-compact`: lets Claude compact its own context at a step boundary it picks, with its own instructions, then resume the work on its own. Reminders arrive at 60% and 80% of the auto-compact point. Interactive sessions only: a `-p` or SDK session cannot compact on request yet, so there the mod only adds its keep-list to automatic compactions.
- `gh-pane`: `/gh-pane`, or the `Open gh-pane` button above the prompt (`Hide gh-pane` while the pane is up, each followed by the Nerd Font GitHub mark, which `/plugin configure` can blank where the terminal font has none), docks a pane of the session repo's open issues and PRs in run order: spec trees from sub-issues, blocked-by edges, claims and their ship runs, planning maps whose tickets close without a PR, and the needs-triage and needs-info lists. Its buttons fill the prompt with `/ship N`, `/triage N`, a map's next ticket (`/wayfinder MAP N`), a request to release a stale claim, or a request to close an issue whose sub-issues are all closed (`all done`), and never send it. Two band buttons act on this session's own state instead: when a main-loop answer carries the merge-gate text and a PR link, `merge PR #N` (hotkey `m`) sends the merge reply as your own prompt, and once that PR reads as merged over REST, `clear + /ship N` (hotkey `n`) clears the session and runs the first ready row's command (one that does not start with `/` shows no button), and goes once the next turn ends. When a ship run merges on its own on a clean gate, its answer's merged line (`Merged on a clean gate:` with the PR link after it on that line) takes the same read, so `clear + /ship N` shows with no merge button. A hotkey fires only once the band holds focus (`ctrl+x` then `tab`, or a click), never from the prompt, where `m` types a letter; a click always works. A `/clear` keeps the open pane's last read of the same folder on screen until the next one lands. It reads the repo through `git` and `gh api` (REST only), so `gh` must be installed and signed in. The label names (the map label included), PR cap, ship worktree layout, the band button's icon, the text each button fills, the merge-gate text, the merged text and the merge reply are options in `/plugin configure gh-pane@claude-mods`.

## Install

```sh
claude plugin marketplace add Gharib89/claude-mods
claude plugin install smart-compact@claude-mods
claude plugin install gh-pane@claude-mods
```
