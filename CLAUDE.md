# claude-mods

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `Gharib89/claude-mods`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Ship

`/ship` drives one issue to a merge-ready PR. This repo's ship profile: `docs/agents/ship.md`. Without that file ship refuses: run `/setup-skills`.

Every skill under `.claude/skills/` is a derived copy, changed at its source and refreshed here; `skills-lock.json` records each one's source. `ship`, `cloud-ship`, `setup-skills` and `update-skills` come from `Gharib89/skills`; the skills ship and setup-skills compose come from `mattpocock/skills`, `upstash/context7` and `humanlayer/skills`, each at the pin of the skill that composes it. `/update-skills` refreshes them all in one PR. By hand, refresh a skill by re-running its install line at project scope, without `-g`. Ship's refresh chains its preflight, so a profile the refreshed ship no longer reads is reported now, not on the next `/ship`: `npx skills add Gharib89/skills --skill ship --skill cloud-ship --skill setup-skills --skill update-skills --agent claude-code -y && .claude/skills/ship/scripts/preflight.sh none`.

### Harness

`scripts/check.sh` is this repo's check entry point: `edit <file>...` lints and formats, `turn` answers `skipped`, since this repo has no stack member, and `full` answers for the whole repo: the runner on every file. It prints one JSON line and exits 0 pass, 1 fail, 2 unavailable, 3 over budget. Hooks in `.claude/settings.json` run `edit` after every Edit or Write and `turn` at every stop, and the pre-commit runner is the commit rung. Harness profile: `docs/agents/harness.md`. Re-run `/setup-harness` after adding a stack, a member or a tool.
