/*
 * Reads each configured sheet tab as CSV, links the entries together, and renders
 * the pages and the graph. No build step and no dependencies.
 *
 * The sheet is open for anyone to edit, so every value from it is treated as
 * untrusted text: it is escaped before display, and only http(s) and mailto links are kept.
 */
(function () {
  "use strict";

  const cfg = window.SITE_CONFIG;
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/edit`;
  const CACHE_PREFIX = "sheet-site:v2:";
  const hubs = cfg.hubs || {};
  const data = {}; // section id -> { rows, error, loading, stale }
  const ui = {}; // section id -> { query, tag }
  let graph = { nodes: new Map(), links: [], adj: new Map() };

  // ---------- helpers ----------

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function safeUrl(u) {
    u = String(u || "").trim();
    if (!u) return "";
    if (/^www\./i.test(u)) u = "https://" + u;
    if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(u)) u = "mailto:" + u;
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

  const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  const slug = (s) =>
    norm(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";

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
    const head = rows[0].map((h) => norm(h));
    return rows.slice(1).map((r) => {
      const o = {};
      head.forEach((h, i) => { if (h && !(h in o)) o[h] = (r[i] || "").trim(); });
      return o;
    });
  }

  const get = (row, col) => (col ? row[norm(col)] || "" : "");
  const splitList = (s) => String(s || "").split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
  const splitLinks = (s) => String(s || "").split(/[\s,;]+/).map(safeUrl).filter(Boolean);
  const isTrue = (v) => /^(true|yes|y|x|1|✓|✔)$/i.test(String(v).trim());
  const sectionById = (id) => cfg.sections.find((s) => s.id === id);

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
    return rows.filter((r) => {
      if (!get(r, section.fields.title)) return false;
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
    const cached = data[section.id] && data[section.id].rows.length ? data[section.id].rows : cacheRead(section.id);
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

  // ---------- the link graph ----------
  // Nodes: one per entry ("people/asa-isacson") and one per hub value ("topic/energy").

  function buildGraph() {
    const nodes = new Map();
    const links = [];
    const seen = new Set();
    const byTitle = {}; // section id -> normalized title -> node id

    for (const s of cfg.sections) {
      byTitle[s.id] = {};
      for (const row of (data[s.id] || { rows: [] }).rows) {
        const title = get(row, s.fields.title);
        let id = `${s.id}/${slug(title)}`;
        for (let n = 2; nodes.has(id); n++) id = `${s.id}/${slug(title)}-${n}`;
        row.__id = id;
        nodes.set(id, { id, kind: s.id, label: title, color: s.color || "#3f8f6f", row, section: s });
        byTitle[s.id][norm(title)] ||= id;
      }
    }

    const link = (a, b) => {
      if (a === b) return;
      const key = a < b ? a + "|" + b : b + "|" + a;
      if (seen.has(key)) return;
      seen.add(key);
      links.push({ source: a, target: b });
    };

    for (const s of cfg.sections) {
      for (const row of (data[s.id] || { rows: [] }).rows) {
        for (const rel of s.relations || []) {
          for (const value of splitList(get(row, rel.column))) {
            if (rel.hub) {
              const id = `${rel.hub}/${slug(value)}`;
              if (!nodes.has(id)) {
                const h = hubs[rel.hub] || {};
                nodes.set(id, { id, kind: rel.hub, label: value, color: h.color || "#8a8f98", hub: rel.hub });
              }
              link(row.__id, id);
            } else if (rel.section) {
              const target = (byTitle[rel.section] || {})[norm(value)];
              if (target) link(row.__id, target);
            }
          }
        }
      }
    }

    const adj = new Map([...nodes.keys()].map((k) => [k, new Set()]));
    for (const l of links) { adj.get(l.source).add(l.target); adj.get(l.target).add(l.source); }
    graph = { nodes, links, adj };
  }

  const nodeHref = (n) => `#/${n.id}`;

  function neighborhood(startIds, depth) {
    const keep = new Set(startIds);
    let frontier = [...startIds];
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const id of frontier) for (const nb of graph.adj.get(id) || []) if (!keep.has(nb)) { keep.add(nb); next.push(nb); }
      frontier = next;
    }
    return keep;
  }

  // ---------- graph drawing (small force layout in SVG) ----------

  function hashRand(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }

  function drawGraph(box, keepIds, opts = {}) {
    box.innerHTML = "";
    const ids = [...keepIds].filter((id) => graph.nodes.has(id));
    if (!ids.length) { box.innerHTML = `<p class="graph-empty">No connections yet.</p>`; return () => {}; }

    const W = Math.max(200, box.clientWidth || 300), H = Math.max(200, box.clientHeight || 300);
    const nodes = ids.map((id) => {
      const n = graph.nodes.get(id);
      const a = hashRand(id) * Math.PI * 2, r = 40 + hashRand(id + "r") * 160;
      return { ...n, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, deg: graph.adj.get(id).size };
    });
    const index = new Map(nodes.map((n, i) => [n.id, i]));
    const links = graph.links.filter((l) => index.has(l.source) && index.has(l.target))
      .map((l) => ({ s: nodes[index.get(l.source)], t: nodes[index.get(l.target)] }));
    const nb = new Map(nodes.map((n) => [n.id, new Set()]));
    links.forEach((l) => { nb.get(l.s.id).add(l.t.id); nb.get(l.t.id).add(l.s.id); });

    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `${-W / 2} ${-H / 2} ${W} ${H}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Graph of ${nodes.length} connected items`);
    const view = document.createElementNS(NS, "g");
    svg.appendChild(view);
    const gl = document.createElementNS(NS, "g"); gl.setAttribute("class", "g-links");
    const gn = document.createElementNS(NS, "g"); gn.setAttribute("class", "g-nodes");
    view.append(gl, gn);

    const lineEls = links.map(() => { const e = document.createElementNS(NS, "line"); gl.appendChild(e); return e; });
    const showAllLabels = nodes.length <= 45;
    const nodeEls = nodes.map((n) => {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "g-node" + (n.hub ? " is-hub" : "") + (n.id === opts.focus ? " is-focus" : ""));
      const c = document.createElementNS(NS, "circle");
      n.r = (n.hub ? 3 : 4) + Math.sqrt(n.deg) * 1.8;
      c.setAttribute("r", n.r);
      c.setAttribute("fill", n.color);
      const t = document.createElementNS(NS, "text");
      t.textContent = n.label.length > 32 ? n.label.slice(0, 30) + "…" : n.label;
      t.setAttribute("y", n.r + 11);
      if (!showAllLabels && n.id !== opts.focus && n.deg < 4) g.classList.add("label-hidden");
      const title = document.createElementNS(NS, "title");
      title.textContent = n.label;
      g.append(c, t, title);
      gn.appendChild(g);
      return g;
    });
    box.appendChild(svg);

    // simulation
    let scale = 1, tx = 0, ty = 0, userView = false;
    let alpha = 1, raf = 0, dragging = null;
    const focusNode = opts.focus && nodes[index.get(opts.focus)];
    function tick() {
      const k = alpha;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy || 0.01;
          if (d2 > 90000) continue;
          const f = (2200 / d2) * k;
          const d = Math.sqrt(d2);
          dx /= d; dy /= d;
          a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
        }
      }
      for (const l of links) {
        const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = ((d - 70) / d) * 0.06 * k;
        l.s.vx += dx * f; l.s.vy += dy * f; l.t.vx -= dx * f; l.t.vy -= dy * f;
      }
      for (const n of nodes) {
        n.vx -= n.x * 0.01 * k; n.vy -= n.y * 0.01 * k * Math.min(2, W / H);
        if (n === dragging || (n === focusNode && !opts.freeFocus)) {
          if (n === focusNode && n !== dragging) { n.x *= 0.8; n.y *= 0.8; }
          n.vx = n.vy = 0; continue;
        }
        n.vx *= 0.6; n.vy *= 0.6;
        n.x += Math.max(-20, Math.min(20, n.vx)); n.y += Math.max(-20, Math.min(20, n.vy));
      }
      alpha *= 0.985;
    }
    function paint() {
      links.forEach((l, i) => {
        const e = lineEls[i];
        e.setAttribute("x1", l.s.x.toFixed(1)); e.setAttribute("y1", l.s.y.toFixed(1));
        e.setAttribute("x2", l.t.x.toFixed(1)); e.setAttribute("y2", l.t.y.toFixed(1));
      });
      nodes.forEach((n, i) => nodeEls[i].setAttribute("transform", `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`));
      if (!userView) fit();
    }
    // Keep the whole graph in view until the person pans or zooms.
    function fit() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of nodes) { x0 = Math.min(x0, n.x - 30); x1 = Math.max(x1, n.x + 30); y0 = Math.min(y0, n.y - 14); y1 = Math.max(y1, n.y + 24); }
      const s = Math.min(1.6, Math.max(0.25, Math.min(W / (x1 - x0), H / (y1 - y0))));
      scale = s; tx = -((x0 + x1) / 2) * s; ty = -((y0 + y1) / 2) * s;
      svg.classList.toggle("small", s < 0.75);
      applyView();
    }
    function loop() {
      tick(); paint();
      if (alpha > 0.02 || dragging) raf = requestAnimationFrame(loop); else raf = 0;
    }
    const reheat = (a = 0.3) => { alpha = Math.max(alpha, a); if (!raf) raf = requestAnimationFrame(loop); };

    // hover highlight
    function highlight(n) {
      svg.classList.toggle("has-hover", !!n);
      nodes.forEach((m, i) => nodeEls[i].classList.toggle("is-lit", !!n && (m === n || nb.get(n.id).has(m.id))));
      links.forEach((l, i) => lineEls[i].classList.toggle("is-lit", !!n && (l.s === n || l.t === n)));
    }

    // pan / zoom / drag
    const applyView = () => view.setAttribute("transform", `translate(${tx},${ty}) scale(${scale})`);
    const toSvg = (ev) => {
      const r = svg.getBoundingClientRect();
      return { x: ((ev.clientX - r.left) / r.width - 0.5) * W, y: ((ev.clientY - r.top) / r.height - 0.5) * H };
    };
    let pan = null, moved = false, downNode = null;
    nodeEls.forEach((el, i) => {
      el.addEventListener("pointerenter", () => { if (!dragging && !pan) highlight(nodes[i]); });
      el.addEventListener("pointerleave", () => { if (!dragging) highlight(null); });
      el.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation(); downNode = nodes[i]; dragging = nodes[i]; moved = false;
        svg.setPointerCapture(ev.pointerId); highlight(nodes[i]); reheat(0.1);
      });
    });
    svg.addEventListener("pointerdown", (ev) => { const p = toSvg(ev); pan = { x: p.x - tx, y: p.y - ty }; moved = false; svg.setPointerCapture(ev.pointerId); });
    svg.addEventListener("pointermove", (ev) => {
      const p = toSvg(ev);
      if (dragging) { dragging.x = (p.x - tx) / scale; dragging.y = (p.y - ty) / scale; moved = true; reheat(0.15); }
      else if (pan) { tx = p.x - pan.x; ty = p.y - pan.y; moved = true; userView = true; applyView(); }
    });
    const end = () => {
      if (downNode && !moved && opts.onClick) opts.onClick(downNode);
      if (dragging) highlight(null);
      dragging = null; pan = null; downNode = null;
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      userView = true;
      const p = toSvg(ev), f = Math.exp(-ev.deltaY * 0.0015), ns = Math.min(4, Math.max(0.3, scale * f));
      tx = p.x - ((p.x - tx) * ns) / scale; ty = p.y - ((p.y - ty) * ns) / scale; scale = ns;
      svg.classList.toggle("zoomed", scale > 1.3);
      svg.classList.toggle("small", scale < 0.75);
      applyView();
    }, { passive: false });

    const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { for (let i = 0; i < 260; i++) tick(); alpha = 0; paint(); } else loop();
    return () => cancelAnimationFrame(raf);
  }

  // ---------- rendering ----------

  const $main = () => document.getElementById("main");
  let stopGraph = () => {};

  function renderNav(active) {
    const items = [{ id: "", label: "About" }, ...cfg.sections];
    document.getElementById("nav").innerHTML = items
      .map((s) => `<a href="#/${s.id}" ${s.id === active ? 'aria-current="page"' : ""}>${esc(s.label)}</a>`)
      .join("");
  }

  function renderRight({ keep, focus, title, toc }) {
    stopGraph();
    const right = document.getElementById("right");
    right.innerHTML = `
      <div class="graph-card">
        <div class="graph-head">
          <span>${esc(title || "Graph view")}</span>
          <button type="button" class="icon-btn" id="graph-expand" aria-label="Open full graph" title="Open full graph">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          </button>
        </div>
        <div class="graph-box" id="graph-box"></div>
        <ul class="legend">${[...cfg.sections.map((s) => [s.label, s.color]), ...Object.values(hubs).map((h) => [h.label, h.color])]
          .map(([l, c]) => `<li><span style="background:${esc(c)}"></span>${esc(l)}</li>`).join("")}</ul>
      </div>
      ${toc || ""}`;
    stopGraph = drawGraph(document.getElementById("graph-box"), keep, { focus, onClick: (n) => { location.hash = nodeHref(n); } });
    document.getElementById("graph-expand").addEventListener("click", openFullGraph);
  }

  function openFullGraph() {
    const dlg = document.getElementById("graph-dialog");
    const box = dlg.querySelector(".graph-box");
    dlg.showModal();
    const stop = drawGraph(box, new Set(graph.nodes.keys()), {
      onClick: (n) => { dlg.close(); location.hash = nodeHref(n); },
    });
    dlg.addEventListener("close", stop, { once: true });
  }

  function renderHome() {
    const cards = cfg.sections
      .map((s) => {
        const d = data[s.id];
        const n = d && !d.loading ? d.rows.length : "…";
        return `<a class="overview-card" href="#/${s.id}">
          <span class="overview-count" style="color:${esc(s.color)}">${n}</span>
          <span class="overview-label">${esc(s.label)}</span>
          <span class="overview-desc">${esc(s.description || "")}</span>
        </a>`;
      })
      .join("");
    $main().innerHTML = `
      <article class="intro">
        <h1>About</h1>
        <div class="prose">${cfg.intro || ""}</div>
      </article>
      <section class="overview" aria-label="Sections">${cards}</section>
      <section class="contribute">
        <h2>Contribute</h2>
        <p>The site is built from a shared spreadsheet. Add a row to the right tab and it shows up here.</p>
        <div class="button-row">${cfg.sections
          .map((s) => `<a class="button" href="${esc(addUrl(s))}" target="_blank" rel="noopener">${esc(s.addLabel || "Add to " + s.label)}</a>`)
          .join("")}</div>
      </section>`;
    const heads = [...$main().querySelectorAll(".prose h2, .prose h3, .prose h4")];
    const toc = heads.length > 1
      ? `<nav class="toc" aria-label="On this page"><p class="toc-title">On this page</p><ul>${heads
          .map((h, i) => `<li class="toc-${h.tagName.toLowerCase()}"><button type="button" data-toc="${i}">${esc(h.textContent)}</button></li>`)
          .join("")}</ul></nav>`
      : "";
    renderRight({ keep: new Set(graph.nodes.keys()), title: "Graph view", toc });
    const tocEl = document.querySelector(".toc");
    if (tocEl) tocEl.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-toc]");
      if (b) heads[+b.dataset.toc].scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function chip(id) {
    const n = graph.nodes.get(id);
    return n ? `<a class="chip" href="${esc(nodeHref(n))}" style="--dot:${esc(n.color)}">${esc(n.label)}</a>` : "";
  }

  function entryHTML(section, row) {
    const f = section.fields;
    const id = row.__id;
    const title = get(row, f.title);
    const url = safeUrl(get(row, f.url));
    const subtitle = get(row, f.subtitle);
    const body = get(row, f.body);
    const note = get(row, f.note);
    const meta = (f.meta || []).map((c) => get(row, c)).filter(Boolean);
    const links = splitLinks(get(row, f.links));
    const answer = get(row, f.answer);
    const answerBy = get(row, f.answerBy);

    // relation columns of this row
    const relParts = [];
    const hubChips = [];
    for (const rel of section.relations || []) {
      const values = splitList(get(row, rel.column));
      if (!values.length) continue;
      if (rel.hub) values.forEach((v) => hubChips.push(chip(`${rel.hub}/${slug(v)}`)));
      else {
        const items = values.map((v) => {
          const target = [...(graph.adj.get(id) || [])].find((t) => t.startsWith(rel.section + "/") && norm(graph.nodes.get(t).label) === norm(v));
          return target ? `<a href="${esc(nodeHref(graph.nodes.get(target)))}">${esc(v)}</a>` : esc(v);
        });
        relParts.push(`<p class="rel"><span class="rel-label">${esc(rel.label || rel.column)}</span> ${items.join(", ")}</p>`);
      }
    }
    // backlinks: entries in other tabs that point here
    const backlinks = {};
    const direct = new Set();
    for (const rel of section.relations || []) if (rel.section) splitList(get(row, rel.column)).forEach((v) => direct.add(rel.section + "/" + norm(v)));
    for (const nbId of graph.adj.get(id) || []) {
      const n = graph.nodes.get(nbId);
      if (!n.section || direct.has(n.kind + "/" + norm(n.label))) continue;
      (backlinks[n.section.label] ||= []).push(`<a href="${esc(nodeHref(n))}">${esc(n.label)}</a>`);
    }
    for (const [label, items] of Object.entries(backlinks)) {
      relParts.push(`<p class="rel"><span class="rel-label">${esc(label)}</span> ${items.join(", ")}</p>`);
    }

    return `<article class="entry" id="e-${esc(id.replace("/", "--"))}">
      <h3><a href="${esc("#/" + id)}">${esc(title)}</a></h3>
      ${subtitle ? `<p class="subtitle">${esc(subtitle)}</p>` : ""}
      ${meta.length ? `<p class="meta">${meta.map(esc).join(" · ")}</p>` : ""}
      ${body ? `<p class="body">${esc(body)}</p>` : ""}
      ${note ? `<p class="note">${esc(note)}</p>` : ""}
      ${answer ? `<div class="answer"><p>${esc(answer)}</p>${answerBy ? `<p class="meta">${esc(answerBy)}</p>` : ""}</div>` : ""}
      ${relParts.join("")}
      ${hubChips.length ? `<p class="chips">${hubChips.join("")}</p>` : ""}
      ${url || links.length ? `<p class="links">${[url, ...links].filter(Boolean).map((l) => `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(linkLabel(l))} ↗</a>`).join("")}</p>` : ""}
    </article>`;
  }

  function matches(section, row, state) {
    if (state.tag) {
      const tags = splitList(get(row, section.filterBy)).map(norm);
      if (!tags.includes(norm(state.tag))) return false;
    }
    if (state.query) {
      const cols = [...Object.values(section.fields).flat(), ...(section.relations || []).map((r) => r.column)];
      const hay = cols.map((c) => get(row, c)).join(" ").toLowerCase();
      return state.query.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
    }
    return true;
  }

  function renderSection(section, focusId) {
    const d = data[section.id] || { rows: [], loading: true };
    const state = (ui[section.id] ||= { query: "", tag: "" });
    const allTags = section.filterBy
      ? [...new Set(d.rows.flatMap((r) => splitList(get(r, section.filterBy))))].sort((a, b) => a.localeCompare(b))
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
      ${allTags.length > 1 ? `<div class="filters" role="group" aria-label="Filter">
          <button type="button" data-tag="" ${state.tag ? "" : 'aria-pressed="true"'}>All</button>
          ${allTags.map((t) => `<button type="button" data-tag="${esc(t)}" ${state.tag === t ? 'aria-pressed="true"' : ""}>${esc(t)}</button>`).join("")}
        </div>` : ""}
      ${d.error ? `<p class="notice">${d.stale ? "Showing saved copy. " : ""}Could not load the sheet: ${esc(d.error)}</p>` : ""}
      <div class="entries layout-${esc(section.layout || "list")}" aria-live="polite"></div>`;

    const search = $main().querySelector(".search");
    if (search) search.addEventListener("input", (e) => { state.query = e.target.value; drawEntries(section, focusId); });
    drawEntries(section, focusId);

    if (focusId && graph.nodes.has(focusId)) {
      renderRight({ keep: neighborhood([focusId], 2), focus: focusId, title: "Local graph" });
    } else {
      const own = d.rows.map((r) => r.__id).filter(Boolean);
      renderRight({ keep: neighborhood(own, 1), title: `${section.label} graph` });
    }
  }

  function drawEntries(section, focusId) {
    const d = data[section.id] || { rows: [], loading: true };
    const state = ui[section.id];
    const box = $main().querySelector(".entries");
    if (!box) return;
    if (d.loading) { box.innerHTML = `<p class="empty">Loading…</p>`; return; }
    const rows = d.rows.filter((r) => r.__id === focusId || matches(section, r, state));
    box.innerHTML = rows.length
      ? rows.map((r) => entryHTML(section, r)).join("")
      : `<p class="empty">${esc(d.rows.length ? "Nothing matches that search." : section.emptyText || "Nothing here yet.")}</p>`;
    if (focusId) {
      const el = document.getElementById("e-" + focusId.replace("/", "--"));
      if (el) { el.classList.add("is-focus"); requestAnimationFrame(() => el.scrollIntoView({ block: "center" })); }
    }
  }

  function renderHub(node) {
    const h = hubs[node.hub] || {};
    const groups = {};
    for (const id of graph.adj.get(node.id) || []) {
      const n = graph.nodes.get(id);
      if (n.section) (groups[n.section.id] ||= []).push(n);
    }
    const body = cfg.sections
      .filter((s) => groups[s.id])
      .map((s) => `<h2 class="group-title">${esc(s.label)} <span>${groups[s.id].length}</span></h2>
        <div class="entries layout-${esc(s.layout || "list")}">${groups[s.id].map((n) => entryHTML(s, n.row)).join("")}</div>`)
      .join("");
    $main().innerHTML = `
      <header class="section-head"><div>
        <p class="eyebrow">${esc(h.label || node.hub)}</p>
        <h1>${esc(node.label)}</h1>
      </div></header>
      ${body || `<p class="empty">Nothing is linked to this yet.</p>`}`;
    renderRight({ keep: neighborhood([node.id], 2), focus: node.id, title: "Local graph" });
  }

  function renderHubIndex(hubKey) {
    const h = hubs[hubKey];
    const items = [...graph.nodes.values()].filter((n) => n.hub === hubKey).sort((a, b) => a.label.localeCompare(b.label));
    $main().innerHTML = `
      <header class="section-head"><div><h1>${esc(h.label)}</h1></div></header>
      <p class="chips big">${items.map((n) => `${chip(n.id)}<span class="count">${graph.adj.get(n.id).size}</span>`).join("")}</p>`;
    renderRight({ keep: neighborhood(items.map((n) => n.id), 1), title: `${h.label} graph` });
  }

  // ---------- routing ----------

  function route() {
    const path = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [first, ...rest] = path.split("/");
    const id = rest.length ? `${first}/${rest.join("/")}` : "";
    const section = sectionById(first);
    renderNav(section ? section.id : first ? "" : "");
    if (section) {
      const n = id && graph.nodes.get(id);
      document.title = `${n ? n.label + " · " : ""}${section.label} · ${cfg.title}`;
      renderSection(section, n ? id : null);
    } else if (hubs[first] && id && graph.nodes.has(id)) {
      document.title = `${graph.nodes.get(id).label} · ${cfg.title}`;
      renderHub(graph.nodes.get(id));
    } else if (hubs[first] && !id) {
      document.title = `${hubs[first].label} · ${cfg.title}`;
      renderHubIndex(first);
    } else {
      document.title = cfg.title;
      renderHome();
    }
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".filters button[data-tag]");
    if (!btn) return;
    const first = location.hash.replace(/^#\/?/, "").split("/")[0];
    const section = sectionById(first);
    if (!section) return;
    const state = (ui[first] ||= { query: "", tag: "" });
    state.tag = state.tag === btn.dataset.tag ? "" : btn.dataset.tag;
    renderSection(section);
  });

  window.addEventListener("hashchange", () => { route(); if (!/\/./.test(location.hash.slice(2))) window.scrollTo(0, 0); });

  // ---------- start ----------

  document.getElementById("site-title").textContent = cfg.title;
  document.getElementById("footer").innerHTML = (cfg.footer || "").replace("{sheetUrl}", esc(sheetUrl));
  document.getElementById("hub-nav").innerHTML = Object.entries(hubs)
    .map(([k, h]) => `<a href="#/${esc(k)}">${esc(h.label)}</a>`).join("");
  cfg.sections.forEach((s) => { const c = cacheRead(s.id); data[s.id] = { rows: c || [], loading: !c }; });
  buildGraph();
  route();
  const refresh = () => Promise.all(cfg.sections.map(load)).then(() => { buildGraph(); route(); });
  refresh();

  // Pick up sheet edits if someone leaves the page open.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
})();
