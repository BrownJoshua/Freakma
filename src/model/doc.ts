import type { Doc, Fragment, Layout, Node, Page } from "./types";
import { THEMES, cloneTheme } from "./theme";

let counter = 0;
export const uid = (prefix = "n") => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const DEVICES: Record<string, { label: string; w: number; h: number; hMode: "fixed" | "hug" }> = {
  desktop: { label: "Desktop · 1440", w: 1440, h: 900, hMode: "hug" },
  laptop: { label: "Laptop · 1280", w: 1280, h: 800, hMode: "hug" },
  tablet: { label: "Tablet · 834", w: 834, h: 1194, hMode: "fixed" },
  iphone: { label: "iPhone · 390", w: 390, h: 844, hMode: "fixed" },
  android: { label: "Android · 412", w: 412, h: 915, hMode: "fixed" },
};

export const defaultLayout = (mode: Layout["mode"] = "column", gap = 16, pad = 0): Layout => ({
  mode, gap, padding: [pad, pad, pad, pad], align: "start", justify: "start", wrap: false, columns: 3,
});

export function newDoc(name = "Untitled design"): Doc {
  const page: Page = { id: uid("p"), name: "Page 1", frames: [] };
  const doc: Doc = { app: "freakma", version: 1, name, theme: cloneTheme(THEMES[0]), pages: [page], nodes: {}, components: [] };
  return doc;
}

export function makeFrame(doc: Doc, page: Page, device: string, x: number, y: number, name?: string): Node {
  const d = DEVICES[device] ?? DEVICES.desktop;
  const n: Node = {
    id: uid("f"), type: "frame", name: name ?? d.label.split(" ·")[0], children: [],
    x, y, w: d.w, h: d.h, wMode: "fixed", hMode: d.hMode,
    layout: defaultLayout("column", 0, 0), fill: "$background", clip: true, device,
  };
  doc.nodes[n.id] = n;
  page.frames.push(n.id);
  return n;
}

/** where to put a new frame: to the right of everything on the page */
export function nextFramePosition(doc: Doc, page: Page): { x: number; y: number } {
  let x = 0;
  for (const id of page.frames) {
    const f = doc.nodes[id];
    if (f) x = Math.max(x, (f.x ?? 0) + f.w + 120);
  }
  return { x, y: 0 };
}

export function parentOf(doc: Doc, id: string): Node | null {
  for (const n of Object.values(doc.nodes)) if (n.children.includes(id)) return n;
  return null;
}

export function pageOf(doc: Doc, frameId: string): Page | undefined {
  return doc.pages.find((p) => p.frames.includes(frameId));
}

/** the top-level frame a node lives in */
export function frameOf(doc: Doc, id: string): Node | null {
  let cur: Node | null = doc.nodes[id] ?? null;
  while (cur) {
    const p = parentOf(doc, cur.id);
    if (!p) return cur.type === "frame" ? cur : null;
    cur = p;
  }
  return null;
}

/** root-to-node chain of ids */
export function pathTo(doc: Doc, id: string): string[] {
  const out: string[] = [];
  let cur: Node | null = doc.nodes[id] ?? null;
  while (cur) {
    out.unshift(cur.id);
    cur = parentOf(doc, cur.id);
  }
  return out;
}

export function isDescendant(doc: Doc, id: string, ancestor: string): boolean {
  return pathTo(doc, id).includes(ancestor);
}

export const isContainer = (n?: Node | null) => !!n && !!n.layout && (n.type === "box" || n.type === "frame");

/** detach a subtree as a standalone fragment (deep copy, same ids) */
export function extract(doc: Doc, id: string): Fragment {
  const nodes: Record<string, Node> = {};
  const walk = (nid: string) => {
    const n = doc.nodes[nid];
    if (!n) return;
    nodes[nid] = JSON.parse(JSON.stringify(n));
    n.children.forEach(walk);
  };
  walk(id);
  return { root: id, nodes };
}

/** copy of a fragment with fresh ids */
export function reId(frag: Fragment): Fragment {
  const map: Record<string, string> = {};
  for (const id of Object.keys(frag.nodes)) map[id] = uid();
  const nodes: Record<string, Node> = {};
  for (const [id, n] of Object.entries(frag.nodes)) {
    const c: Node = JSON.parse(JSON.stringify(n));
    c.id = map[id];
    c.children = c.children.filter((k) => map[k]).map((k) => map[k]);
    nodes[c.id] = c;
  }
  return { root: map[frag.root], nodes };
}

