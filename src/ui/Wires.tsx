/* Prototype wires: arrows from every linked element to the screen it opens, and a handle
 * on the selected element to drag a new wire onto a screen. Shown while the Prototype tab is
 * open (or always, if switched on there). */
import { useLayoutEffect, useState } from "react";
import { commit, getState, setState, toast, useStore } from "../model/store";
import { frameOf } from "../model/doc";

interface Rect { x: number; y: number; w: number; h: number }
interface Wire { from: string; to: string; d: string; end: { x: number; y: number }; selected: boolean; dim: boolean }

const q = (stage: HTMLElement, id: string) => stage.querySelector(`[data-node-id="${CSS.escape(id)}"]`) as HTMLElement | null;

function rectIn(stage: HTMLElement, e: Element): Rect {
  const s = stage.getBoundingClientRect(), r = e.getBoundingClientRect();
  return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
}

/** a smooth curve from the side of the element to the near edge of the target screen */
function curve(a: Rect, b: Rect) {
  const right = b.x + b.w / 2 >= a.x + a.w / 2;
  const sx = right ? a.x + a.w : a.x, sy = a.y + a.h / 2;
  const ex = right ? b.x : b.x + b.w;
  const ey = b.y + Math.min(b.h / 2, 48);
  const dx = Math.max(40, Math.abs(ex - sx) * 0.5) * (right ? 1 : -1);
  return { d: `M${sx} ${sy} C${sx + dx} ${sy} ${ex - dx} ${ey} ${ex} ${ey}`, end: { x: ex, y: ey } };
}

export function Wires({ stage }: { stage: HTMLElement | null }) {
  const show = useStore((s) => s.rightTab === "prototype" || s.showWires);
  const selection = useStore((s) => s.selection);
  const rev = useStore((s) => s.rev);
  const [wires, setWires] = useState<Wire[]>([]);
  const [handle, setHandle] = useState<Rect | null>(null);
  const [drag, setDrag] = useState<{ d: string; over: Rect | null } | null>(null);
  void rev;

  useLayoutEffect(() => {
    if (!show || !stage) {
      if (wires.length) setWires([]);
      if (handle) setHandle(null);
      return;
    }
    const s = getState();
    const out: Wire[] = [];
    // with a screen (or something in it) selected, its own wires stand out and the rest fade
    const focusFrame = s.selection[0] ? frameOf(s.doc, s.selection[0])?.id : undefined;
    for (const e of Array.from(stage.querySelectorAll("[data-node-id]"))) {
      const id = (e as HTMLElement).dataset.nodeId!;
      const n = s.doc.nodes[id];
      if (!n?.link) continue;
      const t = q(stage, n.link);
      if (!t) continue;
      const c = curve(rectIn(stage, e), rectIn(stage, t));
      const dim = !!focusFrame && n.link !== focusFrame && frameOf(s.doc, id)?.id !== focusFrame;
      out.push({ from: id, to: n.link, ...c, selected: s.selection.includes(id), dim });
    }
    const key = (w: Wire[]) => w.map((x) => x.d + x.selected + x.dim).join("|");
    if (key(out) !== key(wires)) setWires(out);
    const one = s.selection.length === 1 ? s.selection[0] : null;
    const oe = one && s.doc.nodes[one]?.type !== "frame" ? q(stage, one) : null;
    const h = oe ? rectIn(stage, oe) : null;
    if (JSON.stringify(h) !== JSON.stringify(handle)) setHandle(h);
  });

  if (!show || !stage) return null;

  const startConnect = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const s = getState();
    const src = s.selection[0];
    const own = frameOf(s.doc, src)?.id;
    const a = handle!;
    const sr = stage.getBoundingClientRect();
    let target: string | null = null;
    const mv = (ev: PointerEvent) => {
      const p = { x: ev.clientX - sr.left, y: ev.clientY - sr.top };
      target = null;
      let over: Rect | null = null;
      for (const el of document.elementsFromPoint(ev.clientX, ev.clientY)) {
        const id = (el as HTMLElement).dataset?.nodeId;
        if (!id) continue;
        const f = frameOf(getState().doc, id);
        if (f && f.id !== own) {
          target = f.id;
          over = rectIn(stage, q(stage, f.id)!);
        }
        break;
      }
      const sx = a.x + a.w, sy = a.y + a.h / 2;
      setDrag({ d: `M${sx} ${sy} C${sx + 60} ${sy} ${p.x - 60} ${p.y} ${p.x} ${p.y}`, over });
    };
    const up = () => {
      removeEventListener("pointermove", mv);
      removeEventListener("pointerup", up);
      setDrag(null);
      if (!target) return;
      const name = getState().doc.nodes[target]?.name;
      commit((d) => void (d.nodes[src] && (d.nodes[src].link = target!)));
      toast(`Linked: clicking it in Play opens “${name}”`);
    };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  };

  return (
    <>
      <svg className="wires" width="100%" height="100%">
        <defs>
          <marker id="wire-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#2f80ff" />
          </marker>
          <marker id="wire-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#ff3d7f" />
          </marker>
        </defs>
        {wires.map((w) => (
          <path key={w.from} d={w.d} className={"wire" + (w.selected ? " on" : w.dim ? " dim" : "")} markerEnd={`url(#${w.selected ? "wire-arrow-on" : "wire-arrow"})`} />
        ))}
        {drag && <path d={drag.d} className="wire on dragging" markerEnd="url(#wire-arrow-on)" />}
      </svg>
      {drag?.over && <div className="wire-target" style={{ left: drag.over.x, top: drag.over.y, width: drag.over.w, height: drag.over.h }} />}
      {handle && !drag && (
        <button
          type="button"
          className="wire-handle"
          style={{ left: handle.x + handle.w - 9, top: handle.y + handle.h / 2 - 9 }}
          title="Drag onto a screen to link it (what this opens in Play)"
          onPointerDown={startConnect}
        >
          +
        </button>
      )}
    </>
  );
}

export const toggleWires = () => setState((s) => ({ showWires: !s.showWires }));
