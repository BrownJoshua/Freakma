import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NodeView, EditContext } from "../render/NodeView";
import { beginGesture, commit, endGesture, getState, live, page, select, setState, toast, useStore } from "../model/store";
import type { DropHint, Tool } from "../model/store";
import { frameOf, isContainer, isDescendant, makeFrame, nextFramePosition, parentOf, pathTo, uid } from "../model/doc";
import type { Doc, Node, VectorPoint } from "../model/types";
import { insertComponent, insertPart, moveTo, placeAt, renormalizeVector } from "../model/actions";
import { partById } from "../parts/library";
import { isPositioned } from "../render/style";
import { registerCanvasTarget } from "./dragState";
import { bounds, intersects, shift, simplify, smooth, snap } from "./geometry";
import type { Pt } from "./geometry";
import { CommentPins, CommentThread, newComment } from "./Comments";
import { placeReference } from "./Library";
import { sendCursor } from "../collab/client";
import { Wires } from "./Wires";

export const el = (stage: HTMLElement | null, id: string) => stage?.querySelector(`[data-node-id="${CSS.escape(id)}"]`) as HTMLElement | null;
const stageEl = () => document.querySelector(".stage") as HTMLElement | null;

/** outermost ancestor-or-self that is a finished block (button, field, reusable block) or locked: its insides
 * are not drop targets and don't move on their own */
export function sealedRoot(doc: Doc, id: string): string | null {
  let found: string | null = null;
  for (const p of pathTo(doc, id)) {
    const n = doc.nodes[p];
    if (n && n.type !== "frame" && (n.atomic || n.locked || n.component)) {
      found = p;
      break;
    }
  }
  return found;
}

/** the smart click: parts and finished blocks are selected whole first; clicking again goes
 * to the next block inside, then to the exact element */
function pickTarget(deepest: string): string {
  const s = getState();
  const path = pathTo(s.doc, deepest);
  const isBlock = (id: string) => {
    const n = s.doc.nodes[id];
    return !!n && n.type !== "frame" && (!!n.part || !!n.atomic || !!n.locked || !!n.component);
  };
  const sel = s.selection[0];
  if (sel && path.includes(sel) && sel !== deepest) {
    const i = path.indexOf(sel);
    const next = path.slice(i + 1).find(isBlock);
    return next ?? path[i + 1] ?? deepest;
  }
  return path.slice(1).find(isBlock) ?? deepest;
}

/** the innermost container under a point that can take a drop */
export function containerAt(stage: HTMLElement, x: number, y: number, exclude?: string): Node | null {
  const s = getState();
  for (const e of document.elementsFromPoint(x, y)) {
    if (!stage.contains(e)) continue;
    const nid = (e as HTMLElement).dataset?.nodeId;
    if (!nid) continue;
    if (exclude && (nid === exclude || isDescendant(s.doc, nid, exclude))) continue;
    // never inside a button, a field or a locked block: drop beside it instead
    const sealed = sealedRoot(s.doc, nid);
    let c: Node | null = sealed ? parentOf(s.doc, sealed) : s.doc.nodes[nid];
    if (!sealed && !isContainer(c)) c = parentOf(s.doc, nid);
    while (c && c.type !== "frame" && sealedRoot(s.doc, c.id)) c = parentOf(s.doc, sealedRoot(s.doc, c.id)!);
    if (!c || !isContainer(c) || (c.locked && c.type === "frame")) continue;
    if (exclude && (c.id === exclude || isDescendant(s.doc, c.id, exclude))) continue;
    return c;
  }
  return null;
}

/** a point in a container's own coordinates (what x/y mean for its free children) */
export function localPoint(stage: HTMLElement, c: Node, x: number, y: number): Pt {
  const r = el(stage, c.id)!.getBoundingClientRect();
  const z = getState().view.zoom;
  const b = c.stroke ? c.strokeWidth ?? 1 : 0;
  return { x: (x - r.left) / z - b, y: (y - r.top) / z - b };
}

export function computeDrop(stage: HTMLElement, clientX: number, clientY: number, exclude?: string, free = false): DropHint | null {
  const c = containerAt(stage, clientX, clientY, exclude);
  return c ? hintFor(stage, c, clientX, clientY, exclude, free) : null;
}

/** where a drop lands; "free" (Ctrl held) places it at the exact point, outside the auto layout */
function hintFor(stage: HTMLElement, c: Node, x: number, y: number, exclude?: string, free = false): DropHint {
  const sr = stage.getBoundingClientRect();
  const cr = el(stage, c.id)!.getBoundingClientRect();
  if (c.layout!.mode === "free" || free) {
    const at = localPoint(stage, c, x, y);
    return { parentId: c.id, index: c.children.length, at: { x: Math.round(at.x), y: Math.round(at.y) }, line: { x: cr.left - sr.left, y: cr.top - sr.top, w: cr.width, h: cr.height } };
  }
  const z = getState().view.zoom;
  const [pt, pr, pb, pl] = c.layout!.padding.map((v) => v * z);
  const kids = c.children
    .filter((k) => k !== exclude && !getState().doc.nodes[k]?.abs)
    .map((k) => ({ id: k, e: el(stage, k) }))
    .filter((k): k is { id: string; e: HTMLElement } => !!k.e)
    .map((k) => ({ id: k.id, r: k.e.getBoundingClientRect() }));
  const mode = c.layout!.mode;
  let i = kids.length;
  for (let k = 0; k < kids.length; k++) {
    const r = kids[k].r;
    const before = mode === "row" ? x < r.left + r.width / 2 : mode === "column" ? y < r.top + r.height / 2 : y < r.top || (y < r.bottom && x < r.left + r.width / 2);
    if (before) {
      i = k;
      break;
    }
  }
  let line: DropHint["line"];
  const innerL = cr.left + pl, innerT = cr.top + pt, innerW = cr.width - pl - pr, innerH = cr.height - pt - pb;
  if (!kids.length) line = { x: innerL, y: innerT, w: Math.max(innerW, 24), h: Math.max(innerH, 24) };
  else if (mode === "row" || mode === "grid") {
    const ref = kids[Math.min(i, kids.length - 1)].r;
    line = { x: i < kids.length ? ref.left - 3 : ref.right + 1, y: ref.top, w: 3, h: ref.height };
  } else {
    line = { x: innerL, y: i < kids.length ? kids[i].r.top - 3 : kids[kids.length - 1].r.bottom + 1, w: innerW, h: 3 };
  }
  const index = i < kids.length ? c.children.indexOf(kids[i].id) : c.children.length;
  return { parentId: c.id, index, line: { x: line.x - sr.left, y: line.y - sr.top, w: line.w, h: line.h } };
}

