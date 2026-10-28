/* ---- core: state in, HTML out. No DOM here, so the page can run headless against round-data.md. ---- */
// How a settled answer was reached: [one, many].
const HOW = {
  rec: ["recommendation", "recommendations"],
  pick: ["your pick", "your picks"],
  other: ["your own answer", "your own answers"],
  defer: ["deferred", "deferred"],
};
const QTAG = {
  empty: "Open",
  incomplete: "Other needs text",
  ready: "Ready",
  deferred: "Deferred",
};

function newState(topic) {
  return {
    topic,
    rounds: [],
    submitted: {},
    draft: null,
    status: "idle",
    mode: "loading",
    canEdit: true,
  };
}
const openRound = (S) => S.rounds[S.rounds.length - 1];
const blank = () => ({ choice: null, other: "", comment: "" });
function blankDraft(r) {
  const ids = r.kind === "closing" ? ["closing"] : r.questions.map((q) => q.id);
  return {
    round: r.round,
    answers: Object.fromEntries(ids.map((id) => [id, blank()])),
    reopen: [],
  };
}
function setRounds(S, docs) {
  S.rounds = docs.slice().sort((a, b) => a.round - b.round);
  S.mode = "ready";
  const r = openRound(S);
  if (r && (!S.draft || S.draft.round !== r.round)) {
    S.draft = blankDraft(r);
    S.status = "idle";
  }
}
function setAnswers(S, docs) {
  S.submitted = Object.fromEntries(docs.map((d) => [d.round, true]));
}
function restoreDraft(S, saved) {
  if (!saved || saved.round !== S.draft.round) return;
  for (const [id, a] of Object.entries(S.draft.answers)) {
    const s = saved.answers && saved.answers[id];
    if (s)
      for (const k of ["choice", "other", "comment"])
        if (typeof s[k] === "string") a[k] = s[k];
  }
  if (Array.isArray(saved.reopen))
    S.draft.reopen = saved.reopen.filter((x) => typeof x === "string");
}

const locked = (S) =>
  !S.canEdit ||
  ["sending", "sent", "saved"].includes(S.status) ||
  !!S.submitted[S.draft.round];
const ans = (S, id) => S.draft.answers[id];
function qstate(S, q) {
  const a = ans(S, q.id);
  if (!a.choice) return "empty";
  if (a.choice === "defer") return "deferred";
  if (a.choice === "other" && !a.other.trim()) return "incomplete";
  return "ready";
}
const readyN = (S, r) =>
  r.questions.filter((q) => ["ready", "deferred"].includes(qstate(S, q)))
    .length;
// Questions the jump button still points at: none once the round locks.
const todoN = (S, r) => (locked(S) ? 0 : r.questions.length - readyN(S, r));
function canSubmit(S) {
  const r = openRound(S);
  if (!r || locked(S)) return false;
  if (r.kind === "closing") {
    const c = ans(S, "closing");
    return (
      c.choice === "confirm" || (c.choice === "not-yet" && !!c.comment.trim())
    );
  }
  return readyN(S, r) === r.questions.length;
}
// Where a settled answer went: the first later question carried from it.
function carriedTo(S, id) {
  for (const d of S.rounds)
    for (const q of d.questions || [])
      if (q.carriedFrom && q.carriedFrom.id === id)
        return { round: d.round, q: q.id, open: d === openRound(S) };
  return null;
}

const ACT = {
  pick(S, d) {
    if (!locked(S)) ans(S, d.q).choice = d.o;
  },
  rec(S, d) {
    const q = openRound(S).questions.find((x) => x.id === d.q);
    ACT.pick(S, { q: d.q, o: q.recommended });
  },
  all(S) {
    if (!locked(S))
      for (const q of openRound(S).questions)
        if (!ans(S, q.id).choice) ans(S, q.id).choice = q.recommended;
  },
  field(S, d) {
    if (!locked(S)) ans(S, d.q)[d.field] = d.value;
  },
  reopen(S, d) {
    if (locked(S)) return;
    const r = S.draft.reopen;
    S.draft.reopen = r.includes(d.id)
      ? r.filter((x) => x !== d.id)
      : [...r, d.id];
  },
  closing(S, d) {
    if (!locked(S)) ans(S, "closing").choice = d.choice;
  },
};

