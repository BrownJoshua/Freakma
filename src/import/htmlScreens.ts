/* HTML prototypes → several linked screens.
 *
 * Hand-made HTML prototypes usually keep every screen in one file (hidden <div>s shown by
 * onclick="show('orders')", href="#orders", tabs, modals) or spread over several files linked
 * with href="page2.html". Scripts never run here, so instead we read the markup:
 *   1. find what each button/link points at (href, data-target, aria-controls, onclick text)
 *   2. targets hidden at first are extra screens; overlays/dialogs among them are popups
 *   3. render each screen by showing it (and hiding its sibling screens), convert it, and
 *      remember which node every clickable element became
 *   4. turn every pointer into a prototype link, so the screens come out wired together. */
import type { Fragment } from "../model/types";
import { convertMounted, mountHtml } from "./html";
import type { Mounted } from "./html";

export interface HtmlFile {
  /** path relative to the imported folder (or just the file name) */
  name: string;
  html: string;
  /** where relative links point (pages fetched from the web) */
  baseUrl?: string;
}

export interface ImportedScreen {
  key: string;
  name: string;
  kind: "page" | "screen" | "popup";
  frag: Fragment;
  height: number;
  /** the screen this one sits on (popups) */
  over?: string;
}

export interface ScreensResult {
  screens: ImportedScreen[];
  /** node in a screen's fragment → screen key it opens */
  links: { screen: string; node: string; target: string }[];
  /** clickable things we could not resolve, for the summary */
  unresolved: number;
}

const POPUP_RX = /\b(modal|popup|pop-up|dialog|overlay|sheet|drawer|lightbox|toast|snackbar|alert-box)\b/i;
const SCREENISH = ".screen, .page, .view, .step, .tab-pane, .tab-content > *, [data-screen], [data-page], [data-view], [role=tabpanel], dialog, [role=dialog], .modal, .popup, .overlay, .sheet, .drawer";
const CLOSE_RX = /^(×|✕|✖|x|close|cancel|dismiss|back|done|ok|got it)$|\b(close|dismiss|cancel)\b/i;
const SHOW_CLASSES = ["active", "show", "open", "visible", "is-active", "is-open", "is-visible", "current", "in"];

