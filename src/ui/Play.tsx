import { useEffect, useState } from "react";
import { NodeView } from "../render/NodeView";
import { setState, useStore } from "../model/store";
import { pathTo } from "../model/doc";
import { Ico } from "./controls";

/** clickable prototype: renders one screen at real size; elements with a link navigate */
export function Play() {
  const doc = useStore((s) => s.doc);
  const start = useStore((s) => s.play);
  const [cur, setCur] = useState(start);
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => setCur(start), [start]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setState({ play: null });
      if (e.key === "Backspace" && history.length) back();
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  });
  if (!cur || !doc.nodes[cur]) return null;
  const frames = doc.pages.flatMap((p) => p.frames).map((id) => doc.nodes[id]).filter(Boolean);
  const f = doc.nodes[cur];
  const go = (id: string) => {
    setHistory((h) => [...h, cur]);
    setCur(id);
  };
  const back = () => {
    const h = [...history];
    const p = h.pop();
    setHistory(h);
    if (p) setCur(p);
  };
  const linked = new Set(Object.values(doc.nodes).filter((n) => n.link).map((n) => n.id));

  return (
    <div className="play">
      <div className="play-bar">
        <button type="button" onClick={back} disabled={!history.length}><Ico name="arrow-left" />Back</button>
        <select value={cur} onChange={(e) => go(e.target.value)} aria-label="Screen">
          {frames.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <span className="hint">Click highlighted items · Esc to exit</span>
        <button type="button" className="primary" onClick={() => setState({ play: null })}><Ico name="close" />Close</button>
      </div>
      <div
        className="play-stage"
        onClick={(e) => {
          const t = (e.target as HTMLElement).closest("[data-node-id]") as HTMLElement | null;
          if (!t) return;
          const path = pathTo(doc, t.dataset.nodeId!).reverse();
          const hit = path.map((id) => doc.nodes[id]).find((n) => n?.link && doc.nodes[n.link]);
          if (hit) go(hit.link!);
        }}
      >
        <style>{[...linked].map((id) => `.play-stage [data-node-id="${id}"]{cursor:pointer;outline:2px solid rgba(59,130,246,.35);outline-offset:2px}`).join("")}</style>
        <div className="play-frame" style={{ width: f.w }}>
          <NodeView id={cur} nodes={doc.nodes} theme={doc.theme} top />
        </div>
      </div>
    </div>
  );
}
