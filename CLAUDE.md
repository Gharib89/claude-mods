# claude-mods

A Claude Code plugin marketplace of mods: plugins made of function hooks (`register(on)`, each hook `($, e, next)`), not skills or shell hooks. The first mod, `smart-compact`, is specified in issue #1; `plugins/` does not exist until that lands.

## Layout

- `.claude-plugin/marketplace.json` at the root: marketplace `claude-mods`, one entry per mod with `"source": "./plugins/<name>"`.
- `plugins/<name>/`: one mod. `.claude-plugin/plugin.json`, `hooks/hooks.json` (`{ "modules": ["./register.ts"] }`), `hooks/register.ts`, `tests/*.test.ts`, and a `tsconfig.json` that extends `./.claude-plugin/types/tsconfig.json`.
- Every mod is standalone and generic: its code names no skill (`/ship` or any other) and needs nothing outside its own folder.

Users install with `claude plugin marketplace add Gharib89/claude-mods`, then `claude plugin install <name>@claude-mods`.

## Mod dev loop

For a mod at `plugins/<name>`, from the repo root:

1. `claude plugin validate plugins/<name>`: reads the manifest and module the way the engine will and lists what it would refuse.
2. `tsc -p plugins/<name>`: needs `plugins/<name>/.claude-plugin/types/`, which the engine writes when it loads the mod (any session started with `--plugin-dir plugins/<name>`). It is generated for the running build, so never commit it.
3. `claude plugin test plugins/<name>`: runs the mod's `*.test.ts` with the `claude-code/testing` kit. A test answers every engine event the mod awaits (`session.usage`, `turn.complete`, `ui.toast`) itself.
4. Live run: `claude --plugin-dir plugins/<name>`, or headless `claude -p "<prompt>" --plugin-dir plugins/<name> < /dev/null`.

## Plugin API authority

The plugin API is early access and changes between Claude Code builds. Its authority is the types file the engine writes for the running build: `plugins/<name>/.claude-plugin/types/claude-code/index.d.ts` once the mod has loaded, or the file the bundled `plugin-authoring` skill names when it loads. Grep it for the event or method (`'tool.call'`, `compact(`) and read the declaration; take API facts from there, not from memory or a web search. Load `plugin-authoring` for the `($, e, next)` contract and worked examples. An API behaviour a mod relies on that the types do not state (an ordering, a refusal) goes in a code comment beside the call, with the build it was seen on; issue #1 lists the ones `smart-compact` found on 2.1.288.

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
