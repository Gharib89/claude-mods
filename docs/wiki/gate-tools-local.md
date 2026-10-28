# Gate tools on a local machine

On 2026-10-28 ship-55 found its local gate unavailable. `scripts/check.sh full` lacked prek, prettier, markdownlint-cli2, shellcheck and zizmor, and the `secrets` leg of `scripts/local-gate.sh` lacked gitleaks. The run installed them all user-local.

As of `Gharib89/claude-mods@22e2d2e`, both install routes are cloud-only. The runner's tools install from `.claude/hooks/cloud-setup.sh`, which exits at once outside a cloud session, and gitleaks installs from `scripts/cloud-ship-bootstrap.sh` (`SCANNER_INSTALL`). The fix belongs in the skills that generate these files, so it is tracked as Gharib89/skills#1033, under retro #65.
