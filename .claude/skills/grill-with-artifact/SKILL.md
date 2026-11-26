---
name: grill-with-artifact
description: "Grill a plan or design on a private artifact page. Use when the human names grill-with-artifact, asks to grill on a page or an artifact, or a wayfinder ticket's Notes call for it."
argument-hint: "[topic]"
metadata:
  version: 0.7.1
---

# grill-with-artifact

Grilling, with a page as the surface. Call the Skill tool twice, for `grilling`
and `domain-modeling`: they own the design tree, the frontier, "facts are your
job" and every glossary and ADR write. With either one not installed, print
these for the human and stop:

```sh
npx skills@1.8.1 add mattpocock/skills#a496f5513d4a4cf889bc48e189e579f4b0bdf6aa --skill grilling --agent claude-code -y
npx skills@1.8.1 add mattpocock/skills#d81f3a183412e71a5b1e84ca21bc1a35eea03a60 --skill domain-modeling --agent claude-code -y
```

This skill replaces only two things in them: how a
**grilling round** is shown (a round document on the page, never the chat
format `grilling` gives) and how the answers come back (a Submit on the page).

The page is [page.html](page.html) with its style and script siblings, fixed
and tested: a session fills its title and publishes it once. From then on
every grilling round is a document in the page's database, and the page renders
it live. [round-data.md](round-data.md) is the contract between the two: read
it before writing round 1, and hold every document you write to its field
table and its figure style contract.

## 1 · Pick the surface

The page needs the `Artifact`, `ArtifactData` and `ArtifactComments` tools.
With any of them missing, or when the human says the page cannot reach its
database, print one line, `No artifact surface here, so this session runs in
the chat.`, and run the rest of the session as `grilling` and
`domain-modeling` describe. Skip the rest of this file.

**Done when:** the session is on the page, or the one line is printed and the
chat format runs.

## 2 · Publish the page

1. Take the topic from the invocation. A wayfinder `grilling` ticket's Notes
   invoke this skill: the ticket's title is the topic and its body is the first
   frontier's context. Only when no topic was given, ask the human for one in a
   few words.
2. Copy `page.html` and its siblings (`page.css`, `page-core.js`,
   `page-boot.js`) into your scratchpad as `grill-<topic-slug>/` and replace
   the one `{{TOPIC}}` in `page.html` only with the topic, HTML-escaped (`&`,
   `<`, `>`, `"`).
3. Publish `page.html` as a new artifact, the siblings in `files`:
   `capabilities` `{"db": {}, "user": {}, "comments": {}}`, `icon` `question`,
   and a one sentence `description` naming what is being grilled. Each session
   gets its own artifact. Refused: print step 1's line and fall back.
4. Read the publish result's subscription line. The Submit wake reaches you only
   while the artifact's watch shows auto-replies armed. A line saying there is
   no live subscription, or a session with `T3CODE_THREAD_ID` set (T3 Code's
   messages carry no human origin, so nothing arms), is unarmed from the first
   publish. When the line leaves it in doubt, check with `ArtifactComments`
   `watch` and no `url`. Unarmed, the page only saves (`wake: false` on every
   round, step 3.4), because a comment with no watch wakes a separate cloud
   session that replies without this session's context and resolves the thread.
   The page is published once, so an armed session checks again with
   `ArtifactComments` `watch` and no `url` before writing each later round: once
   it shows no armed watch, the session is unarmed from that round on.
5. Print the page link, and whether the wake is armed. Unarmed, say in the same
   reply that the human types `submitted` in this chat after each Submit.

**Done when:** the link is printed, and the reply says whether Submit wakes
the session.

## 3 · Post a grilling round

1. Compute the frontier as `grilling` says.
2. Draw the design tree as `treeSvg`, every decision a node in its state, each
   open node carrying `data-q` for its question, and the `hot` path named in
   `treeCaption`. Where a mechanism or a comparison is faster seen than read,
   add a question's `figureSvg`. Both follow the figure style contract in
   [round-data.md](round-data.md). The first figure loads `artifact-diagramming`
   through the Skill tool; the contract's classes win over its colours. Without
   that skill the round goes out with no figures and stays on the page.
3. Fill `settled` with one entry per question the previous round asked, and
   `docsWritten` with every glossary term and ADR written from its answers:
   both are empty arrays in round 1.
4. Write the round with `ArtifactData` `set`, collection `rounds`, doc id the
   round number, carrying `wake: false` when the session is unarmed.
5. Resolve the Submit thread that started this turn, if one did, so an open
   thread always means still working. Then print one status line,
   `Round <n> posted. Questions: <k>.`, and end the turn. The questions and
   what settled them live on the page only.

**Done when:** `rounds/<n>` is written, the turn's Submit thread is resolved,
and the status line is the turn's only text.

## 4 · Read a Submit

The Submit comment is a **doorbell**: the one page action that starts a turn in
this session. It arrives as a comment on the watched artifact, sent to Claude.
A `submitted` typed in the chat rings the same bell.

1. Read `answers/round-<n>` with `ArtifactData` `get`. With no such document,
   take the answers from the comment's text, whose lines round-data.md's
   **Answers text** lists; a pasted answers text in the chat is the same
   text. A comment carrying no answers
   is the human talking: answer it in the chat, resolve its thread, and end
   the turn.
2. Apply each answer as `grilling` and `domain-modeling` say, writing any term
   or ADR it settles now, in the repo. One rule differs: `domain-modeling` only
   offers an ADR, and here the session writes it once the decision meets the
   three conditions of `domain-modeling`'s "Offer ADRs sparingly", because the
   Submit is the human's approval and an offer would cost another round. A
   reopen or a Not yet edits the ADR.
3. **Defer** puts the question back in the next round with `carriedFrom`
   reason `deferred`. **Reopen** (each id in `answers.reopen`) puts a settled
   question back with reason `reopened` and its answer as `earlier`. Recompute
   which later decisions rested on it: carry back each one now on the frontier,
   and mark the rest `n-blocked` in the tree.
4. Post the next grilling round (step 3). The platform's own reply in the
   Submit thread is the receipt; add none of your own.

**Done when:** every answer is applied and the next round is posted.

## 5 · Close

When the frontier is empty, post a closing round: `kind` `closing`, with
`summary` holding every decision under a few headings, and its status line
reads `Round <n> posted. Closing summary.` The page shows Confirm and Not yet,
and no Reopen: a Not yet comment names what to reopen.

- **Not yet**: grill its comment as a new frontier from step 3.
- **Confirm**: resolve its thread, resolve a wayfinder ticket (below), print
  exactly `Session confirmed. Decisions: <k>. Docs written: <m>.`, and end the
  turn.

Any outward-facing step (filing issues, writing a spec) waits for the Confirm
and for the human to ask for it. A wayfinder ticket is the exception: on the
Confirm, resolve it with the Resolve operation in the repo's
`docs/agents/issue-tracker.md` (comment the closing summary, close the
ticket, append the context pointer to the map's Decisions-so-far), with no
further ask, since the ticket exists to be closed by this session. A next
command the Skill tool cannot run, such as `/to-spec`, is named for the human to
type.

**Done when:** the human pressed Confirm, its thread is resolved, any wayfinder
ticket is resolved, and the confirmed line is the turn's only text.
