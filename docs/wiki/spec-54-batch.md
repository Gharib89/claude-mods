# Spec #54 batch

On 2026-10-28 a review of gh-pane's UI and performance became spec #54, cut into four slices that were shipped one at a time by supervised `/ship` runs in Herdr tabs (`drive-session`).

| Slice                                                         | PR  | Merge commit |
| ------------------------------------------------------------- | --- | ------------ |
| #55 read every page without `--slurp`, oldest first           | #61 | `2a00786`    |
| #56 conditional reads, two rounds, coalesced refreshes        | #62 | `0bc244c`    |
| #57 rows that fit the dock, one glyph per state, a spec state | #63 | `5fdc52a`    |
| #58 header, footer, focus hint, inline overflow               | #64 | `22e2d2e`    |

A side fix, #59 (PR #60, `a1cad1c`), cleared a pre-existing zizmor `dangerous-triggers` finding on main that turned every slice's local gate red. #54 was closed as completed the same day.

## What the runs surfaced

- ship-55's live proof assumed gh 2.46; the owner had upgraded gh to 2.103.3 that morning. The proof ran on 2.103.3 and the substitution was logged as a deviation.
- ship-55 found six gate tools missing: see [Gate tools on a local machine](gate-tools-local.md).
- The classifier refused merges on #61 and #64: see [Merge classifier block](merge-classifier-block.md).
- #63 and #64 stopped at a gate held on `cap`: see [Docs-only cap hold](docs-only-cap-hold.md).
- ship-56's first review round caught a real bug (a full last page carries no `Link: next`, so a 304 would hide later pages).
- ship-57 claimed all five theme colours render on 2.1.288 when its probe showed three. A later probe found all six keys rendering on 2.1.288 and 2.1.312. Since then a probe-backed claim names what was seen per build.
- ship-57's slice brief paraphrased the parent's list, and a reviewer flagged the parent's own decision as an unlogged deviation. A brief that quotes the parent avoids this.
- ship-57 filed Gharib89/skills#1031: `reply-thread` cannot edit a posted reply.

The retro is #65, with slices #66, Gharib89/skills#1033 and Gharib89/skills#1034.
