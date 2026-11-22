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
  // Nodes: the home node, one per entry ("people/asa-isacson") and one per hub value ("country/sweden").

  const G = cfg.graph || {};
  const HOME = "home";

  function colorOf(kind) {
    if (kind === HOME) return "#2bb274";
    const s = sectionById(kind);
    return (s && s.color) || (hubs[kind] && hubs[kind].color) || "#6fbf8a";
  }

  function buildGraph() {
    const nodes = new Map();
    const links = [];
    const seen = new Set();
    const byTitle = {}; // section id -> normalized title -> node id

    nodes.set(HOME, { id: HOME, kind: HOME, label: G.rootLabel || cfg.title });

    for (const s of cfg.sections) {
      byTitle[s.id] = {};
      for (const row of (data[s.id] || { rows: [] }).rows) {
        const title = get(row, s.fields.title);
        let id = `${s.id}/${slug(title)}`;
        for (let n = 2; nodes.has(id); n++) id = `${s.id}/${slug(title)}-${n}`;
        row.__id = id;
        nodes.set(id, { id, kind: s.id, label: title, row, section: s });
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
              if (!nodes.has(id)) nodes.set(id, { id, kind: rel.hub, label: value, hub: rel.hub });
              link(row.__id, id);
            } else if (rel.section) {
              const target = (byTitle[rel.section] || {})[norm(value)];
              if (target) link(row.__id, target);
            }
          }
        }
      }
    }
    for (const n of nodes.values()) if ((G.children?.[HOME] || []).includes(n.kind)) link(HOME, n.id);

    const adj = new Map([...nodes.keys()].map((k) => [k, new Set()]));
    for (const l of links) { adj.get(l.source).add(l.target); adj.get(l.target).add(l.source); }
    graph = { nodes, links, adj };
  }

  const nodeHref = (n) => (n.id === HOME ? "#/" : `#/${n.id}`);
  const ofKinds = (id, kinds) => [...(graph.adj.get(id) || [])].filter((n) => kinds.includes(graph.nodes.get(n).kind));

  // One step of the drill-down: the item, the items one level below it, and the item(s) above it.
  function drillView(id) {
    const kind = graph.nodes.get(id).kind;
    let kids = ofKinds(id, G.children?.[kind] || []);
    if (!kids.length && G.fallback?.[kind]) kids = ofKinds(id, G.fallback[kind]);
    const ups = ofKinds(id, G.parents?.[kind] || []).filter((p) => !kids.includes(p));
    return {
      ids: [id, ...kids, ...ups],
      links: [...kids.map((k) => [id, k]), ...ups.map((p) => [p, id])],
      faded: new Set(ups),
    };
  }

  function fullView() {
    return { ids: [...graph.nodes.keys()], links: graph.links.map((l) => [l.source, l.target]) };
  }

  // ---------- graph drawing (small force layout in SVG) ----------

  function hashRand(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }

  function drawGraph(box, view, opts = {}) {
    box.innerHTML = "";
    const ids = [...new Set(view.ids)].filter((id) => graph.nodes.has(id));
    if (ids.length < 2) { box.innerHTML = `<p class="graph-empty">Nothing linked here yet.</p>`; return () => {}; }

    const W = Math.max(200, box.clientWidth || 300), H = Math.max(200, box.clientHeight || 300);
    const nodes = ids.map((id) => {
      const n = graph.nodes.get(id);
      const a = hashRand(id) * Math.PI * 2, r = 30 + hashRand(id + "r") * 120;
      return { ...n, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, deg: graph.adj.get(id).size };
    });
    const index = new Map(nodes.map((n, i) => [n.id, i]));
    const links = view.links.filter(([a, b]) => index.has(a) && index.has(b))
      .map(([a, b]) => ({ s: nodes[index.get(a)], t: nodes[index.get(b)] }));
    const nb = new Map(nodes.map((n) => [n.id, new Set()]));
    links.forEach((l) => { nb.get(l.s.id).add(l.t.id); nb.get(l.t.id).add(l.s.id); });
    const center = opts.center && nodes[index.get(opts.center)];

    const NS = "http://www.w3.org/2000/svg";
    const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
    const svg = el("svg", { viewBox: `${-W / 2} ${-H / 2} ${W} ${H}`, role: "img", "aria-label": `Graph of ${nodes.length} linked items` });
    const viewG = el("g");
    const gl = el("g", { class: "g-links" });
    const gn = el("g", { class: "g-nodes" });
    viewG.append(gl, gn);
    svg.appendChild(viewG);

    const lineEls = links.map(() => gl.appendChild(el("line")));
    const showAllLabels = nodes.length <= 40;
    const nodeEls = nodes.map((n) => {
      const g = el("g", { class: `g-node k-${n.kind}` + (n === center ? " is-center" : "") + (view.faded?.has(n.id) ? " is-faded" : "") });
      if (n.id === HOME) {
        // styled after the network's ring logo
        n.r = 15;
        g.append(el("circle", { r: 15, class: "home-halo" }), el("circle", { r: 11.5, class: "home-ring" }), el("circle", { r: 6, class: "home-core" }));
      } else {
        n.r = (n.hub ? 3.5 : 4.5) + Math.min(6, Math.sqrt(n.deg) * 1.4) + (n === center ? 2 : 0);
        g.append(el("circle", { r: n.r, fill: colorOf(n.kind) }));
      }
      const t = el("text", { y: n.r + 12 });
      t.textContent = n.label.length > 30 ? n.label.slice(0, 28) + "…" : n.label;
      if (!showAllLabels && n !== center && n.id !== HOME && n.deg < 4) g.classList.add("label-hidden");
      const title = el("title"); title.textContent = n.label;
      g.append(t, title);
      gn.appendChild(g);
      return g;
    });
    box.appendChild(svg);

    let scale = 1, tx = 0, ty = 0, userView = false;
    let alpha = 1, raf = 0, dragging = null;
    const spring = opts.full ? 90 : 85;
    function tick() {
      const k = alpha;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy || 0.01;
          if (d2 > 160000) continue;
          const f = ((opts.full ? 5200 : 2400) / d2) * k, d = Math.sqrt(d2);
          dx /= d; dy /= d;
          a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
        }
      }
      for (const l of links) {
        const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = ((d - spring) / d) * 0.06 * k;
        l.s.vx += dx * f; l.s.vy += dy * f; l.t.vx -= dx * f; l.t.vy -= dy * f;
      }
      for (const n of nodes) {
        n.vx -= n.x * 0.01 * k; n.vy -= n.y * 0.01 * k * Math.min(2, W / H);
        if (n === dragging) { n.vx = n.vy = 0; continue; }
        if (n === center) { n.x *= 0.8; n.y *= 0.8; n.vx = n.vy = 0; continue; }
        n.vx *= 0.6; n.vy *= 0.6;
        n.x += Math.max(-20, Math.min(20, n.vx)); n.y += Math.max(-20, Math.min(20, n.vy));
      }
      alpha *= 0.985;
    }
    const applyView = () => viewG.setAttribute("transform", `translate(${tx},${ty}) scale(${scale})`);
    function fit() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of nodes) { const lw = Math.min(30, n.label.length) * 3.1 + 6; x0 = Math.min(x0, n.x - lw); x1 = Math.max(x1, n.x + lw); y0 = Math.min(y0, n.y - 20); y1 = Math.max(y1, n.y + 28); }
      const s = Math.min(1.5, Math.max(0.25, Math.min(W / (x1 - x0), H / (y1 - y0))));
      scale = s; tx = -((x0 + x1) / 2) * s; ty = -((y0 + y1) / 2) * s;
      svg.classList.toggle("small", s < 0.7);
      applyView();
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
    function loop() {
      tick(); paint();
      if (alpha > 0.02 || dragging) raf = requestAnimationFrame(loop); else raf = 0;
    }
    const reheat = (a = 0.3) => { alpha = Math.max(alpha, a); if (!raf) raf = requestAnimationFrame(loop); };

    function highlight(n) {
      svg.classList.toggle("has-hover", !!n);
      nodes.forEach((m, i) => nodeEls[i].classList.toggle("is-lit", !!n && (m === n || nb.get(n.id).has(m.id))));
      links.forEach((l, i) => lineEls[i].classList.toggle("is-lit", !!n && (l.s === n || l.t === n)));
    }

    const toSvg = (ev) => {
      const r = svg.getBoundingClientRect();
      return { x: ((ev.clientX - r.left) / r.width - 0.5) * W, y: ((ev.clientY - r.top) / r.height - 0.5) * H };
    };
    let pan = null, moved = false, downNode = null, downAt = null;
    nodeEls.forEach((g, i) => {
      g.addEventListener("pointerenter", () => { if (!dragging && !pan) highlight(nodes[i]); });
      g.addEventListener("pointerleave", () => { if (!dragging) highlight(null); });
      g.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation(); downNode = nodes[i]; dragging = nodes[i]; moved = false; downAt = toSvg(ev);
        svg.setPointerCapture(ev.pointerId); highlight(nodes[i]);
      });
    });
    svg.addEventListener("pointerdown", (ev) => { const p = toSvg(ev); pan = { x: p.x - tx, y: p.y - ty }; moved = false; svg.setPointerCapture(ev.pointerId); });
    svg.addEventListener("pointermove", (ev) => {
      const p = toSvg(ev);
      if (dragging) {
        if (!moved && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 4) return;
        dragging.x = (p.x - tx) / scale; dragging.y = (p.y - ty) / scale; moved = true; userView = true; reheat(0.15);
      } else if (pan) { tx = p.x - pan.x; ty = p.y - pan.y; moved = true; userView = true; applyView(); }
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
      const p = toSvg(ev), f = Math.exp(-ev.deltaY * 0.0015), ns = Math.min(4, Math.max(0.2, scale * f));
      tx = p.x - ((p.x - tx) * ns) / scale; ty = p.y - ((p.y - ty) * ns) / scale; scale = ns;
      svg.classList.toggle("zoomed", scale > 1.3);
      svg.classList.toggle("small", scale < 0.7);
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
    document.getElementById("hub-nav").innerHTML = [
      ...Object.entries(hubs).map(([k, h]) => [k, h.label]),
      ["map", "Full map"],
    ].map(([k, l]) => `<a href="#/${esc(k)}" ${k === active ? 'aria-current="page"' : ""}>${esc(l)}</a>`).join("");
  }

  const goTo = (n) => { location.hash = nodeHref(n); };

  function renderRight(centerId, toc) {
    stopGraph();
    const right = document.getElementById("right");
    right.innerHTML = `
      <div class="graph-card">
        <a class="icon-btn graph-expand" href="#/map" aria-label="Open the full map" title="Open the full map">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
        </a>
        <div class="graph-box" id="graph-box"></div>
      </div>
      ${toc || ""}`;
    const view = graph.nodes.has(centerId) ? drillView(centerId) : drillView(HOME);
    stopGraph = drawGraph(document.getElementById("graph-box"), view, { center: graph.nodes.has(centerId) ? centerId : HOME, onClick: goTo });
  }

  function tocHTML(heads) {
    if (heads.length < 2) return "";
    return `<nav class="toc" aria-label="On this page"><p class="toc-title">On this page</p><ul>${heads
      .map((h, i) => `<li class="toc-${h.tagName.toLowerCase()}"><button type="button" data-toc="${i}">${esc(h.textContent)}</button></li>`)
      .join("")}</ul></nav>`;
  }
  function wireToc(heads) {
    const t = document.querySelector(".toc");
    if (t) t.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-toc]");
      if (b) heads[+b.dataset.toc].scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function renderHome() {
    $main().innerHTML = `
      <article class="page">
        <h1>About</h1>
        <div class="prose">${cfg.intro || ""}${(cfg.contribute || "").replace("{sheetUrl}", esc(sheetUrl))}</div>
      </article>`;
    const heads = [...$main().querySelectorAll(".prose h2, .prose h3, .prose h4")];
    renderRight(HOME, tocHTML(heads));
    wireToc(heads);
  }

  const nodeLink = (id) => { const n = graph.nodes.get(id); return n ? `<a href="${esc(nodeHref(n))}">${esc(n.label)}</a>` : ""; };

  function statusNotice(section) {
    const d = data[section.id] || {};
    if (d.loading) return `<p class="muted">Loading…</p>`;
    return d.error ? `<p class="notice">${d.stale ? "Showing a saved copy. " : ""}Could not load the sheet: ${esc(d.error)}</p>` : "";
  }

  function renderSection(section) {
    const d = data[section.id] || { rows: [] };
    const sub = section.fields.subtitle || (section.relations || []).find((r) => r.hub === "country")?.column;
    const items = d.rows
      .slice()
      .sort((a, b) => get(a, section.fields.title).localeCompare(get(b, section.fields.title)))
      .map((r) => {
        const extra = sub ? get(r, sub) : "";
        return `<li>${nodeLink(r.__id)}${extra ? `<span class="muted"> · ${esc(extra)}</span>` : ""}</li>`;
      }).join("");
    $main().innerHTML = `
      <article class="page">
        <h1>${esc(section.label)}</h1>
        ${section.description ? `<p class="lead">${esc(section.description)}</p>` : ""}
        <p class="add"><a href="${esc(addUrl(section))}" target="_blank" rel="noopener">${esc(section.addLabel || "Add to this list")} in the sheet ↗</a></p>
        ${statusNotice(section)}
        ${items ? `<ul class="index">${items}</ul>` : d.loading ? "" : `<p class="muted">${esc(section.emptyText || "Nothing here yet.")}</p>`}
      </article>`;
    renderRight(HOME);
  }

  function renderEntry(node) {
    const section = node.section, row = node.row, f = section.fields;
    const props = [];
    const prop = (label, html) => html && props.push(`<dt>${esc(label)}</dt><dd>${html}</dd>`);
    const direct = new Set();
    for (const rel of section.relations || []) {
      const values = splitList(get(row, rel.column));
      const html = values.map((v) => {
        const id = rel.hub ? `${rel.hub}/${slug(v)}` : [...graph.adj.get(node.id)].find((t) => t.startsWith(rel.section + "/") && norm(graph.nodes.get(t).label) === norm(v));
        if (id && graph.nodes.has(id)) { direct.add(id); return nodeLink(id); }
        return esc(v);
      }).join(", ");
      prop(rel.label || (rel.hub && hubs[rel.hub]?.single) || rel.column, html);
    }
    const url = safeUrl(get(row, f.url));
    const links = [url, ...splitLinks(get(row, f.links))].filter(Boolean);
    prop("Links", links.map((l) => `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(linkLabel(l))} ↗</a>`).join(", "));

    const backlinks = {};
    for (const id of graph.adj.get(node.id) || []) {
      const n = graph.nodes.get(id);
      if (!n.section || direct.has(id)) continue;
      (backlinks[n.section.label] ||= []).push(id);
    }
    const back = Object.entries(backlinks)
      .map(([label, ids]) => `<h2>${esc(label)}</h2><ul class="index">${ids.map((id) => `<li>${nodeLink(id)}</li>`).join("")}</ul>`).join("");

    const subtitle = get(row, f.subtitle), body = get(row, f.body), note = get(row, f.note);
    $main().innerHTML = `
      <article class="page">
        <p class="crumb"><a href="#/${esc(section.id)}">${esc(section.label)}</a></p>
        <h1>${esc(node.label)}</h1>
        ${subtitle ? `<p class="lead">${esc(subtitle)}</p>` : ""}
        ${props.length ? `<dl class="props">${props.join("")}</dl>` : ""}
        ${body ? `<p>${esc(body)}</p>` : ""}
        ${note ? `<p>${esc(note)}</p>` : ""}
        ${back}
      </article>`;
    renderRight(node.id);
  }

  function renderHub(node) {
    const h = hubs[node.hub] || {};
    const groups = {};
    for (const id of graph.adj.get(node.id) || []) {
      const n = graph.nodes.get(id);
      if (n.section) (groups[n.section.id] ||= []).push(id);
    }
    const body = cfg.sections.filter((s) => groups[s.id])
      .map((s) => `<h2>${esc(s.label)}</h2><ul class="index">${groups[s.id].map((id) => `<li>${nodeLink(id)}</li>`).join("")}</ul>`).join("");
    $main().innerHTML = `
      <article class="page">
        <p class="crumb"><a href="#/${esc(node.hub)}">${esc(h.label || node.hub)}</a></p>
        <h1>${esc(node.label)}</h1>
        ${body || `<p class="muted">Nothing is linked to this yet.</p>`}
      </article>`;
    renderRight(node.id);
  }

  function renderHubIndex(hubKey) {
    const h = hubs[hubKey];
    const items = [...graph.nodes.values()].filter((n) => n.hub === hubKey).sort((a, b) => a.label.localeCompare(b.label));
    $main().innerHTML = `
      <article class="page">
        <h1>${esc(h.label)}</h1>
        <ul class="index">${items.map((n) => `<li>${nodeLink(n.id)} <span class="muted">· ${graph.adj.get(n.id).size}</span></li>`).join("")}</ul>
      </article>`;
    renderRight(HOME);
  }

  function renderMap() {
    stopGraph();
    document.getElementById("right").innerHTML = "";
    $main().innerHTML = `
      <article class="page page-wide">
        <h1>Full map</h1>
        <p class="lead">Everything in the network and how it connects. Drag to move, scroll to zoom, click to open.</p>
        <div class="graph-card map"><div class="graph-box" id="map-box"></div></div>
      </article>`;
    stopGraph = drawGraph(document.getElementById("map-box"), fullView(), { center: HOME, full: true, onClick: goTo });
  }

  // ---------- search (sidebar) ----------

  function setUpSearch() {
    const input = document.getElementById("search");
    const out = document.getElementById("search-results");
    const run = () => {
      const q = norm(input.value);
      if (!q) { out.innerHTML = ""; out.hidden = true; return; }
      const words = q.split(" ");
      const hits = [...graph.nodes.values()].filter((n) => {
        if (n.id === HOME) return false;
        const hay = norm(n.label + " " + (n.row ? Object.values(n.row).join(" ") : ""));
        return words.every((w) => hay.includes(w));
      }).slice(0, 12);
      out.hidden = false;
      out.innerHTML = hits.length
        ? hits.map((n) => `<li><a href="${esc(nodeHref(n))}">${esc(n.label)}</a><span class="muted"> · ${esc(n.section ? n.section.label : hubs[n.hub]?.label || "")}</span></li>`).join("")
        : `<li class="muted">No matches</li>`;
    };
    input.addEventListener("input", run);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const a = out.querySelector("a"); if (a) { location.hash = a.getAttribute("href"); input.value = ""; run(); } }
      if (e.key === "Escape") { input.value = ""; run(); }
    });
    out.addEventListener("click", (e) => { if (e.target.closest("a")) { input.value = ""; run(); } });
  }

  // ---------- routing ----------

  function route() {
    const path = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [first, ...rest] = path.split("/");
    const id = rest.length ? `${first}/${rest.join("/")}` : "";
    const section = sectionById(first);
    renderNav(first);
    document.querySelector(".layout").classList.toggle("is-map", first === "map");
    const n = id && graph.nodes.get(id);
    if (first === "map") { document.title = `Full map · ${cfg.title}`; renderMap(); }
    else if (section && n) { document.title = `${n.label} · ${cfg.title}`; renderEntry(n); }
    else if (section) { document.title = `${section.label} · ${cfg.title}`; renderSection(section); }
    else if (hubs[first] && n) { document.title = `${n.label} · ${cfg.title}`; renderHub(n); }
    else if (hubs[first]) { document.title = `${hubs[first].label} · ${cfg.title}`; renderHubIndex(first); }
    else { document.title = cfg.title; renderHome(); }
  }

  let lastHash = location.hash;
  window.addEventListener("hashchange", () => { lastHash = location.hash; route(); window.scrollTo(0, 0); });

  // ---------- start ----------

  document.getElementById("site-title").textContent = cfg.title;
  cfg.sections.forEach((s) => { const c = cacheRead(s.id); data[s.id] = { rows: c || [], loading: !c }; });
  buildGraph();
  route();
  setUpSearch();
  const refresh = () => Promise.all(cfg.sections.map(load)).then(() => {
    const y = window.scrollY;
    buildGraph(); route();
    window.scrollTo(0, y);
  });
  refresh();

  // Pick up sheet edits if someone leaves the page open.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
})();
