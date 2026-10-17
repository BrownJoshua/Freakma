import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NodeView, EditContext } from "../render/NodeView";
import { beginGesture, commit, endGesture, getState, live, page, select, setState, toast, useStore } from "../model/store";
import type { DropHint } from "../model/store";
import { frameOf, isContainer, isDescendant, parentOf, pathTo } from "../model/doc";
import type { Node } from "../model/types";
import { insertComponent, insertPart, moveTo } from "../model/actions";
import { partById } from "../parts/library";
import { getDragSource, setDragSource } from "./dragState";

const el = (stage: HTMLElement | null, id: string) => stage?.querySelector(`[data-node-id="${CSS.escape(id)}"]`) as HTMLElement | null;

/** the smart click: a part is selected as a whole first, a second click goes inside it */
function pickTarget(deepest: string): string {
  const s = getState();
  const path = pathTo(s.doc, deepest);
  const sel = s.selection[0];
  // already inside something selected on this path → go one level deeper from it
  if (sel && path.includes(sel) && sel !== deepest) {
    const i = path.indexOf(sel);
    return path[i + 1] ?? deepest;
  }
  // outermost part root below the frame
  for (let i = 1; i < path.length; i++) {
    const n = s.doc.nodes[path[i]];
    if (n?.part) return n.id;
  }
  return deepest;
}

export function computeDrop(stage: HTMLElement, clientX: number, clientY: number, exclude?: string): DropHint | null {
  const s = getState();
  const els = document.elementsFromPoint(clientX, clientY);
  for (const e of els) {
    if (!stage.contains(e)) continue;
    const nid = (e as HTMLElement).dataset?.nodeId;
    if (!nid) continue;
    if (exclude && (nid === exclude || isDescendant(s.doc, nid, exclude))) continue;
    let c: Node | null = s.doc.nodes[nid];
    if (!isContainer(c)) c = parentOf(s.doc, nid);
    if (!c || !isContainer(c)) continue;
    if (exclude && isDescendant(s.doc, c.id, exclude)) continue;
    return hintFor(stage, c, clientX, clientY, exclude);
  }
  return null;
}

function hintFor(stage: HTMLElement, c: Node, x: number, y: number, exclude?: string): DropHint {
  const sr = stage.getBoundingClientRect();
  const cEl = el(stage, c.id)!;
  const cr = cEl.getBoundingClientRect();
  const z = getState().view.zoom;
  const [pt, pr, pb, pl] = c.layout!.padding.map((v) => v * z);
  const kids = c.children
    .filter((k) => k !== exclude)
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
  else if (mode === "row") {
    const xx = i < kids.length ? kids[i].r.left - 3 : kids[kids.length - 1].r.right + 1;
    const ref = kids[Math.min(i, kids.length - 1)].r;
    line = { x: xx, y: ref.top, w: 3, h: ref.height };
  } else if (mode === "grid") {
    const ref = kids[Math.min(i, kids.length - 1)].r;
    const xx = i < kids.length ? ref.left - 3 : ref.right + 1;
    line = { x: xx, y: ref.top, w: 3, h: ref.height };
  } else {
    const yy = i < kids.length ? kids[i].r.top - 3 : kids[kids.length - 1].r.bottom + 1;
    line = { x: innerL, y: yy, w: innerW, h: 3 };
  }
  const index = i < kids.length ? c.children.indexOf(kids[i].id) : c.children.length;
  return { parentId: c.id, index, line: { x: line.x - sr.left, y: line.y - sr.top, w: line.w, h: line.h } };
}

