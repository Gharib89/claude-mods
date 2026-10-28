# Merge classifier block

On 2026-10-28, in the [spec #54 batch](spec-54-batch.md), the auto-mode classifier refused ship's `merge.sh` as "Merge Without Review" on PR #61 and on PR #64, although `run-file gate clean` read `clean: true, held_by: []` and the PRs had been reviewed (#64 twice). It also refused the supervisor relaying a bare `merge` to the ship tab. PR #62 merged with no refusal.

The owner answered: "merge and you can judge and merge urself later". A relayed `merge` that quoted those words and named the clean gate passed the classifier on #64.

On 2026-10-28 the owner approved a permission rule for the merge script: #66. Whether an allow rule overrides the classifier was unmeasured on that date, so #66 starts with a probe.

Related: [Owner preferences](owner-preferences.md).