/* ---------------- drafts drawn while a tool is active ---------------- */

export interface Draft {
  kind: "box" | "ellipse" | "line" | "path";
  /** client coordinates */
  pts: Pt[];
  handles?: { i: Pt; o: Pt }[];
  closed?: boolean;
}

const TOOL_CURSOR: Partial<Record<Tool, string>> = { hand: "grab", frame: "crosshair", rect: "crosshair", ellipse: "crosshair", line: "crosshair", arrow: "crosshair", pen: "crosshair", pencil: "crosshair", text: "text", comment: "cell" };

function toWorld(stage: HTMLElement, cx: number, cy: number): Pt {
  const r = stage.getBoundingClientRect();
  const v = getState().view;
  return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
}

/** create a vector from client-space points inside whatever container is under the first point */
function finishVector(stage: HTMLElement, clientPts: VectorPoint[], closed: boolean, arrow?: "end") {
  if (clientPts.length < 2) return;
  const c = containerAt(stage, clientPts[0].x, clientPts[0].y);
  if (!c) return toast("Draw inside a screen");
  const r = el(stage, c.id)!.getBoundingClientRect();
  const z = getState().view.zoom;
  const loc = clientPts.map((p) => ({
    x: (p.x - r.left) / z, y: (p.y - r.top) / z,
    ...(p.ix !== undefined ? { ix: (p.ix - r.left) / z, iy: (p.iy! - r.top) / z } : {}),
    ...(p.ox !== undefined ? { ox: (p.ox - r.left) / z, oy: (p.oy! - r.top) / z } : {}),
  }));
  const b = bounds(loc);
  const pts = shift(loc, -b.x, -b.y);
  let id = "";
  commit((d) => {
    id = uid("v");
    d.nodes[id] = {
      id, type: "vector", name: arrow ? "Arrow" : closed ? "Shape" : pts.length === 2 ? "Line" : "Path", children: [],
      x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), wMode: "fixed", hMode: "fixed",
      vw: b.w, vh: b.h, points: pts, closed, stroke: "$text", strokeWidth: 2, fill: closed ? "$primarySoft" : undefined,
      arrow, abs: c.layout?.mode !== "free" ? true : undefined,
    };
    d.nodes[c.id].children.push(id);
  }, { tool: "select" });
  select([id]);
}

/** rectangles, ellipses and frames drawn by dragging */
function finishBox(stage: HTMLElement, tool: Tool, a: Pt, b: Pt) {
  const z = getState().view.zoom;
  const tiny = Math.abs(b.x - a.x) < 4 && Math.abs(b.y - a.y) < 4;
  if (tool === "frame" || !containerAt(stage, a.x, a.y)) {
    if (tool !== "frame" && tool !== "rect" && tool !== "ellipse") return toast("Draw inside a screen");
    const w1 = toWorld(stage, a.x, a.y), w2 = toWorld(stage, b.x, b.y);
    let id = "";
    commit((d) => {
      const pg = d.pages.find((p) => p.id === getState().pageId) ?? d.pages[0];
      const pos = tiny ? nextFramePosition(d, pg) : { x: Math.round(Math.min(w1.x, w2.x)), y: Math.round(Math.min(w1.y, w2.y)) };
      const f = makeFrame(d, pg, "desktop", pos.x, pos.y, "Frame");
      if (!tiny) {
        f.w = Math.round(Math.abs(w2.x - w1.x));
        f.h = Math.round(Math.abs(w2.y - w1.y));
      } else {
        f.w = 400;
        f.h = 300;
      }
      f.hMode = "fixed";
      f.device = undefined;
      f.fill = "$surface";
      f.layout = { ...f.layout!, mode: "free" };
      if (tool === "ellipse") f.radius = "full";
      id = f.id;
    }, { tool: "select" });
    return select([id]);
  }
  const c = containerAt(stage, a.x, a.y)!;
  const p1 = localPoint(stage, c, Math.min(a.x, b.x), Math.min(a.y, b.y));
  const w = tiny ? 120 : Math.abs(b.x - a.x) / z, h = tiny ? 120 : Math.abs(b.y - a.y) / z;
  let id = "";
  commit((d) => {
    id = uid("r");
    d.nodes[id] = {
      id, type: "box", name: tool === "ellipse" ? "Ellipse" : "Rectangle", children: [], x: Math.round(p1.x), y: Math.round(p1.y),
      w: Math.round(w), h: Math.round(h), wMode: "fixed", hMode: "fixed", fill: "$primarySoft", radius: tool === "ellipse" ? "full" : undefined,
      abs: c.layout?.mode !== "free" ? true : undefined,
    };
    d.nodes[c.id].children.push(id);
  }, { tool: "select" });
  select([id]);
}

