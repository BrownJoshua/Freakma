/* Reference library: images, website captures, saved designs, HTML snippets and links
 * collected while looking for ideas. It is shared by every project on this computer
 * (desktop: a folder in the app's data, browser: IndexedDB), and anything in it can be
 * placed on a screen, traced over, converted into an editable design, mined for a
 * colour palette, or handed to Claude Code to recreate. */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { commit, getState, select, setState, toast, useStore } from "../model/store";
import type { DropHint } from "../model/store";
import { extract, frameOf, insertFragment, makeFrame, uid } from "../model/doc";
import type { Fragment, Node, Theme } from "../model/types";
import { focusNode, placeAt } from "../model/actions";
import { bridge, isDesktop } from "../platform";
import type { RefMeta } from "../platform";
import { importHtml } from "../import/apply";
import { panelPointerDown } from "./dragState";
import { Preview } from "./LeftPanel";
import { Ico } from "./controls";

/* ================= storage ================= */

const DB = "freakma-refs";
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("meta", { keyPath: "id" });
      r.result.createObjectStore("data");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(store: "meta" | "data", mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req ? req.result : (undefined as T));
    t.onerror = () => rej(t.error);
  });
}

const store = {
  async list(): Promise<RefMeta[]> {
    if (bridge) return bridge.refsList();
    const all = await tx<RefMeta[]>("meta", "readonly", (s) => s.getAll());
    return all.sort((a, b) => b.created - a.created);
  },
  async add(meta: RefMeta, data: string) {
    if (bridge) return bridge.refsAdd(meta, data);
    await tx("data", "readwrite", (s) => void s.put(data, meta.id));
    await tx("meta", "readwrite", (s) => void s.put(meta));
    return meta;
  },
  async update(id: string, patch: Partial<RefMeta>) {
    if (bridge) return bridge.refsUpdate(id, patch);
    const cur = refs.find((r) => r.id === id);
    if (cur) await tx("meta", "readwrite", (s) => void s.put({ ...cur, ...patch, id }));
  },
  async remove(id: string) {
    if (bridge) return bridge.refsDelete(id);
    await tx("meta", "readwrite", (s) => void s.delete(id));
    await tx("data", "readwrite", (s) => void s.delete(id));
  },
  async data(id: string): Promise<string | null> {
    if (bridge) return bridge.refsData(id);
    return (await tx<string | undefined>("data", "readonly", (s) => s.get(id))) ?? null;
  },
};

let refs: RefMeta[] = [];
let loaded = false;
const subs = new Set<() => void>();
const publish = (next: RefMeta[]) => {
  refs = next;
  subs.forEach((f) => f());
};
async function refresh() {
  try {
    publish(await store.list());
  } catch (e) {
    toast(`Could not open the reference library: ${(e as Error).message}`);
  }
  loaded = true;
}
function useRefs() {
  useEffect(() => void (!loaded && refresh()), []);
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => refs,
  );
}

/* ================= images: thumbnails + palette ================= */

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("That file is not an image this app can read"));
    i.src = src;
  });

/** small JPEG for the grid; very tall captures show their top */
async function thumbOf(src: string) {
  const img = await loadImage(src);
  const W = 360;
  const s = Math.min(1, W / img.width);
  const w = Math.round(img.width * s), h = Math.round(Math.min(img.height * s, w * 1.4));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  g.drawImage(img, 0, 0, img.width * s, img.height * s);
  return { thumb: c.toDataURL("image/jpeg", 0.8), w: img.width, h: img.height, palette: paletteOf(g, w, h) };
}

