# Ship profile

Schema: 3

Every repo-specific fact `/ship` needs, one section per axis. Fourteen `##` headings, always present and in this order; a defaulted axis reads `None.` or `Default.` under its own heading. Facts sit on `Label:` lines and nowhere else, and the prose under a heading explains them. The `Schema:` line above is the profile schema `ship` checks at preflight; only a `setup-skills` re-run moves it.

## Host

Host: github

## Worktree

Carry: None.
Bootstrap: None.

## Local gate

Location: scripts/local-gate.sh
Small node: no test runner exists yet, so the only node is docs-class: the repo-relative path of the changed document, run through `scripts/check.sh edit <path>`, e.g. `docs/agents/ship.md`.
Tripwires: None.

The gate runs `scripts/check.sh full` from the harness, plus `secrets` (gitleaks over `base..HEAD`). `deps` is a no-op until a stack with a lockfile lands.

## CI

Legs: check: the mod dev loop, steps 1 to 3 (validate the marketplace, then validate, tsc and test every mod under `plugins/`) on Claude Code 2.1.288
No-checks legal: no, `mods.yml` runs on every PR with no `paths:` filter, so a PR with no checks means CI never started.
Push policy: Default.

`.github/workflows/mods.yml` also runs on push to `main`. `.github/workflows/claude-review.yml` is the Claude reviewer, triggered by `issue_comment`. It lands no check run on the PR head, so it is not a leg.

## Reviewers

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

None.

## Versioning and changelog

Tooling: none
Reads: None.
In-PR requirement: None.
Subject constraints: None.

Each mod carries its own `version` in its `plugin.json`; no release tooling reads it yet.

## PR

Template: .github/pull_request_template.md

## Public surface

Default.

## Triage

File as an issue labelled `needs-triage`.

## Docs sync

Targets: README.md, docs/
Agent-facing: docs/agents/, .claude/skills/

## Current docs

Sources: context7
Pinned: Claude Code 2.1.288

The plugin API (function hooks) is early access and moves between Claude Code releases. Its authority is the bundled `plugin-authoring` skill's types file for the installed version, not web docs or context7.

## Cloud lane

PR cap: 3
Bootstrap: scripts/cloud-ship-bootstrap.sh
