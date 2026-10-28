# Ship profile

Schema: 5

Every repo-specific fact `/ship` needs, one section per axis. Fourteen `##` headings, always present and in this order; a defaulted axis reads `None.` or `Default.` under its own heading. Facts sit on `Label:` lines and nowhere else, and the prose under a heading explains them. The `Schema:` line above is the profile schema `ship` checks at preflight; only a `setup-skills` re-run moves it.

## Host

Host: github

## Worktree

Carry: None.
Bootstrap: None.

## Local gate

Location: scripts/local-gate.sh
Small node: a mod folder, run through `scripts/claude-pinned.sh plugin test <folder>`, which takes no narrower node, e.g. `plugins/gh-pane`; docs-class: the repo-relative path of the changed document, run through `scripts/check.sh edit <path>`, e.g. `docs/agents/ship.md`.
Tripwires: None.

The gate runs `scripts/check.sh full` from the harness, plus `secrets` (gitleaks over `base..HEAD`). `deps` is a no-op until a stack with a lockfile lands.

## CI

Legs: check: the mod dev loop, steps 1 to 3 (validate the marketplace, then validate, tsc and test every mod under `plugins/`) on the Claude Code build `.claude-code-version` pins
No-checks legal: no, `mods.yml` runs on every PR with no `paths:` filter, so a PR with no checks means CI never started.
Push policy: Default.

`.github/workflows/mods.yml` also runs on push to `main`. `.github/workflows/claude-review.yml` is the Claude reviewer, triggered by `issue_comment`. It lands no check run on the PR head, so it is not a leg. `.github/workflows/latest.yml` validates and tests the mods weekly on the newest Claude Code, triggered by `schedule` and `workflow_dispatch` only; with no `pull_request` trigger it is not a leg either.

## Reviewers

Self-review cap: 3

### Claude Code

Login: claude[bot]
Trigger: on-request
Request: comment @claude review
Workflow: .github/workflows/claude-review.yml
Cap: 2
Resolve: resolve-thread
Gating: no
Fallback-for: None.
Instructions: docs/contributing/coding-standards.md

## Coding standards

docs/contributing/coding-standards.md

## Verification

### Live run

Proves: the changed mod's behaviour in a real Claude Code session, step 4 of the mod dev loop in CLAUDE.md
Applies when: the change alters what a mod under `plugins/` does at run time (a hook, a pane, a band, a command, a message); not a change to tests, types or docs alone
Run: `claude -p "<a prompt that exercises the change>" --plugin-dir plugins/<name> < /dev/null`; for a mod whose calls refuse headless (on 2.1.288, `$.session.compact`), an interactive `claude --plugin-dir plugins/<name>`
Needs: a signed-in Claude Code on PATH: `claude auth status` reports `"loggedIn": true`
Without it: hand-off
Also proven by CI: None.
Claims to probe: each plugin API call or event the change relies on, read in the running build's types file, `plugins/<name>/.claude-plugin/types/claude-code/index.d.ts`

## Versioning and changelog

Tooling: manual
Reads: None.
In-PR requirement: a PR that changes what a mod does bumps that mod's `version` in `plugins/<name>/.claude-plugin/plugin.json`.
Subject constraints: None.

Each mod carries its own `version` in its `plugin.json`; no release tooling reads it yet.

## PR

Template: .github/pull_request_template.md
Merge: on-clean-gate

## Public surface

Default.

## Triage

File as an issue labelled `needs-triage`.

## Docs sync

Targets: README.md, docs/, GLOSSARY.md
Agent-facing: docs/agents/, .claude/skills/

## Current docs

Sources: context7
Pinned: Claude Code at the build `.claude-code-version` pins

The plugin API (function hooks) is early access and moves between Claude Code releases. Its authority is the bundled `plugin-authoring` skill's types file for the installed version, not web docs or context7.

## Cloud lane

PR cap: 3
Bootstrap: scripts/cloud-ship-bootstrap.sh