const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex: string) => {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const sat = (hex: string) => {
  const [r, g, b] = rgbOf(hex);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};
const dist = (a: string, b: string) => {
  const x = rgbOf(a), y = rgbOf(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
export const mix = (a: string, b: string, t: number) => {
  const x = rgbOf(a), y = rgbOf(b);
  return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
};

/** the most-used distinct colours, by bucketing pixels into a 4-bit-per-channel grid */
function paletteOf(g: CanvasRenderingContext2D, w: number, h: number): string[] {
  const px = g.getImageData(0, 0, w, h).data;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < px.length; i += 16) {
    if (px[i + 3] < 128) continue;
    const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    b.n++;
    b.r += px[i];
    b.g += px[i + 1];
    b.b += px[i + 2];
    buckets.set(key, b);
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n).map((b) => toHex(b.r / b.n, b.g / b.n, b.b / b.n));
  const out: string[] = [];
  for (const c of sorted) {
    if (out.every((o) => dist(o, c) > 48)) out.push(c);
    if (out.length >= 8) break;
  }
  return out;
}

/** turn a palette into a full theme: background from the lightest, text from the darkest,
 * primary from the most colourful */
export function themeFromPalette(base: Theme, palette: string[]): Theme {
  const byLum = [...palette].sort((a, b) => lum(b) - lum(a));
  const light = byLum[0], dark = byLum[byLum.length - 1];
  const primary = [...palette].sort((a, b) => sat(b) * (1 - Math.abs(lum(b) - 0.3)) - sat(a) * (1 - Math.abs(lum(a) - 0.3)))[0];
  const darkBg = lum(light) < 0.4; // a dark design: keep it dark
  const bg = darkBg ? dark : light;
  const text = darkBg ? light : lum(dark) > 0.1 ? mix(dark, "#000000", 0.5) : dark;
  const onPrimary = lum(primary) > 0.45 ? "#111111" : "#FFFFFF";
  const contrast = (lum(bg) + 0.05) / (lum(text) + 0.05);
  if (Math.max(contrast, 1 / contrast) < 4.5) {
    // the reference has no readable light/dark pair: take only its accent colour
    return { ...base, name: "From reference", colors: { ...base.colors, primary, onPrimary, primarySoft: mix(primary, base.colors.background, 0.86), onPrimarySoft: mix(primary, base.colors.text, 0.45) } };
  }
  return {
    ...base,
    name: "From reference",
    colors: {
      ...base.colors,
      primary,
      onPrimary,
      primarySoft: mix(primary, bg, 0.86),
      onPrimarySoft: mix(primary, text, 0.45),
      background: bg,
      surface: darkBg ? mix(bg, "#FFFFFF", 0.06) : "#FFFFFF",
      surfaceAlt: mix(bg, text, 0.04),
      inverse: text,
      text,
      textMuted: mix(text, bg, 0.38),
      border: mix(bg, text, 0.14),
    },
    canvas: mix(bg, "#888888", 0.15),
  };
}

/* ================= adding references ================= */

const extOf = (mime: string) => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" })[mime] ?? "png";

function meta(kind: RefMeta["kind"], name: string, ext: string, board: string, extra: Partial<RefMeta> = {}): RefMeta {
  return { id: uid("ref"), kind, name, tags: [], board, created: Date.now(), ext, ...extra };
}

async function addImageData(dataUrl: string, name: string, board: string, extra: Partial<RefMeta> = {}) {
  const info = await thumbOf(dataUrl);
  const mime = /^data:([^;]+)/.exec(dataUrl)?.[1] ?? "image/png";
  const m = await store.add(meta(extra.kind ?? "image", name, extOf(mime), board, { ...info, ...extra }), dataUrl);
  publish([m, ...refs]);
  return m;
}

export async function addImageFiles(files: File[], board = "") {
  let n = 0;
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const data = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(f);
    });
    try {
      await addImageData(data, f.name.replace(/\.[^.]+$/, ""), board);
      n++;
    } catch (e) {
      toast((e as Error).message);
    }
  }
  if (n) toast(`Added ${n} reference${n > 1 ? "s" : ""}`);
}

