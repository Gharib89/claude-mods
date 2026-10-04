# A mod may read the session repo through git and gh

Every mod is generic: it serves any owner, not this owner's workflow. Until now that also meant a mod read only its own folder. gh-pane (#12) needs the repo the session runs in: its issues, sub-issues, blocking edges and PRs through `gh api`, and its worktrees through `git worktree list`. We decided a mod may read the session repo, but only through git and `gh`, and only REST (`gh api`), never GraphQL, which flakes 401 mid-session. Any detail of one owner's workflow (label names, the PR cap, the worktree layout, the slash commands a button fills) is a `userConfig` option, with this owner's values as the defaults.

## Considered Options

- **Accept gh-pane as a workflow mod outside the generic rule.** Rejected: the rule would then have an unbounded exception, and the next mod would argue its own.
- **Keep the mod to its own folder.** Rejected: a backlog pane has nothing to show without the repo.
