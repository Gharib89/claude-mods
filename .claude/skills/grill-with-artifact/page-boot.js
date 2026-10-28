/* ---- boot: the browser only. Wires the capabilities, the live rounds, drafts and Submit. ---- */
if (typeof document !== "undefined") boot();

async function boot() {
  const S = newState(document.title);
  const app = document.getElementById("app");
  const key = () => "grill-draft-" + S.draft.round;
  const saveDraft = () => {
    try {
      localStorage.setItem(key(), JSON.stringify(S.draft));
    } catch (e) {}
  };
  const loadDraft = () => {
    try {
      return JSON.parse(localStorage.getItem(key()) || "null");
    } catch (e) {
      return null;
    }
  };
  // A figure is data from the database: parse it inert, then drop anything that could run.
  function clean(root) {
    root
      .querySelectorAll(".fig script, .fig foreignObject, .fig iframe")
      .forEach((n) => n.remove());
    root.querySelectorAll(".fig *").forEach((n) => {
      for (const a of [...n.attributes])
        if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value))
          n.removeAttribute(a.name);
    });
  }
  function render() {
    const f = document.activeElement,
      fid = f && f.id;
    const sel =
      f && typeof f.selectionStart === "number"
        ? [f.selectionStart, f.selectionEnd]
        : null;
    const t = document.createElement("template");
    t.innerHTML = view(S);
    clean(t.content);
    app.replaceChildren(t.content);
    const el = fid && document.getElementById(fid);
    if (el) {
      el.focus({ preventScroll: true });
      if (sel && el.setSelectionRange)
        try {
          el.setSelectionRange(...sel);
        } catch (e) {}
    }
  }
  function refresh() {
    const r = openRound(S);
    if (!r) return;
    for (const q of r.questions || []) {
      const st = qstate(S, q);
      document
        .querySelectorAll(
          `[data-card="${CSS.escape(q.id)}"], [data-qtag="${CSS.escape(q.id)}"]`,
        )
        .forEach((el) => {
          el.dataset.state = st;
        });
      const tag = document.querySelector(`[data-qtag="${CSS.escape(q.id)}"]`);
      if (tag) tag.textContent = QTAG[st];
    }
    if (r.questions)
      document.querySelectorAll("[data-ready]").forEach((el) => {
        el.textContent = readyN(S, r);
      });
    if (r.questions)
      document.querySelectorAll('[data-act="next"]').forEach((b) => {
        b.hidden = !todoN(S, r);
        b.querySelector("[data-todo]").textContent = todoN(S, r);
      });
    document.querySelectorAll('[data-act="submit"]').forEach((b) => {
      b.disabled = !canSubmit(S);
    });
    const ft = document.getElementById("fallback-text");
    if (ft) ft.textContent = answersText(S);
  }
  render();

  const use = (n) =>
    window.claude && window.claude.use
      ? window.claude.use(n).catch(() => null)
      : Promise.resolve(null);
  const [db, comments, user] = await Promise.all([
    use("db"),
    use("comments"),
    use("user"),
  ]);
  if (!db) {
    S.mode = "nodb";
    render();
    return;
  }
  if (user) S.canEdit = await user.canEdit().catch(() => true);

  db.collection("rounds")
    .orderBy("round")
    .onSnapshot(
      (snap) => {
        const was = S.draft && S.draft.round;
        setRounds(
          S,
          snap.docs.map((d) => d.data()),
        );
        if (S.draft && S.draft.round !== was) restoreDraft(S, loadDraft());
        render();
      },
      () => {
        S.mode = "nodb";
        render();
      },
    );
  db.collection("answers").onSnapshot(
    (snap) => {
      setAnswers(
        S,
        snap.docs.map((d) => d.data()),
      );
      render();
    },
    () => {},
  );

  // The comment is the doorbell: the one page action that starts a turn in the watching session.
  // It carries the answers too, cut to the 4 KiB a comment holds.
  function capped(text) {
    const enc = new TextEncoder(),
      tail = `\n[cut to fit: read answers/round-${S.draft.round}]`;
    if (enc.encode(text).length <= 4096) return text;
    let s = text;
    while (enc.encode(s + tail).length > 4096) s = s.slice(0, -64);
    return s + tail;
  }
  async function wake(anchor) {
    if (!comments || !anchor) return false;
    try {
      // `available` means this viewer may send, not that a session is watching: a send with no watch
      // lands and wakes nothing, so the sent receipt still names the typed fallback.
      if ((await comments.canSendToClaude()) !== "available") return false;
      await comments.sendToClaude({ anchor, text: capped(answersText(S)) });
      return true;
    } catch (e) {
      return false;
    }
  }
  // A Submit anchors on the button pressed (Confirm, Not yet or Submit); a retry anchors on the Submit it retries.
  const anchorOf = (el) =>
    comments ? comments.anchorFor(el).catch(() => null) : Promise.resolve(null);
  async function submit(btn) {
    if (!canSubmit(S) && S.status !== "neither") return;
    // Lock before any await, so a second click finds the round locked. The render replaces the
    // pressed button, so the anchor takes its re-rendered twin by id.
    const doc = answersDoc(S);
    S.status = "sending";
    render();
    const anchor = await anchorOf(document.getElementById(btn.id) || btn);
    const saved = await db
      .doc("answers/round-" + doc.round)
      .set(doc)
      .then(
        () => true,
        () => false,
      );
    const woke = await wake(anchor);
    S.status = woke ? "sent" : saved ? "saved" : "neither";
    render();
  }
  async function rewake(btn) {
    if (S.status !== "saved") return;
    S.status = "sending";
    render();
    const anchor = await anchorOf(
      document.getElementById("submit-notyet") ||
        document.getElementById("submit") ||
        btn,
    );
    S.status = (await wake(anchor)) ? "sent" : "saved";
    render();
  }
  const motion = () =>
    matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  // The first card left to answer (empty or incomplete), in page order: scrolled to, ringed, and focused.
  function next() {
    const c = document.querySelector(
      '.q[data-state="empty"], .q[data-state="incomplete"]',
    );
    if (!c) return;
    c.scrollIntoView({ block: "center", behavior: motion() });
    c.classList.add("flash");
    setTimeout(() => c.classList.remove("flash"), 1500);
    (c.querySelector('input[type="text"]') || c.querySelector("input"))?.focus({
      preventScroll: true,
    });
  }
  function copy() {
    const note = (t) => {
      const c = document.getElementById("copied");
      if (c) c.textContent = t;
    };
    const selectIt = () => {
      const r = document.createRange();
      r.selectNodeContents(document.getElementById("fallback-text"));
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      note("Selected: press Ctrl+C or Cmd+C");
    };
    try {
      navigator.clipboard
        .writeText(answersText(S))
        .then(() => note("Copied"), selectIt);
    } catch (e) {
      selectIt();
    }
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (t && !t.disabled) {
      const d = t.dataset,
        act = d.act;
      if (act === "submit") return submit(t);
      if (act === "wake") return rewake(t);
      if (act === "copy") return copy();
      if (act === "next") return next();
      if (act === "confirm") {
        ACT.closing(S, { choice: "confirm" });
        saveDraft();
        return submit(t);
      }
      if (act === "notyet") {
        ACT.closing(S, { choice: "not-yet" });
        saveDraft();
        render();
        document.getElementById("closing-note")?.focus();
        return;
      }
      if (ACT[act]) {
        ACT[act](S, d);
        saveDraft();
        render();
      }
      return;
    }
    const node = e.target.closest("svg [data-q]");
    if (node)
      document
        .getElementById("card-" + node.dataset.q)
        ?.scrollIntoView({ block: "center", behavior: motion() });
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (!t.matches('input[type="radio"][data-q]')) return;
    ACT.pick(S, { q: t.dataset.q, o: t.value });
    saveDraft();
    render();
    if (t.value === "other")
      document.getElementById("other-" + t.dataset.q)?.focus();
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.dataset.field) return;
    ACT.field(S, { q: t.dataset.q, field: t.dataset.field, value: t.value });
    saveDraft();
    refresh();
  });
}