async function captureSite(url: string, width: number, board: string) {
  if (!bridge) throw new Error("Website capture needs the desktop app");
  const r = await bridge.captureUrl(url, width);
  const name = r.title || new URL(url).hostname;
  const shot = await addImageData(`data:image/png;base64,${r.png}`, name, board, { kind: "screenshot", url, tags: [width < 800 ? "mobile" : "desktop"] });
  const html = await store.add(meta("html", `${name} (HTML)`, "html", board, { url, thumb: shot.thumb, w: width, tags: ["page source"] }), r.html);
  publish([shot, html, ...refs.filter((x) => x.id !== shot.id)]);
  return shot;
}

async function saveSelectionAsRef(board: string) {
  const s = getState();
  const id = s.selection[0];
  if (!id) throw new Error("Select something on the canvas first");
  const frag = extract(s.doc, id);
  const n = s.doc.nodes[id];
  const m = await store.add(meta("design", n.name, "json", board, { w: n.w, h: n.h, tags: [n.type === "frame" ? "screen" : "component"] }), JSON.stringify({ fragment: frag, theme: s.doc.theme }));
  publish([m, ...refs]);
  return m;
}

/* ================= using references ================= */

const designCache = new Map<string, { fragment: Fragment; theme: Theme }>();
async function designOf(id: string) {
  if (designCache.has(id)) return designCache.get(id)!;
  const raw = await store.data(id);
  if (!raw) throw new Error("That reference's file is missing");
  const d = JSON.parse(raw);
  designCache.set(id, d);
  return d as { fragment: Fragment; theme: Theme };
}

function imageNode(r: RefMeta, src: string, w: number): Node {
  const ratio = (r.h ?? 1) / Math.max(1, r.w ?? 1);
  return { id: uid("img"), type: "image", name: r.name, children: [], w: Math.round(w), h: Math.round(w * ratio), wMode: "fixed", hMode: "fixed", src, fit: "cover" };
}

/** put a reference on the canvas: into the drop target, or as a new screen */
export async function placeReference(id: string, hint: DropHint | null, at?: { x: number; y: number }) {
  const r = refs.find((x) => x.id === id);
  if (!r) return;
  try {
    if (r.kind === "link") {
      if (r.url && bridge) return toast("Capture the website first (open the link's card and press Capture)");
      return toast("Links can't be placed. Open them, or capture the page in the desktop app.");
    }
    if (r.kind === "html") {
      const html = await store.data(id);
      if (!html) throw new Error("That reference's file is missing");
      toast("Converting the page into an editable design…");
      const res = await importHtml(html, { width: r.w && r.w < 800 ? 390 : 1440, baseUrl: r.url, name: r.name.replace(/ \(HTML\)$/, "") });
      return toast(`Converted into ${res.count} layers`);
    }
    if (r.kind === "design") {
      const d = await designOf(id);
      let sel = "";
      commit((doc) => {
        const root = d.fragment.nodes[d.fragment.root];
        if (hint && root.type !== "frame") {
          sel = insertFragment(doc, d.fragment, hint.parentId, hint.index);
          placeAt(doc, sel, hint);
        } else {
          const p = doc.pages.find((x) => x.id === getState().pageId)!;
          const tmp = makeFrame(doc, p, "desktop", Math.round(at?.x ?? 0), Math.round(at?.y ?? 0));
          if (root.type === "frame") {
            // a saved screen comes back as a screen
            p.frames.pop();
            delete doc.nodes[tmp.id];
            const holder = uid("tmp");
            doc.nodes[holder] = { id: holder, type: "box", name: "", children: [], w: 0, h: 0, wMode: "fixed", hMode: "fixed" };
            sel = insertFragment(doc, d.fragment, holder);
            delete doc.nodes[holder];
            Object.assign(doc.nodes[sel], { x: Math.round(at?.x ?? 0), y: Math.round(at?.y ?? 0) });
            p.frames.push(sel);
          } else {
            tmp.name = r.name;
            tmp.layout = { ...tmp.layout!, padding: [24, 24, 24, 24] };
            insertFragment(doc, d.fragment, tmp.id);
            sel = tmp.id;
          }
        }
      });
      return select([sel]);
    }
    // image or screenshot
    const src = await store.data(id);
    if (!src) throw new Error("That reference's file is missing");
    let sel = "";
    commit((doc) => {
      if (hint) {
        const parent = doc.nodes[hint.parentId];
        const n = imageNode(r, src, Math.min(r.w ?? 480, parent?.w ?? 480, 720));
        if (!hint.at) n.wMode = "fill";
        doc.nodes[n.id] = n;
        parent.children.splice(hint.index, 0, n.id);
        placeAt(doc, n.id, hint);
        sel = n.id;
      } else {
        const p = doc.pages.find((x) => x.id === getState().pageId)!;
        const w = Math.min(r.w ?? 1440, 1440);
        const f = makeFrame(doc, p, w < 800 ? "iphone" : "desktop", Math.round(at?.x ?? 0), Math.round(at?.y ?? 0), r.name);
        const n = imageNode(r, src, w);
        Object.assign(n, { x: 0, y: 0 });
        f.w = w;
        f.h = n.h;
        f.hMode = "fixed";
        f.layout = { ...f.layout!, mode: "free" };
        doc.nodes[n.id] = n;
        f.children.push(n.id);
        sel = f.id;
      }
    });
    select([sel]);
  } catch (e) {
    toast((e as Error).message);
  }
}

