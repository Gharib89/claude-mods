# Docs-only cap hold

As of `Gharib89/claude-mods@22e2d2e` (ship's derived copy), ship's review loop ends the host rounds on a docs-only fix-only diff and records `Stop: <reviewer>: cap`, giving that round one local Standards review. The `run-file gate clean` exemption for a local review applies only to a spent cap, so the gate holds on `reviewer <x>: cap`.

On 2026-10-28 this held PR #63 and PR #64. In each case the supervisor ordered one more host round on the final head, which found nothing and stopped on `tree unchanged`.

Filed as Gharib89/skills#1034, under retro #65.