/** put a fragment into the doc under a parent at an index; returns the new root id */
export function insertFragment(doc: Doc, frag: Fragment, parentId: string, index?: number): string {
  const f = reId(frag);
  Object.assign(doc.nodes, f.nodes);
  const root = doc.nodes[f.root];
  delete root.x;
  delete root.y;
  const parent = doc.nodes[parentId];
  const i = index === undefined ? parent.children.length : Math.max(0, Math.min(index, parent.children.length));
  parent.children.splice(i, 0, f.root);
  return f.root;
}

export function removeNode(doc: Doc, id: string) {
  const n = doc.nodes[id];
  if (!n) return;
  const p = parentOf(doc, id);
  if (p) p.children = p.children.filter((c) => c !== id);
  for (const page of doc.pages) page.frames = page.frames.filter((f) => f !== id);
  // links that pointed at a deleted frame are dropped
  if (n.type === "frame") for (const m of Object.values(doc.nodes)) if (m.link === id) delete m.link;
  const drop = (nid: string) => {
    const m = doc.nodes[nid];
    if (!m) return;
    m.children.forEach(drop);
    delete doc.nodes[nid];
  };
  drop(id);
}

/** move an existing node to a new parent/index; refuses to move a node into itself */
export function moveNode(doc: Doc, id: string, parentId: string, index: number): boolean {
  if (id === parentId || isDescendant(doc, parentId, id)) return false;
  const old = parentOf(doc, id);
  if (!old) return false;
  const from = old.children.indexOf(id);
  old.children.splice(from, 1);
  let i = index;
  if (old.id === parentId && from < index) i -= 1;
  const p = doc.nodes[parentId];
  p.children.splice(Math.max(0, Math.min(i, p.children.length)), 0, id);
  return true;
}

export function duplicate(doc: Doc, id: string): string | null {
  const n = doc.nodes[id];
  if (!n) return null;
  if (n.type === "frame") {
    const page = pageOf(doc, id);
    if (!page) return null;
    const f = reId(extract(doc, id));
    Object.assign(doc.nodes, f.nodes);
    const root = doc.nodes[f.root];
    root.x = (n.x ?? 0) + n.w + 120;
    root.y = n.y ?? 0;
    root.name = n.name + " copy";
    page.frames.push(root.id);
    return root.id;
  }
  const p = parentOf(doc, id);
  if (!p) return null;
  return insertFragment(doc, extract(doc, id), p.id, p.children.indexOf(id) + 1);
}

/** wrap nodes (same parent) into a new auto-layout box */
export function wrap(doc: Doc, ids: string[], mode: Layout["mode"] = "column"): string | null {
  if (!ids.length) return null;
  const p = parentOf(doc, ids[0]);
  if (!p || ids.some((id) => parentOf(doc, id)?.id !== p.id)) return null;
  const ordered = p.children.filter((c) => ids.includes(c));
  const at = p.children.indexOf(ordered[0]);
  const box: Node = { id: uid(), type: "box", name: "Stack", children: ordered, w: 100, h: 100, wMode: "fill", hMode: "hug", layout: defaultLayout(mode, 12, 0) };
  doc.nodes[box.id] = box;
  p.children = p.children.filter((c) => !ids.includes(c));
  p.children.splice(at, 0, box.id);
  return box.id;
}

export function allFrames(doc: Doc): Node[] {
  return doc.pages.flatMap((p) => p.frames.map((id) => doc.nodes[id]).filter(Boolean));
}

/** make an old or hand-edited file safe to use */
export function normalize(raw: unknown): Doc {
  const d = raw as Doc;
  if (!d || typeof d !== "object" || !d.nodes || !Array.isArray(d.pages)) throw new Error("Not a Freakma design file");
  const doc: Doc = { ...newDoc(d.name || "Untitled design"), ...d, app: "freakma", version: 1 };
  if (!doc.pages.length) doc.pages = [{ id: uid("p"), name: "Page 1", frames: [] }];
  doc.components = doc.components ?? [];
  for (const [id, n] of Object.entries(doc.nodes)) {
    n.id = id;
    n.children = (n.children ?? []).filter((c) => doc.nodes[c]);
    n.wMode = n.wMode ?? "fixed";
    n.hMode = n.hMode ?? "fixed";
    n.w = n.w ?? 100;
    n.h = n.h ?? 40;
    n.name = n.name ?? n.type;
  }
  for (const p of doc.pages) p.frames = p.frames.filter((f) => doc.nodes[f]);
  return doc;
}