/** a see-through, locked copy of the image under everything in a screen, to design on top of */
async function traceReference(r: RefMeta) {
  const s = getState();
  const frame = s.selection[0] ? frameOf(s.doc, s.selection[0]) : null;
  const target = frame ?? (s.doc.pages.find((p) => p.id === s.pageId)?.frames.map((id) => s.doc.nodes[id]).find(Boolean) ?? null);
  if (!target) return toast("Select a screen to trace on");
  const src = await store.data(r.id);
  if (!src) return toast("That reference's file is missing");
  let id = "";
  commit((doc) => {
    const n = imageNode(r, src, doc.nodes[target.id].w);
    Object.assign(n, { name: `Trace · ${r.name}`, abs: true, x: 0, y: 0, opacity: 0.4, locked: true, fit: "contain" });
    doc.nodes[n.id] = n;
    doc.nodes[target.id].children.unshift(n.id);
    id = n.id;
  });
  select([target.id]);
  setTimeout(() => focusNode(target.id), 30);
  toast("Trace layer added under everything (locked). Lower or hide it from the Layers tab.");
  return id;
}

async function recreateWithClaude(r: RefMeta) {
  const s = getState();
  if (!bridge) return toast("Recreating with Claude needs the desktop app");
  if (!s.projectDir) return toast("Save the design to a folder first (File → Save to folder) so Claude can work on it");
  const rel = await bridge.refsToProject(r.id, s.projectDir);
  const what = r.kind === "html" ? "the web page saved at" : "the reference image";
  setState({
    rightTab: "claude",
    claudeDraft:
      `Recreate ${what} ${rel} as a new screen in design.freakma.json` +
      (r.w ? ` (${r.w < 800 ? "mobile, 390 wide" : "desktop, 1440 wide"})` : "") +
      `. Look at it closely and match its layout, sections, spacing, colours and typography. ` +
      `Use auto layout (rows and columns) with the theme's colour and text-style tokens, ` +
      `real text instead of lorem ipsum, and name every layer clearly.`,
  });
}

function applyPalette(r: RefMeta) {
  if (!r.palette?.length) return;
  commit((d) => void (d.theme = themeFromPalette(d.theme, r.palette!)));
  toast("Theme colours updated from the reference — Ctrl+Z to undo");
}

/* ================= panel ================= */

const KIND_LABEL: Record<RefMeta["kind"], string> = { image: "Image", screenshot: "Website", design: "Design", html: "HTML", link: "Link" };

