# claude-mods

A marketplace of **mods**: Claude Code plugins made of function hooks, `register(on)` with each hook `($, e, next)`.

## Layout

- `.claude-plugin/marketplace.json`: marketplace `claude-mods`, one entry per mod, sourced from `./plugins/<name>`.
- `plugins/<name>/`: one mod, self-contained. Its `tsconfig.json` extends `./.claude-plugin/types/tsconfig.json`, which the engine generates (see the dev loop).
- Every mod is **generic**: it serves any owner, so its code and messages speak of tasks, steps and run files, and any detail of one owner's workflow is a `userConfig` option. It reads its own folder, and the session repo only through git and `gh api` (`docs/adr/0001-mods-may-read-the-session-repo.md`).

## Mod dev loop

A mod change is done when all four steps are **green** for `plugins/<name>`:

1. `claude plugin validate plugins/<name>`: lists what the engine would refuse.
2. `tsc -p plugins/<name>`: needs the generated `.claude-plugin/types/`, which appears once a session loads the mod (`--plugin-dir plugins/<name>`). It belongs to the running build, so keep it out of git.
3. `claude plugin test plugins/<name>`: the test answers every engine event the mod awaits (`session.usage`, `turn.complete`, `ui.toast`) itself.
4. A live run shows the behaviour: `claude -p "<prompt>" --plugin-dir plugins/<name> < /dev/null`, or an interactive `claude --plugin-dir plugins/<name>` for a mod whose calls refuse headless (on 2.1.288, `$.session.compact`). For a change to the marketplace entry, install from the checkout at local scope: `claude plugin marketplace add <checkout> --scope local` then `claude plugin install <name>@claude-mods --scope local`; the `Gharib89/claude-mods` form reads `main`.

CI (`.github/workflows/mods.yml`) runs steps 1 to 3 on the pinned build. `check.sh turn` and `full` run steps 1 and 3; `tsc` stays CI-only, since its types need a model turn.

## Plugin API authority

The plugin API is early access and shifts between Claude Code builds, so the **authority** is the types file the running build writes: `plugins/<name>/.claude-plugin/types/claude-code/index.d.ts`, or before any mod has loaded, the file the bundled `plugin-authoring` skill names. Grep it for the event or method and read the declaration. Load `plugin-authoring` for the hook contract and examples. A behaviour a mod relies on that the types leave unstated (an ordering, a refusal) gets a code comment beside the call naming the build it was seen on.

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

`scripts/check.sh` is this repo's check entry point: `edit <file>...` lints and formats, `turn` validates and tests every mod under `plugins/`, and `full` answers for the whole repo: the runner on every file, the mod rows, and `claude plugin validate .`. It prints one JSON line and exits 0 pass, 1 fail, 2 unavailable, 3 over budget. Hooks in `.claude/settings.json` run `edit` after every Edit or Write and `turn` at every stop, and the pre-commit runner is the commit rung. Harness profile: `docs/agents/harness.md`. Re-run `/setup-harness` after adding a stack, a member or a tool.
