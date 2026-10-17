/* Putting imported designs into the document. */
import { commit, getState, page, select, setState } from "../model/store";
import { insertFragment, nextFramePosition, uid } from "../model/doc";
import type { Doc, Fragment, Node, Page } from "../model/types";
import { focusNode, zoomToFit } from "../model/actions";
import { htmlToFragment } from "./html";
import type { ImportedPage } from "./figma";
import { htmlToScreens } from "./htmlScreens";
import type { HtmlFile, ImportedScreen, ScreensResult } from "./htmlScreens";
import { convertMounted, mountHtml } from "./html";
import { bridge } from "../platform";

const DEVICE_BY_WIDTH: Record<number, string> = { 1440: "desktop", 1280: "laptop", 834: "tablet", 390: "iphone", 412: "android" };

/** a fragment whose root is a frame → a screen on the page at x/y */
function placeFrame(doc: Doc, p: Page, frag: Fragment, x: number, y: number): string {
  // insertFragment wants a parent: use a scratch node, then lift the root out as a screen
  const tmp = uid("tmp");
  doc.nodes[tmp] = { id: tmp, type: "box", name: "", children: [], w: 0, h: 0, wMode: "fixed", hMode: "fixed" };
  const root = insertFragment(doc, frag, tmp);
  delete doc.nodes[tmp];
  const r = doc.nodes[root];
  Object.assign(r, { type: "frame", x, y });
  delete r.abs;
  p.frames.push(root);
  return root;
}

/** one new page per Figma page, keeping the screens where Figma had them */
export function addImportedPages(fileName: string, pages: ImportedPage[]) {
  const ids: string[] = [];
  let first = "";
  commit((doc) => {
    for (const ip of pages) {
      const p: Page = { id: uid("p"), name: pages.length > 1 || !fileName ? ip.name : `${fileName} · ${ip.name}`, frames: [] };
      doc.pages.push(p);
      if (!first) first = p.id;
      const minX = Math.min(...ip.frames.map((f) => f.x)), minY = Math.min(...ip.frames.map((f) => f.y));
      for (const f of ip.frames) ids.push(placeFrame(doc, p, f.frag, f.x - minX, f.y - minY));
    }
  });
  setState({ pageId: first, selection: [] });
  setTimeout(zoomToFit, 60);
  return ids.length;
}

/** HTML → a new screen to the right of the others */
export async function importHtml(html: string, opts: { width: number; baseUrl?: string; name?: string }) {
  const { frag, height, title } = await htmlToFragment(html, opts);
  const name = opts.name || title || "Imported page";
  let id = "";
  commit((doc) => {
    const p = doc.pages.find((x) => x.id === getState().pageId) ?? doc.pages[0];
    const pos = nextFramePosition(doc, p);
    id = placeFrame(doc, p, frag, pos.x, pos.y);
    const r: Node = doc.nodes[id];
    r.name = name;
    r.w = opts.width;
    r.wMode = "fixed";
    r.h = Math.max(200, height);
    r.hMode = opts.width >= 800 ? "hug" : "fixed";
    r.clip = true;
    const dev = DEVICE_BY_WIDTH[opts.width];
    if (dev) r.device = dev;
    if (!r.fill) r.fill = "#FFFFFF";
  });
  select([id]);
  setTimeout(() => focusNode(id), 60);
  return { id, count: Object.keys(frag.nodes).length };
}

export const currentPage = () => page();

/** a whole HTML prototype (one file or a folder) → wired screens on a new page */
export async function importHtmlScreens(files: HtmlFile[], opts: { width: number; pageName?: string; onStatus?: (s: string) => void }) {
  const res = await htmlToScreens(files, opts);
  return placeScreens(res, opts);
}