function answersDoc(S, at = new Date().toISOString()) {
  return {
    round: S.draft.round,
    submittedAt: at,
    answers: Object.entries(S.draft.answers).map(([id, a]) => ({
      id,
      choice: a.choice,
      other: a.choice === "other" ? a.other.trim() : "",
      comment: a.comment.trim(),
    })),
    reopen: S.draft.reopen.slice(),
  };
}
function answerLabel(q, a) {
  if (a.choice === "defer") return "Deferred";
  if (a.choice === "other") return "Other: " + a.other.trim();
  const o = q.options.find((x) => x.id === a.choice);
  return a.choice + ". " + (o ? o.title : "");
}
function answersText(S) {
  const r = openRound(S),
    n = S.draft.round;
  // Names the database document without claiming the save worked: this text is also the fallback.
  const lines = [
    `grill-with-artifact: round ${n} answers (database document answers/round-${n})`,
  ];
  if (r.kind === "closing") {
    const c = ans(S, "closing");
    lines.push(
      c.choice === "confirm" ? "Closing: Confirm" : "Closing: Not yet",
    );
    if (c.comment.trim()) lines.push("What is missing: " + c.comment.trim());
    return lines.join("\n");
  }
  for (const q of r.questions) {
    const a = ans(S, q.id);
    lines.push(`${q.id}: ${answerLabel(q, a)}`);
    if (a.comment.trim()) lines.push("  comment: " + a.comment.trim());
  }
  if (S.draft.reopen.length) lines.push("Reopen: " + S.draft.reopen.join(", "));
  return lines.join("\n");
}