export function Canvas() {
  const doc = useStore((s) => s.doc);
  const pg = useStore((s) => page(s));
  const view = useStore((s) => s.view);
  const editing = useStore((s) => s.editingText);
  const stageRef = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState(false);

  // wheel: pan, ctrl/cmd+wheel or pinch: zoom around the pointer
  useEffect(() => {
    const st = stageRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { view: v } = getState();
      if (e.ctrlKey || e.metaKey) {
        const r = st.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        const z = Math.min(4, Math.max(0.05, v.zoom * Math.exp(-e.deltaY * 0.0085)));
        setState({ view: { zoom: z, x: px - (px - v.x) * (z / v.zoom), y: py - (py - v.y) * (z / v.zoom) } });
      } else setState({ view: { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY } });
    };
    st.addEventListener("wheel", onWheel, { passive: false });
    const kd = (e: KeyboardEvent) => e.code === "Space" && !(e.target as HTMLElement)?.isContentEditable && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName) && setSpace(true);
    const ku = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    addEventListener("keydown", kd);
    addEventListener("keyup", ku);
    return () => {
      st.removeEventListener("wheel", onWheel);
      removeEventListener("keydown", kd);
      removeEventListener("keyup", ku);
    };
  }, []);

  const toWorld = (cx: number, cy: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    const v = getState().view;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (getState().editingText) return;
    const st = stageRef.current!;
    const target = (e.target as HTMLElement).closest("[data-node-id]") as HTMLElement | null;
    const pan = e.button === 1 || space || !target;
    if (pan) {
      if (!target && !e.shiftKey) select([]);
      const start = { x: e.clientX, y: e.clientY, v: getState().view };
      st.setPointerCapture(e.pointerId);
      st.style.cursor = "grabbing";
      const mv = (ev: PointerEvent) => setState({ view: { ...start.v, x: start.v.x + ev.clientX - start.x, y: start.v.y + ev.clientY - start.y } });
      const up = () => {
        st.style.cursor = "";
        st.removeEventListener("pointermove", mv);
        st.removeEventListener("pointerup", up);
      };
      st.addEventListener("pointermove", mv);
      st.addEventListener("pointerup", up);
      return;
    }
    if (e.button !== 0) return;
    const deepest = target!.dataset.nodeId!;
    const s = getState();
    const id = pickTarget(deepest);
    const n = s.doc.nodes[id];
    if (e.shiftKey) {
      select(s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id]);
      return;
    }
    if (!s.selection.includes(id)) select([id]);
    if (!n || n.type === "frame" || n.locked) return;

    // drag to move inside / between auto layouts (window listeners, so clicks and double-clicks still reach the node)
    const start = { x: e.clientX, y: e.clientY };
    let moving = false;
    const mv = (ev: PointerEvent) => {
      if (!moving && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
      moving = true;
      document.body.style.cursor = "grabbing";
      setState({ dropHint: computeDrop(st, ev.clientX, ev.clientY, id), hover: null });
    };
    const up = () => {
      removeEventListener("pointermove", mv);
      removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      const hint = getState().dropHint;
      setState({ dropHint: null });
      if (moving && hint) moveTo(id, hint.parentId, hint.index);
    };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest("[data-node-id]") as HTMLElement | null;
    if (!target) return;
    const id = target.dataset.nodeId!;
    const n = getState().doc.nodes[id];
    select([id]);
    if (n?.type === "text" && !n.locked) setState({ editingText: id, selection: [id] });
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!getDragSource()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const src = getDragSource();
    if (src?.kind === "part" && partById(src.id)?.screen) return setState({ dropHint: null });
    setState({ dropHint: computeDrop(stageRef.current!, e.clientX, e.clientY) });
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const hint = getState().dropHint;
    setState({ dropHint: null });
    const src = getDragSource();
    setDragSource(null);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length) return dropImages(files, computeDrop(stageRef.current!, e.clientX, e.clientY));
    if (!src) return;
    if (src.kind === "part") {
      const p = partById(src.id);
      if (p) insertPart(p, p.screen ? null : hint, toWorld(e.clientX, e.clientY));
    } else if (src.kind === "component") {
      if (hint) insertComponent(src.id, hint);
      else toast("Drop components inside a screen");
    }
  };

  return (
    <EditContext.Provider
      value={{
        editingId: editing,
        onTextCommit: (id, text) => {
          commit((d) => {
            if (d.nodes[id]) {
              d.nodes[id].text = text;
              if (d.nodes[id].name === "Text" || /…$/.test(d.nodes[id].name) || d.nodes[id].name.length < 26) d.nodes[id].name = text.slice(0, 24) || "Text";
            }
          }, { editingText: null });
        },
      }}
    >
      <div
        ref={stageRef}
        className={"stage" + (space ? " panning" : "")}
        style={{ background: doc.theme.canvas }}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onDragOver={onDragOver}
        onDragLeave={() => setState({ dropHint: null })}
        onDrop={onDrop}
        onPointerMove={(e) => {
          if (e.buttons) return;
          const t = (e.target as HTMLElement).closest("[data-node-id]") as HTMLElement | null;
          const id = t ? pickTargetHover(t.dataset.nodeId!) : null;
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
        </div>
        <Overlay stageRef={stageRef} />
        {pg.frames.length === 0 && <EmptyHint />}
      </div>
    </EditContext.Provider>
  );
}

function pickTargetHover(deepest: string) {
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
        e.stopPropagation();
        select([f.id]);
        const start = { x: e.clientX, y: e.clientY, fx: f.x ?? 0, fy: f.y ?? 0 };
        const t = e.currentTarget;
        t.setPointerCapture(e.pointerId);
        let moved = false;
        const mv = (ev: PointerEvent) => {
          const z = getState().view.zoom;
          const dx = (ev.clientX - start.x) / z, dy = (ev.clientY - start.y) / z;
          if (!moved && Math.hypot(dx, dy) < 2) return;
          if (!moved) beginGesture();
          moved = true;
          live((d) => {
            d.nodes[f.id].x = Math.round(start.fx + dx);
            d.nodes[f.id].y = Math.round(start.fy + dy);
          });
        };
        const up = () => {
          t.removeEventListener("pointermove", mv);
          t.removeEventListener("pointerup", up);
          if (moved) endGesture();
        };
        t.addEventListener("pointermove", mv);
        t.addEventListener("pointerup", up);
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
      <span>Use “Add screen” at the top, or drag a template from Parts › Screens onto the canvas.</span>
    </div>
  );
}

