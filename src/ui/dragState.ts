/* Dragging things from the side panels onto the canvas. This uses plain pointer events
 * rather than HTML5 drag-and-drop, which is unreliable inside Electron on Windows and can't
 * show a proper preview. The canvas registers what a drop means (see Canvas.tsx). */
import type React from "react";

export type DragSource = { kind: "part"; id: string } | { kind: "component"; id: string } | { kind: "ref"; id: string } | null;
type Src = NonNullable<DragSource>;

let current: DragSource = null;
export const setDragSource = (d: DragSource) => (current = d);
export const getDragSource = () => current;

interface CanvasTarget {
  /** is this point over the canvas? */
  over(x: number, y: number): boolean;
  /** show where a drop would land (or clear it with null) */
  hint(src: Src, x: number, y: number, free: boolean): void;
  clear(): void;
  drop(src: Src, x: number, y: number, free: boolean): void;
}
let target: CanvasTarget | null = null;
export const registerCanvasTarget = (t: CanvasTarget | null) => (target = t);

/** start a press on a panel tile: a click adds it, a drag places it where it is dropped */
export function panelPointerDown(e: React.PointerEvent<HTMLElement>, src: Src, label: string, onClick: () => void) {
  if (e.button !== 0) return;
  e.preventDefault();
  const tile = e.currentTarget;
  const start = { x: e.clientX, y: e.clientY };
  let ghost: HTMLDivElement | null = null;
  let last = start;
  let free = false;

  const makeGhost = () => {
    const g = document.createElement("div");
    g.className = "drag-ghost";
    const pv = tile.querySelector(".pv");
    if (pv) g.appendChild(pv.cloneNode(true));
    const cap = document.createElement("span");
    cap.textContent = label;
    g.appendChild(cap);
    const tip = document.createElement("small");
    tip.textContent = "Hold Ctrl to place it exactly where you drop";
    g.appendChild(tip);
    document.body.appendChild(g);
    document.body.classList.add("dragging-part");
    current = src;
    return g;
  };
  const place = (x: number, y: number) => {
    if (!ghost) return;
    ghost.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
  };
  const mv = (ev: PointerEvent) => {
    last = { x: ev.clientX, y: ev.clientY };
    free = ev.ctrlKey || ev.metaKey;
    if (!ghost) {
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
      ghost = makeGhost();
    }
    place(ev.clientX, ev.clientY);
    const over = !!target?.over(ev.clientX, ev.clientY);
    ghost.classList.toggle("over", over);
    if (over) target!.hint(src, ev.clientX, ev.clientY, free);
    else target?.clear();
  };
  const finish = (drop: boolean) => {
    removeEventListener("pointermove", mv);
    removeEventListener("pointerup", up);
    removeEventListener("keydown", key, true);
    removeEventListener("blur", cancel);
    current = null;
    document.body.classList.remove("dragging-part");
    if (!ghost) {
      if (drop) onClick();
      return;
    }
    ghost.remove();
    ghost = null;
    if (drop && target?.over(last.x, last.y)) target.drop(src, last.x, last.y, free);
    target?.clear();
  };
  const up = (ev: PointerEvent) => {
    last = { x: ev.clientX, y: ev.clientY };
    free = ev.ctrlKey || ev.metaKey;
    finish(true);
  };
  const key = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      finish(false);
    }
  };
  const cancel = () => finish(false);
  addEventListener("pointermove", mv);
  addEventListener("pointerup", up);
  addEventListener("keydown", key, true);
  addEventListener("blur", cancel);
}