function placeText(stage: HTMLElement, p: Pt) {
  const c = containerAt(stage, p.x, p.y);
  if (!c) return toast("Click inside a screen to add text");
  const free = c.layout?.mode === "free";
  const hint = free ? null : computeDrop(stage, p.x, p.y);
  const at = localPoint(stage, c, p.x, p.y);
  let id = "";
  commit((d) => {
    id = uid("t");
    d.nodes[id] = { id, type: "text", name: "Text", children: [], w: 160, h: 24, wMode: "hug", hMode: "hug", text: "Text", textStyle: "body", ...(free ? { x: Math.round(at.x), y: Math.round(at.y) } : {}) };
    const parent = d.nodes[hint?.parentId ?? c.id];
    parent.children.splice(hint ? hint.index : parent.children.length, 0, id);
  }, { tool: "select" });
  setState({ selection: [id], editingText: id });
}

/* ---------------- free move with smart guides ---------------- */

function startFreeMove(stage: HTMLElement, ids: string[], e: React.PointerEvent, onClick?: () => void) {
  const s = getState();
  const z = s.view.zoom;
  const parent = parentOf(s.doc, ids[0]);
  if (!parent) return;
  const pr = el(stage, parent.id)!.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  const rel = (id: string) => {
    const r = el(stage, id)?.getBoundingClientRect();
    return r ? { x: (r.left - pr.left) / z, y: (r.top - pr.top) / z, w: r.width / z, h: r.height / z } : null;
  };
  const items = ids.map((id) => {
    const n = s.doc.nodes[id];
    const r = rel(id)!;
    return { id, x: n.x ?? Math.round(r.x), y: n.y ?? Math.round(r.y), r };
  });
  const box = items.reduce((b, it) => ({ x1: Math.min(b.x1, it.r.x), y1: Math.min(b.y1, it.r.y), x2: Math.max(b.x2, it.r.x + it.r.w), y2: Math.max(b.y2, it.r.y + it.r.h) }), { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
  const pw = pr.width / z, ph = pr.height / z;
  const xs = [0, pw / 2, pw], ys = [0, ph / 2, ph];
  for (const c of parent.children) {
    if (ids.includes(c)) continue;
    const r = rel(c);
    if (!r) continue;
    xs.push(r.x, r.x + r.w / 2, r.x + r.w);
    ys.push(r.y, r.y + r.h / 2, r.y + r.h);
  }
  const start = { x: e.clientX, y: e.clientY };
  let moving = false;
  const mv = (ev: PointerEvent) => {
    let dx = (ev.clientX - start.x) / z, dy = (ev.clientY - start.y) / z;
    if (!moving && Math.hypot(dx, dy) * z < 3) return;
    if (!moving) beginGesture();
    moving = true;
    const thr = 6 / z;
    const gx: number[] = [], gy: number[] = [];
    if (!ev.altKey) {
      const bw = box.x2 - box.x1, bh = box.y2 - box.y1;
      let best: { d: number; at: number } | null = null;
      for (const [off] of [[0], [bw / 2], [bw]]) {
        const r = snap(box.x1 + dx + off, xs, thr);
        if (r.hit !== null && (!best || Math.abs(r.v - (box.x1 + dx + off)) < best.d)) best = { d: Math.abs(r.v - (box.x1 + dx + off)), at: r.hit - off - box.x1 };
      }
      if (best) {
        dx = best.at;
        gx.push(...xs.filter((x) => [0, bw / 2, bw].some((o) => Math.abs(box.x1 + dx + o - x) < 0.5)));
      }
      let bestY: { d: number; at: number } | null = null;
      for (const [off] of [[0], [bh / 2], [bh]]) {
        const r = snap(box.y1 + dy + off, ys, thr);
        if (r.hit !== null && (!bestY || Math.abs(r.v - (box.y1 + dy + off)) < bestY.d)) bestY = { d: Math.abs(r.v - (box.y1 + dy + off)), at: r.hit - off - box.y1 };
      }
      if (bestY) {
        dy = bestY.at;
        gy.push(...ys.filter((y) => [0, bh / 2, bh].some((o) => Math.abs(box.y1 + dy + o - y) < 0.5)));
      }
    }
    if (ev.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
    setState({ guides: { x: gx.map((x) => pr.left - sr.left + x * z), y: gy.map((y) => pr.top - sr.top + y * z) } });
    live((d) => {
      for (const it of items) {
        d.nodes[it.id].x = Math.round(it.x + dx);
        d.nodes[it.id].y = Math.round(it.y + dy);
      }
    });
  };
  const up = () => {
    removeEventListener("pointermove", mv);
    removeEventListener("pointerup", up);
    setState({ guides: { x: [], y: [] } });
    if (moving) endGesture();
    else onClick?.();
  };
  addEventListener("pointermove", mv);
  addEventListener("pointerup", up);
}

/* ---------------- box select ---------------- */

function startMarquee(stage: HTMLElement, e: React.PointerEvent, scope: string | null) {
  const sr = stage.getBoundingClientRect();
  const start = { x: e.clientX - sr.left, y: e.clientY - sr.top };
  const base = e.shiftKey ? getState().selection : [];
  let active = false;
  const mv = (ev: PointerEvent) => {
    const x = ev.clientX - sr.left, y = ev.clientY - sr.top;
    if (!active && Math.hypot(x - start.x, y - start.y) < 4) return;
    active = true;
    const m = { x: Math.min(x, start.x), y: Math.min(y, start.y), w: Math.abs(x - start.x), h: Math.abs(y - start.y) };
    const s = getState();
    const pool = scope ? s.doc.nodes[scope]?.children ?? [] : page(s).frames;
    const hit = pool.filter((id) => {
      const r = el(stage, id)?.getBoundingClientRect();
      return r && !s.doc.nodes[id]?.locked && intersects(m, { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height });
    });
    setState({ marquee: m, selection: [...new Set([...base, ...hit])] });
  };
  const up = () => {
    removeEventListener("pointermove", mv);
    removeEventListener("pointerup", up);
    setState({ marquee: null });
    if (!active && !e.shiftKey) select(scope ? [scope] : []);
  };
  addEventListener("pointermove", mv);
  addEventListener("pointerup", up);
}

/* ================= the canvas ================= */

export function Canvas() {
  const doc = useStore((s) => s.doc);
  const pg = useStore((s) => page(s));
  const view = useStore((s) => s.view);
  const editing = useStore((s) => s.editingText);
  const tool = useStore((s) => s.tool);
  const stageRef = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const pen = useRef<VectorPoint[] | null>(null);

  const finishPen = (closed = false) => {
    const pts = pen.current;
    pen.current = null;
    setDraft(null);
    if (pts && pts.length >= 2) finishVector(stageRef.current!, pts, closed);
    else setState({ tool: "select" });
  };

  useEffect(() => {
    const st = stageRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { view: v } = getState();
      if (e.ctrlKey || e.metaKey) {
        const r = st.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        const z = Math.min(8, Math.max(0.03, v.zoom * Math.exp(-e.deltaY * 0.0085)));
        setState({ view: { zoom: z, x: px - (px - v.x) * (z / v.zoom), y: py - (py - v.y) * (z / v.zoom) } });
      } else setState({ view: { ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) } });
    };
    st.addEventListener("wheel", onWheel, { passive: false });
    const typingEl = (t: EventTarget | null) => !!t && ((t as HTMLElement).isContentEditable || /INPUT|TEXTAREA|SELECT/.test((t as HTMLElement).tagName));
    const kd = (e: KeyboardEvent) => {
      if (typingEl(e.target)) return;
      if (e.code === "Space") setSpace(true);
      if (pen.current && (e.key === "Enter" || e.key === "Escape")) {
        e.preventDefault();
        e.stopPropagation();
        finishPen(false);
      }
    };
    const ku = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    addEventListener("keydown", kd, true);
    addEventListener("keyup", ku);
    return () => {
      st.removeEventListener("wheel", onWheel);
      removeEventListener("keydown", kd, true);
      removeEventListener("keyup", ku);
    };
  }, []);

  const pan = (e: React.PointerEvent) => {
    const st = stageRef.current!;
    const start = { x: e.clientX, y: e.clientY, v: getState().view };
    st.style.cursor = "grabbing";
    const mv = (ev: PointerEvent) => setState({ view: { ...start.v, x: start.v.x + ev.clientX - start.x, y: start.v.y + ev.clientY - start.y } });
    const up = () => {
      st.style.cursor = "";
      removeEventListener("pointermove", mv);
      removeEventListener("pointerup", up);
    };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const st = stageRef.current!;
    const s = getState();
    if (s.editingText) return;
    if ((e.target as HTMLElement).closest(".pin, .thread")) return;
    if (e.button === 1 || space || tool === "hand") return pan(e);
    if (e.button !== 0) return;
    if (s.openComment) setState({ openComment: null });

    if (tool === "comment") return newComment(st, e.clientX, e.clientY);
    if (tool === "text") return placeText(st, { x: e.clientX, y: e.clientY });

    if (tool === "pen") {
      const p: VectorPoint = { x: e.clientX, y: e.clientY };
      if (!pen.current) pen.current = [];
      const first = pen.current[0];
      if (first && pen.current.length > 2 && Math.hypot(first.x - p.x, first.y - p.y) < 8) return finishPen(true);
      pen.current.push(p);
      const idx = pen.current.length - 1;
      const sync = () => setDraft({ kind: "path", pts: pen.current!.map((q) => ({ x: q.x, y: q.y })), handles: pen.current!.map((q) => ({ i: { x: q.ix ?? q.x, y: q.iy ?? q.y }, o: { x: q.ox ?? q.x, y: q.oy ?? q.y } })) });
      sync();
      const mv = (ev: PointerEvent) => {
        const q = pen.current?.[idx];
        if (!q || Math.hypot(ev.clientX - q.x, ev.clientY - q.y) < 3) return;
        q.ox = ev.clientX;
        q.oy = ev.clientY;
        q.ix = 2 * q.x - ev.clientX;
        q.iy = 2 * q.y - ev.clientY;
        sync();
      };
      const up = () => {
        removeEventListener("pointermove", mv);
        removeEventListener("pointerup", up);
      };
      addEventListener("pointermove", mv);
      addEventListener("pointerup", up);
      return;
    }

    if (tool === "pencil") {
      const pts: Pt[] = [{ x: e.clientX, y: e.clientY }];
      const mv = (ev: PointerEvent) => {
        pts.push({ x: ev.clientX, y: ev.clientY });
        setDraft({ kind: "path", pts: pts.slice() });
      };
      const up = () => {
        removeEventListener("pointermove", mv);
        removeEventListener("pointerup", up);
        setDraft(null);
        const simple = simplify(pts, 2.5);
        const closed = simple.length > 3 && Math.hypot(simple[0].x - simple[simple.length - 1].x, simple[0].y - simple[simple.length - 1].y) < 12;
        if (closed) simple.pop();
        finishVector(st, smooth(simple, closed), closed);
      };
      addEventListener("pointermove", mv);
      addEventListener("pointerup", up);
      return;
    }

    if (tool !== "select") {
      const a = { x: e.clientX, y: e.clientY };
      let b = a;
      const kind: Draft["kind"] = tool === "line" || tool === "arrow" ? "line" : tool === "ellipse" ? "ellipse" : "box";
      const mv = (ev: PointerEvent) => {
        b = { x: ev.clientX, y: ev.clientY };
        if (ev.shiftKey && kind !== "line") {
          const d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
          b = { x: a.x + Math.sign(b.x - a.x || 1) * d, y: a.y + Math.sign(b.y - a.y || 1) * d };
        }
        setDraft({ kind, pts: [a, b] });
      };
      const up = () => {
        removeEventListener("pointermove", mv);
        removeEventListener("pointerup", up);
        setDraft(null);
        if (kind === "line") {
          if (Math.hypot(b.x - a.x, b.y - a.y) < 4) b = { x: a.x + 160, y: a.y };
          finishVector(st, [a, b], false, tool === "arrow" ? "end" : undefined);
        } else finishBox(st, tool, a, b);
      };
      addEventListener("pointermove", mv);
      addEventListener("pointerup", up);
      return;
    }

    /* ---- select tool ---- */
    const target = (e.target as HTMLElement).closest("[data-node-id]") as HTMLElement | null;
    if (s.editPath && !(target && target.dataset.nodeId === s.editPath)) setState({ editPath: null });
    if (!target) return startMarquee(st, e, null);
    const deepest = target.dataset.nodeId!;
    const drill = pickTarget(deepest);
    if (e.shiftKey && s.doc.nodes[drill]?.type !== "frame") {
      select(s.selection.includes(drill) ? s.selection.filter((x) => x !== drill) : [...s.selection, drill]);
      return;
    }
    // pressing on something already selected drags it; only a plain click goes inside it
    const path = pathTo(s.doc, deepest);
    const held = s.selection.find((x) => x !== drill && path.includes(x) && s.doc.nodes[x]?.type !== "frame");
    const id = held ?? drill;
    const clickInside = held ? () => select([drill]) : undefined;
    const n = s.doc.nodes[id];
    if (!n) return;
    if (n.type === "frame") {
      // empty area of a screen: click selects it, drag box-selects inside it
      if (!s.selection.includes(id)) select([id]);
      return startMarquee(st, e, id);
    }
    if (!s.selection.includes(id)) select([id]);
    // locked blocks (and everything inside them) stay where they are
    if (n.locked || (sealedRoot(s.doc, id) && s.doc.nodes[sealedRoot(s.doc, id)!]?.locked)) {
      if (clickInside) addEventListener("pointerup", () => clickInside(), { once: true });
      return;
    }
    const parent = parentOf(s.doc, id);
    if (parent && isPositioned(n, parent.layout)) {
      const sel = getState().selection.filter((x) => {
        const m = s.doc.nodes[x];
        return m && parentOf(s.doc, x)?.id === parent.id && isPositioned(m, parent.layout) && !m.locked;
      });
      return startFreeMove(st, sel.length ? sel : [id], e, clickInside);
    }

    // drag to move: snaps into auto layouts (pink line), or with Ctrl lands exactly where dropped
    const start = { x: e.clientX, y: e.clientY };
    let moving = false;
    const mv = (ev: PointerEvent) => {
      if (!moving && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
      moving = true;
      document.body.style.cursor = "grabbing";
      setState({ dropHint: computeDrop(st, ev.clientX, ev.clientY, id, ev.ctrlKey || ev.metaKey), hover: null });
    };
    const up = () => {
      removeEventListener("pointermove", mv);
      removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      const hint = getState().dropHint;
      setState({ dropHint: null });
      if (!moving) return clickInside?.();
      if (!hint) return;
      if (hint.at) {
        // land exactly at the point: keep the visible size so it doesn't jump
        const z = getState().view.zoom;
        const r = el(st, id)?.getBoundingClientRect();
        commit((d) => {
          const p = parentOf(d, id);
          if (p) p.children = p.children.filter((c) => c !== id);
          d.nodes[hint.parentId].children.push(id);
          const m = d.nodes[id];
          if (r && m.wMode === "fill") Object.assign(m, { wMode: "fixed", w: Math.round(r.width / z) });
          if (r && m.hMode === "fill") Object.assign(m, { hMode: "fixed", h: Math.round(r.height / z) });
          placeAt(d, id, hint);
        });
        return;
      }
      moveTo(id, hint.parentId, hint.index);
      if (n.abs) commit((d) => void delete d.nodes[id].abs);
    };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool === "pen") return finishPen(false);
    const target = (e.target as HTMLElement).closest("[data-node-id]") as HTMLElement | null;
    if (!target) return;
    const id = target.dataset.nodeId!;
    const n = getState().doc.nodes[id];
    if (n?.type === "text" && !n.locked) return setState({ editingText: id, selection: [id] });
    if (n?.type === "vector" && n.points && !n.locked) return setState({ editPath: id, selection: [id] });
    select([id]);
  };

  // files dragged in from the computer still arrive as HTML5 drops
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setState({ dropHint: computeDrop(stageRef.current!, e.clientX, e.clientY) });
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setState({ dropHint: null });
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length) dropImages(files, computeDrop(stageRef.current!, e.clientX, e.clientY));
  };

  // parts, components and references dragged from the panels (see dragState.ts)
  useEffect(() => {
    const stage = () => stageRef.current;
    const isScreen = (src: { kind: string; id: string }) => src.kind === "part" && !!partById(src.id)?.screen;
    registerCanvasTarget({
      over: (x, y) => {
        const r = stage()?.getBoundingClientRect();
        return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      },
      hint: (src, x, y, free) => setState({ dropHint: isScreen(src) ? null : computeDrop(stage()!, x, y, undefined, free) }),
      clear: () => getState().dropHint && setState({ dropHint: null }),
      drop: (src, x, y, free) => {
        const st = stage()!;
        const hint = isScreen(src) ? null : computeDrop(st, x, y, undefined, free);
        setState({ dropHint: null });
        const at = toWorld(st, x, y);
        if (src.kind === "part") {
          const p = partById(src.id);
          if (p) insertPart(p, p.screen ? null : hint, at);
        } else if (src.kind === "component") {
          if (hint) insertComponent(src.id, hint);
          else toast("Drop it inside a screen");
        } else placeReference(src.id, hint, at);
      },
    });
    return () => void registerCanvasTarget(null);
  }, []);

  return (
    <EditContext.Provider
      value={{
        editingId: editing,
        onTextCommit: (id, text) => {
          commit((d) => {
            const n = d.nodes[id];
            if (!n) return;
            n.text = text;
            if (n.name === "Text" || /…$/.test(n.name) || n.name.length < 26) n.name = text.slice(0, 24) || "Text";
          }, { editingText: null });
        },
      }}
    >
      <div
        ref={stageRef}
        className={"stage tool-" + tool + (space || tool === "hand" ? " panning" : "")}
        style={{ background: doc.theme.canvas, cursor: space ? "grab" : TOOL_CURSOR[tool] }}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
        onDragOver={onDragOver}
        onDragLeave={() => setState({ dropHint: null })}
        onDrop={onDrop}
        onPointerMove={(e) => {
          sendCursor(toWorld(stageRef.current!, e.clientX, e.clientY));
          if (pen.current) {
            const pts = pen.current.map((q) => ({ x: q.x, y: q.y }));
            if (!e.buttons) setDraft({ kind: "path", pts: [...pts, { x: e.clientX, y: e.clientY }], handles: pen.current.map((q) => ({ i: { x: q.ix ?? q.x, y: q.iy ?? q.y }, o: { x: q.ox ?? q.x, y: q.oy ?? q.y } })) });
          }
          if (e.buttons || tool !== "select") return;
          const t = (e.target as HTMLElement).closest("[data-node-id]") as HTMLElement | null;
          const id = t ? safePick(t.dataset.nodeId!) : null;
          if (id !== getState().hover) setState({ hover: id });
        }}
        onPointerLeave={() => setState({ hover: null })}
      >
        <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          {pg.frames.map((fid) => {
            const f = doc.nodes[fid];
            if (!f || f.hidden) return null;
            return (
              <div key={fid} className="frame-wrap" style={{ left: f.x ?? 0, top: f.y ?? 0 }}>
                <FrameLabel f={f} zoom={view.zoom} />
                <NodeView id={fid} nodes={doc.nodes} theme={doc.theme} top />
              </div>
            );
          })}
          <CommentPins zoom={view.zoom} />
        </div>
        <Overlay stageRef={stageRef} draft={draft} />
        {pg.frames.length === 0 && <EmptyHint />}
      </div>
    </EditContext.Provider>
  );
}