/** run the prototype's JavaScript (desktop): click through it and keep every screen it reaches */
export async function importCrawled(files: HtmlFile[], opts: { width: number; pageName?: string; onStatus?: (s: string) => void }) {
  if (!bridge) throw new Error("Running a prototype's scripts needs the desktop app");
  opts.onStatus?.("Opening the prototype and clicking through it…");
  const off = bridge.onCrawlProgress((t) => opts.onStatus?.(t));
  let crawl;
  try {
    crawl = await bridge.crawlHtml(files.map((f) => ({ name: f.name, html: f.html })), { width: opts.width });
  } finally {
    off();
  }
  const screens: ImportedScreen[] = [];
  const links: ScreensResult["links"] = [];
  const nodeOfClick: Record<string, string>[] = [];
  for (const [i, st] of crawl.states.entries()) {
    opts.onStatus?.(`Building screen ${i + 1} of ${crawl.states.length}…`);
    const m = await mountHtml(st.html, { width: opts.width, baseUrl: crawl.base + st.file });
    try {
      const r = convertMounted(m, st.name);
      const map: Record<string, string> = {};
      r.byEl.forEach((node, el) => {
        const c = el.getAttribute("data-fk-c");
        if (c !== null && !(c in map)) map[c] = node;
      });
      // a clickable that became text inside a bigger node: use its closest converted ancestor
      for (const el of Array.from(m.doc.querySelectorAll("[data-fk-c]"))) {
        const c = el.getAttribute("data-fk-c")!;
        if (map[c]) continue;
        for (let p: Element | null = el.parentElement; p; p = p.parentElement) if (r.byEl.has(p)) { map[c] = r.byEl.get(p)!; break; }
        if (!map[c]) for (const d of Array.from(el.querySelectorAll("*"))) if (r.byEl.has(d)) { map[c] = r.byEl.get(d)!; break; }
      }
      nodeOfClick.push(map);
      screens.push({ key: st.key, name: st.name, kind: st.overlay ? "popup" : "screen", frag: r.frag, height: r.height });
    } finally {
      m.iframe.remove();
    }
  }
  for (const l of crawl.links) {
    const node = nodeOfClick[l.from]?.[String(l.click)];
    if (node) links.push({ screen: crawl.states[l.from].key, node, target: crawl.states[l.to].key });
  }
  // de-duplicate names (Screen, Screen 2…)
  const seen: Record<string, number> = {};
  for (const s of screens) {
    const n = (seen[s.name] = (seen[s.name] ?? 0) + 1);
    if (n > 1) s.name = `${s.name} ${n}`;
  }
  const r = placeScreens({ screens, links, unresolved: 0 }, opts);
  return { ...r, timedOut: crawl.timedOut };
}

function placeScreens(res: ScreensResult, opts: { width: number; pageName?: string }) {
  const viewportH = opts.width < 800 ? 844 : 900;
  // mark links with the target's key; they become frame ids once the frames exist
  for (const l of res.links) {
    const s = res.screens.find((x) => x.key === l.screen);
    const n = s?.frag.nodes[l.node];
    if (n && !n.link) n.link = "@" + l.target;
  }
  const frameOfKey: Record<string, string> = {};
  let pageId = "";
  commit((doc) => {
    const p: Page = { id: uid("p"), name: opts.pageName || "Imported prototype", frames: [] };
    doc.pages.push(p);
    pageId = p.id;
    const gapX = 120, gapY = 200, perRow = 6;
    let x = 0, y = 0, rowH = 0, lastFile = "", col = 0;
    for (const s of res.screens) {
      const file = s.key.includes("#") ? s.key.split("#")[0] : "";
      if ((lastFile && file !== lastFile) || col === perRow) {
        // each file starts a new row; long flows wrap
        x = 0;
        y += rowH + gapY;
        rowH = 0;
        col = 0;
      }
      lastFile = file;
      const id = placeFrame(doc, p, s.frag, x, y);
      const r = doc.nodes[id];
      const tall = s.height > viewportH + 4;
      Object.assign(r, { name: s.name, w: opts.width, wMode: "fixed", clip: true, h: Math.max(viewportH, s.height), hMode: opts.width >= 800 && tall ? "hug" : "fixed" });
      const dev = DEVICE_BY_WIDTH[opts.width];
      if (dev) r.device = dev;
      frameOfKey[s.key] = id;
      x += opts.width + gapX;
      col++;
      rowH = Math.max(rowH, r.h);
    }
    for (const n of Object.values(doc.nodes)) {
      if (!n.link?.startsWith("@")) continue;
      const f = frameOfKey[n.link.slice(1)];
      if (f) n.link = f;
      else delete n.link;
    }
  });
  setState({ pageId, selection: [], rightTab: "prototype" });
  setTimeout(zoomToFit, 60);
  return { screens: res.screens.length, popups: res.screens.filter((s) => s.kind === "popup").length, links: res.links.length, unresolved: res.unresolved };
}