const fileKey = (name: string) => name.replace(/\\/g, "/").replace(/^\.\//, "");
const baseName = (p: string) => fileKey(p).split("/").pop()!.replace(/[?#].*$/, "");

/** everything a clickable element might point at, as raw references */
function refsOf(el: Element): string[] {
  const out: string[] = [];
  const attr = (a: string) => el.getAttribute(a);
  const href = attr("href") ?? attr("data-href") ?? attr("formaction");
  if (href && !/^(javascript:|mailto:|tel:)/i.test(href)) out.push(href);
  for (const a of ["data-target", "data-bs-target", "data-screen", "data-page", "data-view", "data-goto", "data-go", "data-open", "data-show", "data-modal", "data-tab", "aria-controls"]) {
    const v = attr(a);
    if (v) out.push(v.startsWith("#") || /\.html?\b/i.test(v) ? v : "#" + v);
  }
  // onclick="showScreen('orders')", onclick="location.href='po.html'", onclick="openModal(\"approve\")"
  for (const a of ["onclick", "onmousedown", "ontouchstart", "onsubmit", "onchange"]) {
    const v = attr(a);
    if (!v) continue;
    for (const m of v.matchAll(/["'`]([^"'`]{1,120})["'`]/g)) out.push(m[1]);
  }
  return out;
}

/** is the element (and everything above it) actually showing? */
function shown(win: Window, el: Element) {
  for (let e: Element | null = el; e && e !== el.ownerDocument.body; e = e.parentElement) {
    const cs = win.getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
}

function isPopup(win: Window, el: Element) {
  const sig = `${el.tagName} ${el.id} ${el.getAttribute("class") ?? ""} ${el.getAttribute("role") ?? ""}`;
  if (el.tagName === "DIALOG" || POPUP_RX.test(sig)) return true;
  return win.getComputedStyle(el).position === "fixed";
}

function niceName(el: Element, fallback: string) {
  const h = el.querySelector("h1, h2, h3, .title, [class*=title]");
  const t = (el.getAttribute("aria-label") || el.getAttribute("data-title") || h?.textContent || "").replace(/\s+/g, " ").trim();
  const id = el.id ? el.id.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";
  return (id || t || fallback).slice(0, 40);
}

/* -------- making a hidden screen visible (and undoing it) -------- */

type Saved = { el: Element; style: string | null; cls: string | null; hidden: boolean; open: boolean };

function remember(saved: Saved[], el: Element) {
  if (saved.some((s) => s.el === el)) return;
  saved.push({ el, style: el.getAttribute("style"), cls: el.getAttribute("class"), hidden: el.hasAttribute("hidden"), open: el.hasAttribute("open") });
}
function restore(saved: Saved[]) {
  for (const s of saved.reverse()) {
    const set = (a: string, v: string | null) => (v === null ? s.el.removeAttribute(a) : s.el.setAttribute(a, v));
    set("style", s.style);
    set("class", s.cls);
    if (s.hidden) s.el.setAttribute("hidden", "");
    if (s.open) s.el.setAttribute("open", "");
    else s.el.removeAttribute("open");
  }
  saved.length = 0;
}

function reveal(win: Window, el: Element, saved: Saved[]) {
  for (let e: Element | null = el; e && e.tagName !== "BODY" && e.tagName !== "HTML"; e = e.parentElement) {
    if (shownSelf(win, e)) continue;
    remember(saved, e);
    const h = e as HTMLElement;
    h.removeAttribute("hidden");
    if (e.tagName === "DIALOG") e.setAttribute("open", "");
    for (const c of SHOW_CLASSES) if (!h.classList.contains("hidden")) h.classList.add(c);
    h.classList.remove("hidden", "d-none", "is-hidden", "hide", "invisible", "closed");
    let cs = win.getComputedStyle(e);
    if (cs.display === "none") {
      h.style.display = "";
      cs = win.getComputedStyle(e);
      if (cs.display === "none") h.style.setProperty("display", POPUP_RX.test(h.className) ? "flex" : "block", "important");
    }
    if (cs.visibility === "hidden") h.style.setProperty("visibility", "visible", "important");
    if (parseFloat(cs.opacity) === 0) h.style.setProperty("opacity", "1", "important");
    if (/translate|scale\(0/.test(cs.transform)) h.style.setProperty("transform", "none", "important");
    if (cs.pointerEvents === "none") h.style.pointerEvents = "auto";
  }
}
function shownSelf(win: Window, e: Element) {
  const cs = win.getComputedStyle(e);
  return cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity) !== 0 && !e.hasAttribute("hidden");
}
function conceal(el: Element, saved: Saved[]) {
  remember(saved, el);
  const h = el as HTMLElement;
  for (const c of SHOW_CLASSES) h.classList.remove(c);
  h.style.setProperty("display", "none", "important");
}

/* -------- the import -------- */

interface Target {
  key: string;
  el: Element;
  kind: "screen" | "popup";
  name: string;
  /** default-visible screens to hide while this one shows */
  hide: Element[];
}

export async function htmlToScreens(files: HtmlFile[], opts: { width: number; onStatus?: (s: string) => void }): Promise<ScreensResult> {
  const screens: ImportedScreen[] = [];
  const pending: { screen: string; node: string; ref: string; file: string; inPopup: string | null; text: string }[] = [];
  const byBase = new Map(files.map((f) => [baseName(f.name).toLowerCase(), fileKey(f.name)]));
  const idsByFile = new Map<string, Map<string, string>>(); // file → element id → screen key

  for (const [fi, f] of files.entries()) {
    const fk = fileKey(f.name);
    opts.onStatus?.(`Reading ${baseName(f.name)} (${fi + 1}/${files.length})…`);
    const m = await mountHtml(f.html, { width: opts.width, baseUrl: f.baseUrl });
    try {
      const { win, doc } = m;
      // every element that someone points at, by id
      const clickables = Array.from(doc.querySelectorAll("a, button, [onclick], [data-target], [data-bs-target], [data-screen], [data-page], [data-view], [data-goto], [data-go], [data-open], [data-show], [data-modal], [data-tab], [aria-controls], [role=button], [role=tab], input[type=submit], input[type=button]"));
      const referenced = new Set<Element>();
      for (const c of clickables)
        for (const r of refsOf(c)) {
          const id = r.startsWith("#") ? r.slice(1) : /^[\w-]+$/.test(r) ? r : "";
          const t = id && doc.getElementById(id);
          if (t && t !== doc.body && !t.contains(c)) referenced.add(t);
          else if (t && t.contains(c) && !shown(win, t)) referenced.add(t);
        }
      // hidden screen-like blocks count even when nothing points at them (JS-driven navigation)
      for (const e of Array.from(doc.querySelectorAll(SCREENISH))) if (!shown(win, e) && (e.children.length || e.textContent?.trim())) referenced.add(e);

      // keep only the outermost hidden targets, and drop anchors to sections that are already on screen
      const all = [...referenced].filter((e) => !shown(win, e));
      const targets: Target[] = [];
      const ids = new Map<string, string>();
      idsByFile.set(fk, ids);
      for (const el of all) {
        if (all.some((o) => o !== el && o.contains(el) && !isPopup(win, el))) continue;
        const kind = isPopup(win, el) ? "popup" : "screen";
        const key = `${fk}#${el.id || `s${targets.length}`}`;
        // sibling screens visible by default (e.g. the first .screen) get hidden while this one shows
        const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter((c) => c && !SHOW_CLASSES.includes(c));
        const sibs = el.parentElement ? Array.from(el.parentElement.children).filter((s) => s !== el && shown(win, s)) : [];
        const hide = kind === "popup" ? [] : sibs.filter((s) => s.matches(SCREENISH) || cls.some((c) => s.classList.contains(c)) || referenced.has(s));
        targets.push({ key, el, kind, name: niceName(el, kind === "popup" ? "Popup" : "Screen"), hide });
        if (el.id) ids.set(el.id, key);
      }
      // a default-visible screen that has hidden siblings is "the first screen": name the page after it
      const firstScreen = targets.flatMap((t) => t.hide)[0];
      if (firstScreen?.id) ids.set(firstScreen.id, fk);
      // ids of visible sections still resolve (anchor links that scroll on the same page)
      for (const e of Array.from(doc.querySelectorAll("[id]"))) if (!ids.has(e.id)) ids.set(e.id, findOwner(e, targets) ?? fk);

      const pageName = firstScreen ? niceName(firstScreen, doc.title || "Home") : (files.length > 1 ? baseName(f.name).replace(/\.html?$/i, "") : "") || doc.title || "Home";
      const capture = (key: string, name: string, kind: ImportedScreen["kind"], popupOf: Element | null, over?: string) => {
        const r = convertMounted(m, name);
        screens.push({ key, name, kind, frag: r.frag, height: r.height, over });
        for (const c of clickables) {
          const node = r.byEl.get(c) ?? nearestNode(c, r.byEl);
          if (!node || !shown(win, c)) continue;
          const text = (c.textContent ?? "").replace(/\s+/g, " ").trim() || c.getAttribute("aria-label") || c.getAttribute("title") || "";
          const inPopup = popupOf && popupOf.contains(c) ? over ?? fk : null;
          const rs = refsOf(c);
          if (!rs.length && inPopup) pending.push({ screen: key, node, ref: "", file: fk, inPopup, text });
          for (const ref of rs) pending.push({ screen: key, node, ref, file: fk, inPopup, text });
        }
      };

      // the page as it first appears
      capture(fk, pageName, "page", null);
      // every hidden screen and popup
      const saved: Parameters<typeof restore>[0] = [];
      for (const [ti, t] of targets.entries()) {
        opts.onStatus?.(`${baseName(f.name)}: ${t.kind} “${t.name}” (${ti + 1}/${targets.length})…`);
        for (const h of t.hide) conceal(h, saved);
        // a popup sits on the screen it lives in, or else the screen whose button opens it
        const host = t.kind === "popup" ? hostOf(t, targets, clickables) : undefined;
        if (host) {
          for (const h of host.hide) conceal(h, saved);
          reveal(win, host.el, saved);
        }
        reveal(win, t.el, saved);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        capture(t.key, t.name, t.kind, t.kind === "popup" ? t.el : null, t.kind === "popup" ? host?.key ?? fk : undefined);
        restore(saved);
      }
    } finally {
      m.iframe.remove();
    }
  }

  // resolve every pointer to a screen
  const keys = new Set(screens.map((s) => s.key));
  const links: ScreensResult["links"] = [];
  let unresolved = 0;
  const seen = new Set<string>();
  for (const p of pending) {
    let target: string | undefined;
    const ids = idsByFile.get(p.file)!;
    if (p.ref) {
      const [path, hash] = p.ref.split("#");
      if (path && /\.html?$/i.test(path.replace(/[?].*$/, ""))) {
        const fk = byBase.get(baseName(path).toLowerCase());
        if (fk) target = (hash && idsByFile.get(fk)?.get(hash)) || fk;
      } else if (!path && hash !== undefined) target = ids.get(hash);
      else if (/^[\w-]+$/.test(p.ref)) target = ids.get(p.ref);
    }
    if (!target && p.inPopup && CLOSE_RX.test(p.text)) target = p.inPopup; // close / cancel in a popup goes back
    if (!target || !keys.has(target) || target === p.screen) {
      if (p.ref && !target && /^#?[\w-]+$|\.html?/i.test(p.ref) && !/^#$/.test(p.ref)) unresolved++;
      continue;
    }
    const k = `${p.screen}|${p.node}`;
    if (seen.has(k)) continue; // first pointer wins
    seen.add(k);
    links.push({ screen: p.screen, node: p.node, target });
  }
  return { screens, links, unresolved };
}

function hostOf(t: Target, targets: Target[], clickables: Element[]): Target | undefined {
  const inside = targets.find((o) => o.kind === "screen" && o.el.contains(t.el));
  if (inside) return inside;
  const opener = clickables.find((c) => refsOf(c).some((r) => r === "#" + t.el.id || r === t.el.id) && !t.el.contains(c));
  return opener ? targets.find((o) => o.kind === "screen" && o.el.contains(opener)) : undefined;
}

/** the hidden screen an element lives in (anchor ids inside screens) */
function findOwner(el: Element, targets: Target[]) {
  return targets.find((t) => t.el.contains(el))?.key;
}

/** a clickable's text may have become the node (e.g. <a><span>Go</span></a>): use its closest converted descendant */
function nearestNode(el: Element, byEl: Map<Element, string>) {
  for (const d of Array.from(el.querySelectorAll("*"))) {
    const n = byEl.get(d);
    if (n) return n;
  }
  return undefined;
}

export type { Mounted };
