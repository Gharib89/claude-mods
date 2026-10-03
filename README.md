# claude-mods

Claude Code mods (function-hook plugins), installed through one marketplace.

## Mods

- `smart-compact`: lets Claude compact its own context at a step boundary it picks, with its own instructions, then resume the work on its own. Reminders arrive at 60% and 80% of the auto-compact point. Interactive sessions only: a `-p` or SDK session cannot compact on request yet, so there the mod only adds its keep-list to automatic compactions.

## Install

```sh
claude plugin marketplace add Gharib89/claude-mods
claude plugin install smart-compact@claude-mods
```
