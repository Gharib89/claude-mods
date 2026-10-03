# claude-mods

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `Gharib89/claude-mods`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Harness

`scripts/check.sh` is this repo's check entry point: `edit <file>...` lints and formats, `turn` answers `skipped`, since this repo has no stack member, and `full` answers for the whole repo: the runner on every file. It prints one JSON line and exits 0 pass, 1 fail, 2 unavailable, 3 over budget. Hooks in `.claude/settings.json` run `edit` after every Edit or Write and `turn` at every stop, and the pre-commit runner is the commit rung. Harness profile: `docs/agents/harness.md`. Re-run `/setup-harness` after adding a stack, a member or a tool.
