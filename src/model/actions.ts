import type { Doc, Fragment, Node } from "./types";
import {
  DEVICES, duplicate, extract, frameOf, insertFragment, isContainer, makeFrame, moveNode, nextFramePosition, normalize, pageOf, parentOf, removeNode, reId, uid, wrap,
} from "./doc";
import { commit, getClipboard, getState, insertionParent, loadDoc, page, select, setClipboard, setDiskSaver, setState, toast, flushSave } from "./store";
import type { PartDef } from "../parts/library";
import { PROJECT_FILE, bridge } from "../platform";
import { PROJECT_GUIDE } from "../claude/projectGuide";

/* ---------------- frames ---------------- */

export function addFrame(device: string) {
  let id = "";
  commit((doc) => {
    const p = doc.pages.find((x) => x.id === getState().pageId) ?? doc.pages[0];
    const pos = nextFramePosition(doc, p);
    id = makeFrame(doc, p, device, pos.x, pos.y).id;
  });
  select([id]);
  focusNode(id);
}

/** scroll the canvas so a node is in view */
export function focusNode(id: string) {
  const s = getState();
  const f = frameOf(s.doc, id) ?? s.doc.nodes[id];
  if (!f || f.x === undefined) return;
  const stage = document.querySelector(".stage") as HTMLElement | null;
  const W = stage?.clientWidth ?? 1200;
  const H = stage?.clientHeight ?? 800;
  const zoom = Math.min(1, Math.max(0.1, Math.min((W - 120) / f.w, (H - 120) / Math.max(f.h, 400))));
  setState({ view: { zoom, x: W / 2 - (f.x + f.w / 2) * zoom, y: 60 - (f.y ?? 0) * zoom } });
}

export function zoomToFit() {
  const s = getState();
  const frames = page(s).frames.map((id) => s.doc.nodes[id]).filter(Boolean);
  const stage = document.querySelector(".stage") as HTMLElement | null;
  if (!frames.length || !stage) return setState({ view: { x: 80, y: 80, zoom: 0.5 } });
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const f of frames) {
    const el = stage.querySelector(`[data-node-id="${f.id}"]`) as HTMLElement | null;
    const h = el ? el.offsetHeight : f.h;
    x1 = Math.min(x1, f.x ?? 0);
    y1 = Math.min(y1, f.y ?? 0);
    x2 = Math.max(x2, (f.x ?? 0) + f.w);
    y2 = Math.max(y2, (f.y ?? 0) + h);
  }
  const W = stage.clientWidth, H = stage.clientHeight;
  const zoom = Math.max(0.05, Math.min(1, (W - 160) / (x2 - x1), (H - 160) / (y2 - y1)));
  setState({ view: { zoom, x: (W - (x2 - x1) * zoom) / 2 - x1 * zoom, y: (H - (y2 - y1) * zoom) / 2 - y1 * zoom } });
}

/* ---------------- parts ---------------- */

/** a part that becomes a whole screen, or goes into a new frame on empty canvas */
function partInNewFrame(doc: Doc, part: PartDef, frag: Fragment, at?: { x: number; y: number }): { frame: string; root: string } {
  const p = doc.pages.find((x) => x.id === getState().pageId) ?? doc.pages[0];
  const device = part.screen ?? (part.previewW > 600 ? "desktop" : "iphone");
  const pos = at ?? nextFramePosition(doc, p);
  const f = makeFrame(doc, p, device, Math.round(pos.x), Math.round(pos.y), part.screen ? part.name.split(" ·")[0] : undefined);
  if (!part.screen) f.layout = { ...f.layout!, gap: 16, padding: [24, 24, 24, 24] };
  const root = insertFragment(doc, frag, f.id);
  if (part.screen) {
    doc.nodes[root].wMode = "fill";
    doc.nodes[root].hMode = "fill";
    doc.nodes[root].part = false;
    f.hMode = "fixed";
  }
  return { frame: f.id, root };
}

export function insertPart(part: PartDef, target?: { parentId: string; index: number } | null, at?: { x: number; y: number }) {
  const frag = part.make();
  let sel = "";
  commit((doc) => {
    const t = part.screen ? null : target ?? insertionParentIn(doc);
    if (t && doc.nodes[t.parentId]) sel = insertFragment(doc, frag, t.parentId, t.index);
    else {
      const r = partInNewFrame(doc, part, frag, at);
      sel = part.screen ? r.frame : r.root;
    }
  });
  select([sel]);
  if (part.screen || !target) setTimeout(() => focusIfOffscreen(sel), 30);
}

function insertionParentIn(doc: Doc) {
  const t = insertionParent();
  return t && doc.nodes[t.parentId] ? t : null;
}

