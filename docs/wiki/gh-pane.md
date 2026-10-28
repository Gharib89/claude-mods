# gh-pane

Design decisions from the 2026-10-28 review and the [spec #54 batch](spec-54-batch.md), as of `Gharib89/claude-mods@22e2d2e`:

- It reads GitHub over REST only (`docs/adr/0001-mods-may-read-the-session-repo.md`), following `Link` pagination itself rather than `gh api --slurp` (PR #61; the gh 2.46 the spec assumed has no `--slurp`, as the test host models).
- Reads are conditional (ETag, 304) and refreshes coalesce. Over six runs per side, PR #62 measured the median read at 3263 ms before and 2309 ms after.
- Each glyph means one state anywhere in the pane, and `●` is only ever a label dot. Rows fit a narrow dock on one line (PR #63).
- The header names the repo and counts, the footer says when it last read, a key hint shows while the pane is focused, and an inline pane reports `↓ N more` (PR #64).
- The engine caps the dock width. On 2026-10-28 it gave 53 cells at 120 columns on Claude Code 2.1.312.
