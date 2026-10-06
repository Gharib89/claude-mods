# Round data

The one contract between a session and [page.html](page.html). The session
writes one **round document** per grilling round; the page writes one **answers
document** per Submit. Both live in the artifact's database, written and read
with `ArtifactData`. The page renders whatever round documents exist, live, and
lays nothing out: the design tree and every figure arrive as finished SVG.

## Contents

- [Documents](#documents)
- [Fields](#fields)
- [Answers text](#answers-text)
- [How the page reads a session](#how-the-page-reads-a-session)
- [Figure style contract](#figure-style-contract)

## Documents

| Document | Written by | When |
|---|---|---|
| collection `rounds`, doc id `<n>` (`1`, `2`, ...) | the session, `ArtifactData` `set` | once per round, before the round's status line |
| collection `answers`, doc id `round-<n>` | the page, on Submit | once per Submit of round `<n>` |

A round is never rewritten once the human can see it, and the page is never
republished: a new round is a new document.

## Fields

`round.` is a round document, `answers.` an answers document; `[]` is an array
element. Required reads `yes` in every round, `questions` or `closing` only in
a round of that kind, `reopened` only on a question reopened, `no` never. The
page reads and writes nothing outside this table.

| Path | Type | Required | Meaning |
|---|---|---|---|
| `round.round` | number | yes | The round's number, the same as its doc id. |
| `round.kind` | `"questions"` or `"closing"` | yes | A frontier to answer, or the closing summary. |
| `round.treeSvg` | string | questions | The design tree as one `<svg>`: settled, open, deferred and blocked decisions. |
| `round.treeCaption` | string | no | One or two sentences under the tree, naming the answer with the most riding on it. |
| `round.questions` | array | questions | The frontier, one entry per question, in the order asked. |
| `round.questions[].id` | string | yes | `Q1`, `Q2`, ... numbered afresh each round. |
| `round.questions[].title` | string | yes | The question, as one sentence. |
| `round.questions[].options` | array | yes | The choices, two to four. The page adds Other and Defer itself. |
| `round.questions[].options[].id` | string | yes | `a`, `b`, `c`, ... |
| `round.questions[].options[].title` | string | yes | The choice, short. |
| `round.questions[].options[].detail` | string | no | One line on what the choice means or costs. |
| `round.questions[].recommended` | string | yes | The recommended option's `id`. Nothing is preselected. |
| `round.questions[].why` | string | yes | Why the recommendation, in one to three sentences. |
| `round.questions[].figureSvg` | string | no | A figure for this question, as one `<svg>`. |
| `round.questions[].figureCaption` | string | no | What the figure shows, one or two sentences. |
| `round.questions[].carriedFrom` | object | no | Present on a question that came back: deferred, or reopened. |
| `round.questions[].carriedFrom.round` | number | yes | The round it was settled or deferred in. |
| `round.questions[].carriedFrom.id` | string | yes | The `round.settled[].id` it came back from. |
| `round.questions[].carriedFrom.reason` | `"deferred"` or `"reopened"` | yes | Why it is back. |
| `round.questions[].carriedFrom.earlier` | string | reopened | The earlier answer. |
| `round.settled` | array | yes | The previous round, collapsed: one entry per question it asked. Empty in round 1. |
| `round.settled[].id` | string | yes | `R<n>·Q<m>`: the round it was asked in and its question id. What Reopen sends back. |
| `round.settled[].title` | string | yes | The decision, short. |
| `round.settled[].answer` | string | yes | The settled answer as a sentence, or `Deferred.` |
| `round.settled[].how` | `"rec"`, `"pick"`, `"other"` or `"defer"` | yes | The recommendation taken, another option picked, an Other answer, or deferred. |
| `round.docsWritten` | array | yes | Glossary terms and ADRs written from the previous round's answers. Empty when none. |
| `round.docsWritten[].file` | string | yes | The repo path written. |
| `round.docsWritten[].summary` | string | yes | What changed there, one line. |
| `round.summary` | array | closing | Every decision, grouped under a few headings. |
| `round.summary[].heading` | string | yes | The group's heading. |
| `round.summary[].text` | string | yes | The group's decisions, as prose. |
| `answers.round` | number | yes | The round answered. |
| `answers.submittedAt` | string | yes | ISO 8601 time of the Submit. |
| `answers.answers` | array | yes | One entry per question, or one entry `closing` in a closing round. |
| `answers.answers[].id` | string | yes | The question's `id`, or `closing`. |
| `answers.answers[].choice` | string | yes | An option `id`, `other`, `defer`; in a closing round `confirm` or `not-yet`. |
| `answers.answers[].other` | string | yes | The Other text; empty unless `choice` is `other`. |
| `answers.answers[].comment` | string | yes | The optional comment; in a closing round, what is missing. Empty when none. |
| `answers.reopen` | array | yes | `round.settled[].id` values the human pressed Reopen on. |

Text fields take plain text with two marks the page renders: `` `code` `` and
`**bold**`. Nothing else is interpreted.

## Answers text

The Submit comment carries the answers as text, and the page's copy fallback
shows the same text: the session reads it when `answers/round-<n>` is missing.
One line per form, in this order:

| Line | When |
|---|---|
| `grill-with-artifact: round <n> answers (database document answers/round-<n>)` | always, first |
| `<id>: <option id>. <option title>` | a question answered with an option |
| `<id>: Other: <text>` | a question answered with Other |
| `<id>: Deferred` | a question deferred |
| `  comment: <text>` | under a question the human commented on |
| `Reopen: <id>, <id>` | the settled ids pressed Reopen on, when any |
| `Closing: Confirm` or `Closing: Not yet` | a closing round, in place of the question lines |
| `What is missing: <text>` | under `Closing: Not yet` |
| `[cut to fit: read answers/round-<n>]` | last, when the text was cut to a comment's 4 KiB |

## How the page reads a session

- The newest round document is the open round. Every earlier round shows as a
  settled list built from the round document after it: its `settled` and its
  `docsWritten`.
- A settled entry that a later round's `carriedFrom.id` names shows where it
  went: back in the open round, or back in an earlier one. Nothing else marks
  it, so the session never edits an old round.
- An answers document for the open round means that round was submitted: the
  page locks it and waits for the next round document.
- Drafts live in the viewer's browser storage per round, never in the database.

## Figure style contract

Every `treeSvg` and `figureSvg` uses only these classes, and the page colours
them from its own tokens in both themes. A figure carries no colour of its own:
no `fill`, `stroke` or `style` attribute, and text and strokes default to
`currentColor`.

| Class | Goes on | Means |
|---|---|---|
| `n-settled` | the `<g>` around a node's `<rect>` and `<text>` | a settled decision |
| `n-open` | the same | a question in this round |
| `n-blocked` | the same | a decision waiting on an open one |
| `n-deferred` | the same | a deferred decision |
| `edge` | a `<path>` or `<line>` | a dependency |
| `hot` | beside `edge` or `box` | the path or box with the most riding on it |
| `box` | the `<g>` around a figure's `<rect>` and `<text>` | a figure's plain box |
| `lbl` | a `<text>` | a small mono label: a column heading, a note |

`data-q="Q1"` on a node's `<g>` links it to that question: clicking the node
scrolls to the question's card. Give each `<svg>` a `viewBox`, `role="img"` and
an `aria-label` that says what the figure shows.
