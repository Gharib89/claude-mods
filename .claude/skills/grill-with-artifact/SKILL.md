---
name: grill-with-artifact
description: "Grill a plan or design on a private artifact page: each grilling round arrives as question cards the human answers and Submits, and the glossary and ADRs are written as answers settle. Use when the human asks for grilling on a page or an artifact, or names grill-with-artifact, a wayfinder ticket's Notes included."
argument-hint: "[topic]"
metadata:
  version: 0.4.1
---

# grill-with-artifact

Grilling, with a page as the surface. Call the Skill tool twice, for `grilling`
and `domain-modeling`: they own the design tree, the frontier, "facts are your
job" and every glossary and ADR write. With either one not installed, print
these for the human, at the commits this skill was tested against, and stop:

```sh
npx skills add mattpocock/skills#49dd158d1076134a641b33efb035946536778336 --skill grilling --agent claude-code -y
npx skills add mattpocock/skills#d81f3a183412e71a5b1e84ca21bc1a35eea03a60 --skill domain-modeling --agent claude-code -y
```

This skill replaces only two things in them: how a
**grilling round** is shown (a round document on the page, never the terminal
format `grilling` gives) and how the answers come back (a Submit on the page).

The page is [page.html](page.html), fixed and tested: a session fills its title
and publishes it once. From then on every grilling round is a document in the
page's database, and the page renders it live. [round-data.md](round-data.md)
is the contract between the two: read it before writing round 1, and hold every
document you write to its field table and its figure style contract.

This skill is derived from `grill-with-docs` in `mattpocock/skills`, and
installs with:

```sh
npx skills add Gharib89/skills --skill grill-with-artifact --agent claude-code -y
```

## 1 · Pick the surface

The page needs the `Artifact`, `ArtifactData` and `ArtifactComments` tools.
With any of them missing, or when the human says the page cannot reach its
database, print one line, `No artifact surface here, so this session runs in
the terminal.`, and run the rest of the session as `grilling` and
`domain-modeling` describe. Skip the rest of this file.

**Done when:** the session is on the page, or the one line is printed and the
terminal format runs.

## 2 · Publish the page

1. Take the topic from the invocation; only when none was given, ask the human
   for one in a few words. It names the page in their artifact gallery, so it
   tells this session apart from every other.
2. Copy `page.html` into your scratchpad as `grill-<topic-slug>/page.html` and
   replace its one `{{TOPIC}}` with the topic, HTML-escaped (`&`, `<`, `>`,
   `"`).
3. Publish that file as a new artifact: `capabilities`
   `{"db": {}, "user": {}, "comments": {}}`, `icon` `question`, and a one
   sentence `description` naming what is being grilled. Each session gets its
   own artifact. Refused: print step 1's line and fall back.
4. Read the publish result's subscription line. The Submit wake reaches you
   only while the artifact's watch shows auto-replies armed; when the line
   leaves that in doubt, check with `ArtifactComments` `watch` and no `url`.
5. Print the page link, and whether the wake is armed. Unarmed, add that the
   human types `submitted` in the terminal after each Submit.

**Done when:** the link is printed, and the terminal says whether Submit wakes
the session.

## 3 · Post a grilling round

1. Compute the frontier as `grilling` says. Every question gets two to four
   options, a `recommended` option and a `why`.
2. Draw the design tree as `treeSvg`: every decision as a node in its state
   (`n-settled`, `n-open`, `n-blocked`, `n-deferred`), each open node carrying
   `data-q` for its question, and `hot` on the edge or node with the most riding
   on it, named in `treeCaption`.
3. Give a question a `figureSvg` only where a mechanism or a comparison is
   faster seen than read. The first time one earns a figure, load
   `artifact-diagramming` (bundled with Claude Code's artifact tools) through
   the Skill tool, and draw it with the figure
   style contract's classes, which win over any colours that skill suggests.
   With `artifact-diagramming` not installed, the round goes out with no
   figures and stays on the page.
4. Fill `settled` with one entry per question the previous round asked, and
   `docsWritten` with every glossary term and ADR written from its answers:
   both are empty arrays in round 1.
5. Write the round with `ArtifactData` `set`, collection `rounds`, doc id the
   round number.
6. Resolve the Submit thread that started this turn, if one did, so an open
   thread always means still working. Then print one status line,
   `Round <n> posted. Questions: <k>.`, and end the turn. The questions and
   what settled them live on the page only, so the human reads one copy.

**Done when:** `rounds/<n>` is written, the turn's Submit thread is resolved,
and the status line is the turn's only text.

## 4 · Read a Submit

The Submit comment is a **doorbell**: the one page action that starts a turn in
this session. It arrives as a comment on the watched artifact, sent to Claude.
A `submitted` typed in the terminal rings the same bell.

1. Read `answers/round-<n>` with `ArtifactData` `get`. With no such document,
   take the answers from the comment's text, whose lines round-data.md's
   **Answers text** lists; a pasted answers text in the terminal is the same
   text. A comment carrying no answers
   is the human talking: answer it in the terminal, resolve its thread, and end
   the turn.
2. Apply each answer as `grilling` and `domain-modeling` say, writing any term
   or ADR it settles now, in the repo.
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
- **Confirm**: resolve its thread, print exactly `Session confirmed.
  Decisions: <k>. Docs written: <m>.`, and end the turn.

Any outward-facing step (filing issues, writing a spec) waits for the Confirm
and for the human to ask for it. A next command the Skill tool cannot run, such
as `/to-spec`, is named for the human to type.

**Done when:** the human pressed Confirm, its thread is resolved, and the
confirmed line is the turn's only text.