function focusIfOffscreen(id: string) {
  const el = document.querySelector(`.stage [data-node-id="${id}"]`);
  const stage = document.querySelector(".stage");
  if (!el || !stage) return;
  const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
  if (r.right < s.left || r.left > s.right || r.bottom < s.top || r.top > s.bottom) focusNode(id);
}

export function insertComponent(compId: string, target?: { parentId: string; index: number } | null) {
  const comp = getState().doc.components.find((c) => c.id === compId);
  if (!comp) return;
  let sel = "";
  commit((doc) => {
    const t = target ?? insertionParentIn(doc);
    if (!t) return;
    sel = insertFragment(doc, comp.fragment, t.parentId, t.index);
    doc.nodes[sel].component = comp.id;
  });
  if (sel) select([sel]);
  else toast("Add a screen first, then drop components into it");
}

/** quick-add a basic element into the current insertion point */
export function quickAdd(kind: "text" | "stack" | "row" | "image" | "button") {
  const t = insertionParent();
  if (!t) return toast("Add a screen first");
  let id = "";
  commit((doc) => {
    const n: Node =
      kind === "text"
        ? { id: uid(), type: "text", name: "Text", children: [], w: 120, h: 20, wMode: "hug", hMode: "hug", text: "Type something", textStyle: "body" }
        : kind === "image"
          ? { id: uid(), type: "image", name: "Image", children: [], w: 320, h: 200, wMode: "fill", hMode: "fixed", radius: "md", fit: "cover" }
          : {
              id: uid(), type: "box", name: kind === "row" ? "Row" : kind === "button" ? "Button" : "Stack", children: [], w: 200, h: 120,
              wMode: kind === "button" ? "hug" : "fill", hMode: kind === "button" ? "fixed" : "hug",
              layout: { mode: kind === "stack" ? "column" : "row", gap: 12, padding: kind === "button" ? [0, 18, 0, 18] : [16, 16, 16, 16], align: kind === "stack" ? "start" : "center", justify: kind === "button" ? "center" : "start", wrap: false, columns: 3 },
              stroke: kind === "button" ? undefined : "$border", strokeWidth: kind === "button" ? undefined : 1, radius: "md", fill: kind === "button" ? "$primary" : undefined,
            };
    if (kind === "button") n.h = 44;
    doc.nodes[n.id] = n;
    if (kind === "button") {
      const label: Node = { id: uid(), type: "text", name: "Label", children: [], w: 60, h: 20, wMode: "hug", hMode: "hug", text: "Button", textStyle: "button", color: "$onPrimary" };
      doc.nodes[label.id] = label;
      n.children.push(label.id);
      n.part = true;
    }
    doc.nodes[t.parentId].children.splice(t.index, 0, n.id);
    id = n.id;
  });
  select([id]);
  if (kind === "text") setState({ editingText: id });
}

/* ---------------- selection edits ---------------- */

export function deleteSelection() {
  const ids = getState().selection;
  if (!ids.length) return;
  commit((doc) => ids.forEach((id) => removeNode(doc, id)), { selection: [] });
}

export function duplicateSelection() {
  const ids = getState().selection;
  const out: string[] = [];
  commit((doc) => ids.forEach((id) => {
    const d = duplicate(doc, id);
    if (d) out.push(d);
  }));
  if (out.length) select(out);
}

export function wrapSelection(mode: "column" | "row" = "column") {
  let id: string | null = null;
  commit((doc) => {
    id = wrap(doc, getState().selection, mode);
  });
  if (id) select([id]);
  else toast("Select items that sit side by side in the same container");
}

export function selectParent() {
  const s = getState();
  const p = s.selection[0] ? parentOf(s.doc, s.selection[0]) : null;
  if (p) select([p.id]);
}

export function reorder(delta: number) {
  const s = getState();
  const id = s.selection[0];
  if (!id) return;
  commit((doc) => {
    const p = parentOf(doc, id);
    if (!p) return;
    const i = p.children.indexOf(id);
    const j = Math.max(0, Math.min(p.children.length - 1, i + delta));
    if (i === j) return;
    p.children.splice(i, 1);
    p.children.splice(j, 0, id);
  });
}

export function moveTo(id: string, parentId: string, index: number) {
  commit((doc) => {
    moveNode(doc, id, parentId, index);
  });
}

export function patch(ids: string[], p: Partial<Node>) {
  commit((doc) => ids.forEach((id) => doc.nodes[id] && Object.assign(doc.nodes[id], p)));
}

export function patchFn(ids: string[], fn: (n: Node) => void) {
  commit((doc) => ids.forEach((id) => doc.nodes[id] && fn(doc.nodes[id])));
}

export function copySelection() {
  const s = getState();
  setClipboard(s.selection.map((id) => extract(s.doc, id)));
  toast(`Copied ${s.selection.length} item${s.selection.length === 1 ? "" : "s"}`);
}