function safePick(deepest: string) {
  try {
    return pickTarget(deepest);
  } catch {
    return deepest;
  }
}

function FrameLabel({ f, zoom }: { f: Node; zoom: number }) {
  const sel = useStore((s) => s.selection.includes(f.id));
  return (
    <div
      className={"frame-label" + (sel ? " on" : "")}
      style={{ transform: `scale(${1 / zoom})` }}
      onPointerDown={(e) => {
        if (getState().tool !== "select") return;
        e.stopPropagation();
        const s = getState();
        const ids = s.selection.includes(f.id) ? s.selection.filter((id) => s.doc.nodes[id]?.type === "frame") : [f.id];
        if (!s.selection.includes(f.id)) select([f.id]);
        const starts = ids.map((id) => ({ id, x: s.doc.nodes[id].x ?? 0, y: s.doc.nodes[id].y ?? 0 }));
        const start = { x: e.clientX, y: e.clientY };
        let moved = false;
        const mv = (ev: PointerEvent) => {
          const z = getState().view.zoom;
          const dx = (ev.clientX - start.x) / z, dy = (ev.clientY - start.y) / z;
          if (!moved && Math.hypot(dx, dy) < 2) return;
          if (!moved) beginGesture();
          moved = true;
          live((d) => starts.forEach((p) => Object.assign(d.nodes[p.id], { x: Math.round(p.x + dx), y: Math.round(p.y + dy) })));
        };
        const up = () => {
          removeEventListener("pointermove", mv);
          removeEventListener("pointerup", up);
          if (moved) endGesture();
        };
        addEventListener("pointermove", mv);
        addEventListener("pointerup", up);
      }}
    >
      {f.name}
      <span>{f.w} × {f.hMode === "fixed" ? f.h : "auto"}</span>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="empty-hint">
      <strong>Start with a screen</strong>
      <span>Use “Add screen” at the top, drag a template from Parts › Screens, or press F and drag to draw a frame.</span>
    </div>
  );
}

