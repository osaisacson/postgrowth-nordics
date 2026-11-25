/*
 * Password box shown before the site. Set or remove the password with `passwordHash`
 * in config.js.
 *
 * This is a soft gate for a static site: it hides the page until the right password is
 * typed, and remembers that on the device. It is not real security. The site's files and
 * the Google Sheet stay readable to anyone who goes looking for them.
 *
 * Loaded in <head>, before the page draws, so the site never flashes into view.
 * config.js loads later, so the check waits for DOMContentLoaded.
 */
(function () {
  "use strict";

  const KEY = "sheet-site:unlocked";
  const root = document.documentElement;
  root.classList.add("gate-locked");

  const style = document.createElement("style");
  style.textContent = `
    html.gate-locked body > :not(.gate) { display: none !important; }
    .gate { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
      padding: 24px 16px; background: var(--bg, #fff); color: var(--text, #222); font: 15px/1.6 var(--font, system-ui, sans-serif); }
    .gate form { width: 100%; max-width: 340px; }
    .gate h1 { font-family: var(--serif, Georgia, serif); font-weight: 400; font-size: 1.4rem; line-height: 1.25; margin: 0 0 6px; }
    .gate p { margin: 0 0 20px; color: var(--muted, #6b6b6b); }
    .gate label { display: block; font-size: .9rem; margin-bottom: 6px; }
    .gate .row { display: flex; gap: 8px; }
    .gate input { flex: 1; min-width: 0; padding: 10px 12px; font: inherit; font-size: 16px; color: inherit; background: var(--bg, #fff);
      border: 1px solid var(--line, #e7e7e7); border-radius: 8px; }
    .gate input:focus { outline: none; border-color: var(--accent, #2b8a5a); }
    .gate button { padding: 10px 16px; font: inherit; color: #fff; background: var(--accent, #2b8a5a); border: 0; border-radius: 8px; cursor: pointer; }
    .gate .err { min-height: 1.6em; margin: 8px 0 0; color: #b3261e; font-size: .9rem; }
  `;
  document.head.appendChild(style);

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function remember(h) { try { localStorage.setItem(KEY, h); } catch (e) { /* private mode: ask again next visit */ } }
  function unlock() {
    root.classList.remove("gate-locked");
    const g = document.querySelector(".gate");
    if (g) g.remove();
  }

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function showGate(expected, title) {
    const gate = document.createElement("div");
    gate.className = "gate";
    gate.innerHTML = `
      <form novalidate>
        <h1></h1>
        <p>This site isn't public yet. Enter the password to continue.</p>
        <label for="gate-pw">Password</label>
        <div class="row">
          <input id="gate-pw" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" required>
          <button type="submit">Enter</button>
        </div>
        <p class="err" role="alert" aria-live="polite"></p>
      </form>`;
    gate.querySelector("h1").textContent = title;
    document.body.appendChild(gate);
    const form = gate.querySelector("form");
    const input = gate.querySelector("input");
    const err = gate.querySelector(".err");
    input.focus();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const h = await sha256(input.value.trim());
      if (h === expected) { remember(h); unlock(); }
      else { err.textContent = "That password isn't right. Try again."; input.select(); }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const cfg = window.SITE_CONFIG || {};
    const expected = String(cfg.passwordHash || "").trim().toLowerCase();
    if (!expected || stored() === expected) unlock();
    else showGate(expected, cfg.title || document.title);
  });
})();