export function paste() {
  const frags = getClipboard();
  if (!frags.length) return;
  const out: string[] = [];
  commit((doc) => {
    for (const f of frags) {
      const root = f.nodes[f.root];
      if (root.type === "frame") {
        const p = doc.pages.find((x) => x.id === getState().pageId) ?? doc.pages[0];
        const g = reId(f);
        Object.assign(doc.nodes, g.nodes);
        const pos = nextFramePosition(doc, p);
        Object.assign(doc.nodes[g.root], pos);
        p.frames.push(g.root);
        out.push(g.root);
      } else {
        const t = insertionParentIn(doc);
        if (t) out.push(insertFragment(doc, f, t.parentId, t.index));
      }
    }
  });
  if (out.length) select(out);
}

/* ---------------- components ---------------- */

export function makeComponent() {
  const s = getState();
  const id = s.selection[0];
  const n = id ? s.doc.nodes[id] : undefined;
  if (!n || n.type === "frame") return toast("Select an element inside a screen");
  const cid = uid("c");
  commit((doc) => {
    doc.nodes[id].component = cid;
    doc.components.push({ id: cid, name: n.name, fragment: extract(doc, id) });
  });
  toast(`Saved “${n.name}” as a component`);
}

/** push this copy's design to the component and every other copy */
export function syncComponent(fromId: string) {
  const s = getState();
  const cid = s.doc.nodes[fromId]?.component;
  if (!cid) return;
  let count = 0;
  commit((doc) => {
    const comp = doc.components.find((c) => c.id === cid);
    if (!comp) return;
    comp.fragment = extract(doc, fromId);
    comp.name = doc.nodes[fromId].name;
    for (const n of Object.values(doc.nodes)) {
      if (n.component !== cid || n.id === fromId) continue;
      const p = parentOf(doc, n.id);
      if (!p) continue;
      const i = p.children.indexOf(n.id);
      removeNode(doc, n.id);
      const nid = insertFragment(doc, comp.fragment, p.id, i);
      doc.nodes[nid].component = cid;
      count++;
    }
  });
  toast(`Updated the component and ${count} other cop${count === 1 ? "y" : "ies"}`);
}

export function detachComponent(id: string) {
  patchFn([id], (n) => delete n.component);
}

/* ---------------- project files (desktop) ---------------- */

let lastWritten = "";

export function initDesktop() {
  if (!bridge) return;
  setDiskSaver(async (doc) => {
    const dir = getState().projectDir;
    if (!dir) return;
    lastWritten = JSON.stringify(doc, null, 1);
    await bridge!.writeProject(dir, lastWritten, PROJECT_GUIDE);
  });
  bridge.onFileChanged(async () => {
    const dir = getState().projectDir;
    if (!dir) return;
    const raw = await bridge!.readProject(dir);
    if (!raw || raw === lastWritten) return;
    try {
      lastWritten = raw;
      loadDoc(normalize(JSON.parse(raw)), { keepHistory: true });
      toast("Design updated from file");
    } catch {
      toast("The design file changed but could not be read");
    }
  });
}

export async function saveAsProject() {
  if (!bridge) return downloadDoc();
  const dir = await bridge.pickFolder();
  if (!dir) return;
  setState({ projectDir: dir });
  await flushSave();
  await bridge.watch(dir);
  toast(`Saved to ${dir}`);
}

export async function openProject() {
  if (!bridge) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        loadDoc(normalize(JSON.parse(await f.text())));
        setTimeout(zoomToFit, 50);
      } catch (e) {
        toast(String((e as Error).message));
      }
    };
    input.click();
    return;
  }
  const r = await bridge.openProject();
  if (!r) return;
  try {
    lastWritten = r.json;
    loadDoc(normalize(JSON.parse(r.json)), { projectDir: r.dir });
    await bridge.watch(r.dir);
    setTimeout(zoomToFit, 50);
  } catch (e) {
    toast(String((e as Error).message));
  }
}

export async function reloadFromDisk() {
  const dir = getState().projectDir;
  if (!bridge || !dir) return;
  const raw = await bridge.readProject(dir);
  if (!raw) return;
  lastWritten = raw;
  loadDoc(normalize(JSON.parse(raw)), { keepHistory: true });
}

export function newDesign() {
  import("./doc").then(({ newDoc }) => {
    loadDoc(newDoc(), { projectDir: null });
    setState({ selection: [] });
  });
}

export function downloadDoc() {
  const s = getState();
  downloadText(`${slug(s.doc.name)}.${PROJECT_FILE.replace("design.", "")}`, JSON.stringify(s.doc, null, 1), "application/json");
}

export const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "design";

export function downloadText(name: string, data: string, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const deviceList = Object.entries(DEVICES);
export { isContainer, pageOf };