export function LibraryTab() {
  const list = useRefs();
  const [q, setQ] = useState("");
  const [board, setBoard] = useState("");
  const [kind, setKind] = useState<"" | RefMeta["kind"]>("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<null | "web" | "html" | "link">(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const boards = useMemo(() => [...new Set(list.map((r) => r.board).filter(Boolean))].sort(), [list]);
  const shown = list.filter(
    (r) =>
      (!board || r.board === board) &&
      (!kind || r.kind === kind) &&
      (!q || [r.name, r.url ?? "", r.board, ...r.tags].join(" ").toLowerCase().includes(q.toLowerCase())),
  );

  // paste images straight into the library while it is open
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      addImageFiles(files, board);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [board]);

  const current = open ? list.find((r) => r.id === open) : null;
  if (current) return <RefDetail r={current} boards={boards} onClose={() => setOpen(null)} />;

  return (
    <div
      className={"lib" + (over ? " over" : "")}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        addImageFiles(Array.from(e.dataTransfer.files), board);
      }}
    >
      <div className="lib-add">
        <button type="button" onClick={() => fileRef.current?.click()} title="Add images (or drop / paste them here)"><Ico name="image" size={14} />Images</button>
        <button type="button" onClick={() => setAdding(adding === "web" ? null : "web")} title="Capture a website"><Ico name="globe" size={14} />Website</button>
        <button
          type="button"
          title="Save the selected layers as a reusable reference"
          onClick={() => saveSelectionAsRef(board).then(() => toast("Saved the selection to the library"), (e) => toast(e.message))}
        >
          <Ico name="bookmark" size={14} />Selection
        </button>
        <button type="button" onClick={() => setAdding(adding === "html" ? null : "html")} title="Paste an HTML snippet"><Ico name="file" size={14} />HTML</button>
        <button type="button" onClick={() => setAdding(adding === "link" ? null : "link")} title="Save a link"><Ico name="link" size={14} />Link</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addImageFiles(Array.from(e.target.files ?? []), board);
            e.target.value = "";
          }}
        />
      </div>
      {adding && <AddForm kind={adding} board={board} onDone={() => setAdding(null)} />}

      <label className="search">
        <Ico name="search" size={14} />
        <input placeholder="Search references, tags, sites…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="lib-filters">
        <select value={board} onChange={(e) => (e.target.value === "\u0000new" ? newBoard(setBoard) : setBoard(e.target.value))} aria-label="Board">
          <option value="">All boards</option>
          {boards.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
          <option value={"\u0000new"}>+ New board…</option>
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Type">
          <option value="">All types</option>
          {(Object.keys(KIND_LABEL) as RefMeta["kind"][]).map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k]}</option>
          ))}
        </select>
      </div>

      {!list.length ? (
        <div className="lib-empty">
          <Ico name="bookmark" size={28} />
          <p>Collect references while you look for ideas: drop or paste screenshots here, capture websites, save designs you like.</p>
          <p className="hint">Then drag them onto the canvas, trace over them, pull their colours into your theme, or ask Claude to recreate them.</p>
        </div>
      ) : (
        <div className="lib-grid">
          {shown.map((r) => (
            <RefTile key={r.id} r={r} onOpen={() => setOpen(r.id)} />
          ))}
          {!shown.length && <p className="hint">Nothing matches.</p>}
        </div>
      )}
    </div>
  );
}

function newBoard(set: (b: string) => void) {
  const name = prompt("Name the new board (e.g. Dashboards, Login screens, Colours):")?.trim();
  if (name) set(name);
}

