# Phase 0: preflight, the profile it loads, and isolation

`SKILL.md` names the calls; this file says what each one proves, what it admits
and how the worktree is made.

## What preflight proves

Tooling, identity and push permission. Azure DevOps has no cheap push probe, so
preflight returns `unknown`, warns on stderr and continues: name the unproven
check in the merge summary.

## Admission

Admission by label is `ready-for-agent` always and `ready-for-human` in an
attended run only; anything else is `not triaged`. An assignee, your own
identity included, is `already claimed`: stale-claim recovery is a human
unassigning by hand. `existing PR` is a live PR whose body **closes** this issue
or whose head branch ends in `-<issue>`.

## The worktree

Attended, `isolate <issue> <type> <slug>` fetches, branches
`<type>/<slug>-<issue>` from `origin/HEAD`, creates the sibling worktree
`<parent>/<repo>.worktrees/<slug>-<issue>`, copies the profile's `Carry:` files
in one way, and prints the path. Unattended,
`isolate ... --in-place` does the same fetch and branch in the sandbox clone,
which is already isolation: no worktree, no carry.

Isolation is `isolate`'s call alone, rather than `EnterWorktree` or a bare `git
worktree add`: it is what lands the worktree at the path and branch preflight
checks. Work from the printed path, every edit under it absolute, because an
absolute main-checkout path silently edits the wrong tree.

## The ship profile

`docs/agents/ship.md` has fourteen fixed `##` headings, every one always
present; a defaulted axis reads `None.` or `Default.`. Most facts sit on
`Label:` lines; Coding standards, Public surface and Triage carry theirs as the
section body. Preflight, prepare and the reviewer mechanics read their own
lines; everything else you pass as arguments.

A run that changes the profile, or refreshes the ship copy that reads it,
re-validates the pair with `preflight none` rather than a second `preflight
<issue>`, for the reason [preflight](../scripts/preflight.sh) carries at the top
of its file.
