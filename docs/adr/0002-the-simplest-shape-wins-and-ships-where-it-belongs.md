# The simplest shape wins, and ships from the repo that owns it

Choosing which extensions to build for the owner's sessions, a need gets the simplest shape that meets it: a skill or a hook plugin before a mod. So the claude-mods marketplace carries hook plugins (plugins of plain command hooks) beside its mods, while a skill's brief is filed in `Gharib89/skills`, whose `/ship` already knows that shape. A mod is built only where function hooks are the only way to get the behaviour.

## Considered Options

- **Every build is a mod.** Rejected: a mod costs the early-access API's churn and the four-step dev loop, which a plain hook or a skill avoids.
- **Plain hooks go into the owner's dotfiles.** Rejected: they would be neither generic nor shareable, and no `/ship` would carry them.