function AddForm({ kind, board, onDone }: { kind: "web" | "html" | "link"; board: string; onDone: () => void }) {
  const [url, setUrl] = useState("https://");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [width, setWidth] = useState(1440);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      if (kind === "web") {
        if (!isDesktop) {
          // browsers can't screenshot other sites: keep it as a link instead
          const m = await store.add(meta("link", name || url, "txt", board, { url }), url);
          publish([m, ...refs]);
          toast("Saved as a link. Website capture needs the desktop app.");
        } else {
          toast("Capturing the page…");
          await captureSite(url, width, board);
          toast("Captured — the screenshot and its HTML are in the library");
        }
      } else if (kind === "html") {
        if (!text.trim()) throw new Error("Paste some HTML first");
        const m = await store.add(meta("html", name || "HTML snippet", "html", board, { w: width }), text);
        publish([m, ...refs]);
      } else {
        if (!/^https?:\/\//.test(url)) throw new Error("Enter a web address starting with https://");
        const m = await store.add(meta("link", name || url.replace(/^https?:\/\//, ""), "txt", board, { url }), url);
        publish([m, ...refs]);
      }
      onDone();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="lib-form">
      {kind !== "html" && <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" autoFocus onKeyDown={(e) => e.key === "Enter" && go()} />}
      {kind === "html" && <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="<section>…</section>" rows={5} autoFocus />}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" />
      {kind !== "link" && (
        <div className="seg">
          <button type="button" className={width === 1440 ? "on" : ""} onClick={() => setWidth(1440)}>Desktop</button>
          <button type="button" className={width === 390 ? "on" : ""} onClick={() => setWidth(390)}>Mobile</button>
        </div>
      )}
      <div className="lib-form-b">
        <button type="button" onClick={onDone}>Cancel</button>
        <button type="button" className="primary" disabled={busy} onClick={go}>{busy ? "Working…" : kind === "web" ? (isDesktop ? "Capture" : "Save link") : "Save"}</button>
      </div>
    </div>
  );
}

function DesignThumb({ id }: { id: string }) {
  const [d, setD] = useState<{ fragment: Fragment; theme: Theme } | null>(designCache.get(id) ?? null);
  useEffect(() => void (!d && designOf(id).then(setD, () => {})), [id, d]);
  if (!d) return <div className="pv" />;
  const root = d.fragment.nodes[d.fragment.root];
  return <Preview frag={d.fragment} theme={d.theme} w={Math.min(root?.w || 420, 1440)} />;
}

function RefTile({ r, onOpen }: { r: RefMeta; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="tile ref"
      title={`${r.name} — drag onto the canvas, or click for options`}
      onPointerDown={(e) => (r.kind === "link" ? undefined : panelPointerDown(e, { kind: "ref", id: r.id }, r.name, onOpen))}
      onClick={(e) => (r.kind === "link" || e.detail === 0) && onOpen()}
    >
      {r.kind === "design" ? (
        <DesignThumb id={r.id} />
      ) : r.thumb ? (
        <div className="pv"><img src={r.thumb} alt="" /></div>
      ) : (
        <div className="pv ph"><Ico name={r.kind === "link" ? "link" : "file"} size={22} /><small>{r.url?.replace(/^https?:\/\//, "").slice(0, 40)}</small></div>
      )}
      <span>{r.name}</span>
      <em className={"badge k-" + r.kind}>{KIND_LABEL[r.kind]}</em>
    </button>
  );
}

function RefDetail({ r, boards, onClose }: { r: RefMeta; boards: string[]; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const projectDir = useStore((s) => s.projectDir);
  const save = (p: Partial<RefMeta>) => {
    publish(refs.map((x) => (x.id === r.id ? { ...x, ...p } : x)));
    store.update(r.id, p);
  };
  const run = async (fn: () => Promise<unknown> | unknown) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const isImg = r.kind === "image" || r.kind === "screenshot";
  return (
    <div className="ref-detail">
      <button type="button" className="back" onClick={onClose}><Ico name="arrow-left" size={14} />Library</button>
      <div className="ref-big">
        {r.kind === "design" ? <DesignThumb id={r.id} /> : r.thumb ? <img src={r.thumb} alt="" /> : <div className="pv ph"><Ico name="link" size={26} /></div>}
      </div>
      <input className="name" defaultValue={r.name} key={r.id} aria-label="Reference name" onBlur={(e) => e.target.value.trim() && save({ name: e.target.value.trim() })} />
      {r.url && (
        <a className="ref-url" href={r.url} target="_blank" rel="noreferrer">{r.url}</a>
      )}
      <div className="ref-meta">
        <span>{KIND_LABEL[r.kind]}</span>
        {r.w && r.h ? <span>{r.w} × {r.h}</span> : null}
        <span>{new Date(r.created).toLocaleDateString()}</span>
      </div>

      <label className="field">
        <span>Board</span>
        <input list="ref-boards" defaultValue={r.board} placeholder="No board" onBlur={(e) => save({ board: e.target.value.trim() })} />
        <datalist id="ref-boards">{boards.map((b) => <option key={b} value={b} />)}</datalist>
      </label>
      <label className="field">
        <span>Tags</span>
        <input defaultValue={r.tags.join(", ")} placeholder="login, dark, cards…" onBlur={(e) => save({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} />
      </label>

      {r.palette && r.palette.length > 0 && (
        <div className="ref-palette">
          <div className="sw-row">
            {r.palette.map((c) => (
              <button key={c} type="button" className="sw" style={{ background: c }} title={`${c} — click to copy`} onClick={() => navigator.clipboard?.writeText(c).then(() => toast(`Copied ${c}`))} />
            ))}
          </div>
          <button type="button" className="wide" onClick={() => applyPalette(r)}><Ico name="palette" size={14} />Use these colours as the theme</button>
        </div>
      )}

      <div className="ref-actions">
        {isImg && (
          <>
            <button type="button" className="primary" disabled={busy} onClick={() => run(() => placeReference(r.id, null, nextSpot()))}><Ico name="plus" size={14} />Place as a screen</button>
            <button type="button" disabled={busy} onClick={() => run(() => traceReference(r))}><Ico name="layers" size={14} />Trace over it (in selected screen)</button>
          </>
        )}
        {r.kind === "design" && <button type="button" className="primary" disabled={busy} onClick={() => run(() => placeReference(r.id, null, nextSpot()))}><Ico name="plus" size={14} />Insert into the design</button>}
        {r.kind === "html" && <button type="button" className="primary" disabled={busy} onClick={() => run(() => placeReference(r.id, null))}><Ico name="refresh" size={14} />Convert into an editable design</button>}
        {r.kind === "link" && r.url && (
          <>
            <button type="button" onClick={() => window.open(r.url, "_blank")}><Ico name="globe" size={14} />Open the website</button>
            {isDesktop && (
              <button type="button" className="primary" disabled={busy} onClick={() => run(async () => { toast("Capturing the page…"); await captureSite(r.url!, 1440, r.board); toast("Captured"); })}>
                <Ico name="camera" size={14} />Capture it
              </button>
            )}
          </>
        )}
        {(isImg || r.kind === "html") && (
          <button type="button" disabled={busy} title={!projectDir ? "Save the design to a folder first" : undefined} onClick={() => run(() => recreateWithClaude(r))}>
            <Ico name="sparkle" size={14} />Recreate with Claude
          </button>
        )}
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (!confirm(`Delete "${r.name}" from the reference library?`)) return;
            publish(refs.filter((x) => x.id !== r.id));
            store.remove(r.id);
            onClose();
          }}
        >
          <Ico name="trash" size={14} />Delete
        </button>
      </div>
    </div>
  );
}

/** right of every screen on the current page */
function nextSpot() {
  const s = getState();
  const p = s.doc.pages.find((x) => x.id === s.pageId);
  let x = 0;
  for (const id of p?.frames ?? []) {
    const f = s.doc.nodes[id];
    if (f) x = Math.max(x, (f.x ?? 0) + f.w + 120);
  }
  return { x, y: 0 };
}
