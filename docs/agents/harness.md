# Harness profile

Schema: 3

Written by `/setup-harness`, which reads it back on a re-run. Facts sit on `Label:` lines; prose under a heading is yours and nothing parses it. A budget override reads `override <N>s: <reason>`.

## Claude Code

Floor: 2.1.277

## Check entry point

Location: scripts/check.sh

## Budgets

Edit: default
Turn: default
Commit: default
Full: default
Cloud setup: default

## Cloud

Verdict: cloud-first
Setup: .claude/hooks/cloud-setup.sh
Allowlist: None.
Proof: b78130fa18f4dc9a939534ac206208b4b7d3a3c3

## Excluded

Excluded: None.

## Roots

Root: None.

## Local-only

Local-only: None.

## Declined

Declined: shfmt: no local Go toolchain, and its default style would rewrite the template-derived scripts