/* ---------------- overlay ---------------- */

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function Overlay({ stageRef, draft }: { stageRef: React.RefObject<HTMLDivElement>; draft: Draft | null }) {
  const rev = useStore((s) => s.rev);
  const selection = useStore((s) => s.selection);
  const hover = useStore((s) => s.hover);
  const hint = useStore((s) => s.dropHint);
  const editing = useStore((s) => s.editingText);
  const guides = useStore((s) => s.guides);
  const marquee = useStore((s) => s.marquee);
  const editPath = useStore((s) => s.editPath);
  const peers = useStore((s) => s.peers);
  const view = useStore((s) => s.view);
  const pageId = useStore((s) => s.pageId);
  const [boxes, setBoxes] = useState<{ sel: Box[]; hov: Box | null; remote: (Box & { color: string; name: string })[] }>({ sel: [], hov: null, remote: [] });
  const [, force] = useState(0);

  useEffect(() => {
    document.fonts?.ready.then(() => force((x) => x + 1));
    const ro = new ResizeObserver(() => force((x) => x + 1));
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [stageRef]);

  useLayoutEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    const sr = st.getBoundingClientRect();
    const m = (id: string): Box | null => {
      const e = el(st, id);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { id, x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height };
    };
    const sel = selection.map(m).filter(Boolean) as Box[];
    const hov = hover && !selection.includes(hover) ? m(hover) : null;
    const remote = Object.values(peers).flatMap((p) => (p.page && p.page !== pageId ? [] : p.selection.map((id) => {
      const b = m(id);
      return b ? { ...b, color: p.color, name: p.name } : null;
    }).filter(Boolean) as (Box & { color: string; name: string })[]));
    const next = { sel, hov, remote };
    setBoxes((b) => (JSON.stringify(b) === JSON.stringify(next) ? b : next));
  });
  void rev;

  const s = getState();
  const one = boxes.sel.length === 1 ? boxes.sel[0] : null;
  const oneNode = one ? s.doc.nodes[one.id] : undefined;
  const sr = stageRef.current?.getBoundingClientRect();
  const toStage = (p: Pt) => ({ x: p.x - (sr?.left ?? 0), y: p.y - (sr?.top ?? 0) });

  const startResize = (e: React.PointerEvent, dir: "e" | "s" | "se") => {
    if (!one || !oneNode) return;
    e.stopPropagation();
    const z = getState().view.zoom;
    const start = { x: e.clientX, y: e.clientY, w: one.w / z, h: one.h / z, ratio: one.w / Math.max(1, one.h) };
    beginGesture();
    const mv = (ev: PointerEvent) => {
      let dw = (ev.clientX - start.x) / z, dh = (ev.clientY - start.y) / z;
      if (ev.shiftKey && dir === "se") dh = (start.w + dw) / start.ratio - start.h;
      live((d) => {
        const n = d.nodes[one.id];
        if (dir !== "s") {
          n.w = Math.max(1, Math.round(start.w + dw));
          n.wMode = "fixed";
        }
        if (dir !== "e") {
          n.h = Math.max(1, Math.round(start.h + dh));
          n.hMode = "fixed";
        }
        if (n.type === "icon") n.h = n.w;
      });
    };
    const up = () => {
      removeEventListener("pointermove", mv);
      removeEventListener("pointerup", up);
      endGesture();
    };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  };

  return (
    <div className="overlay">
      {boxes.remote.map((b, i) => (
        <div key={"r" + i} className="ov-remote" style={{ left: b.x, top: b.y, width: b.w, height: b.h, borderColor: b.color }}>
          <span style={{ background: b.color }}>{b.name}</span>
        </div>
      ))}
      {boxes.hov && !hint && <div className="ov-hover" style={{ left: boxes.hov.x, top: boxes.hov.y, width: boxes.hov.w, height: boxes.hov.h }} />}
      {!editing &&
        boxes.sel.map((b) => (
          <div key={b.id} className="ov-sel" style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
            {one && oneNode && !oneNode.locked && editPath !== one.id && (
              <>
                {b.w > 48 && b.h > 28 && <div className="hd hd-e" onPointerDown={(e) => startResize(e, "e")} title="Drag to set width" />}
                {b.w > 48 && b.h > 28 && <div className="hd hd-s" onPointerDown={(e) => startResize(e, "s")} title="Drag to set height" />}
                <div className="hd hd-se" onPointerDown={(e) => startResize(e, "se")} title="Drag to resize (Shift keeps the shape)" />
                <div className="ov-size">
                  {Math.round(b.w / s.view.zoom)} × {Math.round(b.h / s.view.zoom)}
                  {oneNode.type !== "frame" ? ` · ${oneNode.abs || parentOf(s.doc, oneNode.id)?.layout?.mode === "free" ? "free" : oneNode.wMode}` : ""}
                </div>
              </>
            )}
          </div>
        ))}
      {hint && <div className={"ov-drop" + (hint.line.w > 4 && hint.line.h > 4 ? " box" : "")} style={{ left: hint.line.x, top: hint.line.y, width: hint.line.w, height: hint.line.h }} />}
      {guides.x.map((x, i) => <div key={"gx" + i} className="guide v" style={{ left: x }} />)}
      {guides.y.map((y, i) => <div key={"gy" + i} className="guide h" style={{ top: y }} />)}
      {marquee && <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
      {draft && <DraftView draft={draft} toStage={toStage} />}
      {editPath && one && oneNode?.id === editPath && <PathEditor box={one} node={oneNode} />}
      {Object.entries(peers).map(([id, p]) =>
        p.cursor && (!p.page || p.page === pageId) ? (
          <div key={id} className="cursor" style={{ left: p.cursor.x * view.zoom + view.x, top: p.cursor.y * view.zoom + view.y, color: p.color }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3l7 17 2.5-7L21 10.5z" fill="currentColor" stroke="#fff" strokeWidth="1.5" /></svg>
            <span style={{ background: p.color }}>{p.name}</span>
          </div>
        ) : null,
      )}
      <Wires stage={stageRef.current} />
      <CommentThread />
    </div>
  );
}

function DraftView({ draft, toStage }: { draft: Draft; toStage: (p: Pt) => Pt }) {
  const pts = draft.pts.map(toStage);
  if (draft.kind === "box" || draft.kind === "ellipse") {
    const [a, b] = pts;
    return <div className={"draft" + (draft.kind === "ellipse" ? " round" : "")} style={{ left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }} />;
  }
  const hs = draft.handles?.map((h) => ({ i: toStage(h.i), o: toStage(h.o) }));
  let d = pts.length ? `M${pts[0].x} ${pts[0].y}` : "";
  for (let i = 1; i < pts.length; i++) {
    const a = hs?.[i - 1]?.o ?? pts[i - 1], b = hs?.[i]?.i ?? pts[i];
    d += ` C${a.x} ${a.y} ${b.x} ${b.y} ${pts[i].x} ${pts[i].y}`;
  }
  return (
    <svg className="draft-svg" width="100%" height="100%">
      <path d={d} fill="none" stroke="#2f80ff" strokeWidth="2" />
      {draft.kind === "path" && hs && pts.map((p, i) => (
        <g key={i}>
          {(hs[i].o.x !== p.x || hs[i].o.y !== p.y) && <><line x1={hs[i].i.x} y1={hs[i].i.y} x2={hs[i].o.x} y2={hs[i].o.y} stroke="#2f80ff" /><circle cx={hs[i].o.x} cy={hs[i].o.y} r="3" fill="#fff" stroke="#2f80ff" /></>}
          <rect x={p.x - 4} y={p.y - 4} width="8" height="8" fill="#fff" stroke="#2f80ff" strokeWidth="1.5" />
        </g>
      ))}
    </svg>
  );
}

/** drag a vector's points and curve handles; Alt-click a point to make it curved or sharp */
function PathEditor({ box, node }: { box: Box; node: Node }) {
  const pts = node.points ?? [];
  const vw = node.vw || node.w, vh = node.vh || node.h;
  const sx = box.w / vw, sy = box.h / vh;
  const P = (x: number, y: number) => ({ x: box.x + x * sx, y: box.y + y * sy });
  const drag = (e: React.PointerEvent, i: number, which: "p" | "i" | "o") => {
    e.stopPropagation();
    if (which === "p" && e.altKey) {
      commit((d) => {
        const q = d.nodes[node.id].points![i];
        if (q.ix !== undefined || q.ox !== undefined) {
          delete q.ix; delete q.iy; delete q.ox; delete q.oy;
        } else {
          const prev = pts[i - 1] ?? pts[i], next = pts[i + 1] ?? pts[i];
          const tx = (next.x - prev.x) / 4, ty = (next.y - prev.y) / 4;
          Object.assign(q, { ix: q.x - tx, iy: q.y - ty, ox: q.x + tx, oy: q.y + ty });
        }
      });
      return;
    }
    const start = { x: e.clientX, y: e.clientY };
    const orig: VectorPoint = { ...pts[i] };
    beginGesture();
    const mv = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / sx, dy = (ev.clientY - start.y) / sy;
      live((d) => {
        const q = d.nodes[node.id].points![i];
        if (which === "p") Object.assign(q, shift([orig], dx, dy)[0]);
        else if (which === "o") Object.assign(q, { ox: orig.ox! + dx, oy: orig.oy! + dy, ...(ev.altKey ? {} : { ix: 2 * orig.x - (orig.ox! + dx), iy: 2 * orig.y - (orig.oy! + dy) }) });
        else Object.assign(q, { ix: orig.ix! + dx, iy: orig.iy! + dy, ...(ev.altKey ? {} : { ox: 2 * orig.x - (orig.ix! + dx), oy: 2 * orig.y - (orig.iy! + dy) }) });
      });
    };
    const up = () => {
      removeEventListener("pointermove", mv);
      removeEventListener("pointerup", up);
      live((d) => renormalizeVector(d as Doc, node.id));
      endGesture();
    };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  };
  return (
    <svg className="path-edit" width="100%" height="100%">
      {pts.map((p, i) => {
        const a = P(p.x, p.y);
        const hi = p.ix !== undefined ? P(p.ix, p.iy!) : null, ho = p.ox !== undefined ? P(p.ox, p.oy!) : null;
        return (
          <g key={i}>
            {hi && <line x1={a.x} y1={a.y} x2={hi.x} y2={hi.y} stroke="#2f80ff" />}
            {ho && <line x1={a.x} y1={a.y} x2={ho.x} y2={ho.y} stroke="#2f80ff" />}
            {hi && <circle cx={hi.x} cy={hi.y} r="4" fill="#fff" stroke="#2f80ff" onPointerDown={(e) => drag(e, i, "i")} />}
            {ho && <circle cx={ho.x} cy={ho.y} r="4" fill="#fff" stroke="#2f80ff" onPointerDown={(e) => drag(e, i, "o")} />}
            <rect x={a.x - 5} y={a.y - 5} width="10" height="10" fill="#fff" stroke="#2f80ff" strokeWidth="1.5" onPointerDown={(e) => drag(e, i, "p")}><title>Drag to move · Alt-click to curve or sharpen</title></rect>
          </g>
        );
      })}
    </svg>
  );
}

