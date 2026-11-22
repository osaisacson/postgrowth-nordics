/*
 * Reads each configured sheet tab as CSV and renders it.
 * No build step and no dependencies: this file runs as-is in the browser.
 *
 * The sheet is open for anyone to edit, so every value from it is treated as
 * untrusted text: it is escaped before display, and only http(s) and mailto links are kept.
 */
(function () {
  "use strict";

  const cfg = window.SITE_CONFIG;
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/edit`;
  const CACHE_PREFIX = "sheet-site:v1:";
  const data = {}; // section id -> { rows, error, loading }
  const ui = {}; // section id -> { query, tag }

  // ---------- helpers ----------

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function safeUrl(u) {
    u = String(u || "").trim();
    if (!u) return "";
    if (/^www\./i.test(u)) u = "https://" + u;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) u = "mailto:" + u;
    try {
      const p = new URL(u);
      return ["http:", "https:", "mailto:"].includes(p.protocol) ? p.href : "";
    } catch {
      return "";
    }
  }

  function linkLabel(href) {
    try {
      const p = new URL(href);
      if (p.protocol === "mailto:") return p.pathname;
      return p.hostname.replace(/^www\./, "");
    } catch {
      return href;
    }
  }

  // RFC 4180 CSV parser (handles quotes, commas and newlines inside cells).
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", i = 0, q = false;
    while (i < text.length) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
        } else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
      i++;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function toObjects(rows) {
    if (!rows.length) return [];
    const head = rows[0].map((h) => h.trim().toLowerCase());
    return rows.slice(1).map((r) => {
      const o = {};
      head.forEach((h, i) => { if (h && !(h in o)) o[h] = (r[i] || "").trim(); });
      return o;
    });
  }

  const get = (row, col) => (col ? row[String(col).toLowerCase()] || "" : "");
  const splitList = (s) => String(s || "").split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
  const splitLinks = (s) => String(s || "").split(/[\s,;]+/).map(safeUrl).filter(Boolean);
  const isTrue = (v) => /^(true|yes|y|x|1|✓|✔)$/i.test(String(v).trim());

  function csvUrl(section) {
    const p = new URLSearchParams({
      tqx: "out:csv",
      sheet: section.tab,
      headers: "1",
      range: `A${section.headerRow || 1}:ZZ`,
    });
    return `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/gviz/tq?${p}`;
  }

  const addUrl = (section) => (section.gid ? `${sheetUrl}#gid=${section.gid}` : sheetUrl);

  function prepare(section, rows) {
    const f = section.fields;
    return rows.filter((r) => {
      if (!get(r, f.title)) return false;
      if (section.approvedColumn && !isTrue(get(r, section.approvedColumn))) return false;
      return true;
    });
  }

  function cacheRead(id) {
    try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + cfg.sheetId + ":" + id)); } catch { return null; }
  }
  function cacheWrite(id, rows) {
    try { localStorage.setItem(CACHE_PREFIX + cfg.sheetId + ":" + id, JSON.stringify(rows)); } catch {}
  }

  async function load(section) {
    const cached = cacheRead(section.id);
    data[section.id] = { rows: cached || [], loading: !cached, error: null };
    try {
      const res = await fetch(csvUrl(section), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (/^\s*</.test(text)) throw new Error("The sheet is not shared publicly, or the tab name is wrong.");
      const rows = prepare(section, toObjects(parseCSV(text)));
      data[section.id] = { rows, loading: false, error: null };
      cacheWrite(section.id, rows);
    } catch (e) {
      data[section.id] = { rows: cached || [], loading: false, error: e.message || String(e), stale: !!cached };
    }
  }

  // ---------- rendering ----------

  const $main = () => document.getElementById("main");

  function renderNav(active) {
    const items = [{ id: "", label: "About" }, ...cfg.sections];
    document.getElementById("nav").innerHTML = items
      .map((s) => `<a href="#/${s.id}" ${s.id === active ? 'aria-current="page"' : ""}>${esc(s.label)}</a>`)
      .join("");
  }

  function renderHome() {
    const cards = cfg.sections
      .map((s) => {
        const d = data[s.id];
        const n = d && !d.loading ? d.rows.length : "…";
        return `<a class="overview-card" href="#/${s.id}">
          <span class="overview-count">${n}</span>
          <span class="overview-label">${esc(s.label)}</span>
          <span class="overview-desc">${esc(s.description || "")}</span>
        </a>`;
      })
      .join("");
    $main().innerHTML = `
      <div class="about-layout">
        <article class="intro">
          <h1>About</h1>
          <div class="prose">${cfg.intro || ""}</div>
        </article>
        <aside class="toc" aria-label="On this page"></aside>
      </div>
      <section class="overview" aria-label="Sections">${cards}</section>
      <section class="contribute">
        <h2>Contribute</h2>
        <p>The site is built from a shared spreadsheet. Add a row to the right tab and it shows up here.</p>
        <div class="button-row">${cfg.sections
          .map((s) => `<a class="button" href="${esc(addUrl(s))}" target="_blank" rel="noopener">${esc(s.addLabel || "Add to " + s.label)}</a>`)
          .join("")}</div>
      </section>`;
    buildToc();
  }

  // "On this page" list built from the About headings. Uses buttons, since the URL hash is used for page routing.
  function buildToc() {
    const heads = [...$main().querySelectorAll(".prose h2, .prose h3, .prose h4")];
    const toc = $main().querySelector(".toc");
    if (!toc || heads.length < 2) { if (toc) toc.remove(); return; }
    toc.innerHTML = `<p class="toc-title">On this page</p><ul>${heads
      .map((h, i) => `<li class="toc-${h.tagName.toLowerCase()}"><button type="button" data-toc="${i}">${esc(h.textContent)}</button></li>`)
      .join("")}</ul>`;
    toc.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-toc]");
      if (b) heads[+b.dataset.toc].scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function entryHTML(section, row) {
    const f = section.fields;
    const title = get(row, f.title);
    const url = safeUrl(get(row, f.url));
    const titleHTML = url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a>`
      : esc(title);
    const subtitle = get(row, f.subtitle);
    const body = get(row, f.body);
    const note = get(row, f.note);
    const meta = (f.meta || []).map((c) => get(row, c)).filter(Boolean);
    const tags = splitList(get(row, f.tags));
    const links = splitLinks(get(row, f.links));
    const answer = get(row, f.answer);
    const answerBy = get(row, f.answerBy);

    return `<article class="entry">
      <h3>${titleHTML}</h3>
      ${subtitle ? `<p class="subtitle">${esc(subtitle)}</p>` : ""}
      ${meta.length ? `<p class="meta">${meta.map(esc).join(" · ")}</p>` : ""}
      ${body ? `<p class="body">${esc(body)}</p>` : ""}
      ${note ? `<p class="note">${esc(note)}</p>` : ""}
      ${answer ? `<div class="answer"><p>${esc(answer)}</p>${answerBy ? `<p class="meta">${esc(answerBy)}</p>` : ""}</div>` : ""}
      ${tags.length ? `<ul class="tags">${tags.map((t) => `<li><button type="button" data-tag="${esc(t)}">${esc(t)}</button></li>`).join("")}</ul>` : ""}
      ${links.length ? `<p class="links">${links.map((l) => `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(linkLabel(l))}</a>`).join("")}</p>` : ""}
    </article>`;
  }

  function matches(section, row, state) {
    if (state.tag) {
      const tags = splitList(get(row, section.filterBy || section.fields.tags)).map((t) => t.toLowerCase());
      if (!tags.includes(state.tag.toLowerCase())) return false;
    }
    if (state.query) {
      const hay = Object.values(section.fields).flat().map((c) => get(row, c)).join(" ").toLowerCase();
      return state.query.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
    }
    return true;
  }

  function renderSection(section) {
    const d = data[section.id] || { rows: [], loading: true };
    const state = (ui[section.id] ||= { query: "", tag: "" });
    const filterCol = section.filterBy || section.fields.tags;
    const allTags = filterCol
      ? [...new Set(d.rows.flatMap((r) => splitList(get(r, filterCol))))].sort((a, b) => a.localeCompare(b))
      : [];

    $main().innerHTML = `
      <header class="section-head">
        <div>
          <h1>${esc(section.label)}</h1>
          ${section.description ? `<p class="tagline">${esc(section.description)}</p>` : ""}
        </div>
        <a class="button primary" href="${esc(addUrl(section))}" target="_blank" rel="noopener">${esc(section.addLabel || "Add")}</a>
      </header>
      ${d.rows.length > 4 || state.query ? `<input class="search" type="search" placeholder="Search ${esc(section.label.toLowerCase())}…" value="${esc(state.query)}" aria-label="Search">` : ""}
      ${allTags.length > 1 ? `<div class="filters" role="group" aria-label="Filter by topic">
          <button type="button" data-tag="" ${state.tag ? "" : 'aria-pressed="true"'}>All</button>
          ${allTags.map((t) => `<button type="button" data-tag="${esc(t)}" ${state.tag === t ? 'aria-pressed="true"' : ""}>${esc(t)}</button>`).join("")}
        </div>` : ""}
      ${d.error ? `<p class="notice">${d.stale ? "Showing saved copy. " : ""}Could not load the sheet: ${esc(d.error)}</p>` : ""}
      <div class="entries layout-${esc(section.layout || "list")}" aria-live="polite"></div>`;

    const search = $main().querySelector(".search");
    if (search) search.addEventListener("input", (e) => { state.query = e.target.value; drawEntries(section); });
    drawEntries(section);
  }

  function drawEntries(section) {
    const d = data[section.id] || { rows: [], loading: true };
    const state = ui[section.id];
    const box = $main().querySelector(".entries");
    if (!box) return;
    if (d.loading) { box.innerHTML = `<p class="empty">Loading…</p>`; return; }
    const rows = d.rows.filter((r) => matches(section, r, state));
    box.innerHTML = rows.length
      ? rows.map((r) => entryHTML(section, r)).join("")
      : `<p class="empty">${esc(d.rows.length ? "Nothing matches that search." : section.emptyText || "Nothing here yet.")}</p>`;
  }

  // ---------- routing ----------

  function route() {
    const id = location.hash.replace(/^#\/?/, "");
    const section = cfg.sections.find((s) => s.id === id);
    renderNav(section ? section.id : "");
    document.title = section ? `${section.label} · ${cfg.title}` : cfg.title;
    if (section) renderSection(section); else renderHome();
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tag]");
    if (!btn) return;
    const id = location.hash.replace(/^#\/?/, "");
    const section = cfg.sections.find((s) => s.id === id);
    if (!section) return;
    const state = (ui[id] ||= { query: "", tag: "" });
    state.tag = state.tag === btn.dataset.tag ? "" : btn.dataset.tag;
    renderSection(section);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });

  // ---------- start ----------

  document.getElementById("site-title").textContent = cfg.title;
  document.getElementById("footer").innerHTML = (cfg.footer || "").replace("{sheetUrl}", esc(sheetUrl));
  cfg.sections.forEach((s) => { data[s.id] = { rows: cacheRead(s.id) || [], loading: !cacheRead(s.id) }; });
  route();
  Promise.all(cfg.sections.map((s) => load(s).then(route)));

  // Pick up sheet edits if someone leaves the page open.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") cfg.sections.forEach((s) => load(s).then(route));
  });
})();
