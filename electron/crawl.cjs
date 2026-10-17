// Crawling an HTML prototype the way a person would: open it in a hidden, sandboxed window
// (no Node, no preload), let its JavaScript run, click every clickable thing, and record each
// distinct screen it reaches and which click leads where. The renderer turns the recorded
// screens into editable designs and the clicks into prototype links.
const { BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { pathToFileURL } = require("url");

const MAX_STATES = 40;
const MAX_LOADS = 320;
const TIME_LIMIT = 4 * 60 * 1000;
const SETTLE = 350;

/* ---- code run inside the page ---- */

const PAGE_HELPERS = `(() => {
  if (window.__fk) return;
  // never block on dialogs or open new windows
  window.alert = () => {};
  window.confirm = () => true;
  window.prompt = () => "";
  window.open = () => null;
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(e);
    return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0;
  };
  const strong = "a[href], button, [onclick], [role=button], [role=tab], [role=link], [role=menuitem], input[type=button], input[type=submit], summary";
  window.__fk = {
    mark() {
      document.querySelectorAll("[data-fk-c]").forEach((e) => e.removeAttribute("data-fk-c"));
      const out = [];
      for (const e of document.querySelectorAll("body *")) {
        if (/^(SCRIPT|STYLE|HTML|BODY|HEAD|svg|path)$/i.test(e.tagName)) continue;
        const isStrong = e.matches(strong);
        if (!isStrong && getComputedStyle(e).cursor !== "pointer") continue;
        if (!vis(e)) continue;
        // pointer cursors are inherited: only the outermost element of a clickable counts
        const up = e.parentElement && e.parentElement.closest("[data-fk-c]");
        if (up && !isStrong) continue;
        if (e.matches("a[href^='http'], a[href^='mailto:'], a[href^='tel:']")) continue;
        // only what a person could actually click: not covered by a popup or overlay
        const r = e.getBoundingClientRect();
        const cx = r.left + Math.min(r.width / 2, 20), cy = r.top + r.height / 2;
        if (cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight) {
          const top = document.elementFromPoint(cx, cy);
          if (top && top !== e && !e.contains(top) && !top.contains(e)) continue;
        }
        const i = out.length;
        e.setAttribute("data-fk-c", String(i));
        const text = (e.innerText || e.getAttribute("aria-label") || e.getAttribute("title") || "").replace(/\\s+/g, " ").trim().slice(0, 60);
        out.push({ i, text, sig: [e.tagName, text, e.getAttribute("onclick") || "", e.getAttribute("href") || "", e.getAttribute("data-target") || ""].join("|") });
      }
      return out;
    },
    signature() {
      const lines = (document.body ? document.body.innerText : "").split(/\\n+/).map((l) => l.trim()).filter(Boolean);
      let overlays = 0;
      for (const e of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(e);
        if ((cs.position === "fixed" || cs.position === "absolute") && parseInt(cs.zIndex || "0", 10) >= 10 && vis(e)) {
          const r = e.getBoundingClientRect();
          if (r.width * r.height > innerWidth * innerHeight * 0.15) overlays++;
        }
      }
      // the screen's name: the heading of the open popup if there is one, else the first visible heading
      const heads = Array.from(document.querySelectorAll("h1, h2, h3, h4, [class*=title], header b, header strong, [class*=bar] b, [class*=header] b, nav b")).filter(vis);
      const pop = Array.from(document.querySelectorAll("body *")).reverse().find((e) => {
        const cs = getComputedStyle(e);
        return (cs.position === "fixed" || e.tagName === "DIALOG") && parseInt(cs.zIndex || "0", 10) >= 10 && vis(e);
      });
      let h = (pop && heads.find((x) => pop.contains(x))) || heads[0];
      if (!h) {
        // no heading tags: the biggest, boldest text near the top
        let best = 0;
        for (const e of document.querySelectorAll("body *")) {
          if (!Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 1) || !vis(e)) continue;
          const r = e.getBoundingClientRect();
          if (r.top > innerHeight * 0.35) continue;
          const cs = getComputedStyle(e);
          const score = parseFloat(cs.fontSize) * (parseInt(cs.fontWeight, 10) >= 600 ? 1.4 : 1) - r.top / 100;
          if (score > best) (best = score), (h = e);
        }
      }
      // the layout without the words: same skeleton + mostly the same text = the same screen with other data
      const skel = [];
      for (const e of document.querySelectorAll("body *")) {
        if (skel.length > 600) break;
        if (/^(SCRIPT|STYLE)$/.test(e.tagName) || !vis(e)) continue;
        skel.push(e.tagName + "." + ((e.getAttribute("class") || "").split(/\\s+/)[0] || ""));
      }
      return { file: decodeURIComponent(location.pathname.split("/").pop()), lines, overlays, skel: skel.join(" "), title: ((h && h.innerText) || document.title || "").replace(/\\s+/g, " ").trim().slice(0, 40) };
    },
    /** find a clickable again by what it is (not where it is) and click it */
    clickSig(sig, nth) {
      const hit = this.mark().find((o) => o.sig === sig && o.nth === nth);
      return hit ? this.click(hit.i) : false;
    },
    click(i) {
      const e = document.querySelector('[data-fk-c="' + i + '"]');
      if (!e) return false;
      const r = e.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
      e.dispatchEvent(new PointerEvent("pointerdown", o));
      e.dispatchEvent(new MouseEvent("mousedown", o));
      e.dispatchEvent(new PointerEvent("pointerup", o));
      e.dispatchEvent(new MouseEvent("mouseup", o));
      e.click();
      return true;
    },
    snapshot() {
      // CSS added through the CSSOM (CSS-in-JS) is not in the markup: write it back as text
      const css = [];
      for (const s of document.styleSheets) {
        try {
          const rules = Array.from(s.cssRules).map((r) => r.cssText).join("\\n");
          const node = s.ownerNode;
          if (node && node.tagName === "STYLE" && node.textContent.trim().length >= rules.length * 0.9) continue;
          css.push(rules);
          if (node) node.setAttribute("data-fk-drop", "");
        } catch (e) {}
      }
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll("script, [data-fk-drop]").forEach((e) => e.remove());
      document.querySelectorAll("[data-fk-drop]").forEach((e) => e.removeAttribute("data-fk-drop"));
      // keep what people typed into fields
      const live = document.querySelectorAll("input, textarea, select");
      const copies = clone.querySelectorAll("input, textarea, select");
      live.forEach((e, k) => {
        const c = copies[k];
        if (!c) return;
        if (e.type === "checkbox" || e.type === "radio") e.checked ? c.setAttribute("checked", "") : c.removeAttribute("checked");
        else if (e.tagName === "TEXTAREA") c.textContent = e.value;
        else if (e.tagName !== "SELECT") c.setAttribute("value", e.value);
      });
      const head = clone.querySelector("head") || clone;
      if (css.length) {
        const st = document.createElement("style");
        st.textContent = css.join("\\n");
        head.appendChild(st);
      }
      return "<!doctype html>" + clone.outerHTML;
    },
  };
})()`;

/* ---- comparing screens ---- */

function similar(a, b) {
  if (a.file !== b.file || a.overlays !== b.overlays) return false;
  const A = new Set(a.lines), B = new Set(b.lines);
  if (!A.size && !B.size) return true;
  let both = 0;
  for (const l of A) if (B.has(l)) both++;
  const j = both / (A.size + B.size - both);
  // nearly the same words, or the same layout showing another record (another tyre, another order)
  return j >= 0.88 || (a.skel === b.skel && j >= 0.35);
}

/* ---- the crawl ---- */

async function crawl(files, opts, onProgress) {
  const width = opts.width || 390;
  const height = opts.width < 800 ? 844 : 900;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "freakma-crawl-"));
  for (const f of files) {
    const p = path.join(dir, f.name.replace(/\\/g, "/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, f.html, "utf8");
  }
  const entry = path.join(dir, files[0].name);
  const started = Date.now();
  let loads = 0;

  const w = new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false },
  });
  w.webContents.setAudioMuted(true);
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  // the prototype may move between its own files, never off to other places
  w.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(pathToFileURL(dir).href)) e.preventDefault();
  });
  const js = (code) => w.webContents.executeJavaScript(code, true);
  const settle = (ms = SETTLE) => new Promise((r) => setTimeout(r, ms));
  const waitLoad = () =>
    new Promise((resolve) => {
      const done = () => (clearTimeout(t), resolve());
      const t = setTimeout(done, 8000);
      w.webContents.once("did-finish-load", done);
    });
  const open = async (file = entry) => {
    loads++;
    const p = waitLoad();
    w.loadFile(file).catch(() => {});
    await p;
    await settle(500);
    await js(PAGE_HELPERS);
  };
  /** click, following a page change if the click navigates to another file */
  const clickAndWait = async (c) => {
    let navigated = false;
    const onNav = () => (navigated = true);
    w.webContents.once("did-start-navigation", onNav);
    const ok = await js(`window.__fk.clickSig(${JSON.stringify(c.sig)}, ${c.nth})`).catch(() => false);
    await settle();
    w.webContents.removeListener("did-start-navigation", onNav);
    if (navigated) {
      await new Promise((r) => (w.webContents.isLoading() ? w.webContents.once("did-finish-load", r) : r()));
      await settle(400);
      await js(PAGE_HELPERS);
    }
    return ok;
  };
  const replay = async (route) => {
    await open();
    for (const step of route) if (!(await clickAndWait(step))) return false;
    return true;
  };

  const states = [];
  const links = [];
  const knownTargets = new Map(); // clickable signature with an explicit target → state index
  const capture = async (route) => {
    const sig = await js("window.__fk.signature()");
    const clickables = await js("window.__fk.mark()");
    const html = await js("window.__fk.snapshot()");
    states.push({ key: "s" + states.length, route, sig, clickables, html, name: sig.title || sig.file });
    onProgress?.(`Found ${states.length} screen${states.length > 1 ? "s" : ""}…`);
    return states.length - 1;
  };
  const stateLike = (sig) => states.findIndex((s) => similar(s.sig, sig));

  try {
    await open();
    await capture([]);
    for (let si = 0; si < states.length; si++) {
      const s = states[si];
      let fresh = false; // is the window currently showing state si, untouched?
      for (const c of s.clickables) {
        if (Date.now() - started > TIME_LIMIT || loads > MAX_LOADS) break;
        const explicit = /\|[^|]*\(['"`]|\|#[\w-]|\.html?/i.test(c.sig);
        if (explicit && knownTargets.has(c.sig)) {
          const t = knownTargets.get(c.sig);
          if (t !== si) links.push({ from: si, click: c.i, to: t });
          continue;
        }
        if (!fresh && !(await replay(s.route))) break;
        fresh = true;
        if (!(await clickAndWait(c))) continue;
        const sig = await js("window.__fk.signature()").catch(() => null);
        if (!sig || similar(sig, s.sig)) {
          // nothing that looks like a new screen; keep going from here (cheap), but re-mark
          await js(PAGE_HELPERS);
          continue;
        }
        fresh = false; // we moved away: the next click needs a replay
        let t = stateLike(sig);
        if (t < 0 && states.length < MAX_STATES) t = await capture([...s.route, { sig: c.sig, nth: c.nth }]);
        if (t >= 0 && t !== si) {
          links.push({ from: si, click: c.i, to: t });
          if (explicit) knownTargets.set(c.sig, t);
        }
        onProgress?.(`Tried ${c.text ? `“${c.text.slice(0, 24)}”` : "a click"} on “${s.name}” · ${states.length} screens so far`);
      }
    }
  } finally {
    w.destroy();
  }
  return {
    base: pathToFileURL(dir).href + "/",
    states: states.map((s) => ({ key: s.key, name: s.name, file: s.sig.file, html: s.html, overlay: s.sig.overlays > 0 })),
    links,
    timedOut: Date.now() - started > TIME_LIMIT || loads > MAX_LOADS,
  };
}

module.exports = { crawl };