const esc = (s) =>
  String(s == null ? "" : s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const md = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
const dis = (S) => (locked(S) ? "disabled" : "");
const fig = (svg, cap) =>
  `<figure class="fig panel"><div class="fig-scroll">${svg}</div>${cap ? `<figcaption>${md(cap)}</figcaption>` : ""}</figure>`;

function view(S) {
  const r = openRound(S);
  if (S.mode === "nodb")
    return shell(
      S,
      "This page cannot reach its database here, so no round can load. Say so in the terminal, and the session carries on there.",
    );
  if (!r)
    return shell(
      S,
      S.mode === "loading"
        ? "Loading the session."
        : "Waiting for round 1. Claude posts it here in a moment.",
    );
  const closing = r.kind === "closing";
  const lede = closing
    ? "Nothing is left open. Check the whole design below, then confirm it or say what is missing."
    : "Answer each question here and press Submit. Claude reads your answers, writes any docs they settle, and posts the next round on this page.";
  const past = S.rounds.filter(
    (d) => d.round > 1 && (d.settled.length || d.docsWritten.length),
  );
  return `<div class="wrap">
    <header class="hdr"><span class="label">grill-with-artifact · round ${r.round}</span><h1>${esc(S.topic)}</h1><p class="lede">${lede}</p>
      ${S.canEdit ? "" : '<p class="label">Only an editor of this page answers its rounds.</p>'}</header>
    ${closing || !r.treeSvg ? "" : fig(r.treeSvg, r.treeCaption)}
    ${past.map((d) => pastRound(S, d, d === r)).join("")}
    ${closing ? closingRound(S, r) : openQuestions(S, r)}
  </div>${closing ? "" : bar(S, r)}`;
}
function shell(S, text) {
  return `<div class="wrap"><header class="hdr"><span class="label">grill-with-artifact</span><h1>${esc(S.topic)}</h1></header><p class="notice panel" role="status">${text}</p></div>`;
}
function pastRound(S, d, latest) {
  const n = (k) => d.settled.filter((s) => s.how === k).length;
  const how = Object.keys(HOW)
    .filter(n)
    .map((k) => `${n(k)} ${HOW[k][+(n(k) !== 1)]}`)
    .join(", ");
  return `<section class="round"><div class="rhead"><h2>Round ${d.round - 1}</h2><span class="tag ok">settled · ${d.settled.length}</span></div>
    ${
      d.settled.length
        ? `<details class="settled panel" ${latest ? "open" : ""}><summary>Your answers${how ? ": " + how : ""}</summary><ol>
      ${d.settled.map((s) => `<li><span class="qid">${esc(s.id)}</span><span><b>${esc(s.title)}:</b> ${md(s.answer)}<span class="how">${HOW[s.how]?.[0] ?? ""}</span></span><span>${settledCtl(S, s)}</span></li>`).join("")}
    </ol></details>`
        : ""
    }
    <div class="docs panel"><span class="label">Written to the repo</span>${
      d.docsWritten.length
        ? `<ul>${d.docsWritten.map((w) => `<li><code>${esc(w.file)}</code> ${md(w.summary)}</li>`).join("")}</ul>`
        : '<p class="docs-none">Nothing new this round.</p>'
    }</div></section>`;
}
function settledCtl(S, s) {
  const to = carriedTo(S, s.id),
    verb = s.how === "defer" ? "deferred" : "reopened";
  if (to)
    return `<span class="tag park">${verb} · ${to.open ? "back as " + esc(to.q) : "back in round " + to.round}</span>`;
  if (s.how === "defer") return '<span class="tag park">deferred</span>';
  if (openRound(S).kind !== "questions" || !S.canEdit) return "";
  const on = S.draft.reopen.includes(s.id);
  return `${on ? '<span class="tag accent">back next round</span> ' : ""}<button class="btn-link" data-act="reopen" data-id="${esc(s.id)}" aria-pressed="${on}" ${dis(S)}>${on ? "Undo" : "Reopen"}</button>`;
}
function openQuestions(S, r) {
  return `<section class="round"><div class="rhead"><h2>Round ${r.round}</h2><span class="tag accent">open · ${r.questions.length} question${r.questions.length === 1 ? "" : "s"}</span>
    <button class="btn-link" data-act="all" ${dis(S)}>Take all remaining recommendations</button></div>
    ${r.questions.map((q, i) => card(S, q, r.round, `Question ${i + 1} of ${r.questions.length}`)).join("")}</section>`;
}
function carriedNote(q) {
  const c = q.carriedFrom;
  if (!c) return "";
  if (c.reason === "deferred")
    return `<p class="carried"><span class="tag park">Carried</span>You deferred this in round ${c.round} (${esc(c.id)}).</p>`;
  return `<p class="carried"><span class="tag park">Reopened</span>You reopened ${esc(c.id)}. Your earlier answer: <b>${md(c.earlier)}</b></p>`;
}
function card(S, q, round, label) {
  const a = ans(S, q.id),
    st = qstate(S, q);
  const radio = (v) =>
    `<input type="radio" name="q-${esc(q.id)}" id="q-${esc(q.id)}-${esc(v)}" value="${esc(v)}" data-q="${esc(q.id)}" ${a.choice === v ? "checked" : ""}>`;
  return `<article class="q panel" id="card-${esc(q.id)}" data-card="${esc(q.id)}" data-state="${st}">
    <span class="label qn">${label}</span>
    <div class="qhead"><span class="qid">${esc(q.id)}</span><h3>${esc(q.title)}</h3><span class="qtag" data-qtag="${esc(q.id)}" data-state="${st}">${QTAG[st]}</span></div>
    ${carriedNote(q)}
    ${q.figureSvg ? fig(q.figureSvg, q.figureCaption) : ""}
    <fieldset class="opts" ${dis(S)}><legend class="sr">Answer for ${esc(q.id)}</legend>
      ${q.options.map((o) => `<label class="opt" for="q-${esc(q.id)}-${esc(o.id)}">${radio(o.id)}<span><span class="t">${esc(o.id)}. ${md(o.title)}${o.id === q.recommended ? '<span class="rec">Recommended</span>' : ""}</span>${o.detail ? `<span class="d">${md(o.detail)}</span>` : ""}</span></label>`).join("")}
      <label class="opt" for="q-${esc(q.id)}-other">${radio("other")}<span><span class="t">Other</span>${
        a.choice === "other"
          ? `<input type="text" id="other-${esc(q.id)}" data-field="other" data-q="${esc(q.id)}" value="${esc(a.other)}" placeholder="Your answer" aria-label="Your answer for ${esc(q.id)}" ${dis(S)}>`
          : '<span class="d">Give an answer none of these covers.</span>'
      }</span></label>
      <label class="opt defer" for="q-${esc(q.id)}-defer">${radio("defer")}<span><span class="t">Defer</span><span class="d">Park it. It comes back in round ${round + 1}.</span></span></label>
    </fieldset>
    <div class="why"><span class="label">Why ${esc(q.recommended)}</span><p>${md(q.why)}</p></div>
    <div class="foot"><label class="comment" for="comment-${esc(q.id)}"><span class="label">Comment (optional)</span>
      <textarea id="comment-${esc(q.id)}" data-field="comment" data-q="${esc(q.id)}" rows="2" placeholder="Qualify your choice, or leave empty" ${dis(S)}>${esc(a.comment)}</textarea></label>
      <button class="btn btn-sm" data-act="rec" data-q="${esc(q.id)}" ${dis(S)}>Take recommendation (${esc(q.recommended)})</button></div>
  </article>`;
}
function bar(S, r) {
  if (!S.canEdit) return "";
  return `<div class="bar panel"><div class="bar-in">
    <div class="tally"><span class="count"><b data-ready>${readyN(S, r)}</b> of ${r.questions.length} ready${S.draft.reopen.length ? ` · ${S.draft.reopen.length} to reopen` : ""}</span>
      <button class="btn btn-sm jump" data-act="next" ${todoN(S, r) ? "" : "hidden"}><span data-todo>${todoN(S, r)}</span> to answer <span aria-hidden="true">↓</span></button></div>
    <div class="actions"><button class="btn" data-act="all" ${dis(S)}>Take all remaining</button>
      <button class="btn accent" id="submit" data-act="submit" ${canSubmit(S) ? "" : "disabled"}>Submit round ${r.round}</button></div>
    ${status(S)}</div></div>`;
}
function closingRound(S, r) {
  const decisions = S.rounds
    .flatMap((d) => d.settled || [])
    .filter((s) => s.how !== "defer" && !carriedTo(S, s.id)).length;
  const c = ans(S, "closing");
  return `<section class="round"><div class="rhead"><h2>What we settled</h2><span class="tag ok">${r.round - 1} rounds · ${decisions} decisions</span></div>
    <div class="summary panel">${r.summary.map((g) => `<h3>${esc(g.heading)}</h3><p>${md(g.text)}</p>`).join("")}</div>
    ${
      S.canEdit
        ? `<div class="summary panel"><h3>Is this the whole design?</h3><p>Confirm ends the session. Not yet sends Claude what is missing, and it posts another round.</p>
      <div class="cl-ctl"><div class="cl-btns"><button class="btn accent" id="submit" data-act="confirm" ${dis(S)}>Confirm</button>
        <button class="btn ${c.choice === "not-yet" ? "on" : ""}" data-act="notyet" ${dis(S)}>Not yet</button></div>
      ${
        c.choice === "not-yet"
          ? `<label class="cl-note" for="closing-note"><span class="label">What is missing or wrong?</span>
        <textarea id="closing-note" data-field="comment" data-q="closing" rows="3" ${dis(S)}>${esc(c.comment)}</textarea></label>
        <div class="cl-btns"><button class="btn accent" id="submit-notyet" data-act="submit" ${canSubmit(S) ? "" : "disabled"}>Send to Claude</button></div>`
          : ""
      }
      ${status(S)}</div></div>`
        : ""
    }</section>`;
}
function status(S) {
  const n = S.draft.round,
    closing = openRound(S).kind === "closing",
    confirmed = closing && ans(S, "closing").choice === "confirm";
  switch (S.status) {
    case "sending":
      return '<div class="st st-sending" role="status"><span class="spin"></span>Saving your answers and waking Claude.</div>';
    case "sent":
      return `<div class="st st-ok" role="status"><span><b>${confirmed ? "Confirmed." : "Sent to Claude."}</b> ${confirmed ? "Claude is wrapping up the session." : `Claude is writing round ${n + 1}. It appears on this page; if it does not, type <code>submitted</code> in the terminal.`}</span></div>`;
    case "saved":
      return `<div class="st st-warn" role="alert"><span><b>Saved, but Claude was not woken.</b> Type <code>submitted</code> in the terminal and the session reads your saved answers.</span>
      <div class="st-row"><button class="btn btn-sm" data-act="wake">Try waking it again</button></div></div>`;
    case "neither":
      return `<div class="st st-bad" role="alert"><span><b>Not saved and not sent.</b> Copy your answers and paste them into the terminal.</span>
      <pre id="fallback-text">${esc(answersText(S))}</pre>
      <div class="st-row"><button class="btn btn-sm accent" data-act="copy">Copy answers</button><button class="btn btn-sm" data-act="submit">Try again</button><span class="label" id="copied" role="status"></span></div></div>`;
  }
  if (S.submitted[n])
    return `<div class="st st-ok" role="status"><span><b>Submitted.</b> ${confirmed ? "The session is closing." : `Waiting for round ${n + 1}. If it does not appear, type <code>submitted</code> in the terminal.`}</span></div>`;
  return "";
}