/* -------- reading a folder of HTML with its CSS and images -------- */

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" };

const readText = (f: File) => f.text();
const readData = (f: File) =>
  new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(f);
  });

/** resolve "../img/a.png" against "pages/index.html" */
function resolvePath(from: string, rel: string) {
  const parts = from.split("/").slice(0, -1);
  for (const seg of rel.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/** HTML files from a picked folder (or a multi-select), with their local CSS and images inlined
 * so they render without the files around them */
export async function readHtmlFolder(list: File[]): Promise<HtmlFile[]> {
  const byPath = new Map<string, File>();
  for (const f of list) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    // drop the picked folder's own name so paths are relative to it
    const p = rel.includes("/") && (f as File & { webkitRelativePath?: string }).webkitRelativePath ? rel.split("/").slice(1).join("/") : rel;
    byPath.set(p, f);
  }
  const dataCache = new Map<string, Promise<string>>();
  const asData = (p: string) => {
    const f = byPath.get(p);
    if (!f) return null;
    if (!dataCache.has(p)) dataCache.set(p, readData(f).then((d) => (MIME[p.split(".").pop()!.toLowerCase()] && d.startsWith("data:application/octet-stream") ? d.replace("application/octet-stream", MIME[p.split(".").pop()!.toLowerCase()]) : d)));
    return dataCache.get(p)!;
  };
  const local = (u: string) => !/^(https?:|data:|blob:|#|mailto:|tel:|javascript:|\/\/)/i.test(u);
  const inlineUrls = async (css: string, from: string) => {
    const out: string[] = [];
    let last = 0;
    for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      out.push(css.slice(last, m.index));
      const u = m[1];
      const d = local(u) ? await asData(resolvePath(from, u.split(/[?#]/)[0])) : null;
      out.push(d ? `url("${d}")` : m[0]);
      last = m.index! + m[0].length;
    }
    out.push(css.slice(last));
    return out.join("");
  };
  const htmlFiles = [...byPath.keys()].filter((p) => /\.html?$/i.test(p)).sort((a, b) => (/(^|\/)index\.html?$/i.test(a) ? -1 : /(^|\/)index\.html?$/i.test(b) ? 1 : a.localeCompare(b)));
  const out: HtmlFile[] = [];
  for (const p of htmlFiles) {
    let html = await readText(byPath.get(p)!);
    // <link rel="stylesheet" href="css/app.css"> → <style>…</style>
    const links = [...html.matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi)];
    for (const l of links) {
      const href = /href=["']([^"']+)["']/i.exec(l[0])?.[1];
      if (!href || !local(href)) continue;
      const cp = resolvePath(p, href.split(/[?#]/)[0]);
      const f = byPath.get(cp);
      if (!f) continue;
      html = html.replace(l[0], `<style>${await inlineUrls(await readText(f), cp)}</style>`);
    }
    // <script src="js/app.js"> → inline, so the prototype can run from anywhere
    for (const sc of [...html.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi)]) {
      if (!local(sc[2])) continue;
      const f = byPath.get(resolvePath(p, sc[2].split(/[?#]/)[0]));
      if (!f) continue;
      const code = (await readText(f)).replace(/<\/script/gi, "<\\/script");
      html = html.replace(sc[0], `<script${sc[1]}${sc[3]}>${code}</script>`);
    }
    // src="img/logo.png", poster, and url() in inline styles
    const attrs = [...html.matchAll(/\b(src|poster|href)=["']([^"']+)["']/gi)].filter((m) => m[1].toLowerCase() !== "href" || /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(m[2]));
    for (const a of attrs) {
      if (!local(a[2]) || /\.(html?|js)$/i.test(a[2])) continue;
      const d = await asData(resolvePath(p, a[2].split(/[?#]/)[0]));
      if (d) html = html.split(a[0]).join(`${a[1]}="${d}"`);
    }
    html = await inlineUrls(html, p);
    out.push({ name: p, html });
  }
  return out;
}