export function dropImages(files: File[], hint: DropHint | null) {
  files.forEach((f) => {
    const r = new FileReader();
    r.onload = () => {
      const src = String(r.result);
      const img = new Image();
      img.onload = () => {
        const s = getState();
        const sel = s.selection[0] ? s.doc.nodes[s.selection[0]] : undefined;
        if (!hint && sel?.type === "image") return commit((d) => void (d.nodes[sel.id].src = src));
        if (!hint) return toast("Drop the image inside a screen");
        let id = "";
        commit((d) => {
          const ratio = img.height / Math.max(1, img.width);
          const w = Math.min(img.width, 480);
          id = uid("img");
          d.nodes[id] = { id, type: "image", name: f.name.replace(/\.[^.]+$/, ""), children: [], w, h: Math.round(w * ratio), wMode: hint.at ? "fixed" : "fill", hMode: "fixed", src, fit: "cover", radius: "md", ...(hint.at ? { x: hint.at.x, y: hint.at.y, ...(d.nodes[hint.parentId].layout?.mode === "free" ? {} : { abs: true }) } : {}) };
          d.nodes[hint.parentId].children.splice(hint.index, 0, id);
        });
        select([id]);
      };
      img.src = src;
    };
    r.readAsDataURL(f);
  });
}

export { stageEl, frameOf };