/* ---------------- overlay: hover, selection, resize handles, drop line ---------------- */

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function Overlay({ stageRef }: { stageRef: React.RefObject<HTMLDivElement> }) {
  const rev = useStore((s) => s.rev);
  const selection = useStore((s) => s.selection);
  const hover = useStore((s) => s.hover);
  const hint = useStore((s) => s.dropHint);
  const editing = useStore((s) => s.editingText);
  const [boxes, setBoxes] = useState<{ sel: Box[]; hov: Box | null }>({ sel: [], hov: null });
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
    setBoxes((b) => (JSON.stringify(b) === JSON.stringify({ sel, hov }) ? b : { sel, hov }));
  });
  void rev;

  const s = getState();
  const one = boxes.sel.length === 1 ? boxes.sel[0] : null;
  const oneNode = one ? s.doc.nodes[one.id] : undefined;
  const parentFrame = one ? frameOf(s.doc, one.id) : null;

  const startResize = (e: React.PointerEvent, dir: "e" | "s" | "se") => {
    if (!one || !oneNode) return;
    e.stopPropagation();
    const t = e.currentTarget as HTMLElement;
    t.setPointerCapture(e.pointerId);
    const z = getState().view.zoom;
    const start = { x: e.clientX, y: e.clientY, w: one.w / z, h: one.h / z };
    beginGesture();
    const mv = (ev: PointerEvent) => {
      const dw = (ev.clientX - start.x) / z, dh = (ev.clientY - start.y) / z;
      live((d) => {
        const n = d.nodes[one.id];
        if (dir !== "s") {
          n.w = Math.max(8, Math.round(start.w + dw));
          n.wMode = "fixed";
        }
        if (dir !== "e") {
          n.h = Math.max(8, Math.round(start.h + dh));
          n.hMode = "fixed";
        }
        if (n.type === "icon") n.h = n.w;
      });
    };
    const up = () => {
      t.removeEventListener("pointermove", mv);
      t.removeEventListener("pointerup", up);
      endGesture();
    };
    t.addEventListener("pointermove", mv);
    t.addEventListener("pointerup", up);
  };

  return (
    <div className="overlay">
      {boxes.hov && !hint && <div className="ov-hover" style={{ left: boxes.hov.x, top: boxes.hov.y, width: boxes.hov.w, height: boxes.hov.h }} />}
      {!editing &&
        boxes.sel.map((b) => (
          <div key={b.id} className="ov-sel" style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
            {one && oneNode && !oneNode.locked && (
              <>
                {b.w > 48 && b.h > 28 && <div className="hd hd-e" onPointerDown={(e) => startResize(e, "e")} title="Drag to set width" />}
                {b.w > 48 && b.h > 28 && <div className="hd hd-s" onPointerDown={(e) => startResize(e, "s")} title="Drag to set height" />}
                <div className="hd hd-se" onPointerDown={(e) => startResize(e, "se")} />
                <div className="ov-size">
                  {Math.round(b.w / s.view.zoom)} × {Math.round(b.h / s.view.zoom)}
                  {parentFrame && oneNode.type !== "frame" ? ` · ${oneNode.wMode === "fill" ? "fill" : oneNode.wMode === "hug" ? "hug" : "fixed"}` : ""}
                </div>
              </>
            )}
          </div>
        ))}
      {hint && <div className={"ov-drop" + (hint.line.w > 4 && hint.line.h > 4 ? " box" : "")} style={{ left: hint.line.x, top: hint.line.y, width: hint.line.w, height: hint.line.h }} />}
    </div>
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
        const target = hint ?? (s.selection[0] && s.doc.nodes[s.selection[0]]?.type === "image" ? null : null);
        const sel = s.selection[0] ? s.doc.nodes[s.selection[0]] : undefined;
        if (!target && sel?.type === "image") return commit((d) => void (d.nodes[sel.id].src = src));
        if (!target) return toast("Drop the image inside a screen");
        let id = "";
        commit((d) => {
          const ratio = img.height / Math.max(1, img.width);
          id = "img" + Math.random().toString(36).slice(2, 9);
          d.nodes[id] = { id, type: "image", name: f.name.replace(/\.[^.]+$/, ""), children: [], w: Math.min(img.width, 480), h: Math.round(Math.min(img.width, 480) * ratio), wMode: "fill", hMode: "fixed", src, fit: "cover", radius: "md" };
          d.nodes[target.parentId].children.splice(target.index, 0, id);
        });
        select([id]);
      };
      img.src = src;
    };
    r.readAsDataURL(f);
  });
}
